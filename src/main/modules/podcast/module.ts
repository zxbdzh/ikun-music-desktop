import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { app, safeStorage } from 'electron'
import { AurioClubClient, AurioClubError, assertPublicHttpUrl } from './aurioClubClient'
import { parsePublisherTranscript } from './captions'
import { parsePodcastFeed } from './rss'
import { createTranscriptDelta, transcriptDescriptor } from './transcript'
import {
  createLongFormContent,
  longFormContentDescriptor,
  parseLongFormContent,
} from './longFormContent'
import { PodcastStorage } from './storage'
import { simplifyAsrSnapshot } from './simplifiedChinese'
import {
  createSubscriptionSnapshot,
  parseSubscriptionPreferences,
  serializeSubscriptionSnapshot,
} from './syncPreferences'
import {
  articleMetadataFromPodcast,
  encodeArticleMetadata,
  parseArticleMetadataJson,
  restorePodcastEntities,
  longFormContentFromArticleMetadata,
  type ArticleMetadata,
} from './syncMetadata'
import { normalizePopularSources } from './discovery'
import { buildOpml, parseOpml } from './opml'
import {
  VOXRAIL_RETRY_WINDOW_MS,
  VoxrailClient,
  VoxrailError,
  localizeVoxrailSnapshot,
  normalizeVoxrailBaseUrl,
  type VoxrailRequestResponse,
  type VoxrailTranscriptionProgress,
} from './voxrailClient'

const LOCAL_ACCOUNT_ID = 'local'
const PROGRESS_DIRTY_MASK = 0b11
const PREFERENCES_OUTBOX_KEY = 'subscriptions'

interface VoxrailJob {
  controller: AbortController
  promise: Promise<LX.Podcast.TranscriptSnapshot | null>
  queuedAt: number
  requestId?: string
  lastRevisionId?: string
}

export class PodcastModule {
  private token: string | null = null
  private voxrailAccessKey: string | null = null
  private session: LX.Podcast.Session = {
    account: null,
    syncEnabled: false,
    syncState: 'local',
  }
  private currentTranscript: LX.Podcast.TranscriptSnapshot | null = null
  private currentLongFormContent: LX.Podcast.LongFormContentDocument | null = null
  private readonly transcriptionStatuses = new Map<string, LX.Podcast.TranscriptionStatus>()
  private readonly transcriptHistory = new Map<
    string,
    Map<number, LX.Podcast.TranscriptSnapshot>
  >()
  private currentEpisodeId: string | null = null
  private deviceId = ''
  private readonly analyticsSessionId = randomUUID()
  private syncTask: Promise<LX.Podcast.Session> | null = null
  private syncTimer: ReturnType<typeof setTimeout> | null = null
  private initialized = false
  private readonly client: AurioClubClient
  private readonly storage = new PodcastStorage()
  private readonly voxrailJobs = new Map<string, VoxrailJob>()
  private readonly voxrail: VoxrailClient

  constructor(client?: AurioClubClient) {
    this.client =
      client ??
      new AurioClubClient({
        getToken: async () => this.token,
      })
    this.voxrail = new VoxrailClient({
      getBaseUrl: () => global.lx.appSetting['podcast.voxrailBaseUrl'],
      getAccessKey: () => this.voxrailAccessKey,
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
        return this.library(command.kind, command.cursor, command.limit)
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
      case 'long-form-content':
        return this.longFormContent(command.episodeId)
      case 'transcription-status':
        return this.loadTranscriptionStatus(command.episodeId)
      case 'voxrail-config':
        return this.getVoxrailConfig()
      case 'voxrail-config-save':
        return this.saveVoxrailConfig(command.baseUrl, command.accessKey)
      case 'voxrail-key-remove':
        return this.removeVoxrailKey()
      case 'voxrail-test':
        return this.voxrail.quota()
      case 'activate-episode':
        return this.activateEpisode(command.episodeId)
      case 'deactivate-episode':
        this.currentEpisodeId = null
        this.currentTranscript = null
        this.currentLongFormContent = null
        global.lx.event_app.player_status({ transcript: null, longFormContent: null })
        return undefined
      case 'download-states':
        return this.downloadStates(command.episodeIds)
      case 'download-episode':
        return this.downloadEpisode(command.episodeId)
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
      case 'register-password':
        return this.login(
          await this.client.registerPassword(command.email, command.code, command.password)
        )
      case 'reset-password':
        return this.client.resetPassword(command.email, command.code, command.newPassword)
      case 'update-profile':
        return this.updateProfile(command.username)
      case 'change-password':
        if (!this.session.account) throw new Error('请先登录 AurioClub')
        return this.client.changePassword(command.oldPassword, command.newPassword)
      case 'link-device':
        return this.linkDevice(command.migrateGuestData)
      case 'track-event':
        return this.trackEvent(command.event, command.targetId, command.properties)
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

  async longFormContent(
    episodeId: string,
    requireCurrent = false
  ): Promise<LX.Podcast.LongFormContentDocument | null> {
    if (requireCurrent && episodeId !== this.currentEpisodeId) return null
    let document = parseLongFormContent(
      await global.lx.worker.dbService.podcastLongFormContentGet(episodeId)
    )
    if (document) return document
    const episode = await global.lx.worker.dbService.podcastEpisodeGet(episodeId)
    if (!episode || !episode.description.trim()) return null
    document = createLongFormContent({
      contentId: episode.id,
      title: episode.title,
      content: episode.description,
      originalUrl: episode.originalUrl,
      audioUrl: episode.audioUrl,
    })
    const structuredDescription = /<\/?[a-z][^>]*>|\n\s*\n/i.test(episode.description)
    const articleWithoutAudio = !!episode.originalUrl?.trim() && !episode.audioUrl.trim()
    if (
      !document ||
      (!articleWithoutAudio && !structuredDescription && document.characterCount < 280)
    ) return null
    await global.lx.worker.dbService.podcastLongFormContentsSave([document])
    return document
  }

  getTranscriptionStatus(contentId?: string): LX.Podcast.TranscriptionStatus | null {
    if (contentId) return this.transcriptionStatuses.get(contentId) ?? null
    return this.currentEpisodeId
      ? this.transcriptionStatuses.get(this.currentEpisodeId) ?? null
      : null
  }

  shutdown() {
    for (const job of this.voxrailJobs.values()) job.controller.abort()
    this.voxrailJobs.clear()
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
    let snapshot = !forceReload && this.currentEpisodeId === episodeId &&
      this.currentTranscript?.source === 'publisher'
      ? this.currentTranscript
      : await this.loadPublisherTranscript(episodeId).catch((error) => {
        console.warn('[podcast] publisher transcript unavailable:', error instanceof Error ? error.message : error)
        return null
      })
    if (!snapshot && !forceReload && this.currentEpisodeId === episodeId) {
      snapshot = this.currentTranscript
    }
    if (snapshot) snapshot = await this.normalizeStoredTranscript(snapshot)
    if (!snapshot && !forceReload) snapshot = await this.loadStoredTranscript(episodeId)
    if (!snapshot || snapshot.state !== 'ready') {
      void this.ensureVoxrailTranscript(episodeId).catch((error) => {
        console.warn('[podcast] Voxrail transcript unavailable:', error instanceof Error ? error.message : error)
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
        longFormContent: this.currentLongFormContent
          ? longFormContentDescriptor(this.currentLongFormContent)
          : null,
      })
    }
    const baseSnapshot = this.transcriptHistory.get(episodeId)?.get(sinceRevision)
    return createTranscriptDelta(snapshot, sinceRevision, baseSnapshot)
  }

  private async activateEpisode(episodeId: string): Promise<LX.Podcast.Episode> {
    const episode = await global.lx.worker.dbService.podcastEpisodeGet(episodeId)
    if (!episode) throw new Error('找不到播客单集')
    const source = await this.episodeSource(episode)
    const hasAudio = !!episode.audioUrl.trim()
    this.currentEpisodeId = episodeId
    this.currentTranscript = null
    const longFormContent = await this.longFormContent(episodeId)
    this.currentLongFormContent = longFormContent
    global.lx.event_app.player_status({
      name: episode.title,
      singer: source?.title ?? '',
      albumName: source?.title ?? '',
      picUrl: episode.artworkUrl || source?.artworkUrl || '',
      lyric: '',
      tlyric: '',
      rlyric: '',
      lxlyric: '',
      lyricLineText: '',
      lyricLineAllText: '',
      lyricLineStartMs: 0,
      progress: 0,
      duration: hasAudio ? episode.durationSeconds : 0,
      mediaKind: 'podcast',
      contentId: episode.id,
      transcript: null,
      longFormContent: longFormContent ? longFormContentDescriptor(longFormContent) : null,
    })
    if (hasAudio || !longFormContent) {
      void this.transcript(episode.id).catch((error) => {
        console.warn('[podcast] transcript unavailable:', error instanceof Error ? error.message : error)
      })
    }
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
    await global.lx.worker.dbService.podcastLongFormContentsSave(feed.longFormContents)
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
              .filter((episode) => !!episode.audioUrl.trim())
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

  private async ensureVoxrailTranscript(
    episodeId: string
  ): Promise<LX.Podcast.TranscriptSnapshot | null> {
    const active = this.voxrailJobs.get(episodeId)
    if (active) return active.promise
    const status = this.getTranscriptionStatus(episodeId)
    if (
      status?.transcriptSource === 'voxrail' &&
      status.stage === 'failed' &&
      Date.now() - status.updatedAt < VOXRAIL_RETRY_WINDOW_MS
    ) return null
    const episode = await global.lx.worker.dbService.podcastEpisodeGet(episodeId)
    if (!episode) return null
    const source = await this.episodeSource(episode)
    if (!source?.feedUrl) return null
    const queuedAt = Date.now()
    const job: VoxrailJob = {
      controller: new AbortController(),
      queuedAt,
      promise: Promise.resolve(null),
    }
    this.voxrailJobs.set(episodeId, job)
    this.publishTranscriptionStatus(this.createVoxrailStatus(episodeId, 'queued', queuedAt))
    job.promise = this.runVoxrailJob(episode, source.feedUrl, job)
      .catch((error) => {
        if (job.controller.signal.aborted) return null
        const message = error instanceof Error ? error.message : String(error)
        this.publishTranscriptionStatus({
          ...this.createVoxrailStatus(episodeId, 'failed', queuedAt),
          error: message,
        })
        return null
      })
      .finally(() => {
        if (this.voxrailJobs.get(episodeId) === job) this.voxrailJobs.delete(episodeId)
      })
    return job.promise
  }

  private async runVoxrailJob(
    episode: LX.Podcast.Episode,
    feedUrl: string,
    job: VoxrailJob
  ): Promise<LX.Podcast.TranscriptSnapshot | null> {
    let response: VoxrailRequestResponse | null = null
    let networkFailures = 0
    while (!response && !job.controller.signal.aborted) {
      try {
        response = await this.voxrail.createRequest(episode, feedUrl, job.controller.signal)
      } catch (error) {
        if (job.controller.signal.aborted) throw error
        if (!(error instanceof VoxrailError) || error.code !== 'network_error') throw error
        networkFailures += 1
        if (networkFailures >= 5) throw error
        await waitForVoxrailPoll(job.controller.signal, 5_000)
      }
    }
    if (!response) return null
    job.requestId = response.requestId
    networkFailures = 0
    while (!job.controller.signal.aborted) {
      const snapshot = await this.acceptVoxrailResponse(episode.id, response, job)
      if (response.status === 'completed') {
        if (snapshot) return snapshot
        const stored = await this.loadStoredTranscript(episode.id)
        if (stored?.source === 'voxrail' && stored.state === 'ready') return stored
        if (response.transcript?.kind === 'publisher') {
          const publisher = await this.loadPublisherTranscript(episode.id)
          if (publisher) return publisher
        }
        throw new VoxrailError('Voxrail 已完成任务但未返回可用字幕', 'transcript_missing', 502)
      }
      if (response.status === 'failed' || response.status === 'cancelled') {
        throw new VoxrailError(
          response.warnings[0] || 'Voxrail 云端转写失败',
          `request_${response.status}`,
          502
        )
      }
      this.publishTranscriptionStatus(
        this.createVoxrailStatus(
          episode.id,
          response.status,
          job.queuedAt,
          snapshot?.revision ?? 0,
          response.progress
        )
      )
      await waitForVoxrailPoll(job.controller.signal, networkFailures ? 5_000 : 2_000)
      try {
        response = await this.voxrail.getRequest(response.requestId, job.controller.signal)
        networkFailures = 0
      } catch (error) {
        if (job.controller.signal.aborted) throw error
        if (!(error instanceof VoxrailError) || error.code !== 'network_error') throw error
        networkFailures += 1
        if (networkFailures >= 5) throw error
      }
    }
    return null
  }

  private async acceptVoxrailResponse(
    episodeId: string,
    response: VoxrailRequestResponse,
    job: VoxrailJob
  ) {
    const transcript = response.transcript
    if (!transcript || transcript.kind === 'publisher' || transcript.revisionId === job.lastRevisionId) {
      return null
    }
    const previous = await this.loadStoredTranscript(episodeId)
    const snapshot = localizeVoxrailSnapshot(
      transcript.content,
      episodeId,
      previous?.revision ?? 0
    )
    job.lastRevisionId = transcript.revisionId
    await this.publishSnapshot(snapshot, `voxrail:${transcript.revisionId}`)
    this.publishTranscriptionStatus({
      ...this.statusFromSnapshot(snapshot),
      queuedAt: job.queuedAt,
      startedAt: job.queuedAt,
      stage: snapshot.state === 'ready' ? 'completed' : 'running',
    })
    return snapshot
  }

  private createVoxrailStatus(
    contentId: string,
    status: 'queued' | 'running' | 'failed',
    queuedAt: number,
    revision = 0,
    remoteProgress?: VoxrailTranscriptionProgress
  ): LX.Podcast.TranscriptionStatus {
    return {
      protocolVersion: 2,
      contentId,
      transcriptState: status === 'failed' ? 'failed' : 'preparing',
      transcriptSource: 'voxrail',
      revision,
      isPartial: status !== 'failed',
      stage: status === 'queued' ? 'queued' : status === 'running' ? 'running' : 'failed',
      progress: remoteProgress?.percent == null ? null : remoteProgress.percent / 100,
      ...(remoteProgress ? { progressStage: remoteProgress.stage } : {}),
      ...(remoteProgress?.processedSeconds == null
        ? {}
        : { processedSeconds: remoteProgress.processedSeconds }),
      ...(remoteProgress?.totalSeconds == null
        ? {}
        : { totalSeconds: remoteProgress.totalSeconds }),
      queuedAt,
      startedAt: status === 'running' ? queuedAt : undefined,
      lastHeartbeatAt: Date.now(),
      updatedAt: Date.now(),
    }
  }

  private getVoxrailConfig(): LX.Podcast.VoxrailConfig {
    return {
      baseUrl: global.lx.appSetting['podcast.voxrailBaseUrl'],
      hasAccessKey: !!this.voxrailAccessKey,
    }
  }

  private async saveVoxrailConfig(
    baseUrl: string,
    accessKey?: string
  ): Promise<LX.Podcast.VoxrailConfig> {
    const normalized = normalizeVoxrailBaseUrl(baseUrl)
    global.lx.event_app.update_config({ 'podcast.voxrailBaseUrl': normalized })
    if (accessKey?.trim()) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('当前系统无法安全保存 Voxrail Key')
      this.voxrailAccessKey = accessKey.trim()
      await this.persistSession()
    }
    for (const [contentId, status] of this.transcriptionStatuses) {
      if (status.transcriptSource === 'voxrail' && status.stage === 'failed') {
        this.transcriptionStatuses.delete(contentId)
      }
    }
    return this.getVoxrailConfig()
  }

  private async removeVoxrailKey(): Promise<LX.Podcast.VoxrailConfig> {
    this.voxrailAccessKey = null
    await this.persistSession()
    return this.getVoxrailConfig()
  }

  private statusFromSnapshot(snapshot: LX.Podcast.TranscriptSnapshot): LX.Podcast.TranscriptionStatus {
    const current = this.getTranscriptionStatus(snapshot.contentId)
    const stage: LX.Podcast.TranscriptionStage = snapshot.state === 'ready'
      ? 'completed'
      : snapshot.state === 'failed'
        ? 'failed'
        : snapshot.state === 'preparing'
          ? current?.stage ?? (snapshot.source === 'voxrail' ? 'queued' : 'idle')
          : 'idle'
    return {
      protocolVersion: 2,
      contentId: snapshot.contentId,
      transcriptState: snapshot.state,
      transcriptSource: snapshot.source,
      revision: snapshot.revision,
      isPartial: snapshot.isPartial,
      stage,
      progress: stage === 'completed' ? 1 : current?.progress ?? null,
      progressStage: current?.progressStage,
      processedSeconds: current?.processedSeconds,
      totalSeconds: current?.totalSeconds,
      speakerCount: snapshot.speakers.length || current?.speakerCount,
      speakerLabels: snapshot.speakers.map((speaker) => speaker.name).slice(0, 32),
      queuedAt: current?.queuedAt,
      startedAt: current?.startedAt,
      lastHeartbeatAt: current?.lastHeartbeatAt,
      error: snapshot.error ?? current?.error,
      updatedAt: Date.now(),
    }
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

  private async updateProfile(username: string): Promise<LX.Podcast.Session> {
    if (!this.session.account) throw new Error('请先登录 AurioClub')
    const account = normalizeUser(await this.client.updateProfile(username))
    this.session = { ...this.session, account }
    return this.session
  }

  private async linkDevice(migrateGuestData: boolean): Promise<LX.Podcast.Session> {
    if (!this.session.account) throw new Error('请先登录 AurioClub')
    await this.client.linkDevice(this.deviceId, migrateGuestData)
    return this.syncNow()
  }

  private async trackEvent(
    event: string,
    targetId?: string,
    properties: Record<string, unknown> = {}
  ): Promise<void> {
    const eventName = event.trim()
    if (!eventName) return
    try {
      await this.client.track([{
        d_id: this.deviceId,
        u_id: this.session.account?.id ?? null,
        s_id: this.analyticsSessionId,
        p_form: 'desktop',
        v_name: app.getVersion(),
        event: eventName,
        t_id: targetId?.trim() || null,
        ts: Date.now(),
        props: properties,
      }])
    } catch (error) {
      console.warn(
        `[podcast] analytics event ${eventName} was not sent:`,
        error instanceof Error ? error.message : error
      )
    }
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
        const sources = await global.lx.worker.dbService.podcastSourcesGet()
        const sourceById = new Map(sources.map((source) => [source.id, source]))
        const items = await Promise.all(dirtyStates.map(async (state) => {
          const episode = await global.lx.worker.dbService.podcastEpisodeGet(state.episodeId)
          const longFormContent = episode ? await this.longFormContent(episode.id) : null
          const metadata = episode
            ? encodeArticleMetadata(articleMetadataFromPodcast(
                episode,
                sourceById.get(episode.sourceId),
                longFormContent
              ))
            : null
          return toRemoteProgress(state, metadata)
        }))
        await this.client.pushProgressBatch({
          user_id: account.id,
          device_id: this.deviceId,
          items,
        })
        await global.lx.worker.dbService.podcastEpisodeStatesMarkClean(dirtyStates)
      }

      const pull = normalizePull(await this.client.pull(Math.max(0, syncState.watermark - 5)))
      let sourceById: Map<string, LX.Podcast.Source> | null = null
      for (const remote of pull.states) {
        if (remote.articleMetadata) {
          const existingEpisode = await global.lx.worker.dbService
            .podcastEpisodeGet(remote.episodeId)
          const existingLongFormContent = existingEpisode
            ? await this.longFormContent(existingEpisode.id)
            : null
          const restored = restorePodcastEntities(remote.articleMetadata, remote.serverUpdatedAt)
          const longFormContent = longFormContentFromArticleMetadata(remote.articleMetadata)
          sourceById ??= new Map(
            (await global.lx.worker.dbService.podcastSourcesGet())
              .map((source) => [source.id, source])
          )
          const requiredSourceId = existingEpisode?.sourceId ?? restored.source.id
          if (!sourceById.has(requiredSourceId)) {
            const source = { ...restored.source, id: requiredSourceId }
            await global.lx.worker.dbService.podcastSourcesSave([source])
            sourceById.set(source.id, source)
          }
          if (!existingEpisode) {
            await global.lx.worker.dbService.podcastEpisodesSave([restored.episode])
          } else {
            const originalUrl = existingEpisode.originalUrl?.trim()
              ? existingEpisode.originalUrl
              : restored.episode.originalUrl || existingEpisode.originalUrl
            const audioUrl = existingEpisode.audioUrl.trim()
              ? existingEpisode.audioUrl
              : restored.episode.audioUrl || existingEpisode.audioUrl
            if (
              originalUrl !== existingEpisode.originalUrl ||
              audioUrl !== existingEpisode.audioUrl
            ) {
              await global.lx.worker.dbService.podcastEpisodesSave([{
                ...existingEpisode,
                originalUrl,
                audioUrl,
              }])
            }
          }
          if (longFormContent && !existingLongFormContent) {
            await global.lx.worker.dbService.podcastLongFormContentsSave([longFormContent])
          }
        }
        const local = await global.lx.worker.dbService.podcastEpisodeStateGet(account.id, remote.episodeId)
        if (local?.dirtyMask || remote.episodeId === this.currentEpisodeId) continue
        if (local && remote.serverUpdatedAt < local.serverUpdatedAt) continue
        await global.lx.worker.dbService.podcastEpisodeStateSave({
          accountId: account.id,
          episodeId: remote.episodeId,
          positionSeconds: remote.positionSeconds,
          isFinished: remote.isFinished,
          isFavorite: remote.isFavorite,
          historyHidden: remote.historyHidden,
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
    const accountId = this.session.account?.id ?? LOCAL_ACCOUNT_ID
    const current = await global.lx.worker.dbService.podcastEpisodeStateGet(accountId, episodeId)
    const next: LX.Podcast.EpisodeState = {
      accountId,
      episodeId,
      positionSeconds: Math.max(0, Number.isFinite(positionSeconds) ? positionSeconds : 0),
      isFinished,
      isFavorite: current?.isFavorite ?? false,
      historyHidden: current?.historyHidden ?? false,
      dirtyMask: accountId === LOCAL_ACCOUNT_ID ? 0 : PROGRESS_DIRTY_MASK,
      clientUpdatedAt: unixNow(),
      serverUpdatedAt: current?.serverUpdatedAt ?? 0,
    }
    await global.lx.worker.dbService.podcastEpisodeStateSave(next)
    this.scheduleSync()
    return next
  }

  private async downloadEpisode(episodeId: string): Promise<LX.Podcast.DownloadState> {
    const episode = await global.lx.worker.dbService.podcastEpisodeGet(episodeId)
    if (!episode) throw new Error('找不到播客单集')
    if (!episode.audioUrl.trim()) throw new Error('当前博客没有可下载的音频')
    await this.storage.downloadEpisode(episode, 'download')
    return { episodeId, isDownloaded: true }
  }

  private async downloadStates(episodeIds: string[]): Promise<LX.Podcast.DownloadState[]> {
    return Promise.all([...new Set(episodeIds)].map(async (episodeId) => {
      const episode = await global.lx.worker.dbService.podcastEpisodeGet(episodeId)
      return episode?.audioUrl.trim()
        ? this.storage.downloadState(episode)
        : { episodeId, isDownloaded: false }
    }))
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

  private async library(
    kind: LX.Podcast.LibraryKind,
    cursor?: LX.Podcast.LibraryCursor,
    limit = 50
  ): Promise<LX.Podcast.LibraryPage> {
    const accountId = this.session.account?.id ?? LOCAL_ACCOUNT_ID
    return global.lx.worker.dbService.podcastLibraryPageGet(
      accountId,
      kind,
      cursor,
      limit
    )
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
      historyHidden: current?.historyHidden ?? false,
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
        voxrailAccessKey?: string
      }
      this.deviceId = typeof raw.deviceId === 'string' ? raw.deviceId : ''
      if (raw.token && safeStorage.isEncryptionAvailable()) {
        this.token = safeStorage.decryptString(Buffer.from(raw.token, 'base64'))
      }
      if (raw.voxrailAccessKey && safeStorage.isEncryptionAvailable()) {
        this.voxrailAccessKey = safeStorage.decryptString(
          Buffer.from(raw.voxrailAccessKey, 'base64')
        )
      }
    } catch {}
  }

  private async persistSession() {
    await mkdir(path.dirname(this.sessionPath), { recursive: true })
    const token =
      this.token && safeStorage.isEncryptionAvailable()
        ? safeStorage.encryptString(this.token).toString('base64')
        : undefined
    const voxrailAccessKey = this.voxrailAccessKey && safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(this.voxrailAccessKey).toString('base64')
      : undefined
    await writeFile(this.sessionPath, JSON.stringify({
      token,
      voxrailAccessKey,
      deviceId: this.deviceId,
    }), {
      encoding: 'utf8',
      mode: 0o600,
    })
  }

  private get sessionPath() {
    return path.join(global.lxDataPath, 'podcast', 'session.json')
  }
}

const emptyTranscript = (contentId: string): LX.Podcast.TranscriptSnapshot => ({
  protocolVersion: 2,
  contentId,
  revision: 0,
  state: 'missing',
  source: 'voxrail',
  language: 'auto',
  isPartial: false,
  lines: [],
  speakers: [],
})

const waitForVoxrailPoll = (signal: AbortSignal, delayMs: number) => new Promise<void>(
  (resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new Error('Voxrail polling aborted'))
      return
    }
    const timer = setTimeout(done, delayMs)
    function done() {
      signal.removeEventListener('abort', aborted)
      resolve()
    }
    function aborted() {
      clearTimeout(timer)
      signal.removeEventListener('abort', aborted)
      reject(signal.reason ?? new Error('Voxrail polling aborted'))
    }
    signal.addEventListener('abort', aborted, { once: true })
  }
)

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
  historyHidden: boolean
  articleMetadata: ArticleMetadata | null
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
          const episodeId = stringValue(state.podcast_id ?? state.episode_id)
          return {
            episodeId,
            positionSeconds: Math.max(0, Number(state.position_seconds) || 0),
            isFinished: Boolean(Number(state.is_finished)),
            isFavorite: Boolean(Number(state.is_favorite)),
            historyHidden: Boolean(Number(state.history_hidden)),
            articleMetadata: parseArticleMetadataJson(
              state.article_metadata_json,
              episodeId
            ),
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

const toRemoteProgress = (
  state: LX.Podcast.EpisodeState,
  articleMetadataJson: string | null
) => ({
  podcast_id: state.episodeId,
  client_updated_at: state.clientUpdatedAt,
  position_seconds: state.positionSeconds,
  is_finished: state.isFinished ? 1 : 0,
  is_favorite: state.isFavorite ? 1 : 0,
  history_hidden: state.historyHidden ? 1 : 0,
  ...(articleMetadataJson ? { article_metadata_json: articleMetadataJson } : {}),
})

const unixNow = () => Math.floor(Date.now() / 1000)

export const LOCAL_PODCAST_ACCOUNT_ID = LOCAL_ACCOUNT_ID
