declare namespace LX {
  namespace Player {
    interface ProgressBarOptions {
      progress: number
      mode?: Electron.ProgressBarOptions['mode']
    }

    type StatusButtonActions =
      | 'unCollect'
      | 'collect'
      | 'prev'
      | 'pause'
      | 'play'
      | 'next'
      | 'seek'
      | 'volume'
      | 'mute'

    interface LyricInfo extends LX.Music.LyricInfo {
      rawlrcInfo: LX.Music.LyricInfo
    }

    interface Status {
      status: 'playing' | 'paused' | 'error' | 'stoped'
      name: string
      singer: string
      albumName: string
      picUrl: string
      progress: number
      duration: number
      playbackRate: number
      lyricLineText: string
      lyricLineAllText: string
      /** 当前歌词行被点亮时的播放位置(ms,来自歌词播放器 onPlay,已含 offset 校正) */
      lyricLineStartMs: number
      lyric: string
      tlyric: string
      rlyric: string
      lxlyric: string
      collect: boolean
      volume: number
      mute: boolean
      mediaKind: 'music' | 'podcast'
      contentId: string
      transcript: LX.Podcast.TranscriptDescriptor | null
      longFormContent: LX.Podcast.LongFormContentDescriptor | null
    }
  }
}
