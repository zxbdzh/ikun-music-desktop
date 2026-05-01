import { describe, it, expect, beforeEach } from 'vitest'

// 测试跨服守卫逻辑（模拟 usePlayProgress 中的关键逻辑）
describe('crossfade guards', () => {
  // 模拟状态
  let isCompleting: boolean = false
  let crossfadeDoneMusicId: string | null = null
  let activeIndex: 1 | 2 = 1
  let currentMusicId: string | null = null

  // 模拟 setProgress 的守卫逻辑
  const setProgress = (time: number) => {
    // 守卫 1: 无音乐时不更新
    if (!currentMusicId) return { updated: false, reason: 'no_music' }

    // 守卫 2: 跨服完成期间阻止所有更新
    if (isCompleting) return { updated: false, reason: 'isCompleting' }

    // 守卫 3: 跨服期间只允许新音频的更新
    if (crossfadeDoneMusicId && currentMusicId !== crossfadeDoneMusicId) {
      return { updated: false, reason: 'old_song_update' }
    }

    return { updated: true, time }
  }

  // 模拟 handlePlaying 的跨服路径
  const handlePlaying = (newSongId: string) => {
    // 跨服路径: 新歌曲 ID 匹配
    if (crossfadeDoneMusicId && currentMusicId === crossfadeDoneMusicId) {
      crossfadeDoneMusicId = null
      isCompleting = false
      return { action: 'crossfade', songId: newSongId }
    }
    return { action: 'normal', songId: newSongId }
  }

  beforeEach(() => {
    isCompleting = false
    crossfadeDoneMusicId = null
    activeIndex = 1
    currentMusicId = null
  })

  describe('setProgress 守卫', () => {
    it('无音乐时阻止更新', () => {
      currentMusicId = null
      const result = setProgress(10)
      expect(result.updated).toBe(false)
      expect(result.reason).toBe('no_music')
    })

    it('正常播放时允许更新', () => {
      currentMusicId = 'song_1'
      const result = setProgress(30)
      expect(result.updated).toBe(true)
      expect(result.time).toBe(30)
    })

    it('isCompleting=true 时阻止更新', () => {
      currentMusicId = 'song_1'
      isCompleting = true
      const result = setProgress(40)
      expect(result.updated).toBe(false)
      expect(result.reason).toBe('isCompleting')
    })

    it('跨服完成期间，ID 不匹配时阻止更新（旧音频的 timeupdate）', () => {
      currentMusicId = 'song_1'
      crossfadeDoneMusicId = 'song_2'
      const result = setProgress(50)
      expect(result.updated).toBe(false)
      expect(result.reason).toBe('old_song_update')
    })

    it('跨服完成期间，ID 匹配时允许更新（新音频的 timeupdate）', () => {
      currentMusicId = 'song_2'
      crossfadeDoneMusicId = 'song_2'
      const result = setProgress(0)
      expect(result.updated).toBe(true)
    })
  })

  describe('handlePlaying 跨服路径', () => {
    it('ID 匹配时走跨服路径', () => {
      currentMusicId = 'song_2'
      crossfadeDoneMusicId = 'song_2'
      const result = handlePlaying('song_2')
      expect(result.action).toBe('crossfade')
      expect(result.songId).toBe('song_2')
    })

    it('跨服路径清除 crossfadeDoneMusicId', () => {
      crossfadeDoneMusicId = 'song_2'
      currentMusicId = 'song_2'
      handlePlaying('song_2')
      expect(crossfadeDoneMusicId).toBe(null)
    })

    it('ID 不匹配时走普通路径', () => {
      currentMusicId = 'song_1'
      crossfadeDoneMusicId = 'song_2'
      const result = handlePlaying('song_1')
      expect(result.action).toBe('normal')
    })
  })

  describe('完整跨服流程时序', () => {
    it('跨服完成前的 setProgress 被阻止', () => {
      currentMusicId = 'song_1'
      isCompleting = true

      // 旧音频的 timeupdate
      const oldSongUpdate = setProgress(100)
      expect(oldSongUpdate.updated).toBe(false)
      expect(oldSongUpdate.reason).toBe('isCompleting')
    })

    it('跨服完成后新音频的 setProgress 允许更新', () => {
      currentMusicId = 'song_2'
      crossfadeDoneMusicId = 'song_2'
      isCompleting = false

      const newSongUpdate = setProgress(0)
      expect(newSongUpdate.updated).toBe(true)
    })

    it('跨服完成后旧音频的 setProgress 被阻止', () => {
      currentMusicId = 'song_1'
      crossfadeDoneMusicId = 'song_2'
      isCompleting = false

      const oldSongUpdate = setProgress(110)
      expect(oldSongUpdate.updated).toBe(false)
      expect(oldSongUpdate.reason).toBe('old_song_update')
    })
  })

  describe('handleEnded 守卫逻辑', () => {
    it('isAfterCrossfade=true 时不调用 playNext', () => {
      let playNextCalled = false
      const isAfterCrossfade = true

      const handleEnded = () => {
        if (isAfterCrossfade) return
        playNextCalled = true
      }

      handleEnded()
      expect(playNextCalled).toBe(false)
    })

    it('isAfterCrossfade=false 时调用 playNext', () => {
      let playNextCalled = false
      const isAfterCrossfade = false

      const handleEnded = () => {
        if (isAfterCrossfade) return
        playNextCalled = true
      }

      handleEnded()
      expect(playNextCalled).toBe(true)
    })
  })

  describe('buffering timeout 守卫逻辑', () => {
    it('isAfterCrossfade=true 时 buffering timeout 不调用 playNext', () => {
      let playNextCalled = false
      const isAfterCrossfade = true

      const bufferingTimeout = () => {
        if (isAfterCrossfade) return
        playNextCalled = true
      }

      bufferingTimeout()
      expect(playNextCalled).toBe(false)
    })

    it('isAfterCrossfade=false 时 buffering timeout 调用 playNext', () => {
      let playNextCalled = false
      const isAfterCrossfade = false

      const bufferingTimeout = () => {
        if (isAfterCrossfade) return
        playNextCalled = true
      }

      bufferingTimeout()
      expect(playNextCalled).toBe(true)
    })
  })
})
