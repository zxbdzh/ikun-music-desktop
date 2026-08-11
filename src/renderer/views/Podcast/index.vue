<template>
  <main :class="$style.page">
    <header :class="$style.toolbar">
      <div>
        <h1>播客</h1>
        <p>订阅、播放与逐字稿</p>
      </div>
      <form :class="$style.search" @submit.prevent="loadSources">
        <input v-model="query" aria-label="搜索播客" placeholder="搜索节目" />
        <button type="submit" :disabled="loading">搜索</button>
        <button v-if="query" type="button" @click="clearSearch">清除</button>
      </form>
    </header>

    <section :class="$style.content">
      <aside :class="$style.sources" aria-label="播客节目">
        <div :class="$style.sectionTitle">
          <strong>{{ query ? '搜索结果' : '节目目录' }}</strong>
          <button type="button" :disabled="loading" title="刷新" @click="loadSources">刷新</button>
        </div>
        <p v-if="error" :class="$style.error">{{ error }}</p>
        <button
          v-for="source in sources"
          :key="source.id"
          type="button"
          :class="[$style.source, { [$style.selected]: selectedSource?.id === source.id }]"
          @click="selectSource(source)"
        >
          <img :src="source.artworkUrl" alt="" />
          <span>
            <strong>{{ source.title }}</strong>
            <small>{{ source.author || '未知作者' }}</small>
          </span>
          <i v-if="source.subscribed">已订阅</i>
        </button>
        <p v-if="!loading && !sources.length" :class="$style.empty">没有找到节目</p>
      </aside>

      <section :class="$style.episodes">
        <template v-if="selectedSource">
          <div :class="$style.showHeader">
            <img :src="selectedSource.artworkUrl" alt="" />
            <div>
              <h2>{{ selectedSource.title }}</h2>
              <p>{{ selectedSource.author }}</p>
            </div>
            <button
              v-if="!selectedSource.subscribed"
              type="button"
              @click="subscribeTarget = selectedSource"
            >
              订阅
            </button>
            <button v-else type="button" @click="unsubscribe(selectedSource)">取消订阅</button>
            <button type="button" :disabled="loadingEpisodes" @click="loadEpisodes(true)">刷新单集</button>
          </div>

          <div :class="$style.episodeList">
            <article v-for="(episode, index) in episodes" :key="episode.id" :class="$style.episode">
              <div>
                <h3>{{ episode.title }}</h3>
                <p>
                  {{ formatDate(episode.publishedAt) }}
                  <span v-if="episode.durationSeconds"> · {{ formatDuration(episode.durationSeconds) }}</span>
                  <span v-if="episode.transcriptReferences.length"> · 有发布者逐字稿</span>
                </p>
                <div
                  v-if="transcriptionStatuses[episode.id]"
                  :class="[
                    $style.transcriptionStatus,
                    { [$style.transcriptionWarning]: isTranscriptionWarning(transcriptionStatuses[episode.id], now) },
                  ]"
                >
                  <div :class="$style.transcriptionHeadline">
                    <strong :title="transcriptionTitle(transcriptionStatuses[episode.id])">
                      {{ transcriptionTitle(transcriptionStatuses[episode.id]) }}
                    </strong>
                    <span
                      v-if="transcriptionProgress(transcriptionStatuses[episode.id]) != null"
                      :class="$style.segmentProgress"
                      role="progressbar"
                      :aria-valuenow="transcriptionProgress(transcriptionStatuses[episode.id]) ?? 0"
                      aria-valuemin="0"
                      aria-valuemax="100"
                    >
                      <i :style="{ width: `${transcriptionProgress(transcriptionStatuses[episode.id]) ?? 0}%` }" />
                    </span>
                  </div>
                  <small v-if="transcriptionDetail(transcriptionStatuses[episode.id], now)">
                    {{ transcriptionDetail(transcriptionStatuses[episode.id], now) }}
                  </small>
                  <small
                    v-if="transcriptionWarning(transcriptionStatuses[episode.id], now)"
                    :class="$style.transcriptionAlert"
                  >
                    {{ transcriptionWarning(transcriptionStatuses[episode.id], now) }}
                  </small>
                </div>
              </div>
              <div :class="$style.episodeActions">
                <button type="button" title="下载" @click="downloadEpisode(episode)">
                  {{ downloaded.has(episode.id) ? '已下载' : '下载' }}
                </button>
                <button
                  type="button"
                  :disabled="transcriptionAction(transcriptionStatuses[episode.id]).disabled"
                  :title="transcriptionAction(transcriptionStatuses[episode.id]).label"
                  @click="handleTranscriptionAction(episode)"
                >
                  {{ transcriptionAction(transcriptionStatuses[episode.id]).label }}
                </button>
                <button
                  v-if="transcriptionStatuses[episode.id]?.transcriptState === 'ready'"
                  type="button"
                  :disabled="speakerActionDisabled(transcriptionStatuses[episode.id])"
                  :title="transcriptionStatuses[episode.id]?.speakerCount
                    ? '使用 AI 标注主持人和嘉宾'
                    : '先区分说话人，再使用 AI 标注主持人和嘉宾'"
                  @click="identifySpeakers(episode)"
                >
                  AI 标注
                </button>
                <button type="button" title="播放" @click="playEpisode(index)">播放</button>
              </div>
            </article>
            <p v-if="!loadingEpisodes && !episodes.length" :class="$style.empty">暂无单集</p>
          </div>
        </template>
        <p v-else :class="$style.empty">从左侧选择一个节目</p>
      </section>
    </section>

    <details :class="$style.settings" @toggle="handleSettingsToggle">
      <summary>播客设置</summary>
      <section :class="$style.backendPanel" aria-labelledby="podcast-backend-title">
        <header>
          <div>
            <strong id="podcast-backend-title">计算后端</strong>
            <small>显示设备能力与最近任务实际使用的后端</small>
          </div>
          <button type="button" :disabled="backendLoading" @click="loadBackendStatus">
            {{ backendLoading ? '检测中' : '重新检测' }}
          </button>
        </header>
        <p v-if="backendError" :class="$style.backendError">{{ backendError }}</p>
        <div v-if="backendStatus" :class="$style.backendGrid">
          <article>
            <div :class="$style.backendHeadline">
              <span>语音转写</span>
              <strong
                :class="{
                  [$style.backendGpu]: backendExecutorIsGpu(
                    backendDisplayExecutor(backendStatus.asr)
                  ),
                }"
              >
                {{ backendExecutorLabel(backendDisplayExecutor(backendStatus.asr)) }}
              </strong>
            </div>
            <p>
              {{ backendStatus.asr.actualExecutor ? '最近任务实际使用' : '当前可用' }}
              · 首选 {{ backendExecutorLabel(backendStatus.asr.preferredExecutor) }}
            </p>
            <small v-if="backendStatus.asr.deviceName">{{ backendStatus.asr.deviceName }}</small>
            <small :class="{ [$style.backendWarning]: !backendStatus.asr.gpuAvailable }">
              {{ backendStatus.asr.capabilityMessage }}
            </small>
            <small>CPU 后备：已随应用提供</small>
            <small v-if="backendStatus.asr.fallbackReason" :class="$style.backendWarning">
              最近回退：{{ backendStatus.asr.fallbackReason }}
            </small>
          </article>
          <article>
            <div :class="$style.backendHeadline">
              <span>说话人分离</span>
              <strong
                :class="{
                  [$style.backendGpu]: backendExecutorIsGpu(
                    backendDisplayExecutor(backendStatus.speakerDiarization)
                  ),
                }"
              >
                {{ backendExecutorLabel(backendDisplayExecutor(backendStatus.speakerDiarization)) }}
              </strong>
            </div>
            <p>
              {{ backendStatus.speakerDiarization.actualExecutor ? '最近任务实际使用' : '当前可用' }}
              · 首选 {{ backendExecutorLabel(backendStatus.speakerDiarization.preferredExecutor) }}
            </p>
            <small v-if="backendStatus.speakerDiarization.deviceName">
              {{ backendStatus.speakerDiarization.deviceName }}
            </small>
            <small
              :class="{ [$style.backendWarning]: !backendStatus.speakerDiarization.gpuAvailable }"
            >
              {{ backendStatus.speakerDiarization.capabilityMessage }}
            </small>
            <small>CPU 后备：已随应用提供</small>
            <small
              v-if="backendStatus.speakerDiarization.fallbackReason"
              :class="$style.backendWarning"
            >
              最近回退：{{ backendStatus.speakerDiarization.fallbackReason }}
            </small>
          </article>
        </div>
        <small v-else-if="backendLoading">正在检查 CUDA、DirectML 与 CPU 后端…</small>
      </section>
      <div :class="$style.settingGrid">
        <label>
          默认倍速
          <select :value="appSetting['podcast.playbackRate']" @change="changeRate">
            <option v-for="rate in rates" :key="rate" :value="rate">{{ rate }}x</option>
          </select>
        </label>
        <label>
          识别模型
          <select :value="appSetting['podcast.asrModel']" @change="changeModel">
            <option value="base">base</option>
            <option value="small">small（默认）</option>
            <option value="medium">medium</option>
          </select>
        </label>
        <label>
          NVIDIA CUDA 加速
          <input
            type="checkbox"
            :checked="appSetting['podcast.asrVulkan']"
            @change="changeAsrAcceleration"
          />
        </label>
        <div>
          <span>下载位置</span>
          <button type="button" @click="choosePath('podcast.downloadPath')">选择</button>
          <code>{{ appSetting['podcast.downloadPath'] }}</code>
        </div>
        <div>
          <span>音频缓存位置</span>
          <button type="button" @click="choosePath('podcast.cachePath')">选择</button>
          <code>{{ appSetting['podcast.cachePath'] }}</code>
        </div>
        <label>
          AI 身份标注
          <input v-model="aiEnabled" type="checkbox" @change="saveAiPublicSettings" />
        </label>
        <label>
          AI Base URL
          <input v-model="aiBaseUrl" type="url" placeholder="https://api.openai.com/v1" />
        </label>
        <label>
          AI 模型
          <input v-model="aiModel" type="text" placeholder="gpt-4.1-mini" />
        </label>
        <label>
          API Key
          <input
            v-model="aiApiKey"
            type="password"
            autocomplete="off"
            :placeholder="aiConfig?.hasApiKey ? '已安全保存' : '输入 API Key'"
          />
          <button type="button" @click="saveAiConfig">保存</button>
        </label>
        <div>
          <span>AI 连接</span>
          <button type="button" :disabled="aiTesting" @click="testAiConnection">
            {{ aiTesting ? '测试中' : '测试连接' }}
          </button>
          <small>{{ aiConnectionState }}</small>
        </div>
      </div>
      <div :class="$style.account">
        <template v-if="session?.account">
          <span>{{ session.account.username || session.account.email }}</span>
          <span :class="$style.syncSummary">
            <small role="status" :class="{ [$style.syncError]: syncPresentation.isError }">
              {{ syncPresentation.label }}
            </small>
            <small v-if="syncPresentation.detail" role="alert" :class="$style.syncError">
              {{ syncPresentation.detail }}
            </small>
          </span>
          <button
            v-if="syncPresentation.action === 'sync'"
            type="button"
            :disabled="syncPresentation.busy"
            @click="syncNow"
          >
            {{ syncPresentation.actionLabel }}
          </button>
          <button
            v-else-if="syncPresentation.action === 'reauthenticate'"
            type="button"
            @click="reauthenticate"
          >
            {{ syncPresentation.actionLabel }}
          </button>
          <button type="button" @click="logout">退出</button>
        </template>
        <template v-else>
          <select v-model="loginMode" aria-label="登录方式">
            <option value="password">密码登录</option>
            <option value="code">邮箱验证码</option>
          </select>
          <input v-model="email" type="email" autocomplete="username" placeholder="邮箱" />
          <input
            v-model="credential"
            :type="loginMode === 'password' ? 'password' : 'text'"
            :autocomplete="loginMode === 'password' ? 'current-password' : 'one-time-code'"
            :placeholder="loginMode === 'password' ? '密码' : '验证码'"
          />
          <button v-if="loginMode === 'code'" type="button" @click="sendCode">发送验证码</button>
          <button type="button" @click="login">登录</button>
        </template>
      </div>
    </details>

    <div v-if="subscribeTarget" :class="$style.modalBackdrop" @click.self="subscribeTarget = null">
      <section :class="$style.modal" role="dialog" aria-modal="true" aria-labelledby="subscribe-title">
        <h2 id="subscribe-title">订阅 {{ subscribeTarget.title }}</h2>
        <p>是否自动下载最新 3 个未播放单集？自动下载使用任意网络，手动下载内容不会自动删除。</p>
        <div>
          <button type="button" @click="subscribeTarget = null">取消</button>
          <button type="button" @click="subscribe(false)">仅订阅</button>
          <button type="button" @click="subscribe(true)">订阅并自动下载</button>
        </div>
      </section>
    </div>
  </main>
</template>

<script lang="ts">
import { computed, onBeforeUnmount, ref } from '@common/utils/vueTools'
import { LIST_IDS } from '@common/constants'
import { sendPodcastCommand, showSelectDialog } from '@renderer/utils/ipc'
import { setTempList } from '@renderer/store/list/action'
import { playList } from '@renderer/core/player'
import { appSetting, updateSetting } from '@renderer/store/setting'
import {
  isTranscriptionWarning,
  shouldPollTranscription,
  transcriptionAction,
  transcriptionDetail,
  transcriptionProgress,
  transcriptionTitle,
  transcriptionWarning,
} from './transcriptionStatus'
import { syncStatusPresentation } from './syncStatus'

const toMusicInfo = (episode: LX.Podcast.Episode, source: LX.Podcast.Source): LX.Music.MusicInfoPodcast => ({
  id: episode.id,
  name: episode.title,
  singer: source.title,
  source: 'local',
  interval: episode.durationSeconds ? formatDuration(episode.durationSeconds) : null,
  meta: {
    songId: episode.id,
    albumName: source.title,
    picUrl: episode.artworkUrl || source.artworkUrl,
    filePath: episode.audioUrl,
    ext: new URL(episode.audioUrl).pathname.split('.').pop() || 'audio',
    podcast: true,
    audioUrl: episode.audioUrl,
    artworkUrl: episode.artworkUrl || source.artworkUrl,
    sourceId: source.id,
    publishedAt: episode.publishedAt,
  },
})

const formatDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = Math.floor(seconds % 60)
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
    : `${minutes}:${String(rest).padStart(2, '0')}`
}

export default {
  name: 'Podcast',
  setup() {
    const query = ref('')
    const loading = ref(false)
    const loadingEpisodes = ref(false)
    const error = ref('')
    const sources = ref<LX.Podcast.Source[]>([])
    const episodes = ref<LX.Podcast.Episode[]>([])
    const selectedSource = ref<LX.Podcast.Source | null>(null)
    const subscribeTarget = ref<LX.Podcast.Source | null>(null)
    const downloaded = ref(new Set<string>())
    const transcriptionStatuses = ref<Record<string, LX.Podcast.TranscriptionStatus | null>>({})
    const session = ref<LX.Podcast.Session | null>(null)
    const syncPresentation = computed(() => syncStatusPresentation(session.value))
    const loginMode = ref<'password' | 'code'>('password')
    const email = ref('')
    const credential = ref('')
    const aiConfig = ref<LX.Podcast.SpeakerAiConfig | null>(null)
    const aiEnabled = ref(appSetting['podcast.aiEnabled'])
    const aiBaseUrl = ref(appSetting['podcast.aiBaseUrl'])
    const aiModel = ref(appSetting['podcast.aiModel'])
    const aiApiKey = ref('')
    const aiTesting = ref(false)
    const aiConnectionState = ref('')
    const backendStatus = ref<LX.Podcast.ComputeBackendStatus | null>(null)
    const backendLoading = ref(false)
    const backendError = ref('')
    const now = ref(Date.now())
    const rates = [0.75, 1, 1.25, 1.5, 1.75, 2]
    const transcriptionPollTimers = new Map<string, ReturnType<typeof setTimeout>>()
    const clockTimer = setInterval(() => { now.value = Date.now() }, 1_000)
    const clearTranscriptionPolls = () => {
      for (const timer of transcriptionPollTimers.values()) clearTimeout(timer)
      transcriptionPollTimers.clear()
    }

    const loadSources = async () => {
      loading.value = true
      error.value = ''
      try {
        sources.value = await sendPodcastCommand<LX.Podcast.Source[]>({
          action: 'catalog',
          query: query.value.trim() || undefined,
        })
      } catch (value) {
        error.value = value instanceof Error ? value.message : String(value)
      } finally {
        loading.value = false
      }
    }
    const loadEpisodes = async (refresh = false) => {
      if (!selectedSource.value) return
      loadingEpisodes.value = true
      error.value = ''
      try {
        episodes.value = await sendPodcastCommand<LX.Podcast.Episode[]>({
          action: 'episodes',
          sourceId: selectedSource.value.id,
          refresh,
        })
        void Promise.all(episodes.value.map((episode) => refreshTranscriptionStatus(episode.id)))
          .then((statuses) => statuses.forEach((status, index) => {
            scheduleTranscriptionPoll(episodes.value[index]?.id, status)
          }))
      } catch (value) {
        error.value = value instanceof Error ? value.message : String(value)
      } finally {
        loadingEpisodes.value = false
      }
    }
    const selectSource = (source: LX.Podcast.Source) => {
      clearTranscriptionPolls()
      selectedSource.value = source
      void loadEpisodes()
    }
    const subscribe = async (autoDownload: boolean) => {
      if (!subscribeTarget.value) return
      const source = await sendPodcastCommand<LX.Podcast.Source>({
        action: 'subscribe',
        source: subscribeTarget.value,
        autoDownload,
      })
      sources.value = sources.value.map((item) => (item.id === source.id ? source : item))
      selectedSource.value = source
      subscribeTarget.value = null
    }
    const unsubscribe = async (source: LX.Podcast.Source) => {
      await sendPodcastCommand({ action: 'unsubscribe', sourceId: source.id })
      const value = { ...source, subscribed: false, autoDownload: false }
      sources.value = sources.value.map((item) => (item.id === source.id ? value : item))
      selectedSource.value = value
    }
    const playEpisode = async (index: number) => {
      if (!selectedSource.value) return
      await setTempList(
        `podcast:${selectedSource.value.id}`,
        episodes.value.map((episode) => toMusicInfo(episode, selectedSource.value!))
      )
      updateSetting({ 'player.playbackRate': appSetting['podcast.playbackRate'] })
      playList(LIST_IDS.TEMP, index)
    }
    const downloadEpisode = async (episode: LX.Podcast.Episode) => {
      await sendPodcastCommand({ action: 'download-episode', episodeId: episode.id })
      downloaded.value = new Set([...downloaded.value, episode.id])
    }
    const refreshTranscriptionStatus = async (episodeId: string) => {
      const status = await sendPodcastCommand<LX.Podcast.TranscriptionStatus | null>({
        action: 'transcription-status',
        episodeId,
      })
      transcriptionStatuses.value = { ...transcriptionStatuses.value, [episodeId]: status }
      if (status?.asrExecutor || status?.executor) void loadBackendStatus()
      return status
    }
    const scheduleTranscriptionPoll = (
      episodeId: string | undefined,
      status?: LX.Podcast.TranscriptionStatus | null
    ) => {
      if (!episodeId) return
      const existing = transcriptionPollTimers.get(episodeId)
      if (existing) clearTimeout(existing)
      transcriptionPollTimers.delete(episodeId)
      if (!shouldPollTranscription(status)) return
      transcriptionPollTimers.set(episodeId, setTimeout(async () => {
        transcriptionPollTimers.delete(episodeId)
        try {
          scheduleTranscriptionPoll(episodeId, await refreshTranscriptionStatus(episodeId))
        } catch (value) {
          console.warn('[podcast] transcription status poll failed:', value)
          scheduleTranscriptionPoll(episodeId, transcriptionStatuses.value[episodeId])
        }
      }, 1_000))
    }
    const generateTranscript = async (episode: LX.Podcast.Episode) => {
      const status = transcriptionStatuses.value[episode.id]
      const command = status?.transcriptState === 'failed'
        ? 'retry'
        : status?.transcriptState === 'ready'
          ? 'restart'
          : 'start'
      const next = await sendPodcastCommand<LX.Podcast.TranscriptionStatus>({
        action: 'transcription-control',
        episodeId: episode.id,
        command,
      })
      transcriptionStatuses.value = { ...transcriptionStatuses.value, [episode.id]: next }
      scheduleTranscriptionPoll(episode.id, next)
    }
    const cancelTranscription = async (episode: LX.Podcast.Episode) => {
      const next = await sendPodcastCommand<LX.Podcast.TranscriptionStatus>({
        action: 'transcription-control',
        episodeId: episode.id,
        command: 'cancel',
      })
      transcriptionStatuses.value = { ...transcriptionStatuses.value, [episode.id]: next }
      scheduleTranscriptionPoll(episode.id, next)
    }
    const handleTranscriptionAction = (episode: LX.Podcast.Episode) =>
      transcriptionAction(transcriptionStatuses.value[episode.id]).kind === 'cancel'
        ? cancelTranscription(episode)
        : generateTranscript(episode)
    const identifySpeakers = async (episode: LX.Podcast.Episode) => {
      const status = await sendPodcastCommand<LX.Podcast.TranscriptionStatus>({
        action: 'identify-speakers',
        episodeId: episode.id,
      })
      transcriptionStatuses.value = { ...transcriptionStatuses.value, [episode.id]: status }
      scheduleTranscriptionPoll(episode.id, status)
    }
    const speakerActionDisabled = (status?: LX.Podcast.TranscriptionStatus | null) =>
      !aiConfig.value?.enabled || !aiConfig.value?.hasApiKey || shouldPollTranscription(status)
    const clearSearch = () => {
      query.value = ''
      void loadSources()
    }
    const choosePath = async (key: 'podcast.downloadPath' | 'podcast.cachePath') => {
      const result = await showSelectDialog({
        title: key === 'podcast.downloadPath' ? '选择播客下载位置' : '选择播客音频缓存位置',
        defaultPath: appSetting[key],
        properties: ['openDirectory', 'createDirectory'],
      })
      if (!result.canceled && result.filePaths[0]) {
        await sendPodcastCommand({
          action: 'storage-migrate',
          kind: key === 'podcast.downloadPath' ? 'download' : 'cache',
          path: result.filePaths[0],
        })
        updateSetting({ [key]: result.filePaths[0] })
      }
    }
    const changeRate = (event: Event) =>
      updateSetting({ 'podcast.playbackRate': Number((event.target as HTMLSelectElement).value) })
    const changeModel = (event: Event) =>
      updateSetting({
        'podcast.asrModel': (event.target as HTMLSelectElement).value as LX.AppSetting['podcast.asrModel'],
      })
    const changeAsrAcceleration = (event: Event) => {
      updateSetting({
        'podcast.asrVulkan': (event.target as HTMLInputElement).checked,
      })
      setTimeout(() => { void loadBackendStatus() }, 250)
    }
    const loadBackendStatus = async () => {
      if (backendLoading.value) return
      backendLoading.value = true
      backendError.value = ''
      try {
        backendStatus.value = await sendPodcastCommand<LX.Podcast.ComputeBackendStatus>({
          action: 'backend-status',
        })
      } catch (value) {
        backendError.value = value instanceof Error ? value.message : String(value)
      } finally {
        backendLoading.value = false
      }
    }
    const handleSettingsToggle = (event: Event) => {
      if ((event.target as HTMLDetailsElement).open) void loadBackendStatus()
    }
    const backendExecutorLabel = (
      executor: LX.Podcast.AsrExecutor | LX.Podcast.TranscriptionExecutor
    ) => {
      if (executor === 'cuda') return 'CUDA GPU'
      if (executor === 'directml') return 'DirectML GPU'
      if (executor === 'vulkan') return 'Vulkan GPU'
      return 'CPU'
    }
    const backendExecutorIsGpu = (
      executor: LX.Podcast.AsrExecutor | LX.Podcast.TranscriptionExecutor
    ) => executor != null && executor !== 'cpu'
    const backendDisplayExecutor = (
      backend: LX.Podcast.AsrComputeBackendStatus | LX.Podcast.SpeakerComputeBackendStatus
    ) => backend.actualExecutor ?? (
      backend.preferredExecutor !== 'cpu' && !backend.gpuAvailable
        ? 'cpu'
        : backend.preferredExecutor
    )
    const loadAiConfig = async () => {
      aiConfig.value = await sendPodcastCommand<LX.Podcast.SpeakerAiConfig>({
        action: 'speaker-ai-config',
      })
      aiEnabled.value = aiConfig.value.enabled
      aiBaseUrl.value = aiConfig.value.baseUrl
      aiModel.value = aiConfig.value.model
    }
    const saveAiPublicSettings = () => updateSetting({
      'podcast.aiEnabled': aiEnabled.value,
      'podcast.aiBaseUrl': aiBaseUrl.value.trim(),
      'podcast.aiModel': aiModel.value.trim(),
    })
    const saveAiConfig = async () => {
      saveAiPublicSettings()
      if (aiApiKey.value) {
        aiConfig.value = await sendPodcastCommand<LX.Podcast.SpeakerAiConfig>({
          action: 'speaker-ai-key-save',
          apiKey: aiApiKey.value,
        })
        aiApiKey.value = ''
      } else {
        await loadAiConfig()
      }
      aiConnectionState.value = '已保存'
    }
    const testAiConnection = async () => {
      aiTesting.value = true
      aiConnectionState.value = ''
      try {
        await saveAiConfig()
        await sendPodcastCommand({ action: 'speaker-ai-test' })
        aiConnectionState.value = '连接成功'
      } catch (value) {
        aiConnectionState.value = value instanceof Error ? value.message : String(value)
      } finally {
        aiTesting.value = false
      }
    }
    const loadSession = async () => {
      session.value = await sendPodcastCommand<LX.Podcast.Session>({ action: 'session' })
    }
    const sendCode = async () => {
      await sendPodcastCommand({ action: 'send-code', email: email.value.trim() })
    }
    const login = async () => {
      session.value = await sendPodcastCommand<LX.Podcast.Session>(
        loginMode.value === 'password'
          ? { action: 'login-password', email: email.value.trim(), password: credential.value }
          : { action: 'login-email', email: email.value.trim(), code: credential.value.trim() }
      )
      credential.value = ''
    }
    const logout = async () => {
      session.value = await sendPodcastCommand<LX.Podcast.Session>({ action: 'logout' })
    }
    const reauthenticate = async () => {
      await logout()
    }
    const syncNow = async () => {
      if (!session.value) return
      const previous = session.value
      session.value = { ...previous, syncState: 'syncing', error: undefined }
      try {
        session.value = await sendPodcastCommand<LX.Podcast.Session>({ action: 'sync-now' })
      } catch (value) {
        session.value = {
          ...previous,
          syncState: 'error',
          error: value instanceof Error ? value.message : String(value),
        }
      }
    }

    onBeforeUnmount(() => {
      clearInterval(clockTimer)
      clearTranscriptionPolls()
    })

    void loadSources()
    void loadSession()
    void loadAiConfig()
    void loadBackendStatus()
    return {
      appSetting,
      query,
      loading,
      loadingEpisodes,
      error,
      sources,
      episodes,
      selectedSource,
      subscribeTarget,
      downloaded,
      transcriptionStatuses,
      session,
      syncPresentation,
      loginMode,
      email,
      credential,
      aiConfig,
      aiEnabled,
      aiBaseUrl,
      aiModel,
      aiApiKey,
      aiTesting,
      aiConnectionState,
      backendStatus,
      backendLoading,
      backendError,
      now,
      rates,
      loadSources,
      loadEpisodes,
      selectSource,
      subscribe,
      unsubscribe,
      playEpisode,
      downloadEpisode,
      handleTranscriptionAction,
      identifySpeakers,
      speakerActionDisabled,
      transcriptionAction,
      transcriptionProgress,
      transcriptionTitle,
      transcriptionDetail,
      transcriptionWarning,
      isTranscriptionWarning,
      clearSearch,
      choosePath,
      changeRate,
      changeModel,
      changeAsrAcceleration,
      loadBackendStatus,
      handleSettingsToggle,
      backendExecutorLabel,
      backendExecutorIsGpu,
      backendDisplayExecutor,
      saveAiPublicSettings,
      saveAiConfig,
      testAiConnection,
      sendCode,
      login,
      logout,
      reauthenticate,
      syncNow,
      formatDate: (value: number) => new Date(value).toLocaleDateString(),
      formatDuration,
    }
  },
}
</script>

<style lang="less" module>
.page { height: 100%; display: flex; flex-direction: column; min-width: 0; color: var(--color-font); }
.toolbar { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 18px 24px; border-bottom: 1px solid var(--color-primary-light-900-alpha-100); }
.toolbar h1, .showHeader h2, .modal h2 { margin: 0; font-size: 20px; letter-spacing: 0; }
.toolbar p, .showHeader p { margin: 3px 0 0; opacity: .65; font-size: 12px; }
.search { display: flex; gap: 8px; min-width: min(420px, 50%); }
.search input { flex: 1; min-width: 100px; }
.page input, .page select, .page button { border: 1px solid var(--color-primary-light-900-alpha-200); background: var(--color-primary-light-100-alpha-700); color: inherit; border-radius: 4px; padding: 7px 10px; letter-spacing: 0; }
.page button { cursor: pointer; }
.page button:disabled { opacity: .45; cursor: default; }
.content { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(240px, 32%) 1fr; }
.sources { overflow: auto; border-right: 1px solid var(--color-primary-light-900-alpha-100); padding: 12px; }
.sectionTitle { display: flex; align-items: center; justify-content: space-between; margin: 0 4px 8px; }
.source { width: 100%; display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; align-items: center; gap: 10px; text-align: left; margin-bottom: 5px; border-color: transparent !important; background: transparent !important; }
.source:hover, .source.selected { background: var(--color-primary-light-300-alpha-700) !important; }
.source img, .showHeader img { width: 44px; height: 44px; object-fit: cover; border-radius: 4px; background: var(--color-primary-light-400-alpha-400); }
.source span, .episode div { min-width: 0; }
.source strong, .source small { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.source small, .source i { opacity: .65; font-size: 11px; font-style: normal; }
.episodes { min-width: 0; overflow: auto; padding: 16px 20px; }
.showHeader { display: grid; grid-template-columns: 56px minmax(0, 1fr) auto auto; align-items: center; gap: 10px; padding-bottom: 14px; }
.showHeader img { width: 56px; height: 56px; }
.episodeList { border-top: 1px solid var(--color-primary-light-900-alpha-100); }
.episode { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 16px; padding: 13px 4px; border-bottom: 1px solid var(--color-primary-light-900-alpha-100); }
.episodeActions { display: flex; gap: 6px; }
.episode h3 { margin: 0; font-size: 14px; letter-spacing: 0; }
.episode p { margin: 5px 0 0; opacity: .62; font-size: 11px; }
.transcriptionStatus { display: grid; gap: 3px; min-height: 16px; margin-top: 7px; font-family: Consolas, "Microsoft YaHei UI", sans-serif; font-size: 11px; opacity: .82; }
.transcriptionHeadline { display: flex; align-items: center; gap: 9px; min-width: 0; }
.transcriptionHeadline strong { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 11px; font-weight: 600; }
.transcriptionStatus small { display: block; opacity: .76; }
.transcriptionWarning { opacity: 1; }
.transcriptionAlert { color: #c98316; opacity: 1 !important; }
.segmentProgress { position: relative; display: block; width: 112px; height: 4px; flex: none; overflow: hidden; border-radius: 2px; background: var(--color-primary-light-900-alpha-100); }
.segmentProgress i { position: absolute; inset: 0 auto 0 0; display: block; background: var(--color-primary); transition: width .2s ease; }
.settings { flex: none; border-top: 1px solid var(--color-primary-light-900-alpha-100); padding: 9px 24px; }
.settings[open] { max-height: 68vh; overflow-y: auto; }
.settings summary { position: sticky; top: 0; z-index: 1; cursor: pointer; margin: -9px 0 0; padding: 9px 0; font-weight: 600; background: var(--color-primary-light-100); }
.backendPanel { margin-top: 12px; padding: 12px; border: 1px solid var(--color-primary-light-900-alpha-100); border-radius: 6px; background: var(--color-primary-light-100-alpha-300); }
.backendPanel > header { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.backendPanel > header div { display: grid; gap: 2px; }
.backendPanel > header small, .backendPanel > small { opacity: .62; }
.backendGrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 10px; }
.backendGrid article { min-width: 0; padding: 11px 12px; border-radius: 5px; background: var(--color-primary-light-300-alpha-300); }
.backendHeadline { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.backendHeadline > span { font-size: 12px; font-weight: 600; }
.backendHeadline > strong { flex: none; padding: 3px 7px; border-radius: 999px; background: var(--color-primary-light-900-alpha-100); font-family: Consolas, "Microsoft YaHei UI", sans-serif; font-size: 11px; }
.backendHeadline > strong.backendGpu { color: var(--color-primary); background: var(--color-primary-alpha-100); }
.backendGrid article p { margin: 7px 0 4px; opacity: .72; font-size: 11px; }
.backendGrid article small { display: block; overflow-wrap: anywhere; opacity: .68; line-height: 1.5; }
.backendGrid article small.backendWarning, .backendError { color: #c98316; opacity: 1; }
.settingGrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 20px; padding: 12px 0 4px; }
.settingGrid label, .settingGrid > div { display: grid; grid-template-columns: 110px auto minmax(0, 1fr); align-items: center; gap: 8px; }
.settingGrid code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: .7; }
.account { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 0 4px; border-top: 1px solid var(--color-primary-light-900-alpha-100); }
.account input { min-width: 150px; }
.account small { opacity: .65; margin-right: auto; }
.syncSummary { display: grid; gap: 2px; margin-right: auto; }
.account .syncSummary small { margin-right: 0; }
.account .syncError { color: #d84a4a; opacity: 1; }
.empty { margin: 30px 8px; text-align: center; opacity: .55; }
.error { color: #d84a4a; padding: 8px; }
.modalBackdrop { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; background: rgba(0, 0, 0, .42); }
.modal { width: min(460px, calc(100vw - 40px)); box-sizing: border-box; padding: 20px; border-radius: 6px; background: var(--color-primary-light-100); box-shadow: 0 14px 40px rgba(0, 0, 0, .28); }
.modal p { line-height: 1.6; opacity: .72; }
.modal div { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
@media (max-width: 760px) {
  .toolbar { align-items: stretch; flex-direction: column; gap: 10px; padding: 14px; }
  .search { min-width: 0; }
  .content { grid-template-columns: 1fr; overflow: auto; }
  .sources { max-height: 40vh; border-right: 0; border-bottom: 1px solid var(--color-primary-light-900-alpha-100); }
  .episodes { overflow: visible; padding: 14px; }
  .showHeader { grid-template-columns: 48px minmax(0, 1fr); }
  .settingGrid { grid-template-columns: 1fr; }
  .backendGrid { grid-template-columns: 1fr; }
  .settings[open] { max-height: 80vh; }
  .settingGrid label, .settingGrid > div { grid-template-columns: 100px minmax(0, 1fr); }
  .settingGrid code { grid-column: 1 / -1; }
}
</style>
