<template>
  <transition enter-active-class="animated slideInRight" leave-active-class="animated slideOutDown">
    <div
      v-if="isShowShareMusicCard"
      ref="dom_page"
      :class="$style.page"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-card-title"
      @keydown="handleDialogKeydown"
    >
      <div :class="$style.bg" />
      <header :class="$style.header">
        <div id="share-card-title" :class="$style.title">{{ $t('share__title') }}</div>
        <button
          ref="dom_close"
          :class="$style.closeBtn"
          type="button"
          :aria-label="$t('close')"
          :title="$t('close')"
          @click="handleClose"
        >
          <svg
            version="1.1"
            xmlns="http://www.w3.org/2000/svg"
            xlink="http://www.w3.org/1999/xlink"
            viewBox="0 0 212.982 212.982"
            space="preserve"
          >
            <use xlink:href="#icon-delete" />
          </svg>
        </button>
      </header>

      <div :class="$style.container">
        <aside :class="$style.panel">
          <div :class="$style.group">
            <div :class="$style.groupTitle">{{ $t('share__style_preset') }}</div>
            <div :class="$style.presetList">
              <button
                v-for="preset in presets"
                :key="preset.id"
                :class="[$style.presetBtn, { [$style.active]: stylePreset == preset.id }]"
                type="button"
                @click="handlePresetChange(preset.id)"
              >
                {{ preset.name }}
              </button>
            </div>
          </div>

          <div :class="$style.group">
            <div :class="$style.groupLine">
              <div :class="$style.groupTitle">{{ $t('share__select_lyrics') }}</div>
              <div :class="$style.selectionControls">
                <label :class="$style.switch">
                  <input
                    :checked="allLyricsSelected"
                    :indeterminate="someLyricsSelected"
                    :aria-checked="someLyricsSelected ? 'mixed' : allLyricsSelected"
                    :disabled="!lyricLines.length"
                    type="checkbox"
                    @change="handleSelectAll"
                  />
                  <span>{{ $t('share__select_all') }}</span>
                </label>
                <label :class="$style.switch">
                  <input v-model="includeTranslation" type="checkbox" />
                  <span>{{ $t('share__include_translation') }}</span>
                </label>
              </div>
            </div>
            <div v-if="lyricLines.length" :class="[$style.lyricList, 'scroll']">
              <label v-for="(line, index) in lyricLines" :key="line.key + index" :class="$style.lineItem">
                <input
                  v-model="selectedLineIndexes"
                  :value="index"
                  type="checkbox"
                />
                <div>
                  <div :class="$style.lineMain">{{ line.text }}</div>
                  <div v-if="line.translation" :class="$style.lineSub">{{ line.translation }}</div>
                </div>
              </label>
            </div>
            <div v-else :class="$style.emptyLyric">{{ $t('share__no_lyric') }}</div>
          </div>

          <button
            v-if="!isPodcast"
            :class="$style.ceruBtn"
            :disabled="generating"
            type="button"
            @click="handleGenerateCeruShare"
          >
            {{ generating ? $t('share__generating') : $t('share__generate_ceru_link') }}
          </button>

          <div :class="$style.actions">
            <button :class="$style.actionBtn" type="button" @click="handleCopyLink">{{ $t('share__copy_link') }}</button>
            <button :class="$style.actionBtn" type="button" @click="handleCopyImage">{{ $t('share__copy_image') }}</button>
            <button :class="$style.actionBtn" type="button" @click="handleSaveImage">{{ $t('share__save_image') }}</button>
          </div>
        </aside>

        <section :class="$style.previewWrap">
          <div :class="$style.previewColumn">
            <div :class="[$style.cardViewport, 'scroll']">
              <div ref="dom_card" :class="[$style.card, $style[stylePreset]]" :style="coverStyle">
                <div :class="$style.coverWrap">
                  <img
                    v-if="musicInfo?.meta?.picUrl"
                    ref="dom_cover"
                    :src="musicInfo.meta.picUrl"
                    :alt="musicInfo?.name || ''"
                    :class="$style.cover"
                    crossorigin="anonymous"
                  />
                  <div v-else :class="$style.coverFallback">♪</div>
                </div>
                <div :class="$style.meta">
                  <h2 :class="$style.song">{{ musicInfo?.name || '-' }}</h2>
                  <p :class="$style.singer">{{ musicInfo?.singer || '-' }}</p>
                </div>

                <div :class="$style.lyricPreview">
                  <template v-for="(line, index) in currentLyricPage" :key="line.key + 'preview' + index">
                    <p :class="$style.previewMain">{{ line.text }}</p>
                    <p v-if="includeTranslation && line.translation" :class="$style.previewSub">
                      {{ line.translation }}
                    </p>
                  </template>
                </div>

                <div :class="$style.footer">
                  <div :class="$style.qrWrap">
                    <img
                      v-if="qrDataUrl"
                      :src="qrDataUrl"
                      :alt="$t('share__qr_alt')"
                      :class="$style.qr"
                    />
                  </div>
                  <div :class="$style.footerInfo">
                    <div :class="$style.scanText">{{ $t('share__scan_to_detail') }}</div>
                    <div v-if="lyricPageCount > 1" :class="$style.cardPageStatus">
                      {{ pageStatusText }}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div
              v-if="lyricPageCount > 1"
              :class="$style.pageControls"
              role="group"
              :aria-label="$t('share__page_navigation')"
            >
              <button
                :class="$style.pageButton"
                type="button"
                :disabled="!hasPreviousPage"
                :aria-label="$t('pagination__prev')"
                :title="$t('pagination__prev')"
                @click="handlePreviousPage"
              >
                <svg viewBox="0 0 451.846 451.847" aria-hidden="true">
                  <use xlink:href="#icon-left" />
                </svg>
              </button>
              <div :class="$style.pageStatus" aria-live="polite" aria-atomic="true">
                {{ pageStatusText }}
              </div>
              <button
                :class="$style.pageButton"
                type="button"
                :disabled="!hasNextPage"
                :aria-label="$t('pagination__next')"
                :title="$t('pagination__next')"
                @click="handleNextPage"
              >
                <svg viewBox="0 0 451.846 451.847" aria-hidden="true">
                  <use xlink:href="#icon-right" />
                </svg>
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { computed, ref, watch, nextTick } from '@common/utils/vueTools'
import { isShowShareMusicCard, shareMusicInfo, closeShareMusicCard } from '@renderer/store/shareMusicCard'
import {
  resolveMusicDetailWebUrl,
  buildLyricSelectableLines,
  paginateLyricLines,
} from '@renderer/utils/shareMusicCard'
import { createShareForMusic } from '@renderer/utils/cerumusicShare'
import { clipboardWriteText, clipboardWriteImageDataURL } from '@common/utils/electron'
import { dialog } from '@renderer/plugins/Dialog'
import { getPlayerLyric, openSaveDir } from '@renderer/utils/ipc'
import { musicInfo as playerMusicInfo } from '@renderer/store/player/state'
import { toPng } from 'html-to-image'
import QRCode from 'qrcode'

/**
 * 使用 Canvas API 提取图片主色调
 * @param {string} imageUrl - 图片 URL
 * @returns {Promise<[number, number, number] | null>} RGB 数组或 null
 */
const extractDominantColor = (imageUrl) => {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        const width = 50
        const height = Math.round((img.height / img.width) * width)
        canvas.width = width
        canvas.height = height
        ctx.drawImage(img, 0, 0, width, height)
        const imageData = ctx.getImageData(0, 0, width, height)
        const data = imageData.data

        // 统计颜色出现次数
        const colorCounts = {}
        let maxCount = 0
        let dominantColor = null

        for (let i = 0; i < data.length; i += 4) {
          const r = Math.round(data[i] / 16) * 16
          const g = Math.round(data[i + 1] / 16) * 16
          const b = Math.round(data[i + 2] / 16) * 16
          const a = data[i + 3]

          // 跳过透明像素
          if (a < 128) continue
          // 跳过接近白色和黑色的
          if ((r > 240 && g > 240 && b > 240) || (r < 15 && g < 15 && b < 15)) continue

          const key = `${r},${g},${b}`
          colorCounts[key] = (colorCounts[key] || 0) + 1

          if (colorCounts[key] > maxCount) {
            maxCount = colorCounts[key]
            dominantColor = [r, g, b]
          }
        }
        resolve(dominantColor)
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = imageUrl
  })
}

const presets = [
  { id: 'presetNebula', name: 'Nebula' },
  { id: 'presetAmber', name: 'Amber' },
  { id: 'presetMono', name: 'Mono' },
  { id: 'presetCover', name: 'Cover' },
]
const dialogFocusableSelector = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const stylePreset = ref('presetNebula')
const includeTranslation = ref(true)
const lyricLines = ref([])
const selectedLineIndexes = ref([])
const currentPageIndex = ref(0)
const qrDataUrl = ref('')
const dom_page = ref(null)
const dom_close = ref(null)
const dom_card = ref(null)
const dom_cover = ref(null)
const coverColors = ref(null)
const rawLyric = ref('')
const rawTlyric = ref('')
const cerumusicUrl = ref('')
const generating = ref(false)
let shareTrigger = null

const musicInfo = computed(() => shareMusicInfo.value)
const isPodcast = computed(() => musicInfo.value?.meta?.podcast === true)
const detailUrl = computed(() => resolveMusicDetailWebUrl(musicInfo.value))
// 优先使用 CeruMusic 分享落地页链接,未生成时回退到平台详情链接
const shareUrl = computed(() => isPodcast.value ? detailUrl.value : cerumusicUrl.value || detailUrl.value)

const selectedLyricLines = computed(() => {
  const selected = new Set(selectedLineIndexes.value)
  return lyricLines.value.filter((_, index) => selected.has(index))
})
const lyricPages = computed(() => paginateLyricLines(selectedLyricLines.value, {
  includeTranslation: includeTranslation.value,
}))
const lyricPageCount = computed(() => lyricPages.value.length)
const currentPageNumber = computed(() => lyricPageCount.value ? currentPageIndex.value + 1 : 0)
const currentLyricPage = computed(() => lyricPages.value[currentPageIndex.value] ?? [])
const hasPreviousPage = computed(() => currentPageIndex.value > 0)
const hasNextPage = computed(() => currentPageIndex.value + 1 < lyricPageCount.value)
const pageStatusText = computed(() => window.i18n.t('share__page_status', {
  current: currentPageNumber.value,
  total: lyricPageCount.value,
}))
const allLyricsSelected = computed(() =>
  lyricLines.value.length > 0 && selectedLineIndexes.value.length === lyricLines.value.length
)
const someLyricsSelected = computed(() =>
  selectedLineIndexes.value.length > 0 && !allLyricsSelected.value
)

const coverStyle = computed(() => {
  if (stylePreset.value !== 'presetCover' || !coverColors.value) return {}
  const [r, g, b] = coverColors.value
  // 根据主色调生成渐变背景
  return {
    background: `linear-gradient(135deg,
      rgb(${r}, ${g}, ${b}) 0%,
      rgb(${Math.max(0, r - 40)}, ${Math.max(0, g - 40)}, ${Math.max(0, b - 40)}) 50%,
      rgb(${Math.max(0, r - 80)}, ${Math.max(0, g - 80)}, ${Math.max(0, b - 80)}) 100%)`,
  }
})

const extractCoverColors = async () => {
  if (stylePreset.value !== 'presetCover' || !musicInfo.value?.meta?.picUrl) {
    coverColors.value = null
    return
  }
  const colors = await extractDominantColor(musicInfo.value.meta.picUrl)
  coverColors.value = colors
}

const handlePresetChange = (presetId) => {
  stylePreset.value = presetId
  if (presetId === 'presetCover') {
    nextTick(() => {
      extractCoverColors()
    })
  }
}

const refreshLyricData = async () => {
  const mInfo = musicInfo.value
  if (!mInfo) {
    lyricLines.value = []
    selectedLineIndexes.value = []
    rawLyric.value = ''
    rawTlyric.value = ''
    return
  }

  let sourceLyric = ''
  let sourceTlyric = ''

  // 如果正在播放这首歌，优先使用播放器的歌词
  if (playerMusicInfo.id && playerMusicInfo.id == mInfo.id && playerMusicInfo.lrc) {
    sourceLyric = playerMusicInfo.lxlrc || playerMusicInfo.lrc || ''
    sourceTlyric = playerMusicInfo.tlrc || ''
  }

  // 如果没有歌词，从播放器获取
  if (!sourceLyric) {
    const playerLyric = await getPlayerLyric(mInfo).catch(() => null)
    sourceLyric = playerLyric?.lyric || ''
    sourceTlyric = playerLyric?.tlyric || ''
  }

  rawLyric.value = sourceLyric
  rawTlyric.value = sourceTlyric

  const lines = buildLyricSelectableLines(sourceLyric, sourceTlyric)
  lyricLines.value = lines
  const selectedCount = isPodcast.value ? lines.length : Math.min(lines.length, 4)
  selectedLineIndexes.value = Array.from({ length: selectedCount }, (_, index) => index)
  currentPageIndex.value = 0
}

const refreshQRCode = async () => {
  const url = shareUrl.value
  qrDataUrl.value = url
    ? await QRCode.toDataURL(url, {
        margin: 1,
        width: 180,
        errorCorrectionLevel: 'M',
      })
    : ''
}

const handleClose = () => {
  closeShareMusicCard()
}

const handleDialogKeydown = (event) => {
  if (event.key === 'Escape') {
    event.preventDefault()
    handleClose()
    return
  }
  if (event.key !== 'Tab' || !dom_page.value) return

  const focusable = [...dom_page.value.querySelectorAll(dialogFocusableSelector)]
  if (!focusable.length) return

  const first = focusable[0]
  const last = focusable.at(-1)
  const active = document.activeElement
  if (event.shiftKey && active === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

const handleSelectAll = (event) => {
  selectedLineIndexes.value = event.target.checked
    ? lyricLines.value.map((_, index) => index)
    : []
}

const handlePreviousPage = () => {
  if (hasPreviousPage.value) currentPageIndex.value--
}

const handleNextPage = () => {
  if (hasNextPage.value) currentPageIndex.value++
}

const renderCardPng = async () => {
  if (!dom_card.value) return ''
  return toPng(dom_card.value, {
    cacheBust: true,
    pixelRatio: 2,
  })
}

const handleGenerateCeruShare = async () => {
  if (!musicInfo.value || isPodcast.value || generating.value) return
  generating.value = true
  try {
    const url = await createShareForMusic(musicInfo.value, {
      lrc: rawLyric.value,
      trans: rawTlyric.value,
    })
    cerumusicUrl.value = url
    await refreshQRCode()
    await dialog.confirm({
      message: window.i18n.t('share__generate_ceru_success'),
      confirmButtonText: window.i18n.t('ok'),
    })
  } catch (err) {
    await dialog.confirm({
      message: `${window.i18n.t('share__generate_ceru_failed')}\n${err?.message || ''}`,
      confirmButtonText: window.i18n.t('ok'),
    })
  } finally {
    generating.value = false
  }
}

const handleCopyLink = async () => {
  if (!shareUrl.value) return
  try {
    clipboardWriteText(shareUrl.value)
    await dialog.confirm({
      message: window.i18n.t('share__copy_link_success'),
      confirmButtonText: window.i18n.t('ok'),
    })
  } catch {
    await dialog.confirm({
      message: window.i18n.t('share__copy_link_failed'),
      confirmButtonText: window.i18n.t('ok'),
    })
  }
}

const handleCopyImage = async () => {
  try {
    const dataUrl = await renderCardPng()
    if (!dataUrl) {
      await dialog.confirm({
        message: window.i18n.t('share__copy_image_failed'),
        confirmButtonText: window.i18n.t('ok'),
      })
      return
    }
    clipboardWriteImageDataURL(dataUrl)
    await dialog.confirm({
      message: window.i18n.t('share__copy_image_success'),
      confirmButtonText: window.i18n.t('ok'),
    })
  } catch {
    await dialog.confirm({
      message: window.i18n.t('share__copy_image_failed'),
      confirmButtonText: window.i18n.t('ok'),
    })
  }
}

const handleSaveImage = async () => {
  try {
    const dataUrl = await renderCardPng()
    if (!dataUrl) {
      await dialog.confirm({
        message: window.i18n.t('share__save_image_failed'),
        confirmButtonText: window.i18n.t('ok'),
      })
      return
    }

    const pageSuffix = lyricPageCount.value > 1
      ? `_p${currentPageNumber.value}-of-${lyricPageCount.value}`
      : ''
    const result = await openSaveDir({
      title: 'Save share card',
      defaultPath: `${musicInfo.value?.name || 'music-share-card'}${pageSuffix}.png`,
      filters: [{ name: 'PNG', extensions: ['png'] }],
    })
    if (result.canceled || !result.filePath) return

    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
    const binary = window.atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    await window.lx.worker.main.saveStrToFile(result.filePath, bytes)
    await dialog.confirm({
      message: window.i18n.t('share__save_image_success'),
      confirmButtonText: window.i18n.t('ok'),
    })
  } catch {
    await dialog.confirm({
      message: window.i18n.t('share__save_image_failed'),
      confirmButtonText: window.i18n.t('ok'),
    })
  }
}

watch(
  [selectedLineIndexes, includeTranslation],
  () => {
    currentPageIndex.value = 0
  },
  { deep: true }
)

watch(
  () => isShowShareMusicCard.value,
  async (show) => {
    if (!show) {
      const target = shareTrigger
      shareTrigger = null
      await nextTick()
      if (target?.isConnected) target.focus()
      return
    }
    shareTrigger = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    await nextTick()
    dom_close.value?.focus()
    cerumusicUrl.value = ''
    await refreshLyricData()
    await refreshQRCode()
    if (stylePreset.value === 'presetCover') {
      nextTick(() => {
        extractCoverColors()
      })
    }
  }
)

watch(
  () => musicInfo.value?.id,
  async () => {
    if (!isShowShareMusicCard.value) return
    cerumusicUrl.value = ''
    await refreshLyricData()
    await refreshQRCode()
    if (stylePreset.value === 'presetCover') {
      nextTick(() => {
        extractCoverColors()
      })
    }
  }
)

watch(
  () => musicInfo.value?.meta?.picUrl,
  async () => {
    if (!isShowShareMusicCard.value) return
    if (stylePreset.value === 'presetCover') {
      nextTick(() => {
        extractCoverColors()
      })
    }
  }
)
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.page {
  position: absolute;
  inset: 0;
  z-index: 12;
  color: var(--color-font);
  overflow: hidden;
}
.bg {
  position: absolute;
  inset: 0;
  background: var(--background-image) var(--background-image-position) no-repeat;
  background-size: var(--background-image-size);
  opacity: 1;

  &:before {
    .mixin-after();
    inset: 0;
    position: absolute;
    background-color: var(--color-app-background);
  }

  &:after {
    .mixin-after();
    inset: 0;
    position: absolute;
    background-color: var(--color-main-background);
  }
}
.header {
  position: relative;
  height: @height-toolbar;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
}
.title {
  font-size: 15px;
  font-weight: 600;
}
.closeBtn {
  border: none;
  background: transparent;
  color: var(--color-font);
  width: 44px;
  height: 44px;
  padding: 12px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  svg {
    width: 20px;
    height: 20px;
  }

  &:hover {
    background: var(--color-button-background-hover);
  }

  &:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }
}
.container {
  position: relative;
  height: calc(100% - @height-toolbar);
  min-height: 0;
  box-sizing: border-box;
  padding: 12px 22px 20px;
  display: flex;
  gap: 16px;
}
.panel {
  width: 40%;
  min-width: 320px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
}
.previewWrap {
  flex: auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  align-items: flex-start;
  justify-content: center;
}
.previewColumn {
  width: 100%;
  height: 100%;
  min-width: 360px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.cardViewport {
  width: 100%;
  min-height: 0;
  flex: 1;
  display: flex;
  justify-content: center;
  overflow-y: auto;
}
.group {
  border: 1px solid var(--color-primary-alpha-600);
  border-radius: 10px;
  padding: 10px;
}
.groupTitle {
  font-size: 13px;
  opacity: 0.8;
  margin-bottom: 8px;
}
.groupLine {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.groupLine .groupTitle {
  margin-bottom: 0;
}
.selectionControls {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 12px;
}
.switch {
  font-size: 12px;
  display: flex;
  gap: 6px;
  align-items: center;
}
.presetList {
  display: flex;
  gap: 8px;
}
.presetBtn {
  border: none;
  border-radius: 16px;
  padding: 6px 12px;
  cursor: pointer;
  color: var(--color-font);
  background: var(--color-button-background);

  &.active {
    background: var(--color-primary);
    color: #fff;
  }
}
.lyricList {
  max-height: 230px;
  overflow: auto;
}
.lineItem {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin-bottom: 8px;
}
.lineMain {
  font-size: 13px;
}
.lineSub {
  font-size: 12px;
  opacity: 0.68;
}
.emptyLyric {
  padding: 10px;
  font-size: 13px;
  opacity: 0.7;
}
.ceruBtn {
  margin-top: 10px;
  width: 100%;
  border: none;
  border-radius: 6px;
  padding: 9px 12px;
  color: #fff;
  background: var(--color-primary);
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
}
.actions {
  margin-top: 10px;
  display: flex;
  gap: 10px;
}
.actionBtn {
  border: none;
  border-radius: 6px;
  padding: 8px 12px;
  color: #fff;
  background: var(--color-primary);
  cursor: pointer;
}
.card {
  width: 360px;
  min-height: 560px;
  box-sizing: border-box;
  padding: 18px;
  display: flex;
  flex-direction: column;
  color: #fff;
  box-shadow: 0 22px 50px rgba(0, 0, 0, 0.3);
}
.coverWrap {
  width: 96px;
  height: 96px;
  overflow: hidden;
}
.cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.coverFallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  background: rgba(255, 255, 255, 0.15);
}
.meta {
  margin-top: 12px;
}
.song {
  margin: 0;
  font-size: 22px;
}
.singer {
  margin: 6px 0 0;
  opacity: 0.82;
}
.lyricPreview {
  margin-top: 18px;
  min-height: 60px;
}
.previewMain {
  margin: 0 0 8px;
  line-height: 1.35;
}
.previewSub {
  margin: -5px 0 10px;
  line-height: 1.3;
  font-size: 13px;
  opacity: 0.75;
}
.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
  padding-top: 18px;
}
.footerInfo {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  text-align: right;
}
.qrWrap {
  width: 88px;
  height: 88px;
  background: #fff;
  padding: 6px;
}
.qr {
  width: 100%;
  height: 100%;
}
.scanText {
  font-size: 13px;
  opacity: 0.88;
}
.cardPageStatus,
.pageStatus {
  font-variant-numeric: tabular-nums;
}
.cardPageStatus {
  font-size: 12px;
  opacity: 1;
}
.pageControls {
  min-height: 44px;
  display: grid;
  grid-template-columns: 44px minmax(112px, auto) 44px;
  align-items: center;
  gap: 8px;
}
.pageButton {
  width: 44px;
  height: 44px;
  padding: 12px;
  border: 1px solid var(--color-primary-alpha-600);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-font);
  background: var(--color-button-background);
  cursor: pointer;
  transition: background-color 180ms ease, opacity 180ms ease;

  svg {
    width: 16px;
    height: 16px;
  }

  &:hover:not(:disabled) {
    background: var(--color-button-background-hover);
  }

  &:active:not(:disabled) {
    background: var(--color-button-background-active);
  }

  &:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
}
.pageStatus {
  min-width: 112px;
  text-align: center;
  font-size: 13px;
}
.presetNebula {
  background: radial-gradient(circle at 14% 20%, #4956ff 0, transparent 54%),
    radial-gradient(circle at 84% 10%, #00b5d9 0, transparent 40%),
    linear-gradient(145deg, #120b2f, #0f1830 55%, #13252e);
}
.presetAmber {
  background: radial-gradient(circle at 20% 16%, #ff983d 0, transparent 48%),
    radial-gradient(circle at 86% 20%, #ffe07a 0, transparent 32%),
    linear-gradient(145deg, #27110a, #44220f, #201410);
}
.presetMono {
  background: linear-gradient(145deg, #151515, #2a2a2a);
}
</style>
