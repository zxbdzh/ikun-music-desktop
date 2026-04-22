<template>
  <teleport to="body">
    <div v-if="visible" :class="$style.overlay" @click="handleOverlayClick">
      <div :class="$style.popup" @click.stop>
        <!-- Header -->
        <div :class="$style.header">
          <span :class="$style.title">{{ $t('audio_match__title') }}</span>
          <button type="button" :class="$style.closeBtn" @click="handleClose">
            <svg viewBox="0 0 24 24" width="14" height="14">
              <use xlink:href="#icon-window-close" />
            </svg>
          </button>
        </div>

        <!-- Content -->
        <div :class="$style.content">
          <!-- 音频源选择 -->
          <div :class="$style.sourceSelect">
            <label>{{ $t('audio_match__audio_source') }}:</label>
            <select v-model="selectedSource" :disabled="isListening">
              <option value="microphone">{{ $t('audio_match__source_microphone') }}</option>
              <option value="system">{{ $t('audio_match__source_system') }}</option>
            </select>
          </div>

          <!-- 空闲状态 -->
          <div v-if="state.status === 'idle'" :class="$style.statusIdle">
            <div :class="$style.statusIcon">●</div>
            <span>{{ $t('audio_match__status_idle') }}</span>
          </div>

          <!-- 录音中 -->
          <div v-else-if="state.status === 'listening'" :class="$style.statusListening">
            <div :class="$style.statusIcon">◉</div>
            <span>{{ $t('audio_match__status_recording') }} {{ state.duration }}s</span>
            <div :class="$style.progressBar">
              <div :class="$style.progressFill" :style="{ width: Math.min(100, state.duration / 30 * 100) + '%' }" />
            </div>
          </div>

          <!-- 识别中 -->
          <div v-else-if="state.status === 'matching'" :class="$style.statusMatching">
            <div :class="$style.statusIcon">◌</div>
            <span>{{ $t('audio_match__status_matching') }}</span>
          </div>

          <!-- 错误 -->
          <div v-else-if="state.status === 'error'" :class="$style.statusError">
            <span>{{ state.error }}</span>
          </div>

          <!-- 结果 -->
          <div v-if="state.result" :class="$style.result">
            <div :class="$style.resultInfo">
              <div :class="$style.musicIcon">🎵</div>
              <div :class="$style.resultText">
                <span :class="$style.songName">{{ state.result.name }}</span>
                <span :class="$style.artistName">{{ state.result.artist }}</span>
              </div>
            </div>
            <div :class="$style.resultActions">
              <button type="button" :class="$style.playBtn" @click="handlePlayResult">
                {{ $t('audio_match__play') }}
              </button>
              <button type="button" :class="$style.retryBtn" @click="handleRetry">
                {{ $t('audio_match__retry') }}
              </button>
            </div>
          </div>

          <!-- 按钮区域 -->
          <div :class="$style.actions">
            <button
              v-if="state.status === 'idle' || state.status === 'error'"
              type="button"
              :class="$style.startBtn"
              @click="handleStart"
            >
              🎤 {{ $t('audio_match__start') }}
            </button>

            <button
              v-if="state.status === 'listening'"
              type="button"
              :class="$style.stopBtn"
              @click="handleStop"
            >
              ■ {{ $t('audio_match__stop') }}
            </button>

            <button
              type="button"
              :class="$style.cancelBtn"
              @click="handleClose"
            >
              {{ $t('audio_match__close') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script lang="ts">
import { ref, computed, watch, onBeforeUnmount } from '@common/utils/vueTools'
import { startListening, stopListening, reset, onStateChange, getState, type AudioSource } from '@renderer/utils/audioMatch'
import { isAudioMatchVisible, hideAudioMatch } from '@renderer/core/useApp/useAudioMatch'

export default {
  name: 'AudioMatch',
  setup() {
    const selectedSource = ref<AudioSource>('microphone')
    const state = ref(getState())

    let unsubscribe: (() => void) | null = null

    const handleClose = () => {
      hideAudioMatch()
      reset()
    }

    const handleOverlayClick = () => {
      handleClose()
    }

    const handleStart = async () => {
      await startListening(selectedSource.value)
    }

    const handleStop = async () => {
      await stopListening()
    }

    const handlePlayResult = () => {
      const result = state.value.result
      if (!result) return
      // TODO: 跳转到歌曲播放
      console.log('[AudioMatch] Play result:', result)
    }

    const handleRetry = () => {
      reset()
    }

    onBeforeUnmount(() => {
      if (unsubscribe) unsubscribe()
      reset()
    })

    watch(
      isAudioMatchVisible,
      (val) => {
        if (val && !unsubscribe) {
          unsubscribe = onStateChange((s) => {
            state.value = { ...s }
          })
        }
      },
      { immediate: true }
    )

    const isListening = computed(() => state.value.status === 'listening')

    return {
      visible: isAudioMatchVisible,
      selectedSource,
      state,
      isListening,
      handleClose,
      handleOverlayClick,
      handleStart,
      handleStop,
      handlePlayResult,
      handleRetry,
    }
  },
}
</script>

<style lang="less" module>
.overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.popup {
  width: 420px;
  background-color: var(--color-content-background);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background-color: var(--color-primary-light-100-alpha-100);
  border-bottom: 1px solid var(--color-primary-light-200-alpha-300);
}

.title {
  font-size: 15px;
  font-weight: 500;
  color: var(--color-primary);
}

.closeBtn {
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--color-button-font);
  padding: 4px;
  line-height: 0;
  border-radius: 4px;

  &:hover {
    background-color: var(--color-button-background-hover);
  }
}

.content {
  padding: 20px;
}

.sourceSelect {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;

  label {
    font-size: 13px;
    color: var(--color-font);
  }

  select {
    flex: 1;
    padding: 6px 10px;
    border: 1px solid var(--color-primary-light-300-alpha-500);
    border-radius: 4px;
    background-color: var(--color-primary-light-300-alpha-200);
    color: var(--color-font);
    font-size: 13px;
    cursor: pointer;

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }
}

.statusIdle,
.statusListening,
.statusMatching,
.statusError {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 0;
  font-size: 14px;
  color: var(--color-font);
}

.statusIcon {
  font-size: 24px;
  color: var(--color-primary);
}

.statusListening .statusIcon {
  animation: pulse 1s infinite;
}

.statusMatching .statusIcon {
  animation: spin 1s linear infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.progressBar {
  width: 100%;
  height: 6px;
  background-color: var(--color-primary-light-300-alpha-500);
  border-radius: 3px;
  overflow: hidden;
}

.progressFill {
  height: 100%;
  background-color: var(--color-primary);
  transition: width 0.3s ease;
}

.statusError {
  color: var(--color-error);
}

.result {
  background-color: var(--color-primary-light-300-alpha-200);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.resultInfo {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.musicIcon {
  font-size: 32px;
}

.resultText {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.songName {
  font-size: 15px;
  font-weight: 500;
  color: var(--color-font);
}

.artistName {
  font-size: 13px;
  color: var(--color-secondary-font);
}

.resultActions {
  display: flex;
  gap: 10px;
}

.playBtn,
.retryBtn {
  flex: 1;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.playBtn {
  background-color: var(--color-primary);
  color: #fff;

  &:hover {
    background-color: var(--color-primary-dark-200);
  }
}

.retryBtn {
  background-color: var(--color-primary-light-300-alpha-500);
  color: var(--color-font);

  &:hover {
    background-color: var(--color-primary-light-300-alpha-700);
  }
}

.actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}

.startBtn,
.stopBtn,
.cancelBtn {
  flex: 1;
  padding: 10px 16px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.startBtn {
  background-color: var(--color-primary);
  color: #fff;

  &:hover {
    background-color: var(--color-primary-dark-200);
  }
}

.stopBtn {
  background-color: var(--color-error);
  color: #fff;

  &:hover {
    background-color: var(--color-error-dark);
  }
}

.cancelBtn {
  background-color: var(--color-primary-light-300-alpha-500);
  color: var(--color-font);

  &:hover {
    background-color: var(--color-primary-light-300-alpha-700);
  }
}
</style>