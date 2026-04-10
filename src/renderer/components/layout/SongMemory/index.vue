<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="isShowSongMemory" :class="$style.overlay" @click.self="handleClose">
        <div :class="$style.modal">
          <div :class="$style.header">
            <div :class="$style.headerIcon">🎵</div>
            <span :class="$style.headerTitle">回忆坐标</span>
            <button :class="$style.closeBtn" @click="handleClose">✕</button>
          </div>

          <div v-if="loading" :class="$style.loading">
            <div :class="$style.loadingSpinner"></div>
            <span>加载中...</span>
          </div>

          <div v-else-if="data" :class="$style.content">
            <div :class="$style.songInfo">
              <img
                :class="$style.songCover"
                :src="data.songInfoDto?.coverUrl || songMemoryInfo?.meta?.picUrl"
                :alt="data.songInfoDto?.songName || songMemoryInfo?.name"
              />
              <div :class="$style.songDetail">
                <div :class="$style.songName">{{ data.songInfoDto?.songName || songMemoryInfo?.name }}</div>
                <div :class="$style.singer">{{ data.songInfoDto?.singer || songMemoryInfo?.singer }}</div>
              </div>
            </div>

            <div :class="$style.cards">
              <div v-if="data.musicFirstListenDto" :class="[$style.card, $style.cardEnter]">
                <div :class="$style.cardIcon">🌟</div>
                <div :class="$style.cardLabel">首次试听</div>
                <div :class="$style.cardValue">{{ formatDate(data.musicFirstListenDto.date) }}</div>
                <div :class="$style.cardSub">{{ data.musicFirstListenDto.period }} · {{ data.musicFirstListenDto.time }}</div>
              </div>

              <div v-if="data.musicTotalPlayDto" :class="[$style.card, $style.cardEnter]">
                <div :class="$style.cardIcon">🎧</div>
                <div :class="$style.cardLabel">累计播放</div>
                <div :class="$style.cardValue">{{ data.musicTotalPlayDto.playCount }}次</div>
                <div :class="$style.cardSub">{{ data.musicTotalPlayDto.text }}</div>
              </div>

              <div v-if="data.musicPlayMostDto" :class="[$style.card, $style.cardEnter]">
                <div :class="$style.cardIcon">✨</div>
                <div :class="$style.cardLabel">最特别的一天</div>
                <div :class="$style.cardValue">{{ formatDate(data.musicPlayMostDto.date) }}</div>
                <div :class="$style.cardSub">播放 {{ data.musicPlayMostDto.mostPlayedCount }} 次</div>
              </div>

              <div v-if="data.musicFrequentListenDto" :class="[$style.card, $style.cardEnter]">
                <div :class="$style.cardIcon">⏰</div>
                <div :class="$style.cardLabel">常听时段</div>
                <div :class="$style.cardValue">{{ formatTimeDesc(data.musicFrequentListenDto.timeDesc) }}</div>
                <div :class="$style.cardSub">{{ data.musicFrequentListenDto.describe }}</div>
              </div>
            </div>

            <div v-if="data.musicLikeSongDto?.like" :class="[$style.likeCard, $style.cardEnter]">
              <div :class="$style.likeIcon">❤️</div>
              <div :class="$style.likeContent">
                <div :class="$style.likeDate">红心于 {{ data.musicLikeSongDto.redTime }}</div>
                <div :class="$style.likeDesc">{{ data.musicLikeSongDto.redDesc }}</div>
              </div>
            </div>
          </div>

          <div v-else :class="$style.empty">
            <div :class="$style.emptyIcon">📭</div>
            <div :class="$style.emptyText">暂无回忆数据</div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { ref, watch } from '@common/utils/vueTools'
import wyUtil from '@renderer/utils/musicSdk/wy/wyUtil'
import { appSetting } from '@renderer/store/setting'
import { isShowSongMemory, songMemoryInfo, closeSongMemory } from '@renderer/store/songMemory'

export default {
  name: 'SongMemory',
  setup() {
    const loading = ref(false)
    const data = ref(null)

    const formatDate = (dateStr) => {
      if (!dateStr) return ''
      const match = dateStr.match(/(\d+)-(\d+)-(\d+)/)
      if (match) {
        return `${parseInt(match[2])}月${parseInt(match[3])}日`
      }
      return dateStr
    }

    const formatTimeDesc = (timeDesc) => {
      const map = {
        morning: '早上',
        noon: '中午',
        afternoon: '下午',
        evening: '傍晚',
        night: '夜晚',
        deep_night: '深夜',
      }
      return map[timeDesc] || timeDesc || ''
    }

    const loadData = () => {
      if (!isShowSongMemory.value || !songMemoryInfo.value) return

      loading.value = true
      data.value = null

      const songId = songMemoryInfo.value.meta?.songId || songMemoryInfo.value.id
      const cookie = appSetting['common.wy_cookie']

      if (!cookie || !songId) {
        loading.value = false
        return
      }

      wyUtil.getSongFirstListenInfo(songId, cookie)
        .then((res) => {
          data.value = res
        })
        .catch((err) => {
          console.error('获取回忆坐标失败:', err)
          data.value = null
        })
        .finally(() => {
          loading.value = false
        })
    }

    const handleClose = () => {
      closeSongMemory()
    }

    watch(isShowSongMemory, (val) => {
      if (val) {
        loadData()
      }
    })

    return {
      isShowSongMemory,
      songMemoryInfo,
      loading,
      data,
      handleClose,
      formatDate,
      formatTimeDesc,
    }
  },
}
</script>

<style lang="less" module>
.overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.modal {
  width: 420px;
  max-width: 90vw;
  max-height: 85vh;
  background: var(--color-main-background);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.header {
  display: flex;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-secondary-background);
  gap: 10px;
}

.headerIcon {
  font-size: 20px;
}

.headerTitle {
  flex: 1;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.closeBtn {
  width: 28px;
  height: 28px;
  border: none;
  background: var(--color-secondary-background);
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: var(--color-secondary-text);
  transition: all 0.2s;

  &:hover {
    background: var(--color-primary);
    color: var(--white);
  }
}

.content {
  padding: 20px;
  overflow-y: auto;
}

.songInfo {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--color-secondary-background);
}

.songCover {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  object-fit: cover;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.songDetail {
  flex: 1;
  min-width: 0;
}

.songName {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 4px;
}

.singer {
  font-size: 13px;
  color: var(--color-secondary-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.card {
  background: var(--color-secondary-background);
  border-radius: 12px;
  padding: 14px;
  text-align: center;
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
  }
}

.cardIcon {
  font-size: 24px;
  margin-bottom: 6px;
}

.cardLabel {
  font-size: 11px;
  color: var(--color-secondary-text);
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.cardValue {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: 2px;
}

.cardSub {
  font-size: 11px;
  color: var(--color-secondary-text);
}

.likeCard {
  display: flex;
  align-items: center;
  gap: 14px;
  background: linear-gradient(135deg, rgba(255, 87, 87, 0.1), rgba(255, 87, 87, 0.05));
  border: 1px solid rgba(255, 87, 87, 0.2);
  border-radius: 12px;
  padding: 14px 16px;
  margin-top: 12px;
}

.likeIcon {
  font-size: 28px;
}

.likeContent {
  flex: 1;
}

.likeDate {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 2px;
}

.likeDesc {
  font-size: 12px;
  color: var(--color-secondary-text);
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  gap: 12px;
  color: var(--color-secondary-text);
}

.loadingSpinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-secondary-background);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  gap: 12px;
}

.emptyIcon {
  font-size: 48px;
  opacity: 0.5;
}

.emptyText {
  font-size: 14px;
  color: var(--color-secondary-text);
}

.modal-enter-active {
  animation: modalIn 0.3s ease-out;
}

.modal-leave-active {
  animation: modalOut 0.2s ease-in;
}

@keyframes modalIn {
  from {
    opacity: 0;
    transform: scale(0.92);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes modalOut {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.92);
  }
}

.cardEnter {
  animation: cardIn 0.4s ease-out backwards;
}

.card:nth-child(1) { animation-delay: 0.05s; }
.card:nth-child(2) { animation-delay: 0.1s; }
.card:nth-child(3) { animation-delay: 0.15s; }
.card:nth-child(4) { animation-delay: 0.2s; }

@keyframes cardIn {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
