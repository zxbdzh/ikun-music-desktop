import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { safeStorage } from 'electron'
import { AurioClubClient, AurioClubError, assertPublicHttpUrl } from './aurioClubClient'
import { parsePublisherTranscript } from './captions'
import { parsePodcastFeed } from './rss'
import { createTranscriptDelta, transcriptDescriptor } from './transcript'
import { PodcastStorage } from './storage'
import {
  PodcastAsr,
  PodcastAsrCancelledError,
  PriorityTaskQueue,
  isPodcastAsrCancelledError,
  resolvePodcastAsrBinaryDir,
  type PodcastAsrProgress,
} from './asr'
import { PodcastSpeakerDiarization, type SpeakerDiarizationProgress } from './speakerDiarization'
import { applySpeakerLabels, reuseSpeakerLabels } from './speakerLabels'
import { PodcastSpeakerIdentification } from './speakerIdentification'
import { MAX_PODCAST_SPEAKER_COUNT } from './speakerClustering'
import { simplifyAsrSnapshot } from './simplifiedChinese'
import {
  createSubscriptionSnapshot,
  parseSubscriptionPreferences,
  serializeSubscriptionSnapshot,
} from './syncPreferences'
import { normalizePopularSources } from './discovery'
import { buildOpml, parseOpml } from './opml'
import {
  createPodcastComputeBackendStatus,
  inspectPodcastComputeBackendCapabilities,
  type PodcastComputeBackendCapabilities,
} from './computeBackends'

const LOCAL_ACCOUNT_ID = 'local'
const PROGRESS_DIRTY_MASK = 0b11
const PREFERENCES_OUTBOX_KEY = 'subscriptions'

interface PodcastAsrJob {
  promise: Promise<LX.Podcast.TranscriptSnapshot>
  positionMs: number
  versionId: string
  failed: boolean
  controller: AbortController
  queuedAt: number
  startedAt?: number
  heartbeatTimer?: ReturnType<typeof setInterval>
  cancelRequested: boolean
  speakerReference?: LX.Podcast.TranscriptSnapshot
}

interface SpeakerIdentityJob {
  controller: AbortController
  promise: Promise<LX.Podcast.TranscriptionStatus>
  heartbeatTimer?: ReturnType<typeof setInterval>
}

export class PodcastModule {
  private token: string | null = null
  private aiApiKey: string | null = null
  private session: LX.Podcast.Session = {
    account: null,
    syncEnabled: false,
    syncState: 'local',
  }
  private currentTranscript: LX.Podcast.TranscriptSnapshot | null = null
  private transcriptionStatus: LX.Podcast.TranscriptionStatus | null = null
  private readonly transcriptionStatuses = new Map<string, LX.Podcast.TranscriptionStatus>()
  private readonly transcriptHistory = new Map<
    string,
    Map<number, LX.Podcast.TranscriptSnapshot>
  >()
  private currentEpisodeId: string | null = null
  private deviceId = ''
  private syncTask: Promise<LX.Podcast.Session> | null = null
  private syncTimer: ReturnType<typeof setTimeout> | null = null
  private initialized = false
  private readonly client: AurioClubClient
  private readonly storage = new PodcastStorage()
  private readonly asr = new PodcastAsr(this.storage)
  private readonly speakerDiarization = new PodcastSpeakerDiarization()
  private readonly speakerIdentification = new PodcastSpeakerIdentification()
  private readonly asrQueue = new PriorityTaskQueue()
  private readonly asrJobs = new Map<string, PodcastAsrJob>()
  private readonly speakerIdentityJobs = new Map<string, SpeakerIdentityJob>()
  private backendCapabilities: PodcastComputeBackendCapabilities | null = null
  private backendCapabilitiesPromise: Promise<PodcastComputeBackendCapabilities> | null = null

  constructor(client?: AurioClubClient) {
    this.client =
      client ??
      new AurioClubClient({
        getToken: async () => this.token,
      })
  }

  async init() {
    if (this.initialized) return
    this.initialized = true
    await this.loadSession()
    if (!this.deviceId) {
      this.deviceId = randomUUID()
      await this.persistSession()
    }
    if (this.token) {
      try {
        const user = normalizeUser(await this.client.me())
        this.session = { account: user, syncEnabled: true, syncState: 'idle' }
      } catch {
        this.token = null
        this.session = { account: null, syncEnabled: false, syncState: 'local' }
        await this.persistSession()
      }
    }
  }

  async execute(command: LX.Podcast.Command): Promise<unknown> {
    await this.init()
    switch (command.action) {
      case 'catalog':
        return command.query ? this.search(command.query) : this.catalog()
      case 'popular-sources':
        return normalizePopularSources(await this.client.popularSources(command.days, command.sort))
      case 'episodes':
        return this.episodes(command.sourceId, command.refresh ?? false)
      case 'episode-states':
        return this.episodeStates(command.episodeIds)
      case 'library':
        return this.library(command.kind)
      case 'set-favorite':
        return this.setFavorite(command.episodeId, command.isFavorite)
      case 'subscription-groups':
        return global.lx.worker.dbService.podcastSubscriptionGroupsGet()
      case 'subscription-group-save':
        return this.saveSubscriptionGroup(command.group)
      case 'subscription-group-delete':
        return this.deleteSubscriptionGroup(command.groupId)
      case 'subscription-source-move':
        return this.moveSubscriptionSource(command.sourceId, command.groupId)
      case 'opml-import':
        return this.importOpml(command.path)
      case 'opml-export':
        return this.exportOpml(command.path)
      case 'subscribe':
        return this.subscribe(command.source, command.autoDownload)
      case 'unsubscribe':
        await global.lx.worker.dbService.podcastSourceSubscriptionSet(command.sourceId, false, false)
        await this.markPreferencesDirty()
        return undefined
      case 'transcript':
        return this.transcript(command.episodeId, command.sinceRevision ?? 0)
      case 'transcription-status':
        return this.loadTranscriptionStatus(command.episodeId)
      case 'backend-status':
        return this.getComputeBackendStatus()
      case 'transcription-control':
        return this.controlTranscription(command.episodeId, command.command)
      case 'speaker-ai-config':
        return this.getSpeakerAiConfig()
      case 'speaker-ai-key-save':
        return this.saveSpeakerAiKey(command.apiKey)
      case 'speaker-ai-test':
        await this.speakerIdentification.test(this.speakerAiRequestConfig())
        return { ok: true }
      case 'identify-speakers':
        return this.startSpeakerIdentification(command.episodeId)
      case 'activate-episode':
        return this.activateEpisode(command.episodeId)
      case 'deactivate-episode':
        this.currentEpisodeId = null
        this.currentTranscript = null
        this.transcriptionStatus = null
        global.lx.event_app.player_status({ transcript: null })
        return undefined
      case 'download-episode': {
        const episode = await global.lx.worker.dbService.podcastEpisodeGet(command.episodeId)
        if (!episode) throw new Error('找不到播客单集')
        return this.storage.downloadEpisode(episode, 'download')
      }
      case 'storage-migrate': {
        const target = await this.storage.migrate(command.kind, command.path)
        if (command.kind === 'download') {
          global.lx.event_app.update_config({ 'podcast.downloadPath': target })
        } else {
          global.lx.event_app.update_config({ 'podcast.cachePath': target })
        }
        return target
      }
      case 'save-progress':
        return this.saveProgress(command.episodeId, command.positionSeconds, command.isFinished)
      case 'send-code':
        return this.client.sendCode(command.email)
      case 'login-password':
        return this.login(await this.client.loginPassword(command.email, command.password))
      case 'login-email':
        return this.login(await this.client.loginEmail(command.email, command.code))
      case 'logout':
        return this.logout()
      case 'session':
        return this.session
      case 'sync-now':
        return this.syncNow()
    }
  }

  getTranscriptDescriptor(): LX.Podcast.TranscriptDescriptor | null {
    return this.currentTranscript ? transcriptDescriptor(this.currentTranscript) : null
  }

  getTranscriptionStatus(contentId?: string): LX.Podcast.TranscriptionStatus | null {
    if (contentId) return this.transcriptionStatuses.get(contentId) ?? null
    return this.currentEpisodeId
      ? this.transcriptionStatuses.get(this.currentEpisodeId) ?? null
      : null
  }

  shutdown() {
    for (const [contentId, job] of this.asrJobs) {
      job.cancelRequested = true
      if (job.heartbeatTimer) clearInterval(job.heartbeatTimer)
      this.asrQueue.cancelPending(`${contentId}:`)
      job.controller.abort()
    }
    for (const [contentId, job] of this.speakerIdentityJobs) {
      if (job.heartbeatTimer) clearInterval(job.heartbeatTimer)
      this.asrQueue.cancelPending(`${contentId}:estimate-speakers`)
      this.asrQueue.cancelPending(`${contentId}:diarize`)
      this.asrQueue.cancelPending(`${contentId}:identify`)
      job.controller.abort()
    }
  }

  async controlTranscription(
    contentId: string,
    action: 'start' | 'retry' | 'restart' | 'cancel'
  ): Promise<LX.Podcast.TranscriptionStatus> {
    if (!contentId) throw new Error('Transcript content is required')
    const current = await this.loadTranscriptionStatus(contentId)
    if (action === 'cancel') return this.cancelTranscription(contentId, current)
    if (this.asrJobs.has(contentId)) return current ?? this.createQueuedStatus(contentId)
    if (action === 'start' && current?.transcriptState === 'ready') return current
    if (action === 'retry' && current && !['failed', 'unavailable'].includes(current.transcriptState)) {
      return current
    }
    if (action === 'restart' && current?.transcriptSource !== 'asr') {
      throw new Error('Only a local ASR transcript can be restarted')
    }

    this.publishTranscriptionStatus(this.createQueuedStatus(contentId))
    void this.startAsrJob(contentId, action === 'restart').catch((error) => {
      this.publishTranscriptionStatus({
        ...this.createQueuedStatus(contentId),
        transcriptState: 'failed',
        stage: 'failed',
        modelState: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
    })
    return this.getTranscriptionStatus(contentId) ?? this.createQueuedStatus(contentId)
  }

  private async loadTranscriptionStatus(contentId: string) {
    const current = this.getTranscriptionStatus(contentId)
    if (current) return current
    const snapshot = await this.loadStoredTranscript(contentId)
    if (!snapshot) return null
    const status = this.statusFromSnapshot(snapshot)
    this.publishTranscriptionStatus(status)
    return status
  }

  async transcript(
    episodeId: string,
    sinceRevision = 0,
    forceReload = false
  ): Promise<LX.Podcast.TranscriptDelta> {
    let snapshot = !forceReload && this.currentEpisodeId === episodeId ? this.currentTranscript : null
    if (snapshot) snapshot = await this.normalizeStoredTranscript(snapshot)
    if (!snapshot && !forceReload) {
      snapshot = await this.loadStoredTranscript(episodeId)
    }
    if (!snapshot && !forceReload) {
      snapshot = await this.loadPublisherTranscript(episodeId).catch((error) => {
        console.warn('[podcast] publisher transcript unavailable:', error instanceof Error ? error.message : error)
        return null
      })
    }
    if (!snapshot) snapshot = emptyTranscript(episodeId)
    this.rememberSnapshot(snapshot)
    if (this.currentEpisodeId === episodeId) {
      this.currentTranscript = snapshot
      if (!this.getTranscriptionStatus(episodeId)) {
        this.publishTranscriptionStatus(this.statusFromSnapshot(snapshot))
      }
      global.lx.event_app.player_status({
        mediaKind: 'podcast',
        contentId: episodeId,
        transcript: transcriptDescriptor(snapshot),
      })
    }
    const baseSnapshot = this.transcriptHistory.get(episodeId)?.get(sinceRevision)
    return createTranscriptDelta(snapshot, sinceRevision, baseSnapshot)
  }

  private async activateEpisode(episodeId: string): Promise<LX.Podcast.Episode> {
    const episode = await global.lx.worker.dbService.podcastEpisodeGet(episodeId)
    if (!episode) throw new Error('找不到播客单集')
    this.currentEpisodeId = episodeId
    this.currentTranscript = null
    this.transcriptionStatus = this.getTranscriptionStatus(episodeId)
    global.lx.event_app.player_status({
      mediaKind: 'podcast',
      contentId: episode.id,
      transcript: null,
    })
    void this.transcript(episode.id).catch((error) => {
      console.warn('[podcast] transcript unavailable:', error instanceof Error ? error.message : error)
    })
    return episode
  }

  private async catalog(): Promise<LX.Podcast.Source[]> {
    const local = await global.lx.worker.dbService.podcastSourcesGet()
    const subscribed = new Map(local.map((source) => [source.feedUrl, source]))
    const remote = normalizeCatalog(await this.client.catalog())
    const merged = remote.map((source) => {
      const existing = subscribed.get(source.feedUrl)
      return existing
        ? {
            ...source,
            id: existing.id,
            subscribed: existing.subscribed,
            autoDownload: existing.autoDownload,
            groupId: existing.groupId,
            subscriptionOrder: existing.subscriptionOrder,
          }
        : source
    })
    await global.lx.worker.dbService.podcastSourcesSave(merged)
    return merged
  }

  private async search(query: string): Promise<LX.Podcast.Source[]> {
    const result = await this.client.searchItunes(query)
    const sources = normalizeItunes(result)
    await global.lx.worker.dbService.podcastSourcesSave(sources)
    return sources
  }

  private async episodes(sourceId: string, refresh: boolean): Promise<LX.Podcast.Episode[]> {
    const cached = await global.lx.worker.dbService.podcastEpisodesGet(sourceId)
    if (!refresh && cached.length) return cached
    const source = (await global.lx.worker.dbService.podcastSourcesGet()).find(
      (item) => item.id === sourceId
    )
    if (!source) throw new Error('找不到播客订阅源')
    assertPublicHttpUrl(source.feedUrl)
    const feed = parsePodcastFeed(await this.client.proxyText(source.feedUrl), source.feedUrl)
    const mergedSource = {
      ...feed.source,
      id: source.id,
      subscribed: source.subscribed,
      autoDownload: source.autoDownload,
      groupId: source.groupId,
      subscriptionOrder: source.subscriptionOrder,
    }
    const episodes = feed.episodes.map((episode) => ({ ...episode, sourceId: source.id }))
    await global.lx.worker.dbService.podcastSourcesSave([mergedSource])
    await global.lx.worker.dbService.podcastEpisodesSave(episodes)
    return episodes
  }

  private async subscribe(source: LX.Podcast.Source, autoDownload: boolean) {
    const value = { ...source, subscribed: true, autoDownload, updatedAt: Date.now() }
    await global.lx.worker.dbService.podcastSourcesSave([value])
    await this.markPreferencesDirty()
    if (autoDownload) {
      void this.episodes(value.id, false)
        .then((episodes) =>
          Promise.all(
            episodes
              .slice(0, 3)
              .map((episode) => this.storage.downloadEpisode(episode, 'download'))
          )
        )
        .catch((error) => {
          console.warn('[podcast] auto download failed:', error instanceof Error ? error.message : error)
        })
    }
    return value
  }

  private async loadPublisherTranscript(
    episodeId: string
  ): Promise<LX.Podcast.TranscriptSnapshot | null> {
    const episode = await global.lx.worker.dbService.podcastEpisodeGet(episodeId)
    const reference = episode?.transcriptReferences.find((item) =>
      /vtt|srt|json/i.test(item.type)
    )
    if (!reference) return null
    assertPublicHttpUrl(reference.url)
    const snapshot = parsePublisherTranscript(
      episodeId,
      await this.client.proxyText(reference.url),
      reference.type,
      reference.language ?? 'auto'
    )
    await global.lx.worker.dbService.podcastTranscriptSave(`publisher:${reference.url}`, snapshot, true)
    return snapshot
  }

  private async startAsrJob(
    episodeId: string,
    restart: boolean
  ): Promise<LX.Podcast.TranscriptSnapshot> {
    const episode = await global.lx.worker.dbService.podcastEpisodeGet(episodeId)
    if (!episode) return emptyTranscript(episodeId)
    const activeJob = this.asrJobs.get(episodeId)
    if (activeJob) return activeJob.promise
    const stored = await this.loadStoredTranscript(episodeId)
    let speakerReference = needsWordTimingUpgrade(stored) ? stored! : undefined
    if (restart && !speakerReference) {
      const historical = await global.lx.worker.dbService
        .podcastTranscriptSpeakerReferenceGet(episodeId)
      if (needsWordTimingUpgrade(historical)) speakerReference = historical!
    }
    const wordTimingUpgrade = !!speakerReference
    const initial: LX.Podcast.TranscriptSnapshot = {
      ...(restart || !stored ? emptyTranscript(episodeId) : stored),
      protocolVersion: 2,
      revision: (stored?.revision ?? 0) + 1,
      state: 'preparing',
      source: 'asr',
      language: global.lx.appSetting['podcast.asrLanguage'],
      isPartial: true,
      lines: restart
        ? speakerReference?.lines ?? []
        : stored?.lines ?? [],
      speakers: speakerReference?.speakers ?? (restart ? [] : stored?.speakers ?? []),
      completedSegmentIndexes: restart
        ? []
        : completedSegmentIndexes(stored, episodeId),
      wordTimingUpgrade: wordTimingUpgrade ? true : undefined,
      interruptionReason: undefined,
      error: undefined,
    }
    const queuedAt = this.getTranscriptionStatus(episodeId)?.queuedAt ?? Date.now()
    const job: PodcastAsrJob = {
      positionMs: this.currentEpisodeId === episodeId
        ? Math.max(0, (global.lx.player_status.progress || 0) * 1_000)
        : 0,
      versionId: `asr:${Date.now()}`,
      failed: false,
      controller: new AbortController(),
      queuedAt,
      cancelRequested: false,
      speakerReference,
      promise: Promise.resolve(initial),
    }
    this.asrJobs.set(episodeId, job)
    await this.publishSnapshot(initial, job.versionId)
    this.publishTranscriptionStatus(this.createQueuedStatus(episodeId, initial.revision, queuedAt))
    job.promise = this.runAsrJob(episode, initial, job)
      .catch(async (error) => {
        const latest = this.latestSnapshot(episodeId) ?? initial
        if (job.cancelRequested || isPodcastAsrCancelledError(error)) {
          const cancelled: LX.Podcast.TranscriptSnapshot = {
            ...latest,
            revision: latest.revision + 1,
            state: 'preparing',
            isPartial: true,
            interruptionReason: 'cancelled',
            error: undefined,
          }
          try {
            await this.publishSnapshot(cancelled, job.versionId)
          } catch (saveError) {
            const failed: LX.Podcast.TranscriptSnapshot = {
              ...latest,
              revision: latest.revision + 1,
              state: 'failed',
              isPartial: latest.lines.length > 0,
              interruptionReason: undefined,
              error: `中止转写后保存部分字幕失败：${
                saveError instanceof Error ? saveError.message : String(saveError)
              }`,
            }
            this.publishTranscriptionStatus(this.statusFromSnapshot(failed))
            return failed
          }
          this.publishTranscriptionStatus({
            ...this.statusFromSnapshot(cancelled),
            stage: 'cancelled',
            startedAt: job.startedAt,
            queuedAt: job.queuedAt,
          })
          return cancelled
        }
        const failed: LX.Podcast.TranscriptSnapshot = {
          ...latest,
          revision: latest.revision + 1,
          state: 'failed',
          isPartial: latest.lines.length > 0,
          interruptionReason: undefined,
          error: error instanceof Error ? error.message : String(error),
        }
        await this.publishSnapshot(failed, job.versionId)
        this.publishTranscriptionStatus(this.statusFromSnapshot(failed))
        return failed
      })
      .finally(() => {
        if (job.heartbeatTimer) clearInterval(job.heartbeatTimer)
        if (this.asrJobs.get(episodeId) === job) this.asrJobs.delete(episodeId)
      })
    return job.promise
  }

  private async runAsrJob(
    episode: LX.Podcast.Episode,
    initial: LX.Podcast.TranscriptSnapshot,
    job: PodcastAsrJob
  ) {
    const prepared = await this.asrQueue.enqueue(
      `${episode.id}:prepare`,
      () => this.currentEpisodeId === episode.id ? -100 : 9_000,
      () => {
        this.startAsrHeartbeat(episode.id, job)
        return this.asr.prepare(
          episode,
          (progress) => this.handleAsrProgress(episode.id, progress),
          job.controller.signal
        )
      }
    )
    if (job.controller.signal.aborted) throw new PodcastAsrCancelledError()
    let snapshot = initial
    const completed = new Set(completedSegmentIndexes(snapshot, episode.id))
    this.updateSegmentStatus(episode.id, completed.size, prepared.segments.length)
    const segmentTasks = prepared.segments
      .filter((segment) => !completed.has(segment.index))
      .map((segment) =>
        this.asrQueue.enqueue(
          `${episode.id}:segment-${segment.index}`,
          () => this.segmentPriority(episode.id, segment.index, job.positionMs),
          async () => {
            if (job.controller.signal.aborted) throw new PodcastAsrCancelledError()
            if (job.failed) return
            this.updateSegmentStatus(
              episode.id,
              completed.size,
              prepared.segments.length,
              segment.index
            )
            try {
              const recognizedLines = await this.asr.transcribeSegment(
                prepared,
                segment,
                (progress) => this.handleAsrProgress(episode.id, progress),
                job.controller.signal
              )
              const lines = job.speakerReference
                ? reuseSpeakerLabels(recognizedLines, job.speakerReference).lines
                : recognizedLines
              const prefix = `${episode.id}:segment-${segment.index}:`
              completed.add(segment.index)
              snapshot = {
                ...snapshot,
                revision: snapshot.revision + 1,
                state: 'preparing',
                isPartial: true,
                lines: [
                  ...snapshot.lines.filter((line) => !line.id.startsWith(prefix)),
                  ...lines,
                ].sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id)),
                completedSegmentIndexes: [...completed].sort((a, b) => a - b),
              }
              await this.publishSnapshot(snapshot, job.versionId)
              this.updateSegmentStatus(episode.id, completed.size, prepared.segments.length)
            } catch (error) {
              if (isPodcastAsrCancelledError(error) || job.controller.signal.aborted) {
                throw new PodcastAsrCancelledError()
              }
              job.failed = true
              throw error
            }
          }
        )
      )
    const results = await Promise.allSettled(segmentTasks)
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    )
    if (rejected) throw rejected.reason
    if (job.controller.signal.aborted) throw new PodcastAsrCancelledError()
    if (job.speakerReference) {
      this.handleAsrProgress(episode.id, { stage: 'saving', progress: null })
      const labels = reuseSpeakerLabels(snapshot.lines, job.speakerReference)
      snapshot = {
        ...snapshot,
        revision: snapshot.revision + 1,
        lines: labels.lines,
        speakers: labels.speakers,
      }
      await this.publishSnapshot(snapshot, job.versionId)
      const current = this.getTranscriptionStatus(episode.id) ?? this.createQueuedStatus(episode.id)
      this.publishTranscriptionStatus({
        ...current,
        speakerCount: snapshot.speakers.length,
        speakerIdentityMessage: '已保留现有说话人标注',
      })
    } else {
      try {
      const speakerAiEnabled = global.lx.appSetting['podcast.aiEnabled'] && !!this.aiApiKey
      const source = speakerAiEnabled ? await this.episodeSource(episode) : null
      const expectedSpeakerCount = speakerAiEnabled
        ? await this.estimateSpeakerCountForDiarization(
            episode,
            snapshot,
            job.controller.signal,
            source
          )
        : undefined
      const diarization = await this.asrQueue.enqueue(
        `${episode.id}:diarize`,
        () => this.currentEpisodeId === episode.id ? -50 : 9_100,
        () => this.speakerDiarization.diarize(
          prepared,
          (progress) => this.handleSpeakerProgress(episode.id, progress),
          job.controller.signal,
          expectedSpeakerCount
        )
      )
      const labels = applySpeakerLabels(snapshot.lines, diarization.segments)
      snapshot = {
        ...snapshot,
        revision: snapshot.revision + 1,
        lines: labels.lines,
        speakers: labels.speakers,
      }
      await this.publishSnapshot(snapshot, job.versionId)
      if (speakerAiEnabled) {
        try {
          this.handleSpeakerProgress(episode.id, {
            stage: 'identifying-speakers',
            progress: null,
          })
          snapshot = {
            ...await this.asrQueue.enqueue(
              `${episode.id}:identify`,
              () => this.currentEpisodeId === episode.id ? -40 : 9_200,
              () => this.speakerIdentification.identify(
                episode,
                snapshot,
                this.speakerAiRequestConfig(),
                job.controller.signal,
                source
              )
            ),
            revision: snapshot.revision + 1,
          }
          await this.publishSnapshot(snapshot, job.versionId)
          this.publishTranscriptionStatus({
            ...this.statusFromSnapshot(snapshot),
            speakerIdentityMessage: speakerIdentityMessage(snapshot),
          })
        } catch (error) {
          if (job.controller.signal.aborted) throw new PodcastAsrCancelledError()
          const current = this.getTranscriptionStatus(episode.id) ?? this.createQueuedStatus(episode.id)
          this.publishTranscriptionStatus({
            ...current,
            speakerIdentityError: error instanceof Error ? error.message : String(error),
          })
        }
      }
      } catch (error) {
        if (job.controller.signal.aborted) throw new PodcastAsrCancelledError()
        const current = this.getTranscriptionStatus(episode.id) ?? this.createQueuedStatus(episode.id)
        this.publishTranscriptionStatus({
          ...current,
          speakerModelState: current.speakerModelState === 'ready' ? 'ready' : 'error',
          speakerError: error instanceof Error ? error.message : String(error),
        })
      }
    }
    const ready: LX.Podcast.TranscriptSnapshot = {
      ...snapshot,
      revision: snapshot.revision + 1,
      state: 'ready',
      isPartial: false,
      completedSegmentIndexes: prepared.segments.map((segment) => segment.index),
      wordTimingUpgrade: undefined,
      interruptionReason: undefined,
    }
    await this.publishSnapshot(ready, job.versionId)
    this.publishTranscriptionStatus({
      ...this.statusFromSnapshot(ready),
      completedSegments: prepared.segments.length,
      totalSegments: prepared.segments.length,
    })
    return ready
  }

  private segmentPriority(contentId: string, segmentIndex: number, positionMs: number) {
    const currentIndex = Math.max(0, Math.floor(positionMs / 30_000))
    const activePenalty = this.currentEpisodeId === contentId ? 0 : 10_000
    if (segmentIndex >= currentIndex && segmentIndex <= currentIndex + 2) {
      return activePenalty + segmentIndex - currentIndex
    }
    if (segmentIndex > currentIndex) return activePenalty + 100 + segmentIndex - currentIndex
    return activePenalty + 1_000 + currentIndex - segmentIndex
  }

  private createQueuedStatus(
    contentId: string,
    revision = 0,
    queuedAt = Date.now()
  ): LX.Podcast.TranscriptionStatus {
    return {
      protocolVersion: 2,
      contentId,
      transcriptState: 'preparing',
      transcriptSource: 'asr',
      revision,
      isPartial: true,
      model: global.lx.appSetting?.['podcast.asrModel'] ?? 'small',
      modelState: 'checking',
      stage: 'queued',
      progress: null,
      queuedAt,
      updatedAt: Date.now(),
    }
  }

  private statusFromSnapshot(snapshot: LX.Podcast.TranscriptSnapshot): LX.Podcast.TranscriptionStatus {
    const current = this.getTranscriptionStatus(snapshot.contentId)
    const isAsr = snapshot.source === 'asr'
    const stage: LX.Podcast.TranscriptionStage = snapshot.interruptionReason === 'cancelled'
      ? 'cancelled'
      : snapshot.state === 'ready'
      ? 'completed'
      : snapshot.state === 'failed'
        ? 'failed'
        : snapshot.state === 'preparing'
          ? current?.stage ?? 'cancelled'
          : 'idle'
    const modelState: LX.Podcast.TranscriptionModelState = !isAsr
      ? 'not-required'
      : snapshot.state === 'ready'
        ? 'ready'
        : snapshot.state === 'failed'
          ? current?.modelState === 'ready' ? 'ready' : 'error'
          : current?.modelState ?? 'checking'
    return {
      protocolVersion: 2,
      contentId: snapshot.contentId,
      transcriptState: snapshot.state,
      transcriptSource: snapshot.source,
      revision: snapshot.revision,
      isPartial: snapshot.isPartial,
      model: isAsr ? global.lx.appSetting?.['podcast.asrModel'] ?? 'small' : null,
      modelState,
      speakerModelState: current?.speakerModelState,
      stage,
      progress: stage === 'completed' ? 1 : current?.progress ?? null,
      asrExecutor: current?.asrExecutor,
      asrExecutorFallbackReason: current?.asrExecutorFallbackReason,
      executor: current?.executor,
      executorFallbackReason: current?.executorFallbackReason,
      speakerCount: snapshot.speakers.length || current?.speakerCount,
      speakerError: current?.speakerError,
      speakerIdentityError: current?.speakerIdentityError,
      speakerIdentityMessage: current?.speakerIdentityMessage,
      speakerLabels: snapshot.speakers.map((speaker) => speaker.name).slice(0, MAX_PODCAST_SPEAKER_COUNT),
      aiSpeakerCount: snapshot.speakers.filter((speaker) => speaker.origin === 'ai').length,
      completedSegments: current?.completedSegments,
      totalSegments: current?.totalSegments,
      currentSegment: current?.currentSegment,
      queuedAt: current?.queuedAt,
      startedAt: current?.startedAt,
      lastHeartbeatAt: current?.lastHeartbeatAt,
      lastSegmentCompletedAt: current?.lastSegmentCompletedAt,
      currentSegmentStartedAt: current?.currentSegmentStartedAt,
      error: snapshot.error ?? current?.error,
      updatedAt: Date.now(),
    }
  }

  private handleAsrProgress(contentId: string, progress: PodcastAsrProgress) {
    const current = this.getTranscriptionStatus(contentId)
      ?? (this.transcriptionStatus?.contentId === contentId ? this.transcriptionStatus : null)
      ?? this.createQueuedStatus(contentId)
    this.publishTranscriptionStatus({
      ...current,
      transcriptState: progress.stage === 'failed' ? 'failed' : 'preparing',
      modelState: progress.modelState ?? current.modelState,
      stage: progress.stage ?? current.stage,
      progress: progress.progress === undefined ||
        (progress.progress === null && current.totalSegments)
        ? current.progress
        : progress.progress,
      ...(progress.asrExecutor !== undefined
        ? {
            asrExecutor: progress.asrExecutor,
            asrExecutorFallbackReason: progress.asrExecutorFallbackReason,
          }
        : {}),
      error: progress.error,
      updatedAt: Date.now(),
    })
  }

  private handleSpeakerProgress(contentId: string, progress: SpeakerDiarizationProgress) {
    const current = this.getTranscriptionStatus(contentId) ?? this.createQueuedStatus(contentId)
    this.publishTranscriptionStatus({
      ...current,
      speakerModelState: progress.modelState ?? current.speakerModelState,
      stage: progress.stage ?? current.stage,
      progress: progress.progress === undefined ? current.progress : progress.progress,
      executor: progress.executor ?? current.executor,
      executorFallbackReason:
        progress.executorFallbackReason ?? current.executorFallbackReason,
      speakerCount: progress.speakerCount ?? current.speakerCount,
      speakerError: undefined,
    })
  }

  private getSpeakerAiConfig(): LX.Podcast.SpeakerAiConfig {
    return {
      enabled: global.lx.appSetting['podcast.aiEnabled'],
      baseUrl: global.lx.appSetting['podcast.aiBaseUrl'],
      model: global.lx.appSetting['podcast.aiModel'],
      hasApiKey: !!this.aiApiKey,
    }
  }

  private async getComputeBackendStatus(): Promise<LX.Podcast.ComputeBackendStatus> {
    if (!this.backendCapabilities || Date.now() - this.backendCapabilities.checkedAt > 30_000) {
      this.backendCapabilitiesPromise ??= inspectPodcastComputeBackendCapabilities({
        binaryDir: resolvePodcastAsrBinaryDir(
          global.staticPath,
          process.resourcesPath,
          process.env.NODE_ENV === 'production'
        ),
      }).then((value) => {
        this.backendCapabilities = value
        return value
      }).finally(() => {
        this.backendCapabilitiesPromise = null
      })
      await this.backendCapabilitiesPromise
    }
    return createPodcastComputeBackendStatus(
      this.backendCapabilities!,
      this.transcriptionStatuses.values(),
      global.lx.appSetting['podcast.asrVulkan']
    )
  }

  private async saveSpeakerAiKey(apiKey: string): Promise<LX.Podcast.SpeakerAiConfig> {
    const value = apiKey.trim()
    if (value && !safeStorage.isEncryptionAvailable()) {
      throw new Error('当前系统无法使用安全存储，未保存 API Key')
    }
    this.aiApiKey = value || null
    await this.persistSession()
    return this.getSpeakerAiConfig()
  }

  private speakerAiRequestConfig() {
    return {
      baseUrl: global.lx.appSetting['podcast.aiBaseUrl'],
      model: global.lx.appSetting['podcast.aiModel'],
      apiKey: this.aiApiKey ?? '',
    }
  }

  private async estimateSpeakerCountForDiarization(
    episode: LX.Podcast.Episode,
    snapshot: LX.Podcast.TranscriptSnapshot,
    signal: AbortSignal,
    source?: LX.Podcast.Source | null
  ): Promise<number | undefined> {
    this.handleSpeakerProgress(episode.id, {
      stage: 'estimating-speakers',
      progress: null,
    })
    try {
      return await this.asrQueue.enqueue(
        `${episode.id}:estimate-speakers`,
        () => this.currentEpisodeId === episode.id ? -60 : 9_050,
        () => this.speakerIdentification.estimateSpeakerCount(
          episode,
          snapshot,
          this.speakerAiRequestConfig(),
          signal,
          source
        )
      )
    } catch (error) {
      if (signal.aborted) throw error
      const current = this.getTranscriptionStatus(episode.id) ?? this.createQueuedStatus(episode.id)
      this.publishTranscriptionStatus({
        ...current,
        speakerIdentityError: `AI 人数估算失败，已改用本地自动聚类：${
          error instanceof Error ? error.message : String(error)
        }`,
      })
      return undefined
    }
  }

  private async startSpeakerIdentification(
    contentId: string
  ): Promise<LX.Podcast.TranscriptionStatus> {
    const active = this.speakerIdentityJobs.get(contentId)
    if (active) return this.getTranscriptionStatus(contentId) ?? this.createQueuedStatus(contentId)
    const episode = await global.lx.worker.dbService.podcastEpisodeGet(contentId)
    const storedSnapshot = await this.normalizeStoredTranscript(
      this.currentEpisodeId === contentId && this.currentTranscript
        ? this.currentTranscript
        : await global.lx.worker.dbService.podcastTranscriptGet(contentId)
    )
    if (!episode || !storedSnapshot) throw new Error('找不到可标注的播客字幕')
    let snapshot: LX.Podcast.TranscriptSnapshot = storedSnapshot
    if (!global.lx.appSetting['podcast.aiEnabled']) throw new Error('请先开启 AI 身份标注')
    if (!this.aiApiKey) throw new Error('请先保存 AI API Key')
    const source = await this.episodeSource(episode)
    const hasUserLabels = snapshot.speakers.some((speaker) => speaker.origin === 'user')
    const initiallyNeedsDiarization = !snapshot.speakers.length || (
      snapshot.speakers.length > MAX_PODCAST_SPEAKER_COUNT &&
      !hasUserLabels
    )
    const current = this.getTranscriptionStatus(contentId) ?? this.statusFromSnapshot(snapshot)
    const startedAt = Date.now()
    this.publishTranscriptionStatus({
      ...current,
      stage: hasUserLabels ? 'identifying-speakers' : 'estimating-speakers',
      progress: null,
      startedAt,
      lastHeartbeatAt: startedAt,
      speakerError: undefined,
      speakerIdentityError: undefined,
      speakerIdentityMessage: undefined,
    })
    const controller = new AbortController()
    let phase: 'diarization' | 'identification' = initiallyNeedsDiarization
      ? 'diarization'
      : 'identification'
    const run = async () => {
      const expectedSpeakerCount = hasUserLabels
        ? undefined
        : await this.estimateSpeakerCountForDiarization(
            episode,
            snapshot,
            controller.signal,
            source
          )
      const shouldDiarize = initiallyNeedsDiarization || (
        !hasUserLabels &&
        expectedSpeakerCount != null &&
        expectedSpeakerCount !== snapshot.speakers.length
      )
      if (shouldDiarize) {
        phase = 'diarization'
        const diarization = await this.asrQueue.enqueue(
          `${contentId}:diarize`,
          () => this.currentEpisodeId === contentId ? -50 : 9_100,
          async () => {
            const prepared = await this.asr.prepareAudio(
              episode,
              (progress) => this.handleSpeakerProgress(contentId, progress),
              controller.signal
            )
            return this.speakerDiarization.diarize(
              prepared,
              (progress) => this.handleSpeakerProgress(contentId, progress),
              controller.signal,
              expectedSpeakerCount
            )
          }
        )
        const labels = applySpeakerLabels(snapshot.lines, diarization.segments)
        snapshot = {
          ...snapshot,
          revision: snapshot.revision + 1,
          lines: labels.lines,
          speakers: labels.speakers,
        }
        await this.publishSnapshot(snapshot, `diarization:${Date.now()}`)
      }

      phase = 'identification'
      this.publishTranscriptionStatus({
        ...(this.getTranscriptionStatus(contentId) ?? current),
        stage: 'identifying-speakers',
        progress: null,
        lastHeartbeatAt: Date.now(),
      })
      const identified = {
        ...await this.asrQueue.enqueue(
          `${contentId}:identify`,
          () => this.currentEpisodeId === contentId ? -40 : 9_200,
          () => this.speakerIdentification.identify(
            episode,
            snapshot,
            this.speakerAiRequestConfig(),
            controller.signal,
            source
          )
        ),
        revision: snapshot.revision + 1,
      }
      await this.publishSnapshot(identified, `ai:${Date.now()}`)
      const completed = {
        ...this.statusFromSnapshot(identified),
        stage: 'completed' as const,
        progress: 1,
        speakerIdentityMessage: speakerIdentityMessage(identified),
      }
      this.publishTranscriptionStatus(completed)
      return completed
    }
    const promise = run().catch((error) => {
      const current = this.getTranscriptionStatus(contentId) ?? this.createQueuedStatus(contentId)
      const message = controller.signal.aborted
        ? 'AI 标注已中止'
        : error instanceof Error ? error.message : String(error)
      const failed: LX.Podcast.TranscriptionStatus = {
        ...current,
        stage: controller.signal.aborted ? 'cancelled' : 'completed',
        progress: controller.signal.aborted ? current.progress : 1,
        speakerError: phase === 'diarization' ? message : current.speakerError,
        speakerIdentityError: phase === 'identification' ? message : current.speakerIdentityError,
      }
      this.publishTranscriptionStatus(failed)
      return failed
    }).finally(() => {
      const job = this.speakerIdentityJobs.get(contentId)
      if (job?.heartbeatTimer) clearInterval(job.heartbeatTimer)
      this.speakerIdentityJobs.delete(contentId)
    })
    const heartbeatTimer = setInterval(() => {
      if (controller.signal.aborted) return
      const value = this.getTranscriptionStatus(contentId)
      if (value) this.publishTranscriptionStatus({ ...value, lastHeartbeatAt: Date.now() })
    }, 5_000)
    heartbeatTimer.unref?.()
    this.speakerIdentityJobs.set(contentId, { controller, promise, heartbeatTimer })
    void promise
    return this.getTranscriptionStatus(contentId)!
  }

  private async episodeSource(
    episode: LX.Podcast.Episode
  ): Promise<LX.Podcast.Source | null> {
    const sources = await global.lx.worker.dbService.podcastSourcesGet()
    return sources.find((source) => source.id === episode.sourceId) ?? null
  }

  private publishTranscriptionStatus(status: LX.Podcast.TranscriptionStatus) {
    const value = { ...status, updatedAt: Date.now() }
    this.transcriptionStatuses.set(status.contentId, value)
    if (this.currentEpisodeId === status.contentId) {
      this.transcriptionStatus = value
    }
  }

  private updateSegmentStatus(
    contentId: string,
    completedSegments: number,
    totalSegments: number,
    currentSegment?: number
  ) {
    const current = this.getTranscriptionStatus(contentId) ?? this.createQueuedStatus(contentId)
    const segmentCompleted = currentSegment == null &&
      completedSegments > (current.completedSegments ?? 0)
    this.publishTranscriptionStatus({
      ...current,
      transcriptState: 'preparing',
      isPartial: true,
      completedSegments,
      totalSegments,
      currentSegment: currentSegment == null ? undefined : currentSegment + 1,
      currentSegmentStartedAt: currentSegment == null
        ? undefined
        : current.currentSegment === currentSegment + 1
          ? current.currentSegmentStartedAt
          : Date.now(),
      lastSegmentCompletedAt: segmentCompleted ? Date.now() : current.lastSegmentCompletedAt,
      progress: totalSegments > 0 ? completedSegments / totalSegments : null,
    })
  }

  private async cancelTranscription(
    contentId: string,
    current: LX.Podcast.TranscriptionStatus | null
  ): Promise<LX.Podcast.TranscriptionStatus> {
    const identityJob = this.speakerIdentityJobs.get(contentId)
    if (identityJob) {
      this.publishTranscriptionStatus({
        ...(this.getTranscriptionStatus(contentId) ?? current ?? this.createQueuedStatus(contentId)),
        stage: 'cancelling',
      })
      this.asrQueue.cancelPending(`${contentId}:estimate-speakers`)
      this.asrQueue.cancelPending(`${contentId}:diarize`)
      this.asrQueue.cancelPending(`${contentId}:identify`)
      identityJob.controller.abort()
      return this.getTranscriptionStatus(contentId) ?? current ?? this.createQueuedStatus(contentId)
    }
    const job = this.asrJobs.get(contentId)
    if (!job) {
      if (current) return current
      throw new Error('当前节目没有可中止的转写任务')
    }
    if (job.cancelRequested) {
      return this.getTranscriptionStatus(contentId) ?? current ?? this.createQueuedStatus(contentId)
    }

    job.cancelRequested = true
    const stage: LX.Podcast.TranscriptionStage = job.startedAt ? 'cancelling' : 'cancelled'
    this.publishTranscriptionStatus({
      ...(current ?? this.createQueuedStatus(contentId, 0, job.queuedAt)),
      transcriptState: 'preparing',
      stage,
      error: undefined,
    })
    this.asrQueue.cancelPending(`${contentId}:`)
    job.controller.abort()
    return this.getTranscriptionStatus(contentId)!
  }

  private startAsrHeartbeat(contentId: string, job: PodcastAsrJob) {
    if (job.startedAt) return
    const now = Date.now()
    job.startedAt = now
    this.publishTranscriptionStatus({
      ...(this.getTranscriptionStatus(contentId)
        ?? this.createQueuedStatus(contentId, 0, job.queuedAt)),
      startedAt: now,
      lastHeartbeatAt: now,
    })
    job.heartbeatTimer = setInterval(() => {
      if (this.asrJobs.get(contentId) !== job) return
      const current = this.getTranscriptionStatus(contentId)
      if (!current || ['cancelled', 'completed', 'failed'].includes(current.stage)) return
      this.publishTranscriptionStatus({ ...current, lastHeartbeatAt: Date.now() })
    }, 5_000)
    job.heartbeatTimer.unref?.()
  }

  private rememberSnapshot(snapshot: LX.Podcast.TranscriptSnapshot) {
    let history = this.transcriptHistory.get(snapshot.contentId)
    if (!history) {
      history = new Map()
      this.transcriptHistory.set(snapshot.contentId, history)
    }
    history.set(snapshot.revision, snapshot)
    while (history.size > 64) history.delete(history.keys().next().value!)
  }

  private latestSnapshot(contentId: string) {
    const history = this.transcriptHistory.get(contentId)
    return history ? [...history.values()].at(-1) ?? null : null
  }

  private async publishSnapshot(snapshot: LX.Podcast.TranscriptSnapshot, versionId: string) {
    this.rememberSnapshot(snapshot)
    await global.lx.worker.dbService.podcastTranscriptSave(versionId, snapshot, true)
    if (this.currentEpisodeId === snapshot.contentId) {
      this.currentTranscript = snapshot
      global.lx.event_app.player_status({ transcript: transcriptDescriptor(snapshot) })
    }
  }

  private async loadStoredTranscript(contentId: string) {
    return this.normalizeStoredTranscript(
      await global.lx.worker.dbService.podcastTranscriptGet(contentId)
    )
  }

  private async normalizeStoredTranscript(
    snapshot: LX.Podcast.TranscriptSnapshot | null
  ): Promise<LX.Podcast.TranscriptSnapshot | null> {
    if (!snapshot) return null
    if (snapshot.state !== 'ready') return snapshot
    const normalized = simplifyAsrSnapshot(snapshot)
    if (normalized === snapshot) return snapshot
    const migrated = { ...normalized, revision: snapshot.revision + 1 }
    await global.lx.worker.dbService.podcastTranscriptSave(
      'normalization:simplified-v1',
      migrated,
      true
    )
    return migrated
  }

  private async login(value: unknown): Promise<LX.Podcast.Session> {
    const record = asRecord(value)
    const token = stringValue(record.token ?? record.access_token)
    if (!token) throw new Error('AurioClub 登录响应缺少 token')
    this.token = token
    try {
      const account = normalizeUser(await this.client.me())
      this.session = { account, syncEnabled: true, syncState: 'idle' }
      await this.persistSession()
      return this.syncNow()
    } catch (error) {
      this.token = null
      this.session = { account: null, syncEnabled: false, syncState: 'local' }
      await this.persistSession()
      throw error
    }
  }

  private async logout() {
    if (this.syncTimer) clearTimeout(this.syncTimer)
    this.syncTimer = null
    this.token = null
    this.session = { account: null, syncEnabled: false, syncState: 'local' }
    await this.persistSession()
    return this.session
  }

  private async syncNow(): Promise<LX.Podcast.Session> {
    if (!this.session.account || !this.session.syncEnabled) return this.session
    if (this.syncTask) return this.syncTask
    this.syncTask = this.performSync().finally(() => {
      this.syncTask = null
    })
    return this.syncTask
  }

  private async performSync(): Promise<LX.Podcast.Session> {
    const account = this.session.account
    if (!account) return this.session
    this.session = { ...this.session, syncState: 'syncing', error: undefined }
    try {
      let syncState = await global.lx.worker.dbService.podcastSyncStateGet(account.id)
      const dirtyStates = await global.lx.worker.dbService.podcastEpisodeStatesGet(account.id, true)
      if (dirtyStates.length) {
        await this.client.pushProgressBatch({
          user_id: account.id,
          device_id: this.deviceId,
          items: dirtyStates.map(toRemoteProgress),
        })
        await global.lx.worker.dbService.podcastEpisodeStatesMarkClean(dirtyStates)
      }

      const pull = normalizePull(await this.client.pull(Math.max(0, syncState.watermark - 5)))
      for (const remote of pull.states) {
        const local = await global.lx.worker.dbService.podcastEpisodeStateGet(account.id, remote.episodeId)
        if (local?.dirtyMask || remote.episodeId === this.currentEpisodeId) continue
        if (local && remote.serverUpdatedAt < local.serverUpdatedAt) continue
        await global.lx.worker.dbService.podcastEpisodeStateSave({
          accountId: account.id,
          episodeId: remote.episodeId,
          positionSeconds: remote.positionSeconds,
          isFinished: remote.isFinished,
          isFavorite: remote.isFavorite,
          dirtyMask: 0,
          clientUpdatedAt: local?.clientUpdatedAt ?? remote.serverUpdatedAt,
          serverUpdatedAt: remote.serverUpdatedAt,
        })
      }

      const preferencesDirty = syncState.outbox.includes(PREFERENCES_OUTBOX_KEY)
      if (preferencesDirty) {
        const sources = await global.lx.worker.dbService.podcastSourcesGet()
        const groups = await global.lx.worker.dbService.podcastSubscriptionGroupsGet()
        await this.client.pushPreferences({
          user_id: account.id,
          client_updated_at: unixNow(),
          subscriptions_json: serializeSubscriptionSnapshot(groups, sources),
        })
      } else if (pull.subscriptions) {
        if (Array.isArray(pull.subscriptions)) {
          await global.lx.worker.dbService.podcastSourceSubscriptionsReplace(pull.subscriptions)
        } else {
          await global.lx.worker.dbService.podcastSubscriptionSnapshotReplace(pull.subscriptions)
        }
      }

      syncState = {
        ...syncState,
        watermark: Math.max(syncState.watermark, pull.serverTime),
        outbox: preferencesDirty
          ? syncState.outbox.filter((item) => item !== PREFERENCES_OUTBOX_KEY)
          : syncState.outbox,
        updatedAt: Date.now(),
      }
      await global.lx.worker.dbService.podcastSyncStateSave(syncState)
      if (this.session.account?.id !== account.id) return this.session
      this.session = { ...this.session, syncState: 'idle' }
    } catch (error) {
      if (this.session.account?.id !== account.id) return this.session
      if (error instanceof AurioClubError && error.status === 401) {
        this.session = { ...this.session, syncState: 'reauth-required', error: error.message }
      } else {
        this.session = {
          ...this.session,
          syncState: 'error',
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }
    return this.session
  }

  private async saveProgress(episodeId: string, positionSeconds: number, isFinished: boolean) {
    const job = this.asrJobs.get(episodeId)
    if (job && Number.isFinite(positionSeconds)) job.positionMs = Math.max(0, positionSeconds * 1_000)
    const accountId = this.session.account?.id ?? LOCAL_ACCOUNT_ID
    const current = await global.lx.worker.dbService.podcastEpisodeStateGet(accountId, episodeId)
    const next: LX.Podcast.EpisodeState = {
      accountId,
      episodeId,
      positionSeconds: Math.max(0, Number.isFinite(positionSeconds) ? positionSeconds : 0),
      isFinished,
      isFavorite: current?.isFavorite ?? false,
      dirtyMask: accountId === LOCAL_ACCOUNT_ID ? 0 : PROGRESS_DIRTY_MASK,
      clientUpdatedAt: unixNow(),
      serverUpdatedAt: current?.serverUpdatedAt ?? 0,
    }
    await global.lx.worker.dbService.podcastEpisodeStateSave(next)
    this.scheduleSync()
    return next
  }

  private async episodeStates(episodeIds: string[]): Promise<LX.Podcast.EpisodeState[]> {
    const accountId = this.session.account?.id ?? LOCAL_ACCOUNT_ID
    const states = await Promise.all(
      [...new Set(episodeIds)].map((episodeId) =>
        global.lx.worker.dbService.podcastEpisodeStateGet(accountId, episodeId)
      )
    )
    return states.filter((state): state is LX.Podcast.EpisodeState => state != null)
  }

  private async library(kind: 'favorites' | 'history'): Promise<LX.Podcast.LibraryItem[]> {
    const accountId = this.session.account?.id ?? LOCAL_ACCOUNT_ID
    const states = await global.lx.worker.dbService.podcastEpisodeStatesGet(accountId)
    const selected = states
      .filter((state) => kind === 'favorites'
        ? state.isFavorite
        : state.positionSeconds > 0 || state.isFinished)
      .sort((left, right) => right.clientUpdatedAt - left.clientUpdatedAt)
    const sources = await global.lx.worker.dbService.podcastSourcesGet()
    const sourceById = new Map(sources.map((source) => [source.id, source]))
    const items = await Promise.all(selected.map(async (state) => {
      const episode = await global.lx.worker.dbService.podcastEpisodeGet(state.episodeId)
      const source = episode ? sourceById.get(episode.sourceId) : undefined
      return episode && source ? { episode, source, state } : null
    }))
    return items.filter((item): item is LX.Podcast.LibraryItem => item != null)
  }

  private async setFavorite(
    episodeId: string,
    isFavorite: boolean
  ): Promise<LX.Podcast.EpisodeState> {
    const accountId = this.session.account?.id ?? LOCAL_ACCOUNT_ID
    const current = await global.lx.worker.dbService.podcastEpisodeStateGet(accountId, episodeId)
    const next: LX.Podcast.EpisodeState = {
      accountId,
      episodeId,
      positionSeconds: current?.positionSeconds ?? 0,
      isFinished: current?.isFinished ?? false,
      isFavorite,
      dirtyMask: accountId === LOCAL_ACCOUNT_ID ? 0 : PROGRESS_DIRTY_MASK,
      clientUpdatedAt: unixNow(),
      serverUpdatedAt: current?.serverUpdatedAt ?? 0,
    }
    await global.lx.worker.dbService.podcastEpisodeStateSave(next)
    this.scheduleSync()
    return next
  }

  private async saveSubscriptionGroup(
    value: Partial<LX.Podcast.SubscriptionGroup> & { name: string }
  ) {
    const name = value.name.trim()
    if (!name) throw new Error('分组名称不能为空')
    const groups = await global.lx.worker.dbService.podcastSubscriptionGroupsGet()
    const group: LX.Podcast.SubscriptionGroup = {
      id: value.id?.trim() || `group_${randomUUID()}`,
      name,
      isExpanded: value.isExpanded ?? true,
      sortOrder: value.sortOrder ?? groups.length,
    }
    await global.lx.worker.dbService.podcastSubscriptionGroupSave(group)
    await this.markPreferencesDirty()
    return group
  }

  private async deleteSubscriptionGroup(groupId: string) {
    if (groupId === 'default_group') throw new Error('默认分组不能删除')
    await global.lx.worker.dbService.podcastSubscriptionGroupDelete(groupId)
    await this.markPreferencesDirty()
  }

  private async moveSubscriptionSource(sourceId: string, groupId: string) {
    const groups = await global.lx.worker.dbService.podcastSubscriptionGroupsGet()
    if (!groups.some((group) => group.id === groupId)) throw new Error('目标分组不存在')
    await global.lx.worker.dbService.podcastSourceGroupSet(sourceId, groupId)
    await this.markPreferencesDirty()
  }

  private async importOpml(filePath: string) {
    const snapshot = parseOpml(await readFile(filePath, 'utf8'))
    await global.lx.worker.dbService.podcastSubscriptionSnapshotReplace(snapshot)
    await this.markPreferencesDirty()
    return snapshot
  }

  private async exportOpml(filePath: string) {
    const groups = await global.lx.worker.dbService.podcastSubscriptionGroupsGet()
    const sources = await global.lx.worker.dbService.podcastSourcesGet()
    await writeFile(filePath, buildOpml(createSubscriptionSnapshot(groups, sources)), 'utf8')
    return filePath
  }

  private async markPreferencesDirty() {
    const accountId = this.session.account?.id
    if (!accountId) return
    const state = await global.lx.worker.dbService.podcastSyncStateGet(accountId)
    if (!state.outbox.includes(PREFERENCES_OUTBOX_KEY)) {
      await global.lx.worker.dbService.podcastSyncStateSave({
        ...state,
        outbox: [...state.outbox, PREFERENCES_OUTBOX_KEY],
        updatedAt: Date.now(),
      })
    }
    this.scheduleSync()
  }

  private scheduleSync() {
    if (!this.session.account || !this.session.syncEnabled) return
    if (this.syncTimer) clearTimeout(this.syncTimer)
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null
      void this.syncNow()
    }, 2_000)
  }

  private async loadSession() {
    try {
      const raw = JSON.parse(await readFile(this.sessionPath, 'utf8')) as {
        token?: string
        deviceId?: string
        aiApiKey?: string
      }
      this.deviceId = typeof raw.deviceId === 'string' ? raw.deviceId : ''
      if (raw.token && safeStorage.isEncryptionAvailable()) {
        this.token = safeStorage.decryptString(Buffer.from(raw.token, 'base64'))
      }
      if (raw.aiApiKey && safeStorage.isEncryptionAvailable()) {
        this.aiApiKey = safeStorage.decryptString(Buffer.from(raw.aiApiKey, 'base64'))
      }
    } catch {}
  }

  private async persistSession() {
    await mkdir(path.dirname(this.sessionPath), { recursive: true })
    const token =
      this.token && safeStorage.isEncryptionAvailable()
        ? safeStorage.encryptString(this.token).toString('base64')
        : undefined
    const aiApiKey = this.aiApiKey && safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(this.aiApiKey).toString('base64')
      : undefined
    await writeFile(this.sessionPath, JSON.stringify({ token, aiApiKey, deviceId: this.deviceId }), {
      encoding: 'utf8',
      mode: 0o600,
    })
  }

  private get sessionPath() {
    return path.join(global.lxDataPath, 'podcast', 'session.json')
  }
}

const speakerIdentityMessage = (snapshot: LX.Podcast.TranscriptSnapshot) => {
  const count = snapshot.speakers.filter((speaker) => speaker.origin === 'ai').length
  return count > 0
    ? `AI 已标注 ${count} 位说话人`
    : 'AI 未找到足够可信的身份，已保留本地说话人标签'
}

const emptyTranscript = (contentId: string): LX.Podcast.TranscriptSnapshot => ({
  protocolVersion: 2,
  contentId,
  revision: 0,
  state: 'missing',
  source: 'asr',
  language: 'auto',
  isPartial: false,
  lines: [],
  speakers: [],
  completedSegmentIndexes: [],
})

const needsWordTimingUpgrade = (
  snapshot: LX.Podcast.TranscriptSnapshot | null
) => !!snapshot &&
  snapshot.source === 'asr' &&
  snapshot.lines.length > 0 &&
  snapshot.speakers.length > 0 &&
  snapshot.lines.some((line) => !!line.speakerId) &&
  (snapshot.wordTimingUpgrade === true || (
    snapshot.state === 'ready' &&
    snapshot.lines.every((line) => line.words.length === 0)
  ))

const completedSegmentIndexes = (
  snapshot: LX.Podcast.TranscriptSnapshot | null | undefined,
  contentId: string
) => {
  if (!snapshot) return []
  const values = new Set(
    (snapshot.completedSegmentIndexes ?? [])
      .filter((value) => Number.isSafeInteger(value) && value >= 0)
  )
  if (snapshot.wordTimingUpgrade) return [...values].sort((a, b) => a - b)
  const prefix = `${contentId}:segment-`
  for (const line of snapshot.lines) {
    if (!line.id.startsWith(prefix)) continue
    const index = Number.parseInt(line.id.slice(prefix.length).split(':', 1)[0], 10)
    if (Number.isSafeInteger(index) && index >= 0) values.add(index)
  }
  return [...values].sort((a, b) => a - b)
}

const normalizeCatalog = (value: unknown): LX.Podcast.Source[] => {
  const record = asRecord(value)
  const list = Array.isArray(value)
    ? value
    : Array.isArray(record.podcasts)
      ? record.podcasts
      : Array.isArray(record.items)
        ? record.items
        : []
  return list.map(normalizeSource).filter((source) => source.feedUrl)
}

const normalizeItunes = (value: unknown): LX.Podcast.Source[] => {
  const record = asRecord(value)
  const list = Array.isArray(record.results) ? record.results : []
  return list
    .map((item) => {
      const value = asRecord(item)
      return normalizeSource({
        id: value.collectionId,
        title: value.collectionName,
        author: value.artistName,
        description: '',
        artwork_url: value.artworkUrl600 ?? value.artworkUrl100,
        rss_url: value.feedUrl,
        categories: value.genres,
      })
    })
    .filter((source) => source.feedUrl)
}

const normalizeSource = (value: unknown): LX.Podcast.Source => {
  const item = asRecord(value)
  const feedUrl = stringValue(item.rss_url ?? item.feed_url ?? item.feedUrl ?? item.url)
  return {
    id: stringValue(item.id) || createHash('sha256').update(feedUrl).digest('hex'),
    title: localizedValue(item.title, item.name, parseJson(item.name_json)),
    author: stringValue(item.host ?? item.author ?? item.publisher),
    description: localizedValue(
      item.description,
      item.summary,
      parseJson(item.description_json)
    ),
    artworkUrl: stringValue(
      item.cover_url ?? item.artwork_url ?? item.artworkUrl ?? item.image
    ),
    feedUrl,
    categories: Array.isArray(item.tags ?? item.categories)
      ? (item.tags ?? item.categories).map((value: unknown) => localizedValue(value)).filter(Boolean)
      : [],
    subscribed: false,
    autoDownload: false,
    groupId: 'default_group',
    subscriptionOrder: 0,
    updatedAt: Date.now(),
  }
}

const normalizeUser = (value: unknown): LX.Podcast.Account => {
  const record = asRecord(value)
  const item = asRecord(record.user ?? record.profile ?? value)
  const id = stringValue(item.id ?? item.user_id)
  if (!id) throw new Error('AurioClub 用户响应缺少 id')
  return { id, email: stringValue(item.email), username: stringValue(item.username) }
}
const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' ? (value as Record<string, any>) : {}
const stringValue = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''

const parseJson = (value: unknown): unknown => {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

const localizedValue = (...values: unknown[]): string => {
  for (const raw of values) {
    const value = parseJson(raw)
    const direct = stringValue(value)
    if (direct) return direct
    const item = asRecord(value)
    for (const key of ['zh', 'zh-CN', 'zh_CN', 'en']) {
      const text = stringValue(item[key])
      if (text) return text
    }
    const fallback = Object.values(item).map(stringValue).find(Boolean)
    if (fallback) return fallback
  }
  return ''
}

interface RemoteEpisodeState {
  episodeId: string
  positionSeconds: number
  isFinished: boolean
  isFavorite: boolean
  serverUpdatedAt: number
}

const normalizePull = (value: unknown): {
  states: RemoteEpisodeState[]
  subscriptions: LX.Podcast.SubscriptionSnapshot | string[] | null
  serverTime: number
} => {
  const item = asRecord(value)
  const states = Array.isArray(item.states)
    ? item.states
        .map((raw: unknown) => {
          const state = asRecord(raw)
          return {
            episodeId: stringValue(state.podcast_id ?? state.episode_id),
            positionSeconds: Math.max(0, Number(state.position_seconds) || 0),
            isFinished: Boolean(Number(state.is_finished)),
            isFavorite: Boolean(Number(state.is_favorite)),
            serverUpdatedAt: Math.max(0, Number(state.server_updated_at) || 0),
          }
        })
        .filter((state: RemoteEpisodeState) => state.episodeId)
    : []
  const preferences = asRecord(item.preferences)
  return {
    states,
    subscriptions: parseSubscriptionPreferences(preferences.subscriptions_json),
    serverTime: Math.max(0, Number(item.server_time) || 0),
  }
}

const toRemoteProgress = (state: LX.Podcast.EpisodeState) => ({
  podcast_id: state.episodeId,
  client_updated_at: state.clientUpdatedAt,
  position_seconds: state.positionSeconds,
  is_finished: state.isFinished ? 1 : 0,
  is_favorite: state.isFavorite ? 1 : 0,
  article_metadata_json: '{}',
})

const unixNow = () => Math.floor(Date.now() / 1000)

export const LOCAL_PODCAST_ACCOUNT_ID = LOCAL_ACCOUNT_ID
