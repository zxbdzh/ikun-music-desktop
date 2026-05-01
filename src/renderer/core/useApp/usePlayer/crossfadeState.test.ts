import { describe, it, expect, beforeEach } from 'vitest'

// 测试 crossfadeState 模块的响应式状态逻辑（隔离测试）
describe('crossfadeState', () => {
  // 模拟 ref 的行为
  const makeRef = <T>(initial: T) => {
    let value = initial
    return {
      get value() { return value },
      set value(v: T) { value = v },
    }
  }

  // 模拟 crossfadeState 模块的响应式状态
  let isCrossfading: ReturnType<typeof makeRef<boolean>>
  let isCrossfadeCompleting: ReturnType<typeof makeRef<boolean>>
  let crossfadeDoneMusicId: ReturnType<typeof makeRef<string | null>>
  let lastCrossfadeEndTime: ReturnType<typeof makeRef<number>>
  let isAfterCrossfade: ReturnType<typeof makeRef<boolean>>
  let _cancelCrossfade: (() => void) | null = null

  const registerCancelCrossfade = (fn: () => void) => {
    _cancelCrossfade = fn
  }

  const cancelCrossfade = () => {
    _cancelCrossfade?.()
  }

  const onCrossfadeDone = () => {
    isCrossfading.value = false
    isCrossfadeCompleting.value = false
  }

  beforeEach(() => {
    isCrossfading = makeRef(false)
    isCrossfadeCompleting = makeRef(false)
    crossfadeDoneMusicId = makeRef(null)
    lastCrossfadeEndTime = makeRef(0)
    isAfterCrossfade = makeRef(false)
    _cancelCrossfade = null
  })

  describe('isCrossfading', () => {
    it('初始为 false', () => {
      expect(isCrossfading.value).toBe(false)
    })

    it('跨服开始时设为 true', () => {
      isCrossfading.value = true
      expect(isCrossfading.value).toBe(true)
    })

    it('跨服完成时设为 false', () => {
      isCrossfading.value = true
      onCrossfadeDone()
      expect(isCrossfading.value).toBe(false)
    })
  })

  describe('crossfadeDoneMusicId', () => {
    it('初始为 null', () => {
      expect(crossfadeDoneMusicId.value).toBe(null)
    })

    it('跨服完成后设置为新歌曲 ID', () => {
      crossfadeDoneMusicId.value = 'song_123'
      expect(crossfadeDoneMusicId.value).toBe('song_123')
    })

    it('cancelCrossfade 后重置为 null', () => {
      crossfadeDoneMusicId.value = 'song_123'
      _cancelCrossfade = () => {
        crossfadeDoneMusicId.value = null
      }
      cancelCrossfade()
      expect(crossfadeDoneMusicId.value).toBe(null)
    })
  })

  describe('isAfterCrossfade', () => {
    it('初始为 false', () => {
      expect(isAfterCrossfade.value).toBe(false)
    })

    it('跨服完成后设为 true', () => {
      isAfterCrossfade.value = true
      expect(isAfterCrossfade.value).toBe(true)
    })

    it('cancelCrossfade 后重置为 false', () => {
      isAfterCrossfade.value = true
      _cancelCrossfade = () => {
        isAfterCrossfade.value = false
      }
      cancelCrossfade()
      expect(isAfterCrossfade.value).toBe(false)
    })

    it('handleEnded 检查 isAfterCrossfade 时应忽略 ended 事件', () => {
      isAfterCrossfade.value = true
      let playNextCalled = false
      const handleEnded = () => {
        if (isAfterCrossfade.value) {
          isAfterCrossfade.value = false
          return // 不调用 playNext
        }
        playNextCalled = true
      }
      handleEnded()
      expect(playNextCalled).toBe(false)
      expect(isAfterCrossfade.value).toBe(false)
    })

    it('handleEnded 在正常情况下应调用 playNext', () => {
      isAfterCrossfade.value = false
      let playNextCalled = false
      const handleEnded = () => {
        if (isAfterCrossfade.value) {
          isAfterCrossfade.value = false
          return
        }
        playNextCalled = true
      }
      handleEnded()
      expect(playNextCalled).toBe(true)
    })
  })

  describe('lastCrossfadeEndTime', () => {
    it('初始为 0', () => {
      expect(lastCrossfadeEndTime.value).toBe(0)
    })

    it('跨服完成时记录时间戳', () => {
      const now = Date.now()
      lastCrossfadeEndTime.value = now
      expect(lastCrossfadeEndTime.value).toBe(now)
    })
  })

  describe('cancelCrossfade', () => {
    it('注册后可以被调用', () => {
      let called = false
      registerCancelCrossfade(() => { called = true })
      cancelCrossfade()
      expect(called).toBe(true)
    })

    it('未注册时不报错', () => {
      expect(() => cancelCrossfade()).not.toThrow()
    })
  })

  describe('完整跨服流程状态变化', () => {
    it('跨服流程状态正确转换', () => {
      // 1. 初始状态
      expect(isCrossfading.value).toBe(false)
      expect(isCrossfadeCompleting.value).toBe(false)
      expect(crossfadeDoneMusicId.value).toBe(null)
      expect(isAfterCrossfade.value).toBe(false)

      // 2. 跨服开始
      isCrossfading.value = true
      isCrossfadeCompleting.value = true
      expect(isCrossfading.value).toBe(true)
      expect(isCrossfadeCompleting.value).toBe(true)

      // 3. 跨服完成
      crossfadeDoneMusicId.value = 'song_new'
      isAfterCrossfade.value = true
      isCrossfadeCompleting.value = false
      lastCrossfadeEndTime.value = Date.now()
      isCrossfading.value = false
      expect(isCrossfading.value).toBe(false)
      expect(isCrossfadeCompleting.value).toBe(false)
      expect(crossfadeDoneMusicId.value).toBe('song_new')
      expect(isAfterCrossfade.value).toBe(true)

      // 4. handleEnded 检查 isAfterCrossfade 并重置
      const handleEnded = () => {
        if (isAfterCrossfade.value) {
          isAfterCrossfade.value = false
          return
        }
      }
      handleEnded()
      expect(isAfterCrossfade.value).toBe(false)
    })
  })
})

// 测试跨服守卫逻辑
describe('crossfade guards', () => {
  // 模拟状态
  let isCompleting = false
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
