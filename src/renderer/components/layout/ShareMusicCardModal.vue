<template>
  <transition enter-active-class="animated slideInRight" leave-active-class="animated slideOutDown">
    <div
      v-if="isShowShareMusicCard"
      ref="dom_page"
      :class="$style.page"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-card-title"
      :aria-busy="preparingShare"
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
                :disabled="batchBusy"
                :aria-pressed="stylePreset == preset.id"
                type="button"
                @click="handlePresetChange(preset.id)"
              >
                {{ preset.name }}
              </button>
            </div>
          </div>

          <div :class="$style.group">
            <div :class="$style.groupLine">
              <div :class="$style.groupTitle">{{ selectionLabel }}</div>
              <div :class="$style.selectionControls">
                <label :class="$style.switch">
                  <input
                    :checked="allLyricsSelected"
                    :indeterminate="someLyricsSelected"
                    :aria-checked="someLyricsSelected ? 'mixed' : allLyricsSelected"
                    :disabled="!lyricLines.length || batchBusy"
                    type="checkbox"
                    @change="handleSelectAll"
                  />
                  <span>{{ $t('share__select_all') }}</span>
                </label>
                <label v-if="hasTranslations" :class="$style.switch">
                  <input
                    v-model="includeTranslation"
                    :disabled="batchBusy || loadingLyrics"
                    type="checkbox"
                  />
                  <span>{{ $t('share__include_translation') }}</span>
                </label>
              </div>
            </div>
            <div
              v-if="lyricLines.length"
              ref="dom_lyric_list"
              :class="[$style.lyricList, 'scroll']"
              role="listbox"
              aria-multiselectable="true"
              :aria-label="selectionLabel"
              :aria-activedescendant="activeLyricOptionId"
              :aria-busy="loadingLyrics"
              :aria-disabled="batchBusy"
              tabindex="0"
              @keydown="handleLyricListKeydown"
            >
              <label
                v-for="item in visibleLyricLines"
                :id="`share-lyric-option-${item.index}`"
                :key="item.line.key + item.index"
                :class="[
                  $style.lineItem,
                  { [$style.activeLine]: activeLyricIndex == item.index },
                ]"
                role="option"
                :aria-selected="selectedLineSet.has(item.index)"
                :aria-disabled="batchBusy"
                :aria-posinset="item.index + 1"
                :aria-setsize="lyricLines.length"
                @click="activeLyricIndex = item.index"
              >
                <input
                  :checked="selectedLineSet.has(item.index)"
                  :disabled="batchBusy"
                  tabindex="-1"
                  aria-hidden="true"
                  type="checkbox"
                  @change="handleLineSelection(item.index, $event.target.checked)"
                />
                <div>
                  <div :class="$style.lineMain">{{ item.line.text }}</div>
                  <div v-if="item.line.translation" :class="$style.lineSub">
                    {{ item.line.translation }}
                  </div>
                </div>
              </label>
            </div>
            <div v-else :class="$style.emptyLyric" role="status" aria-live="polite">
              {{ loadingLyrics ? $t('share__loading_content') : emptySelectionText }}
            </div>
            <div
              v-if="selectionPageCount > 1"
              :class="$style.selectionPager"
              role="group"
              :aria-label="selectionNavigationLabel"
            >
              <button
                :class="$style.pageButton"
                type="button"
                :disabled="selectionPageIndex == 0 || batchBusy"
                :aria-label="$t('pagination__prev')"
                :title="$t('pagination__prev')"
                @click="handlePreviousSelectionPage"
              >
                <svg viewBox="0 0 451.846 451.847" aria-hidden="true">
                  <use xlink:href="#icon-left" />
                </svg>
              </button>
              <div
                :class="$style.pageStatus"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                {{ selectionPageStatusText }}
              </div>
              <button
                :class="$style.pageButton"
                type="button"
                :disabled="selectionPageIndex + 1 >= selectionPageCount || batchBusy"
                :aria-label="$t('pagination__next')"
                :title="$t('pagination__next')"
                @click="handleNextSelectionPage"
              >
                <svg viewBox="0 0 451.846 451.847" aria-hidden="true">
                  <use xlink:href="#icon-right" />
                </svg>
              </button>
            </div>
          </div>

          <button
            v-if="!isPodcast"
            :class="$style.ceruBtn"
            :disabled="generating || batchBusy || preparingShare"
            type="button"
            @click="handleGenerateCeruShare"
          >
            {{ generating ? $t('share__generating') : $t('share__generate_ceru_link') }}
          </button>

          <div :class="$style.actions">
            <button
              :class="$style.actionBtn"
              type="button"
              :disabled="!shareUrl || batchBusy"
              @click="handleCopyLink"
            >
              {{ $t('share__copy_link') }}
            </button>
            <button
              :class="$style.actionBtn"
              type="button"
              :disabled="batchBusy || preparingShare"
              @click="handleCopyImage"
            >
              {{ $t('share__copy_image') }}
            </button>
            <button
              :class="$style.actionBtn"
              type="button"
              :disabled="batchBusy || preparingShare"
              @click="handleSaveImage"
            >
              {{ $t('share__save_image') }}
            </button>
            <button
              v-if="lyricPageCount > 1"
              :class="$style.actionBtn"
              type="button"
              :disabled="batchPreparing || (!batchSaving && (generating || preparingShare))"
              @click="batchSaving ? handleCancelBatchSave() : handleSaveAllImages()"
            >
              {{ batchSaving ? $t('btn_cancel') : $t('share__save_all_images') }}
            </button>
          </div>
          <div
            v-if="batchProgressText"
            :class="$style.exportStatus"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {{ batchProgressText }}
          </div>
        </aside>

        <section :class="$style.previewWrap">
          <div :class="$style.previewColumn">
            <div :class="[$style.cardViewport, 'scroll']">
              <div
                ref="dom_card"
                :class="[$style.card, $style[cardStylePreset]]"
                :style="cardCoverStyle"
              >
                <div :class="$style.coverWrap">
                  <img
                    v-if="cardMusicInfo?.meta?.picUrl"
                    ref="dom_cover"
                    :src="cardMusicInfo.meta.picUrl"
                    :alt="cardMusicInfo?.name || ''"
                    :class="$style.cover"
                    crossorigin="anonymous"
                  />
                  <div v-else :class="$style.coverFallback">♪</div>
                </div>
                <div :class="$style.meta">
                  <h2 :class="$style.song">{{ cardMusicInfo?.name || '-' }}</h2>
                  <p :class="$style.singer">{{ cardMusicInfo?.singer || '-' }}</p>
                </div>

                <div ref="dom_lyric_preview" :class="$style.lyricPreview">
                  <template v-for="(line, index) in currentLyricPage" :key="line.key + 'preview' + index">
                    <p :class="$style.previewMain">{{ line.text }}</p>
                    <p v-if="cardIncludeTranslation && line.translation" :class="$style.previewSub">
                      {{ line.translation }}
                    </p>
                  </template>
                </div>

                <div :class="$style.footer">
                  <div v-if="cardQrDataUrl" :class="$style.qrWrap">
                    <img
                      :src="cardQrDataUrl"
                      :alt="$t('share__qr_alt')"
                      :class="$style.qr"
                    />
                  </div>
                  <div :class="$style.footerInfo">
                    <div v-if="cardQrDataUrl" :class="$style.scanText">
                      {{ $t(cardScanTextKey) }}
                    </div>
                    <div v-else-if="cardHasShareUrl" :class="$style.noShareLink" role="status">
                      {{ loadingQr && !batchSaving
                        ? $t('share__preparing_card')
                        : $t('share__qr_failed') }}
                    </div>
                    <div v-else :class="$style.noShareLink" role="status">
                      {{ $t('share__no_share_link') }}
                    </div>
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
                :disabled="!hasPreviousPage || batchBusy"
                :aria-label="$t('pagination__prev')"
                :title="$t('pagination__prev')"
                @click="handlePreviousPage"
              >
                <svg viewBox="0 0 451.846 451.847" aria-hidden="true">
                  <use xlink:href="#icon-left" />
                </svg>
              </button>
              <label :class="$style.pageStatus">
                <input
                  v-model.number="pageDraft"
                  :class="$style.pageInput"
                  type="number"
                  inputmode="numeric"
                  min="1"
                  :max="lyricPageCount"
                  :disabled="batchBusy"
                  :aria-label="$t('share__page_jump')"
                  @change="handlePageJump"
                  @blur="handlePageJump"
                  @keydown.enter="$event.currentTarget.blur()"
                />
                <span aria-hidden="true">/ {{ lyricPageCount }}</span>
              </label>
              <span :class="$style.srOnly" aria-live="polite" aria-atomic="true">
                {{ pageStatusText }}
              </span>
              <button
                :class="$style.pageButton"
                type="button"
                :disabled="!hasNextPage || batchBusy"
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
  buildShareCardBatchId,
  buildShareCardPageFileName,
  resolveMusicDetailWebUrl,
  buildLyricSelectableLines,
  paginateLyricLines,
} from '@renderer/utils/shareMusicCard'
import { createShareForMusic } from '@renderer/utils/cerumusicShare'
import { clipboardWriteText, clipboardWriteImageDataURL } from '@common/utils/electron'
import { dialog } from '@renderer/plugins/Dialog'
import { getPlayerLyric, openSaveDir, showSelectDialog } from '@renderer/utils/ipc'
import { musicInfo as playerMusicInfo } from '@renderer/store/player/state'
import { toPng } from 'html-to-image'
import QRCode from 'qrcode'
import path from 'path'

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
  'input:not([disabled]):not([tabindex="-1"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')
const SELECTION_PAGE_SIZE = 40
const CARD_MAX_LINES_PER_PAGE = 5
const CARD_MAX_CHARACTERS_PER_PAGE = 120

const stylePreset = ref('presetNebula')
const includeTranslation = ref(true)
const lyricLines = ref([])
const selectedLineIndexes = ref([])
const currentPageIndex = ref(0)
const pageDraft = ref(1)
const selectionPageIndex = ref(0)
const activeLyricIndex = ref(0)
const qrDataUrl = ref('')
const dom_page = ref(null)
const dom_close = ref(null)
const dom_card = ref(null)
const dom_cover = ref(null)
const dom_lyric_list = ref(null)
const dom_lyric_preview = ref(null)
const coverColors = ref(null)
const rawLyric = ref('')
const rawTlyric = ref('')
const cerumusicUrl = ref('')
const generating = ref(false)
const batchPreparing = ref(false)
const batchSaving = ref(false)
const batchCancelling = ref(false)
const batchProgress = ref(0)
const batchStatus = ref('')
const loadingLyrics = ref(false)
const loadingQr = ref(false)
const loadingCover = ref(false)
const qrError = ref(false)
const batchLyricPages = ref(null)
const batchCardSnapshot = ref(null)
let batchCancelRequested = false
let closeAfterBatchCancel = false
let lyricLoadGeneration = 0
let qrLoadGeneration = 0
let coverLoadGeneration = 0
let shareTrigger = null
let openingMusicInfo = null

const musicInfo = computed(() => shareMusicInfo.value)
const isPodcast = computed(() => musicInfo.value?.meta?.podcast === true)
const detailUrl = computed(() => resolveMusicDetailWebUrl(musicInfo.value))
// 优先使用 CeruMusic 分享落地页链接,未生成时回退到平台详情链接
const shareUrl = computed(() => isPodcast.value ? detailUrl.value : cerumusicUrl.value || detailUrl.value)
const preparingShare = computed(() => (
  loadingLyrics.value || loadingQr.value || loadingCover.value
))
const batchBusy = computed(() => batchPreparing.value || batchSaving.value)
const selectionLabel = computed(() => window.i18n.t(
  isPodcast.value ? 'share__select_transcript' : 'share__select_lyrics'
))
const selectionNavigationLabel = computed(() => window.i18n.t(
  isPodcast.value
    ? 'share__transcript_selection_navigation'
    : 'share__selection_navigation'
))
const emptySelectionText = computed(() => window.i18n.t(
  isPodcast.value ? 'share__no_transcript' : 'share__no_lyric'
))

const selectedLyricLines = computed(() => {
  const selected = new Set(selectedLineIndexes.value)
  return lyricLines.value.filter((_, index) => selected.has(index))
})
const selectedLineSet = computed(() => new Set(selectedLineIndexes.value))
const hasTranslations = computed(() => lyricLines.value.some((line) => line.translation))
const selectionPageCount = computed(() => Math.ceil(
  lyricLines.value.length / SELECTION_PAGE_SIZE
))
const visibleLyricLines = computed(() => {
  const start = selectionPageIndex.value * SELECTION_PAGE_SIZE
  return lyricLines.value
    .slice(start, start + SELECTION_PAGE_SIZE)
    .map((line, offset) => ({ line, index: start + offset }))
})
const activeLyricOptionId = computed(() => lyricLines.value.length
  ? `share-lyric-option-${activeLyricIndex.value}`
  : undefined)
const selectionPageStatusText = computed(() => window.i18n.t('share__page_status', {
  current: selectionPageIndex.value + 1,
  total: selectionPageCount.value,
}))
const lyricPages = computed(() => paginateLyricLines(selectedLyricLines.value, {
  maxLinesPerPage: CARD_MAX_LINES_PER_PAGE,
  maxCharactersPerPage: CARD_MAX_CHARACTERS_PER_PAGE,
  includeTranslation: includeTranslation.value,
}))
const displayedLyricPages = computed(() => batchLyricPages.value ?? lyricPages.value)
const lyricPageCount = computed(() => displayedLyricPages.value.length)
const currentPageNumber = computed(() => lyricPageCount.value ? currentPageIndex.value + 1 : 0)
const currentLyricPage = computed(() => displayedLyricPages.value[currentPageIndex.value] ?? [])
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
const batchProgressText = computed(() => {
  if (batchSaving.value) {
    return window.i18n.t(
      batchCancelling.value ? 'share__save_all_cancelling' : 'share__save_all_progress',
      { current: batchProgress.value, total: lyricPageCount.value }
    )
  }
  return batchStatus.value
})
const cardMusicInfo = computed(() => batchCardSnapshot.value?.musicInfo ?? musicInfo.value)
const cardQrDataUrl = computed(() => batchCardSnapshot.value?.qrDataUrl ?? qrDataUrl.value)
const cardHasShareUrl = computed(() => Boolean(
  batchCardSnapshot.value?.shareUrl ?? shareUrl.value
))
const cardStylePreset = computed(() => batchCardSnapshot.value?.stylePreset ?? stylePreset.value)
const cardIncludeTranslation = computed(() => (
  batchCardSnapshot.value?.includeTranslation ?? includeTranslation.value
))
const cardScanTextKey = computed(() => {
  const info = cardMusicInfo.value
  if (info?.meta?.podcast !== true) return 'share__scan_to_detail'
  const publisherUrl = resolveMusicDetailWebUrl({
    ...info,
    meta: { ...info.meta, audioUrl: '' },
  })
  return publisherUrl ? 'share__scan_to_detail' : 'share__scan_to_audio'
})

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
  const generation = ++coverLoadGeneration
  const sourceMusicInfo = musicInfo.value
  const imageUrl = sourceMusicInfo?.meta?.picUrl
  coverColors.value = null
  loadingCover.value = stylePreset.value === 'presetCover' && Boolean(imageUrl)
  if (!loadingCover.value) return

  try {
    const colors = await extractDominantColor(imageUrl)
    if (
      generation === coverLoadGeneration &&
      musicInfo.value === sourceMusicInfo &&
      stylePreset.value === 'presetCover'
    ) {
      coverColors.value = colors
    }
  } finally {
    if (generation === coverLoadGeneration) loadingCover.value = false
  }
}

const handlePresetChange = (presetId) => {
  if (batchBusy.value) return
  stylePreset.value = presetId
  if (presetId === 'presetCover') {
    void extractCoverColors()
  } else {
    coverLoadGeneration++
    loadingCover.value = false
    coverColors.value = null
  }
}

const resetLyricState = () => {
  lyricLines.value = []
  selectedLineIndexes.value = []
  currentPageIndex.value = 0
  pageDraft.value = 1
  selectionPageIndex.value = 0
  activeLyricIndex.value = 0
  rawLyric.value = ''
  rawTlyric.value = ''
}

const refreshLyricData = async () => {
  const generation = ++lyricLoadGeneration
  const mInfo = musicInfo.value
  resetLyricState()
  loadingLyrics.value = Boolean(mInfo)
  if (!mInfo) return

  try {
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

    if (generation !== lyricLoadGeneration || musicInfo.value !== mInfo) return

    rawLyric.value = sourceLyric
    rawTlyric.value = sourceTlyric

    const lines = buildLyricSelectableLines(sourceLyric, sourceTlyric)
    lyricLines.value = lines
    const selectedCount = mInfo.meta?.podcast === true ? lines.length : Math.min(lines.length, 4)
    selectedLineIndexes.value = Array.from({ length: selectedCount }, (_, index) => index)
  } finally {
    if (generation === lyricLoadGeneration) loadingLyrics.value = false
  }
}

const refreshQRCode = async () => {
  const generation = ++qrLoadGeneration
  const url = shareUrl.value
  qrDataUrl.value = ''
  qrError.value = false
  loadingQr.value = Boolean(url)
  if (!url) return

  try {
    const dataUrl = await QRCode.toDataURL(url, {
      margin: 1,
      width: 180,
      errorCorrectionLevel: 'M',
    })
    if (generation === qrLoadGeneration && shareUrl.value === url) qrDataUrl.value = dataUrl
  } catch {
    if (generation === qrLoadGeneration && shareUrl.value === url) qrError.value = true
  } finally {
    if (generation === qrLoadGeneration) loadingQr.value = false
  }
}

const handleClose = () => {
  if (batchSaving.value) {
    closeAfterBatchCancel = true
    handleCancelBatchSave()
    return
  }
  if (batchPreparing.value) return
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
  if (batchBusy.value) return
  selectedLineIndexes.value = event.target.checked
    ? lyricLines.value.map((_, index) => index)
    : []
}

const handleLineSelection = (index, selected) => {
  if (batchBusy.value) return
  const next = new Set(selectedLineIndexes.value)
  selected ? next.add(index) : next.delete(index)
  selectedLineIndexes.value = [...next].sort((a, b) => a - b)
}

const moveActiveLyric = (targetIndex) => {
  if (!lyricLines.value.length) return
  const nextIndex = Math.min(lyricLines.value.length - 1, Math.max(0, targetIndex))
  activeLyricIndex.value = nextIndex
  selectionPageIndex.value = Math.floor(nextIndex / SELECTION_PAGE_SIZE)
  void nextTick(() => {
    dom_lyric_list.value
      ?.querySelector(`#share-lyric-option-${nextIndex}`)
      ?.scrollIntoView({ block: 'nearest' })
  })
}

const toggleActiveLyric = () => {
  const index = activeLyricIndex.value
  handleLineSelection(index, !selectedLineSet.value.has(index))
}

const handleLyricListKeydown = (event) => {
  const actions = {
    ArrowDown: () => moveActiveLyric(activeLyricIndex.value + 1),
    ArrowUp: () => moveActiveLyric(activeLyricIndex.value - 1),
    PageDown: () => moveActiveLyric(activeLyricIndex.value + SELECTION_PAGE_SIZE),
    PageUp: () => moveActiveLyric(activeLyricIndex.value - SELECTION_PAGE_SIZE),
    Home: () => moveActiveLyric(0),
    End: () => moveActiveLyric(lyricLines.value.length - 1),
    ' ': toggleActiveLyric,
    Enter: toggleActiveLyric,
  }
  const action = actions[event.key]
  if (!action || batchBusy.value) return
  event.preventDefault()
  action()
}

const handlePreviousSelectionPage = () => {
  if (batchBusy.value || !selectionPageIndex.value) return
  moveActiveLyric((selectionPageIndex.value - 1) * SELECTION_PAGE_SIZE)
}

const handleNextSelectionPage = () => {
  if (batchBusy.value || selectionPageIndex.value + 1 >= selectionPageCount.value) return
  moveActiveLyric((selectionPageIndex.value + 1) * SELECTION_PAGE_SIZE)
}

const handlePreviousPage = () => {
  if (!batchBusy.value && hasPreviousPage.value) currentPageIndex.value--
}

const handleNextPage = () => {
  if (!batchBusy.value && hasNextPage.value) currentPageIndex.value++
}

const handlePageJump = () => {
  if (batchBusy.value) return
  const requestedPage = Math.floor(Number(pageDraft.value))
  const nextPage = Number.isFinite(requestedPage)
    ? Math.min(lyricPageCount.value, Math.max(1, requestedPage))
    : currentPageNumber.value
  currentPageIndex.value = Math.max(0, nextPage - 1)
  pageDraft.value = nextPage
}

const renderCardPng = async () => {
  if (!dom_card.value) return ''
  if (
    dom_lyric_preview.value &&
    dom_lyric_preview.value.scrollHeight > dom_lyric_preview.value.clientHeight + 1
  ) {
    throw new Error('share card content exceeds the preview area')
  }
  return toPng(dom_card.value, {
    cacheBust: true,
    pixelRatio: 2,
  })
}

const dataUrlToBytes = (dataUrl) => {
  return Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64')
}

const waitForCardPaint = () => new Promise((resolve) => {
  window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))
})
const cardCoverStyle = computed(() => batchCardSnapshot.value?.coverStyle ?? coverStyle.value)

const handleGenerateCeruShare = async () => {
  if (
    !musicInfo.value ||
    isPodcast.value ||
    generating.value ||
    batchBusy.value ||
    preparingShare.value
  ) return
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
  if (!shareUrl.value || batchBusy.value) return
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
  if (batchBusy.value || preparingShare.value) return
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
  if (batchBusy.value || preparingShare.value) return
  try {
    const dataUrl = await renderCardPng()
    if (!dataUrl) {
      await dialog.confirm({
        message: window.i18n.t('share__save_image_failed'),
        confirmButtonText: window.i18n.t('ok'),
      })
      return
    }

    const result = await openSaveDir({
      title: 'Save share card',
      defaultPath: buildShareCardPageFileName(
        musicInfo.value?.name,
        currentPageNumber.value,
        lyricPageCount.value
      ),
      filters: [{ name: 'PNG', extensions: ['png'] }],
    })
    if (result.canceled || !result.filePath) return

    await window.lx.worker.main.saveStrToFile(result.filePath, dataUrlToBytes(dataUrl))
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

const handleCancelBatchSave = () => {
  if (!batchSaving.value) return
  batchCancelRequested = true
  batchCancelling.value = true
}

const refreshCurrentShareContent = async () => {
  await Promise.all([
    refreshLyricData(),
    refreshQRCode(),
    extractCoverColors(),
  ])
}

const handleSaveAllImages = async () => {
  if (
    batchBusy.value ||
    generating.value ||
    preparingShare.value ||
    lyricPages.value.length < 2
  ) return

  batchPreparing.value = true
  const sourceMusicInfo = musicInfo.value
  const pages = lyricPages.value.map((page) => page.map((line) => ({ ...line })))
  const total = pages.length
  const originalPageIndex = currentPageIndex.value
  const batchId = buildShareCardBatchId()
  const snapshotMusicInfo = sourceMusicInfo
    ? { ...sourceMusicInfo, meta: { ...sourceMusicInfo.meta } }
    : null
  const cardSnapshot = {
    musicInfo: snapshotMusicInfo,
    qrDataUrl: qrDataUrl.value,
    shareUrl: shareUrl.value,
    stylePreset: stylePreset.value,
    coverStyle: { ...coverStyle.value },
    includeTranslation: includeTranslation.value,
  }
  const batchTitle = snapshotMusicInfo?.name
  let directory = ''
  let folderSelectionFailed = false
  batchProgress.value = 0
  batchStatus.value = ''

  try {
    const result = await showSelectDialog({
      title: window.i18n.t('share__save_all_select_folder'),
      properties: ['openDirectory', 'createDirectory'],
    })
    directory = result.canceled ? '' : result.filePaths?.[0] || ''

    if (directory) {
      batchCancelRequested = false
      closeAfterBatchCancel = false
      batchCancelling.value = false
      batchLyricPages.value = pages
      batchCardSnapshot.value = cardSnapshot
      batchSaving.value = true
    }
  } catch {
    folderSelectionFailed = true
    const message = window.i18n.t('share__save_all_folder_failed')
    batchStatus.value = message
    await dialog.confirm({
      message,
      confirmButtonText: window.i18n.t('ok'),
    })
  } finally {
    batchPreparing.value = false
  }

  if (folderSelectionFailed || !directory) {
    if (musicInfo.value !== sourceMusicInfo) await refreshCurrentShareContent()
    return
  }

  let failureStage = 'render'
  try {
    for (let index = 0; index < total; index++) {
      if (batchCancelRequested) break
      currentPageIndex.value = index
      await nextTick()
      await waitForCardPaint()
      failureStage = 'render'
      const dataUrl = await renderCardPng()
      if (!dataUrl) throw new Error('share card is unavailable')
      const fileName = buildShareCardPageFileName(
        batchTitle,
        index + 1,
        total,
        batchId
      )
      failureStage = 'write'
      await window.lx.worker.main.saveStrToFile(
        path.join(directory, fileName),
        dataUrlToBytes(dataUrl)
      )
      batchProgress.value = index + 1
    }

    if (batchCancelRequested) {
      batchStatus.value = window.i18n.t('share__save_all_cancelled', {
        current: batchProgress.value,
        total,
      })
    } else {
      batchStatus.value = window.i18n.t('share__save_all_success', { total })
      await dialog.confirm({
        message: batchStatus.value,
        confirmButtonText: window.i18n.t('ok'),
      })
    }
  } catch {
    const failedPage = Math.min(batchProgress.value + 1, total)
    const messageKey = failureStage === 'write'
      ? 'share__save_all_write_failed'
      : 'share__save_all_render_failed'
    batchStatus.value = window.i18n.t(messageKey, {
      current: batchProgress.value,
      total,
      failed: failedPage,
    })
    await dialog.confirm({
      message: batchStatus.value,
      confirmButtonText: window.i18n.t('ok'),
    })
  } finally {
    const shouldClose = closeAfterBatchCancel
    batchLyricPages.value = null
    batchCardSnapshot.value = null
    currentPageIndex.value = Math.min(
      originalPageIndex,
      Math.max(lyricPages.value.length - 1, 0)
    )
    pageDraft.value = currentPageIndex.value + 1
    batchSaving.value = false
    batchCancelling.value = false
    batchCancelRequested = false
    closeAfterBatchCancel = false

    if (musicInfo.value !== sourceMusicInfo && !shouldClose) {
      await refreshCurrentShareContent()
    }
    if (shouldClose) closeShareMusicCard()
  }
}

watch(
  [selectedLineIndexes, includeTranslation],
  () => {
    if (!batchBusy.value) currentPageIndex.value = 0
  },
  { deep: true }
)

watch(currentPageNumber, (page) => {
  pageDraft.value = page || 1
})

watch(
  () => isShowShareMusicCard.value,
  async (show) => {
    if (!show) {
      lyricLoadGeneration++
      qrLoadGeneration++
      coverLoadGeneration++
      loadingLyrics.value = false
      loadingQr.value = false
      loadingCover.value = false
      const target = shareTrigger
      shareTrigger = null
      await nextTick()
      if (target?.isConnected) target.focus()
      return
    }
    shareTrigger = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    cerumusicUrl.value = ''
    qrDataUrl.value = ''
    qrError.value = false
    batchProgress.value = 0
    batchStatus.value = ''
    batchLyricPages.value = null
    batchCardSnapshot.value = null
    openingMusicInfo = musicInfo.value
    const refreshPromise = refreshCurrentShareContent()
    await nextTick()
    dom_close.value?.focus()
    try {
      await refreshPromise
    } finally {
      if (openingMusicInfo === musicInfo.value) openingMusicInfo = null
    }
  }
)

watch(
  musicInfo,
  async () => {
    if (!isShowShareMusicCard.value) return
    if (openingMusicInfo === musicInfo.value) return
    openingMusicInfo = null
    if (batchBusy.value) {
      if (batchSaving.value) handleCancelBatchSave()
      return
    }
    cerumusicUrl.value = ''
    await refreshCurrentShareContent()
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
  border-radius: 8px;
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
  min-height: 44px;
  font-size: 12px;
  display: flex;
  gap: 6px;
  align-items: center;
  cursor: pointer;
}
.presetList {
  display: flex;
  gap: 8px;
}
.presetBtn {
  border: none;
  border-radius: 16px;
  min-height: 44px;
  padding: 6px 12px;
  cursor: pointer;
  color: var(--color-font);
  background: var(--color-button-background);

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }

  &.active {
    background: var(--color-primary);
    color: #fff;
  }

  &:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }
}
.lyricList {
  max-height: 230px;
  overflow: auto;
  border-radius: 6px;

  &:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }
}
.lineItem {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  min-height: 44px;
  box-sizing: border-box;
  padding: 6px 4px;
  border-radius: 4px;
  cursor: pointer;

  input {
    margin-top: 3px;
  }

  > div {
    min-width: 0;
  }
}
.activeLine {
  background: var(--color-button-background-hover);
  box-shadow: inset 3px 0 0 var(--color-primary);
}
.lineMain {
  font-size: 13px;
  overflow-wrap: anywhere;
}
.lineSub {
  font-size: 12px;
  opacity: 0.68;
  overflow-wrap: anywhere;
}
.emptyLyric {
  padding: 10px;
  font-size: 13px;
  opacity: 0.7;
}
.selectionPager {
  min-height: 44px;
  margin-top: 8px;
  display: grid;
  grid-template-columns: 44px minmax(112px, auto) 44px;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.ceruBtn {
  margin-top: 10px;
  width: 100%;
  border: none;
  border-radius: 6px;
  min-height: 44px;
  padding: 9px 12px;
  color: #fff;
  background: var(--color-primary);
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }

  &:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }
}
.actions {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.actionBtn {
  border: none;
  border-radius: 6px;
  min-height: 44px;
  padding: 8px 12px;
  color: #fff;
  background: var(--color-primary);
  cursor: pointer;

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }

  &:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }
}
.exportStatus {
  min-height: 20px;
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.5;
}
.card {
  width: 360px;
  height: 720px;
  flex: 0 0 auto;
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
  flex: 0 0 96px;
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
  flex: 0 0 auto;
  min-width: 0;
}
.song {
  margin: 0;
  font-size: 22px;
  line-height: 1.25;
  display: -webkit-box;
  overflow: hidden;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.singer {
  margin: 6px 0 0;
  line-height: 1.4;
  display: -webkit-box;
  overflow: hidden;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  opacity: 0.82;
}
.lyricPreview {
  margin-top: 18px;
  min-height: 60px;
  flex: 1 1 auto;
  overflow: hidden;
}
.previewMain {
  margin: 0 0 8px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.previewSub {
  margin: -5px 0 10px;
  line-height: 1.3;
  font-size: 13px;
  opacity: 0.75;
  overflow-wrap: anywhere;
}
.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
  padding-top: 18px;
  flex: 0 0 auto;
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
.noShareLink {
  max-width: 190px;
  font-size: 13px;
  line-height: 1.4;
  opacity: 0.82;
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
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  text-align: center;
  font-size: 13px;
}
.pageInput {
  width: 56px;
  height: 44px;
  box-sizing: border-box;
  border: 1px solid var(--color-primary-alpha-600);
  border-radius: 6px;
  padding: 0 6px;
  text-align: center;
  color: var(--color-font);
  background: var(--color-button-background);
  font: inherit;
  font-variant-numeric: tabular-nums;

  &:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }
}
.srOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
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
.presetCover {
  background: #1d2427;
}

@media (max-width: 760px) {
  .container {
    padding: 8px 6px 16px;
    flex-direction: column;
    overflow-y: auto;
  }
  .panel {
    width: 100%;
    min-width: 0;
    overflow: visible;
    flex: none;
  }
  .previewWrap {
    flex: none;
  }
  .previewColumn {
    min-width: 0;
    height: auto;
  }
  .cardViewport {
    flex: none;
    overflow-x: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .page {
    animation: none !important;
  }
}
</style>
