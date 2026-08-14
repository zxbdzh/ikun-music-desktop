declare namespace LX {
  namespace Podcast {
    type TranscriptState = 'missing' | 'preparing' | 'ready' | 'failed' | 'unavailable'

    type TranscriptSource = 'publisher' | 'asr' | 'ai' | 'voxrail'

    type TranscriptionStage =
      | 'idle'
      | 'queued'
      | 'running'
      | 'completed'
      | 'failed'

    type TranscriptionProgressStage =
      | 'downloading-media'
      | 'transcribing'
      | 'diarizing'
      | 'annotating-speakers'
      | 'publishing-final'

    interface TranscriptionStatus {
      protocolVersion: 2
      contentId: string
      transcriptState: TranscriptState
      transcriptSource: TranscriptSource | null
      revision: number
      isPartial: boolean
      stage: TranscriptionStage
      progress: number | null
      progressStage?: TranscriptionProgressStage
      processedSeconds?: number
      totalSeconds?: number
      speakerCount?: number
      speakerLabels?: string[]
      queuedAt?: number
      startedAt?: number
      lastHeartbeatAt?: number
      error?: string
      updatedAt: number
    }

    interface VoxrailConfig {
      baseUrl: string
      hasAccessKey: boolean
    }

    interface VoxrailQuota {
      usedMinutes: number
      reservedMinutes: number
      remainingMinutes: number
      concurrencyLimit: number
      activeJobs: number
      expiresAt: string
    }

    interface Source {
      id: string
      title: string
      author: string
      description: string
      artworkUrl: string
      feedUrl: string
      categories: string[]
      subscribed: boolean
      autoDownload: boolean
      groupId: string
      subscriptionOrder: number
      updatedAt: number
    }

    interface SubscriptionGroup {
      id: string
      name: string
      isExpanded: boolean
      sortOrder: number
    }

    interface SubscriptionSource {
      id: string
      label: string
      type: 0 | 1
      url: string
      groupId: string
      image: string | null
    }

    interface SubscriptionSnapshot {
      groups: SubscriptionGroup[]
      sources: SubscriptionSource[]
    }

    interface TranscriptReference {
      url: string
      type: string
      language?: string
      rel?: string
    }

    interface Chapter {
      id: string
      startSeconds: number
      title: string
      imageUrl?: string
      url?: string
    }

    interface Episode {
      id: string
      sourceId: string
      guid: string
      title: string
      description: string
      artworkUrl: string
      originalUrl?: string
      audioUrl: string
      publishedAt: number
      durationSeconds: number
      transcriptReferences: TranscriptReference[]
      chaptersUrl?: string
      chapters: Chapter[]
      updatedAt: number
    }

    interface Word {
      id: string
      startIndex: number
      length: number
      startMs: number
      endMs: number
    }

    interface Speaker {
      id: string
      name: string
      origin: 'publisher' | 'local' | 'ai' | 'user'
    }

    interface TranscriptLine {
      id: string
      startMs: number
      endMs: number
      displayText: string
      speakerId?: string
      words: Word[]
    }

    interface TranscriptSnapshot {
      protocolVersion: 2
      contentId: string
      revision: number
      state: TranscriptState
      source: TranscriptSource
      language: string
      isPartial: boolean
      lines: TranscriptLine[]
      speakers: Speaker[]
      error?: string
    }

    interface TranscriptDescriptor {
      protocolVersion: 2
      contentId: string
      revision: number
      state: TranscriptState
      isPartial: boolean
    }

    interface TranscriptDelta {
      protocolVersion: 2
      contentId: string
      baseRevision: number
      revision: number
      reset: boolean
      state: TranscriptState
      isPartial: boolean
      upsertLines: TranscriptLine[]
      deletedLineIds: string[]
      speakers: Speaker[]
    }

    type LongFormContentBlockKind = 'heading' | 'paragraph' | 'list-item' | 'quote'

    interface LongFormContentBlock {
      id: string
      kind: LongFormContentBlockKind
      text: string
      level?: number
    }

    interface LongFormContentDescriptor {
      protocolVersion: 1
      contentId: string
      revision: number
      blockCount: number
      characterCount: number
    }

    interface LongFormContentDocument extends LongFormContentDescriptor {
      title: string
      blocks: LongFormContentBlock[]
      originalUrl: string | null
      audioUrl: string | null
      shareUrl: string | null
    }

    interface EpisodeState {
      accountId: string
      episodeId: string
      positionSeconds: number
      isFinished: boolean
      isFavorite: boolean
      historyHidden: boolean
      dirtyMask: number
      clientUpdatedAt: number
      serverUpdatedAt: number
    }

    interface DownloadState {
      episodeId: string
      isDownloaded: boolean
    }

    type PopularPeriod = 1 | 7 | 30
    type PopularSort = 'duration' | 'count'

    interface PopularSource {
      source: string
      totalDuration: number
      viewCount: number
    }

    type LibraryKind = 'favorites' | 'history'

    interface LibraryCursor {
      clientUpdatedAt: number
      episodeId: string
    }

    interface LibraryEpisode {
      id: string
      sourceId: string
      title: string
      artworkUrl: string
      originalUrl?: string
      audioUrl: string
      publishedAt: number
      durationSeconds: number
    }

    interface LibrarySource {
      id: string
      title: string
      artworkUrl: string
    }

    interface LibraryItem {
      episode: LibraryEpisode
      source: LibrarySource
      state: EpisodeState
    }

    interface LibraryPage {
      items: LibraryItem[]
      nextCursor: LibraryCursor | null
    }

    interface Account {
      id: string
      email: string
      username: string
    }

    interface Session {
      account: Account | null
      syncEnabled: boolean
      syncState: 'local' | 'idle' | 'syncing' | 'reauth-required' | 'error'
      error?: string
    }

    interface AnalyticsEvent {
      d_id: string
      u_id: string | null
      s_id: string
      p_form: string
      v_name: string
      event: string
      t_id: string | null
      ts: number
      props: Record<string, unknown>
    }

    interface SyncState {
      accountId: string
      watermark: number
      outbox: unknown[]
      updatedAt: number
    }

    type Command =
      | { action: 'catalog'; query?: string }
      | { action: 'popular-sources'; days: PopularPeriod; sort: PopularSort }
      | { action: 'episodes'; sourceId: string; refresh?: boolean }
      | { action: 'episode-states'; episodeIds: string[] }
      | { action: 'library'; kind: LibraryKind; cursor?: LibraryCursor; limit?: number }
      | { action: 'set-favorite'; episodeId: string; isFavorite: boolean }
      | { action: 'subscription-groups' }
      | { action: 'subscription-group-save'; group: Partial<SubscriptionGroup> & { name: string } }
      | { action: 'subscription-group-delete'; groupId: string }
      | { action: 'subscription-source-move'; sourceId: string; groupId: string }
      | { action: 'opml-import'; path: string }
      | { action: 'opml-export'; path: string }
      | { action: 'subscribe'; source: Source; autoDownload: boolean }
      | { action: 'unsubscribe'; sourceId: string }
      | { action: 'transcript'; episodeId: string; sinceRevision?: number }
      | { action: 'long-form-content'; episodeId: string }
      | { action: 'transcription-status'; episodeId: string }
      | { action: 'voxrail-config' }
      | { action: 'voxrail-config-save'; baseUrl: string; accessKey?: string }
      | { action: 'voxrail-key-remove' }
      | { action: 'voxrail-test' }
      | { action: 'activate-episode'; episodeId: string }
      | { action: 'deactivate-episode' }
      | { action: 'download-states'; episodeIds: string[] }
      | { action: 'download-episode'; episodeId: string }
      | { action: 'storage-migrate'; kind: 'download' | 'cache'; path: string }
      | { action: 'save-progress'; episodeId: string; positionSeconds: number; isFinished: boolean }
      | { action: 'login-password'; email: string; password: string }
      | { action: 'send-code'; email: string }
      | { action: 'login-email'; email: string; code: string }
      | { action: 'register-password'; email: string; code: string; password: string }
      | { action: 'reset-password'; email: string; code: string; newPassword: string }
      | { action: 'update-profile'; username: string }
      | { action: 'change-password'; oldPassword: string; newPassword: string }
      | { action: 'link-device'; migrateGuestData: boolean }
      | {
          action: 'track-event'
          event: string
          targetId?: string
          properties?: Record<string, unknown>
        }
      | { action: 'logout' }
      | { action: 'session' }
      | { action: 'sync-now' }
  }
}
