<template>
  <main :class="$style.page">
    <header :class="$style.toolbar">
      <div>
        <h1>播客</h1>
        <p>订阅、播放与逐字稿</p>
        <nav :class="$style.viewTabs" aria-label="播客视图">
          <button
            v-for="item in views"
            :key="item.id"
            type="button"
            :class="{ [$style.activeTab]: activeView === item.id }"
            :aria-current="activeView === item.id ? 'page' : undefined"
            @click="changeView(item.id)"
          >
            {{ item.label }}
          </button>
        </nav>
      </div>
      <form v-if="activeView === 'discover'" :class="$style.search" @submit.prevent="loadSources">
        <input v-model="query" aria-label="搜索播客" placeholder="搜索节目" />
        <button type="submit" :disabled="loading">搜索</button>
        <button v-if="query" type="button" @click="clearSearch">清除</button>
      </form>
    </header>

    <section v-if="activeView === 'discover'" :class="$style.content">
      <aside :class="$style.sources" aria-label="播客节目">
        <section :class="$style.popular" aria-labelledby="popular-title">
          <div :class="$style.sectionTitle">
            <strong id="popular-title">热门发现</strong>
            <button type="button" :disabled="loadingPopular" @click="loadPopular">刷新</button>
          </div>
          <div :class="$style.popularFilters">
            <select :value="popularPeriod" aria-label="热门统计周期" @change="changePopularPeriod">
              <option :value="1">24 小时</option>
              <option :value="7">7 天</option>
              <option :value="30">30 天</option>
            </select>
            <select v-model="popularSort" aria-label="热门排序指标" @change="loadPopular">
              <option value="duration">收听时长</option>
              <option value="count">播放次数</option>
            </select>
          </div>
          <ol v-if="popularSources.length" :class="$style.popularList">
            <li v-for="(item, index) in popularSources" :key="popularKey(item, index)">
              <span>{{ popularRank(index) }}</span>
              <button type="button" @click="openPopular(item)">{{ item.source }}</button>
              <small>{{ popularMetric(item) }}</small>
            </li>
          </ol>
          <small v-else-if="!loadingPopular">暂无热门数据</small>
        </section>
        <section :class="$style.groupManager" aria-labelledby="groups-title">
          <div :class="$style.sectionTitle">
            <strong id="groups-title">订阅分组</strong>
            <span :class="$style.groupTools">
              <button type="button" :disabled="groupBusy" @click="importOpml">导入 OPML</button>
              <button
                type="button"
                :disabled="groupBusy || !hasSubscriptions"
                @click="exportOpml"
              >
                导出
              </button>
            </span>
          </div>
          <form :class="$style.groupCreate" @submit.prevent="createGroup">
            <input v-model="newGroupName" aria-label="新分组名称" placeholder="新建分组" />
            <button type="submit" :disabled="groupBusy || !newGroupName.trim()">添加</button>
          </form>
          <p v-if="groupMessage" :class="{ [$style.error]: groupError }" role="status">
            {{ groupMessage }}
          </p>
          <div v-for="group in subscriptionGroups" :key="group.id" :class="$style.groupBlock">
            <div :class="$style.groupHeading">
              <button
                type="button"
                :title="group.isExpanded ? '收起分组' : '展开分组'"
                :aria-expanded="group.isExpanded"
                @click="toggleGroup(group)"
              >
                {{ group.isExpanded ? '−' : '+' }}
              </button>
              <input
                :value="group.name"
                :aria-label="`${group.name} 分组名称`"
                @change="renameGroup(group, $event)"
              />
              <small>{{ groupSources(group.id).length }}</small>
              <button
                type="button"
                title="上移分组"
                :disabled="isFirstGroup(group)"
                @click="reorderGroup(group.id, -1)"
              >
                ↑
              </button>
              <button
                type="button"
                title="下移分组"
                :disabled="isLastGroup(group)"
                @click="reorderGroup(group.id, 1)"
              >
                ↓
              </button>
              <button
                v-if="group.id !== 'default_group'"
                type="button"
                title="删除分组，节目将移至默认分组"
                @click="deleteGroup(group)"
              >
                删除
              </button>
            </div>
            <ul v-if="group.isExpanded && groupSources(group.id).length" :class="$style.groupSources">
              <li v-for="source in groupSources(group.id)" :key="source.id">
                <span :title="source.title">{{ source.title }}</span>
                <select
                  :value="source.groupId"
                  :aria-label="`移动 ${source.title} 到分组`"
                  @change="moveSource(source, $event)"
                >
                  <option v-for="target in subscriptionGroups" :key="target.id" :value="target.id">
                    {{ target.name }}
                  </option>
                </select>
              </li>
            </ul>
          </div>
        </section>
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
              :data-podcast-subscription-action="selectedSource.id"
              :disabled="sourceActionBusy"
              @click="openSubscribeDialog(selectedSource)"
            >
              订阅
            </button>
            <button
              v-else
              type="button"
              :data-podcast-subscription-action="selectedSource.id"
              :disabled="sourceActionBusy"
              @click="unsubscribe(selectedSource)"
            >
              {{ sourceActionBusy ? '取消中' : '取消订阅' }}
            </button>
            <button type="button" :disabled="loadingEpisodes" @click="loadEpisodes(true)">
              {{ loadingEpisodes ? '刷新中' : '刷新单集' }}
            </button>
          </div>
          <p
            v-if="sourceActionMessage"
            :class="[$style.showActionMessage, { [$style.error]: sourceActionError }]"
            :role="sourceActionError ? 'alert' : 'status'"
          >
            {{ sourceActionMessage }}
          </p>

          <div :class="$style.episodeList">
            <article
              v-for="(episode, index) in visibleEpisodes"
              :key="episode.id"
              :class="$style.episode"
            >
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
                <small
                  v-if="episodeActionErrors[episode.id]"
                  :class="$style.episodeActionError"
                  role="alert"
                >
                  {{ episodeActionErrors[episode.id] }}
                </small>
              </div>
              <div :class="$style.episodeActions">
                <button
                  type="button"
                  :disabled="favoriteBusy.has(episode.id)"
                  :title="episodeStates[episode.id]?.isFavorite ? '取消收藏' : '收藏'"
                  @click="toggleFavorite(episode)"
                >
                  {{ favoriteBusy.has(episode.id)
                    ? '处理中'
                    : episodeStates[episode.id]?.isFavorite ? '已收藏' : '收藏' }}
                </button>
                <button
                  type="button"
                  :disabled="downloading.has(episode.id) || downloadStates[episode.id]?.isDownloaded"
                  :title="downloadStates[episode.id]?.isDownloaded ? '已下载' : '下载'"
                  @click="downloadEpisode(episode)"
                >
                  {{ downloading.has(episode.id)
                    ? '下载中'
                    : downloadStates[episode.id]?.isDownloaded ? '已下载' : '下载' }}
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
            <button
              v-if="hasMoreEpisodes"
              type="button"
              :class="$style.loadMore"
              @click="loadMoreEpisodes"
            >
              加载更多（剩余 {{ episodes.length - visibleEpisodes.length }} 集）
            </button>
            <p v-if="!loadingEpisodes && !episodes.length" :class="$style.empty">暂无单集</p>
          </div>
        </template>
        <p v-else :class="$style.empty">从左侧选择一个节目</p>
      </section>
    </section>

    <section v-else :class="$style.library" :aria-labelledby="`${activeView}-title`">
      <header :class="$style.libraryHeader">
        <div>
          <h2 :id="`${activeView}-title`">{{ activeView === 'favorites' ? '我的收藏' : '播放历史' }}</h2>
          <p>{{ activeView === 'favorites' ? '已收藏的播客单集' : '最近播放和已播完的单集' }}</p>
        </div>
        <button type="button" :disabled="loadingLibrary" @click="loadLibrary">刷新</button>
      </header>
      <p v-if="error" :class="$style.error" role="alert">{{ error }}</p>
      <div :class="$style.libraryList">
        <article v-for="(item, index) in libraryItems" :key="item.episode.id" :class="$style.libraryItem">
          <img :src="item.episode.artworkUrl || item.source.artworkUrl" alt="" />
          <div>
            <h3>{{ item.episode.title }}</h3>
            <p>{{ item.source.title }} · {{ formatDate(item.episode.publishedAt) }}</p>
            <small v-if="item.state.isFinished">已播完</small>
            <small v-else-if="item.state.positionSeconds">
              已播放至 {{ formatDuration(item.state.positionSeconds) }}
            </small>
          </div>
          <div :class="$style.episodeActions">
            <button
              type="button"
              :disabled="favoriteBusy.has(item.episode.id)"
              @click="toggleFavorite(item.episode, item.state)"
            >
              {{ favoriteBusy.has(item.episode.id)
                ? '处理中'
                : item.state.isFavorite ? '取消收藏' : '收藏' }}
            </button>
            <button type="button" @click="playLibraryEpisode(index)">播放</button>
          </div>
        </article>
      </div>
      <p v-if="!loadingLibrary && !libraryItems.length" :class="$style.empty">
        {{ activeView === 'favorites' ? '还没有收藏单集' : '还没有播放记录' }}
      </p>
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
      <section :class="$style.accountPanel" aria-labelledby="podcast-account-title">
        <header :class="$style.accountHeader">
          <div :class="$style.accountIdentity">
            <strong id="podcast-account-title">
              {{ session?.account?.username || 'AurioClub 账户' }}
            </strong>
            <small v-if="session?.account">{{ session.account.email }}</small>
          </div>
          <template v-if="session?.account">
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
            <button type="button" :disabled="accountBusy !== null" @click="logout">退出</button>
          </template>
        </header>

        <div v-if="session?.account" :class="$style.accountGrid">
          <form :class="$style.accountForm" @submit.prevent="updateProfile">
            <strong>个人资料</strong>
            <label for="podcast-account-username">用户名</label>
            <div :class="$style.fieldAction">
              <input
                id="podcast-account-username"
                v-model="profileUsername"
                type="text"
                autocomplete="nickname"
                required
              />
              <button type="submit" :disabled="accountBusy !== null">
                {{ accountBusy === 'profile' ? '保存中' : '保存' }}
              </button>
            </div>
          </form>

          <form :class="$style.accountForm" @submit.prevent="changePassword">
            <strong>修改密码</strong>
            <label for="podcast-old-password">当前密码</label>
            <input
              id="podcast-old-password"
              v-model="oldPassword"
              type="password"
              autocomplete="current-password"
              required
            />
            <label for="podcast-new-password">新密码</label>
            <input
              id="podcast-new-password"
              v-model="newPassword"
              type="password"
              autocomplete="new-password"
              required
            />
            <label for="podcast-confirm-password">确认新密码</label>
            <input
              id="podcast-confirm-password"
              v-model="confirmNewPassword"
              type="password"
              autocomplete="new-password"
              required
            />
            <button type="submit" :disabled="accountBusy !== null">
              {{ accountBusy === 'password' ? '修改中' : '修改密码' }}
            </button>
          </form>

          <section :class="$style.accountForm">
            <strong>当前设备</strong>
            <label :class="$style.checkboxLabel">
              <input v-model="migrateGuestData" type="checkbox" />
              迁移此设备的游客数据
            </label>
            <button type="button" :disabled="accountBusy !== null" @click="linkDevice">
              {{ accountBusy === 'device' ? '关联中' : '关联设备' }}
            </button>
          </section>
        </div>

        <template v-else>
          <nav :class="$style.authModes" aria-label="账户操作">
            <button
              v-for="mode in authModes"
              :key="mode.id"
              type="button"
              :class="{ [$style.activeAccountMode]: authMode === mode.id }"
              :aria-pressed="authMode === mode.id"
              @click="selectAuthMode(mode.id)"
            >
              {{ mode.label }}
            </button>
          </nav>

          <form :class="$style.authForm" @submit.prevent="submitAuthentication">
            <div v-if="authMode === 'login'" :class="$style.authMethods" role="group" aria-label="登录方式">
              <button
                type="button"
                :class="{ [$style.activeAccountMode]: loginMode === 'password' }"
                :aria-pressed="loginMode === 'password'"
                @click="selectLoginMode('password')"
              >
                密码
              </button>
              <button
                type="button"
                :class="{ [$style.activeAccountMode]: loginMode === 'code' }"
                :aria-pressed="loginMode === 'code'"
                @click="selectLoginMode('code')"
              >
                验证码
              </button>
            </div>

            <label for="podcast-account-email">邮箱</label>
            <input
              id="podcast-account-email"
              v-model="email"
              type="email"
              autocomplete="username"
              required
            />

            <template v-if="authNeedsCode">
              <label for="podcast-account-code">验证码</label>
              <div :class="$style.fieldAction">
                <input
                  id="podcast-account-code"
                  v-model="verificationCode"
                  type="text"
                  inputmode="numeric"
                  autocomplete="one-time-code"
                  required
                />
                <button type="button" :disabled="accountBusy !== null" @click="sendCode">
                  {{ accountBusy === 'send-code' ? '发送中' : '发送验证码' }}
                </button>
              </div>
            </template>

            <template v-if="authNeedsPassword">
              <label for="podcast-account-password">
                {{ authMode === 'reset' ? '新密码' : '密码' }}
              </label>
              <input
                id="podcast-account-password"
                v-model="authPassword"
                type="password"
                :autocomplete="authMode === 'login' ? 'current-password' : 'new-password'"
                required
              />
            </template>

            <template v-if="authMode !== 'login'">
              <label for="podcast-account-password-confirm">确认密码</label>
              <input
                id="podcast-account-password-confirm"
                v-model="authPasswordConfirm"
                type="password"
                autocomplete="new-password"
                required
              />
            </template>

            <button type="submit" :disabled="accountBusy !== null">
              {{ authSubmitLabel }}
            </button>
          </form>
        </template>

        <p
          v-if="accountMessage"
          :class="[$style.accountMessage, { [$style.syncError]: accountMessageError }]"
          :role="accountMessageError ? 'alert' : 'status'"
        >
          {{ accountMessage }}
        </p>
      </section>
    </details>

    <div v-if="subscribeTarget" :class="$style.modalBackdrop" @click.self="closeSubscribeDialog">
      <section
        ref="subscribeDialog"
        :class="$style.modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="subscribe-title"
        tabindex="-1"
        @keydown="handleSubscribeDialogKeydown"
      >
        <h2 id="subscribe-title">订阅 {{ subscribeTarget.title }}</h2>
        <p>是否自动下载最新 3 个未播放单集？自动下载使用任意网络，手动下载内容不会自动删除。</p>
        <p v-if="subscriptionError" :class="$style.modalError" role="alert">
          {{ subscriptionError }}
        </p>
        <div>
          <button type="button" @click="closeSubscribeDialog">取消</button>
          <button type="button" :disabled="subscriptionBusy" @click="subscribe(false)">
            {{ subscriptionBusy ? '处理中' : '仅订阅' }}
          </button>
          <button type="button" :disabled="subscriptionBusy" @click="subscribe(true)">
            {{ subscriptionBusy ? '处理中' : '订阅并自动下载' }}
          </button>
        </div>
      </section>
    </div>
  </main>
</template>

<script lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from '@common/utils/vueTools'
import { LIST_IDS } from '@common/constants'
import { openSaveDir, sendPodcastCommand, showSelectDialog } from '@renderer/utils/ipc'
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

const EPISODE_PAGE_SIZE = 50
const DIALOG_FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export default {
  name: 'Podcast',
  setup() {
    type PodcastView = 'discover' | 'favorites' | 'history'
    type AuthMode = 'login' | 'register' | 'reset'
    type AccountOperation =
      | 'send-code'
      | 'login'
      | 'register'
      | 'reset'
      | 'profile'
      | 'password'
      | 'device'
      | 'logout'
      | null
    const views: Array<{ id: PodcastView; label: string }> = [
      { id: 'discover', label: '发现' },
      { id: 'favorites', label: '收藏' },
      { id: 'history', label: '历史' },
    ]
    const activeView = ref<PodcastView>('discover')
    const query = ref('')
    const loading = ref(false)
    const loadingEpisodes = ref(false)
    const error = ref('')
    const sources = ref<LX.Podcast.Source[]>([])
    const episodes = ref<LX.Podcast.Episode[]>([])
    const episodeStates = ref<Record<string, LX.Podcast.EpisodeState | undefined>>({})
    const popularPeriod = ref<LX.Podcast.PopularPeriod>(7)
    const popularSort = ref<LX.Podcast.PopularSort>('duration')
    const popularSources = ref<LX.Podcast.PopularSource[]>([])
    const loadingPopular = ref(false)
    const libraryItems = ref<LX.Podcast.LibraryItem[]>([])
    const loadingLibrary = ref(false)
    const subscriptionGroups = ref<LX.Podcast.SubscriptionGroup[]>([])
    const newGroupName = ref('')
    const groupBusy = ref(false)
    const groupMessage = ref('')
    const groupError = ref(false)
    const hasSubscriptions = computed(() => sources.value.some((source) => source.subscribed))
    const selectedSource = ref<LX.Podcast.Source | null>(null)
    const subscribeTarget = ref<LX.Podcast.Source | null>(null)
    const subscribeDialog = ref<HTMLElement | null>(null)
    const subscriptionBusy = ref(false)
    const subscriptionError = ref('')
    const sourceActionBusy = ref(false)
    const sourceActionMessage = ref('')
    const sourceActionError = ref(false)
    const downloadStates = ref<Record<string, LX.Podcast.DownloadState | undefined>>({})
    const downloading = ref(new Set<string>())
    const favoriteBusy = ref(new Set<string>())
    const episodeActionErrors = ref<Record<string, string | undefined>>({})
    const visibleEpisodeCount = ref(EPISODE_PAGE_SIZE)
    const visibleEpisodes = computed(() => episodes.value.slice(0, visibleEpisodeCount.value))
    const hasMoreEpisodes = computed(() => visibleEpisodeCount.value < episodes.value.length)
    let subscribeTrigger: HTMLElement | null = null
    const transcriptionStatuses = ref<Record<string, LX.Podcast.TranscriptionStatus | null>>({})
    const session = ref<LX.Podcast.Session | null>(null)
    const syncPresentation = computed(() => syncStatusPresentation(session.value))
    const authModes: Array<{ id: AuthMode; label: string }> = [
      { id: 'login', label: '登录' },
      { id: 'register', label: '注册' },
      { id: 'reset', label: '忘记密码' },
    ]
    const authMode = ref<AuthMode>('login')
    const loginMode = ref<'password' | 'code'>('password')
    const email = ref('')
    const verificationCode = ref('')
    const authPassword = ref('')
    const authPasswordConfirm = ref('')
    const profileUsername = ref('')
    const oldPassword = ref('')
    const newPassword = ref('')
    const confirmNewPassword = ref('')
    const migrateGuestData = ref(true)
    const accountBusy = ref<AccountOperation>(null)
    const accountMessage = ref('')
    const accountMessageError = ref(false)
    const authNeedsCode = computed(() => authMode.value !== 'login' || loginMode.value === 'code')
    const authNeedsPassword = computed(
      () => authMode.value !== 'login' || loginMode.value === 'password'
    )
    const authSubmitLabel = computed(() => {
      if (accountBusy.value === 'login') return '登录中'
      if (accountBusy.value === 'register') return '注册中'
      if (accountBusy.value === 'reset') return '重置中'
      if (authMode.value === 'register') return '注册并登录'
      if (authMode.value === 'reset') return '重置密码'
      return '登录'
    })
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
    const loadPopular = async () => {
      loadingPopular.value = true
      try {
        popularSources.value = await sendPodcastCommand<LX.Podcast.PopularSource[]>({
          action: 'popular-sources',
          days: popularPeriod.value,
          sort: popularSort.value,
        })
      } catch (value) {
        error.value = value instanceof Error ? value.message : String(value)
      } finally {
        loadingPopular.value = false
      }
    }
    const changePopularPeriod = (event: Event) => {
      popularPeriod.value = Number((event.target as HTMLSelectElement).value) as LX.Podcast.PopularPeriod
      void loadPopular()
    }
    const popularKey = (item: LX.Podcast.PopularSource, index: unknown) =>
      `${item.source}:${String(index)}`
    const popularRank = (index: unknown) => Number(index) + 1
    const loadGroups = async () => {
      subscriptionGroups.value = await sendPodcastCommand<LX.Podcast.SubscriptionGroup[]>({
        action: 'subscription-groups',
      })
    }
    const withGroupAction = async (action: () => Promise<void>, success: string) => {
      groupBusy.value = true
      groupMessage.value = ''
      groupError.value = false
      try {
        await action()
        groupMessage.value = success
      } catch (value) {
        groupError.value = true
        groupMessage.value = value instanceof Error ? value.message : String(value)
      } finally {
        groupBusy.value = false
      }
    }
    const createGroup = () => withGroupAction(async () => {
      const group = await sendPodcastCommand<LX.Podcast.SubscriptionGroup>({
        action: 'subscription-group-save',
        group: { name: newGroupName.value.trim() },
      })
      subscriptionGroups.value = [...subscriptionGroups.value, group]
      newGroupName.value = ''
    }, '分组已创建')
    const updateGroup = async (group: LX.Podcast.SubscriptionGroup) => {
      const saved = await sendPodcastCommand<LX.Podcast.SubscriptionGroup>({
        action: 'subscription-group-save',
        group,
      })
      subscriptionGroups.value = subscriptionGroups.value.map((item) =>
        item.id === saved.id ? saved : item
      ).sort((left, right) => left.sortOrder - right.sortOrder)
    }
    const renameGroup = (group: LX.Podcast.SubscriptionGroup, event: Event) => {
      const input = event.target as HTMLInputElement
      const name = input.value.trim()
      if (!name || name === group.name) {
        input.value = group.name
        return
      }
      void withGroupAction(() => updateGroup({ ...group, name }), '分组已重命名')
    }
    const toggleGroup = (group: LX.Podcast.SubscriptionGroup) =>
      withGroupAction(() => updateGroup({ ...group, isExpanded: !group.isExpanded }), '')
    const isFirstGroup = (group: LX.Podcast.SubscriptionGroup) =>
      subscriptionGroups.value[0]?.id === group.id
    const isLastGroup = (group: LX.Podcast.SubscriptionGroup) =>
      subscriptionGroups.value.at(-1)?.id === group.id
    const reorderGroup = (groupId: string, offset: -1 | 1) => withGroupAction(async () => {
      const index = subscriptionGroups.value.findIndex((group) => group.id === groupId)
      const targetIndex = index + offset
      if (index < 0 || targetIndex < 0 || targetIndex >= subscriptionGroups.value.length) return
      const ordered = [...subscriptionGroups.value]
      const [moving] = ordered.splice(index, 1)
      ordered.splice(targetIndex, 0, moving)
      const updated = ordered.map((group, sortOrder) => ({ ...group, sortOrder }))
      await Promise.all(updated.map(updateGroup))
      subscriptionGroups.value = updated
    }, '分组顺序已更新')
    const deleteGroup = (group: LX.Podcast.SubscriptionGroup) => withGroupAction(async () => {
      await sendPodcastCommand({ action: 'subscription-group-delete', groupId: group.id })
      subscriptionGroups.value = subscriptionGroups.value.filter((item) => item.id !== group.id)
      sources.value = sources.value.map((source) =>
        source.groupId === group.id ? { ...source, groupId: 'default_group' } : source
      )
    }, '分组已删除，节目已移至默认分组')
    const groupSources = (groupId: string) => sources.value
      .filter((source) => source.subscribed && source.groupId === groupId)
      .sort((left, right) => left.subscriptionOrder - right.subscriptionOrder)
    const moveSource = (source: LX.Podcast.Source, event: Event) => {
      const groupId = (event.target as HTMLSelectElement).value
      if (groupId === source.groupId) return
      void withGroupAction(async () => {
        await sendPodcastCommand({ action: 'subscription-source-move', sourceId: source.id, groupId })
        sources.value = sources.value.map((item) => item.id === source.id ? { ...item, groupId } : item)
        if (selectedSource.value?.id === source.id) selectedSource.value = { ...source, groupId }
      }, '节目已移动')
    }
    const importOpml = async () => {
      const result = await showSelectDialog({
        title: '导入播客订阅 OPML',
        properties: ['openFile'],
        filters: [{ name: 'OPML 文件', extensions: ['opml', 'xml'] }],
      })
      const filePath = result.filePaths[0]
      if (result.canceled || !filePath) return
      await withGroupAction(async () => {
        await sendPodcastCommand({ action: 'opml-import', path: filePath })
        await Promise.all([loadGroups(), loadSources()])
      }, 'OPML 导入完成')
    }
    const exportOpml = async () => {
      const result = await openSaveDir({
        title: '导出播客订阅 OPML',
        defaultPath: 'ikun-podcast-subscriptions.opml',
        filters: [{ name: 'OPML 文件', extensions: ['opml'] }],
      })
      if (result.canceled || !result.filePath) return
      await withGroupAction(async () => {
        await sendPodcastCommand({ action: 'opml-export', path: result.filePath! })
      }, 'OPML 已导出')
    }
    const loadEpisodeStates = async (episodeIds: string[]) => {
      const states = await sendPodcastCommand<LX.Podcast.EpisodeState[]>({
        action: 'episode-states',
        episodeIds,
      })
      episodeStates.value = {
        ...episodeStates.value,
        ...Object.fromEntries(states.map((state) => [state.episodeId, state])),
      }
    }
    const loadDownloadStates = async (episodeIds: string[]) => {
      const states = await sendPodcastCommand<LX.Podcast.DownloadState[]>({
        action: 'download-states',
        episodeIds,
      })
      downloadStates.value = {
        ...downloadStates.value,
        ...Object.fromEntries(states.map((state) => [state.episodeId, state])),
      }
    }
    const loadEpisodeMetadata = async (items: LX.Podcast.Episode[]) => {
      const episodeIds = items.map((episode) => episode.id)
      await Promise.all([loadEpisodeStates(episodeIds), loadDownloadStates(episodeIds)])
      void Promise.all(items.map((episode) => refreshTranscriptionStatus(episode.id)))
        .then((statuses) => statuses.forEach((status, index) => {
          scheduleTranscriptionPoll(items[index]?.id, status)
        }))
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
        visibleEpisodeCount.value = EPISODE_PAGE_SIZE
        episodeStates.value = {}
        downloadStates.value = {}
        transcriptionStatuses.value = {}
        episodeActionErrors.value = {}
        await loadEpisodeMetadata(visibleEpisodes.value)
      } catch (value) {
        error.value = value instanceof Error ? value.message : String(value)
      } finally {
        loadingEpisodes.value = false
      }
    }
    const selectSource = (source: LX.Podcast.Source) => {
      clearTranscriptionPolls()
      selectedSource.value = source
      sourceActionMessage.value = ''
      void loadEpisodes()
    }
    const loadMoreEpisodes = () => {
      const start = visibleEpisodeCount.value
      visibleEpisodeCount.value = Math.min(
        episodes.value.length,
        visibleEpisodeCount.value + EPISODE_PAGE_SIZE
      )
      void loadEpisodeMetadata(episodes.value.slice(start, visibleEpisodeCount.value)).catch((value) => {
        error.value = value instanceof Error ? value.message : String(value)
      })
    }
    const openSubscribeDialog = async (source: LX.Podcast.Source) => {
      subscribeTrigger = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
      subscribeTarget.value = source
      subscriptionError.value = ''
      await nextTick()
      subscribeDialog.value?.focus()
    }
    const closeSubscribeDialog = async () => {
      const sourceId = subscribeTarget.value?.id
      subscribeTarget.value = null
      subscriptionError.value = ''
      await nextTick()
      const fallback = [...document.querySelectorAll<HTMLElement>('[data-podcast-subscription-action]')]
        .find((element) => element.dataset.podcastSubscriptionAction === sourceId)
      const target = subscribeTrigger?.isConnected ? subscribeTrigger : fallback
      target?.focus()
      subscribeTrigger = null
    }
    const handleSubscribeDialogKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        void closeSubscribeDialog()
        return
      }
      if (event.key !== 'Tab' || !subscribeDialog.value) return
      const focusable = [...subscribeDialog.value.querySelectorAll<HTMLElement>(
        DIALOG_FOCUSABLE_SELECTOR
      )]
      if (!focusable.length) {
        event.preventDefault()
        subscribeDialog.value.focus()
        return
      }
      const first = focusable[0]
      const last = focusable.at(-1)!
      const active = document.activeElement
      if (event.shiftKey && (active === first || active === subscribeDialog.value)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    const subscribe = async (autoDownload: boolean) => {
      if (!subscribeTarget.value) return
      const target = subscribeTarget.value
      subscriptionBusy.value = true
      subscriptionError.value = ''
      try {
        const source = await sendPodcastCommand<LX.Podcast.Source>({
          action: 'subscribe',
          source: target,
          autoDownload,
        })
        sources.value = sources.value.map((item) => (item.id === source.id ? source : item))
        selectedSource.value = source
        sourceActionMessage.value = '订阅成功'
        sourceActionError.value = false
        trackEvent('podcast_subscribe', source.id, { auto_download: autoDownload })
        await closeSubscribeDialog()
      } catch (value) {
        subscriptionError.value = value instanceof Error ? value.message : String(value)
      } finally {
        subscriptionBusy.value = false
      }
    }
    const unsubscribe = async (source: LX.Podcast.Source) => {
      if (sourceActionBusy.value) return
      sourceActionBusy.value = true
      sourceActionMessage.value = ''
      try {
        await sendPodcastCommand({ action: 'unsubscribe', sourceId: source.id })
        const value = { ...source, subscribed: false, autoDownload: false }
        sources.value = sources.value.map((item) => (item.id === source.id ? value : item))
        selectedSource.value = value
        sourceActionMessage.value = '已取消订阅'
        sourceActionError.value = false
        trackEvent('podcast_unsubscribe', source.id)
      } catch (value) {
        sourceActionMessage.value = value instanceof Error ? value.message : String(value)
        sourceActionError.value = true
      } finally {
        sourceActionBusy.value = false
      }
    }
    const playEpisode = async (index: number) => {
      if (!selectedSource.value) return
      await setTempList(
        `podcast:${selectedSource.value.id}`,
        episodes.value.map((episode) => toMusicInfo(episode, selectedSource.value!))
      )
      updateSetting({ 'player.playbackRate': appSetting['podcast.playbackRate'] })
      playList(LIST_IDS.TEMP, index)
      trackEvent('podcast_play', episodes.value[index]?.id, { source: 'show' })
    }
    const playLibraryEpisode = async (index: number) => {
      await setTempList(
        `podcast:library:${activeView.value}`,
        libraryItems.value.map((item) => toMusicInfo(item.episode, item.source))
      )
      updateSetting({ 'player.playbackRate': appSetting['podcast.playbackRate'] })
      playList(LIST_IDS.TEMP, index)
      trackEvent('podcast_play', libraryItems.value[index]?.episode.id, {
        source: activeView.value,
      })
    }
    const loadLibrary = async () => {
      if (activeView.value === 'discover') return
      loadingLibrary.value = true
      error.value = ''
      try {
        libraryItems.value = await sendPodcastCommand<LX.Podcast.LibraryItem[]>({
          action: 'library',
          kind: activeView.value,
        })
      } catch (value) {
        error.value = value instanceof Error ? value.message : String(value)
      } finally {
        loadingLibrary.value = false
      }
    }
    const changeView = (view: PodcastView) => {
      activeView.value = view
      if (view !== 'discover') void loadLibrary()
    }
    const toggleFavorite = async (
      episode: LX.Podcast.Episode,
      knownState?: LX.Podcast.EpisodeState
    ) => {
      if (favoriteBusy.value.has(episode.id)) return
      favoriteBusy.value = new Set([...favoriteBusy.value, episode.id])
      const nextErrors = { ...episodeActionErrors.value }
      delete nextErrors[episode.id]
      episodeActionErrors.value = nextErrors
      try {
        const current = knownState ?? episodeStates.value[episode.id]
        const state = await sendPodcastCommand<LX.Podcast.EpisodeState>({
          action: 'set-favorite',
          episodeId: episode.id,
          isFavorite: !current?.isFavorite,
        })
        episodeStates.value = { ...episodeStates.value, [episode.id]: state }
        libraryItems.value = libraryItems.value
          .map((item) => item.episode.id === episode.id ? { ...item, state } : item)
          .filter((item) => activeView.value !== 'favorites' || item.state.isFavorite)
        trackEvent(state.isFavorite ? 'podcast_favorite' : 'podcast_unfavorite', episode.id)
      } catch (value) {
        episodeActionErrors.value = {
          ...episodeActionErrors.value,
          [episode.id]: value instanceof Error ? value.message : String(value),
        }
      } finally {
        const next = new Set(favoriteBusy.value)
        next.delete(episode.id)
        favoriteBusy.value = next
      }
    }
    const openPopular = async (item: LX.Podcast.PopularSource) => {
      const existing = sources.value.find((source) => source.title === item.source)
      if (existing) {
        selectSource(existing)
        return
      }
      query.value = item.source
      await loadSources()
      const match = sources.value.find((source) => source.title === item.source) ?? sources.value[0]
      if (match) selectSource(match)
    }
    const popularMetric = (item: LX.Podcast.PopularSource) => popularSort.value === 'duration'
      ? `${formatDuration(item.totalDuration)} 收听`
      : `${item.viewCount} 次播放`
    const downloadEpisode = async (episode: LX.Podcast.Episode) => {
      if (downloading.value.has(episode.id) || downloadStates.value[episode.id]?.isDownloaded) return
      downloading.value = new Set([...downloading.value, episode.id])
      const nextErrors = { ...episodeActionErrors.value }
      delete nextErrors[episode.id]
      episodeActionErrors.value = nextErrors
      try {
        const state = await sendPodcastCommand<LX.Podcast.DownloadState>({
          action: 'download-episode',
          episodeId: episode.id,
        })
        downloadStates.value = { ...downloadStates.value, [episode.id]: state }
        trackEvent('podcast_download', episode.id)
      } catch (value) {
        episodeActionErrors.value = {
          ...episodeActionErrors.value,
          [episode.id]: value instanceof Error ? value.message : String(value),
        }
      } finally {
        const next = new Set(downloading.value)
        next.delete(episode.id)
        downloading.value = next
      }
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
    const applySession = (value: LX.Podcast.Session) => {
      session.value = value
      profileUsername.value = value.account?.username ?? ''
    }
    const setAccountFeedback = (message: string, isError = false) => {
      accountMessage.value = message
      accountMessageError.value = isError
    }
    const accountErrorText = (value: unknown) =>
      value instanceof Error ? value.message : String(value)
    const runAccountOperation = async (
      operation: Exclude<AccountOperation, null>,
      task: () => Promise<void>,
      successMessage: string
    ) => {
      if (accountBusy.value) return
      accountBusy.value = operation
      setAccountFeedback('')
      try {
        await task()
        setAccountFeedback(successMessage)
      } catch (value) {
        setAccountFeedback(accountErrorText(value), true)
      } finally {
        accountBusy.value = null
      }
    }
    const clearAuthSecrets = () => {
      verificationCode.value = ''
      authPassword.value = ''
      authPasswordConfirm.value = ''
    }
    const selectAuthMode = (mode: AuthMode) => {
      authMode.value = mode
      clearAuthSecrets()
      setAccountFeedback('')
    }
    const selectLoginMode = (mode: 'password' | 'code') => {
      loginMode.value = mode
      clearAuthSecrets()
      setAccountFeedback('')
    }
    const validEmail = () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())
    const validateEmail = () => {
      if (validEmail()) return true
      setAccountFeedback('请输入有效的邮箱地址', true)
      return false
    }
    const trackEvent = (
      event: string,
      targetId?: string,
      properties?: Record<string, unknown>
    ) => {
      void sendPodcastCommand({ action: 'track-event', event, targetId, properties })
        .catch(() => undefined)
    }
    const loadSession = async () => {
      applySession(await sendPodcastCommand<LX.Podcast.Session>({ action: 'session' }))
    }
    const sendCode = async () => {
      if (!validateEmail()) return
      await runAccountOperation(
        'send-code',
        async () => sendPodcastCommand({ action: 'send-code', email: email.value.trim() }),
        '验证码已发送，请检查邮箱'
      )
    }
    const submitAuthentication = async () => {
      if (!validateEmail()) return
      if (authNeedsCode.value && !verificationCode.value.trim()) {
        setAccountFeedback('请输入邮箱验证码', true)
        return
      }
      if (authNeedsPassword.value && !authPassword.value) {
        setAccountFeedback('请输入密码', true)
        return
      }
      if (authMode.value !== 'login' && authPassword.value !== authPasswordConfirm.value) {
        setAccountFeedback('两次输入的密码不一致', true)
        return
      }

      const mode = authMode.value
      const method = loginMode.value
      const operation = mode === 'login' ? 'login' : mode
      const successMessage = mode === 'register'
        ? '注册并登录成功'
        : mode === 'reset'
          ? '密码已重置，请使用新密码登录'
          : '登录成功'
      await runAccountOperation(operation, async () => {
        if (mode === 'login') {
          applySession(await sendPodcastCommand<LX.Podcast.Session>(
            method === 'password'
              ? {
                  action: 'login-password',
                  email: email.value.trim(),
                  password: authPassword.value,
                }
              : {
                  action: 'login-email',
                  email: email.value.trim(),
                  code: verificationCode.value.trim(),
                }
          ))
          trackEvent('account_login', undefined, { method })
        } else if (mode === 'register') {
          applySession(await sendPodcastCommand<LX.Podcast.Session>({
            action: 'register-password',
            email: email.value.trim(),
            code: verificationCode.value.trim(),
            password: authPassword.value,
          }))
          trackEvent('account_register')
        } else {
          await sendPodcastCommand({
            action: 'reset-password',
            email: email.value.trim(),
            code: verificationCode.value.trim(),
            newPassword: authPassword.value,
          })
          authMode.value = 'login'
          loginMode.value = 'password'
          trackEvent('account_password_reset')
        }
        clearAuthSecrets()
      }, successMessage)
    }
    const updateProfile = async () => {
      const username = profileUsername.value.trim()
      if (!username) {
        setAccountFeedback('用户名不能为空', true)
        return
      }
      await runAccountOperation('profile', async () => {
        applySession(await sendPodcastCommand<LX.Podcast.Session>({
          action: 'update-profile',
          username,
        }))
        trackEvent('account_profile_update')
      }, '用户名已更新')
    }
    const changePassword = async () => {
      if (!oldPassword.value || !newPassword.value) {
        setAccountFeedback('请输入当前密码和新密码', true)
        return
      }
      if (newPassword.value !== confirmNewPassword.value) {
        setAccountFeedback('两次输入的新密码不一致', true)
        return
      }
      await runAccountOperation('password', async () => {
        await sendPodcastCommand({
          action: 'change-password',
          oldPassword: oldPassword.value,
          newPassword: newPassword.value,
        })
        oldPassword.value = ''
        newPassword.value = ''
        confirmNewPassword.value = ''
        trackEvent('account_password_change')
      }, '密码已修改')
    }
    const linkDevice = async () => {
      await runAccountOperation('device', async () => {
        applySession(await sendPodcastCommand<LX.Podcast.Session>({
          action: 'link-device',
          migrateGuestData: migrateGuestData.value,
        }))
        trackEvent('account_device_link', undefined, {
          migrate_guest_data: migrateGuestData.value,
        })
      }, '当前设备已关联')
    }
    const performLogout = async (message: string) => {
      await runAccountOperation('logout', async () => {
        applySession(await sendPodcastCommand<LX.Podcast.Session>({ action: 'logout' }))
        clearAuthSecrets()
      }, message)
    }
    const logout = async () => performLogout('已退出登录')
    const reauthenticate = async () => performLogout('请重新登录')
    const syncNow = async () => {
      if (!session.value) return
      const previous = session.value
      session.value = { ...previous, syncState: 'syncing', error: undefined }
      try {
        applySession(await sendPodcastCommand<LX.Podcast.Session>({ action: 'sync-now' }))
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
    void loadPopular()
    void loadGroups()
    void loadSession()
    void loadAiConfig()
    void loadBackendStatus()
    return {
      appSetting,
      views,
      activeView,
      query,
      loading,
      loadingEpisodes,
      error,
      sources,
      episodes,
      episodeStates,
      popularPeriod,
      popularSort,
      popularSources,
      loadingPopular,
      libraryItems,
      loadingLibrary,
      subscriptionGroups,
      newGroupName,
      groupBusy,
      groupMessage,
      groupError,
      hasSubscriptions,
      selectedSource,
      subscribeTarget,
      subscribeDialog,
      subscriptionBusy,
      subscriptionError,
      sourceActionBusy,
      sourceActionMessage,
      sourceActionError,
      downloadStates,
      downloading,
      favoriteBusy,
      episodeActionErrors,
      visibleEpisodes,
      hasMoreEpisodes,
      transcriptionStatuses,
      session,
      syncPresentation,
      authModes,
      authMode,
      loginMode,
      email,
      verificationCode,
      authPassword,
      authPasswordConfirm,
      profileUsername,
      oldPassword,
      newPassword,
      confirmNewPassword,
      migrateGuestData,
      accountBusy,
      accountMessage,
      accountMessageError,
      authNeedsCode,
      authNeedsPassword,
      authSubmitLabel,
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
      loadPopular,
      changePopularPeriod,
      popularKey,
      popularRank,
      loadLibrary,
      changeView,
      openPopular,
      popularMetric,
      createGroup,
      renameGroup,
      toggleGroup,
      reorderGroup,
      isFirstGroup,
      isLastGroup,
      deleteGroup,
      groupSources,
      moveSource,
      importOpml,
      exportOpml,
      loadEpisodes,
      loadMoreEpisodes,
      selectSource,
      openSubscribeDialog,
      closeSubscribeDialog,
      handleSubscribeDialogKeydown,
      subscribe,
      unsubscribe,
      playEpisode,
      playLibraryEpisode,
      toggleFavorite,
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
      selectAuthMode,
      selectLoginMode,
      sendCode,
      submitAuthentication,
      updateProfile,
      changePassword,
      linkDevice,
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
.viewTabs { display: flex; gap: 4px; margin-top: 10px; }
.viewTabs button { padding: 4px 10px; border-color: transparent; background: transparent; }
.viewTabs button.activeTab { border-color: var(--color-primary-light-900-alpha-200); background: var(--color-primary-light-300-alpha-500); }
.search { display: flex; gap: 8px; min-width: min(420px, 50%); }
.search input { flex: 1; min-width: 100px; }
.page input, .page select, .page button { border: 1px solid var(--color-primary-light-900-alpha-200); background: var(--color-primary-light-100-alpha-700); color: inherit; border-radius: 4px; padding: 7px 10px; letter-spacing: 0; }
.page button { cursor: pointer; }
.page button:disabled { opacity: .45; cursor: default; }
.content { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(240px, 32%) 1fr; }
.sources { overflow: auto; border-right: 1px solid var(--color-primary-light-900-alpha-100); padding: 12px; }
.popular { margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid var(--color-primary-light-900-alpha-100); }
.popularFilters { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 8px; }
.popularList { margin: 0; padding: 0; list-style: none; }
.popularList li { display: grid; grid-template-columns: 20px minmax(0, 1fr) auto; align-items: center; gap: 6px; min-height: 30px; }
.popularList li > span { text-align: center; opacity: .55; font-size: 11px; }
.popularList button { overflow: hidden; padding: 4px 2px; border: 0; background: transparent; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
.popularList small { opacity: .58; font-size: 10px; }
.groupManager { margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid var(--color-primary-light-900-alpha-100); }
.groupTools { display: flex; gap: 4px; }
.groupTools button { padding: 4px 6px; font-size: 10px; }
.groupCreate { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; margin-bottom: 8px; }
.groupBlock { border-top: 1px solid var(--color-primary-light-900-alpha-100); }
.groupHeading { display: grid; grid-template-columns: auto minmax(0, 1fr) auto repeat(3, auto); align-items: center; gap: 4px; padding: 5px 0; }
.groupHeading button { min-width: 26px; padding: 4px 5px; }
.groupHeading input { min-width: 0; padding: 4px 6px; border-color: transparent; background: transparent; font-weight: 600; }
.groupHeading small { min-width: 18px; text-align: center; opacity: .55; }
.groupSources { margin: 0 0 6px; padding: 0 0 0 30px; list-style: none; }
.groupSources li { display: grid; grid-template-columns: minmax(0, 1fr) 92px; align-items: center; gap: 6px; padding: 3px 0; }
.groupSources span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
.groupSources select { min-width: 0; padding: 3px 5px; font-size: 10px; }
.sectionTitle { display: flex; align-items: center; justify-content: space-between; margin: 0 4px 8px; }
.source { width: 100%; display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; align-items: center; gap: 10px; text-align: left; margin-bottom: 5px; border-color: transparent !important; background: transparent !important; }
.source:hover, .source.selected { background: var(--color-primary-light-300-alpha-700) !important; }
.source img, .showHeader img { width: 44px; height: 44px; object-fit: cover; border-radius: 4px; background: var(--color-primary-light-400-alpha-400); }
.source span, .episode div { min-width: 0; }
.source strong, .source small { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.source small, .source i { opacity: .65; font-size: 11px; font-style: normal; }
.episodes { min-width: 0; overflow: auto; padding: 16px 20px; }
.library { flex: 1; min-height: 0; overflow: auto; padding: 18px 24px; }
.libraryHeader { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-bottom: 14px; border-bottom: 1px solid var(--color-primary-light-900-alpha-100); }
.libraryHeader h2, .libraryItem h3 { margin: 0; letter-spacing: 0; }
.libraryHeader h2 { font-size: 18px; }
.libraryHeader p, .libraryItem p { margin: 4px 0 0; opacity: .65; font-size: 11px; }
.libraryList { max-width: 980px; }
.libraryItem { display: grid; grid-template-columns: 48px minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 12px 2px; border-bottom: 1px solid var(--color-primary-light-900-alpha-100); }
.libraryItem img { width: 48px; height: 48px; border-radius: 4px; object-fit: cover; background: var(--color-primary-light-400-alpha-400); }
.libraryItem h3 { font-size: 14px; }
.libraryItem small { display: block; margin-top: 4px; opacity: .7; }
.showHeader { display: grid; grid-template-columns: 56px minmax(0, 1fr) auto auto; align-items: center; gap: 10px; padding-bottom: 14px; }
.showHeader img { width: 56px; height: 56px; }
.showActionMessage { margin: -7px 0 12px; font-size: 12px; opacity: .72; }
.showActionMessage.error { padding: 0; }
.episodeList { border-top: 1px solid var(--color-primary-light-900-alpha-100); }
.episode { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 16px; padding: 13px 4px; border-bottom: 1px solid var(--color-primary-light-900-alpha-100); }
.episodeActions { display: flex; justify-content: flex-end; gap: 6px; flex-wrap: wrap; }
.episode h3 { margin: 0; font-size: 14px; letter-spacing: 0; }
.episode p { margin: 5px 0 0; opacity: .62; font-size: 11px; }
.episodeActionError { display: block; margin-top: 7px; color: #d84a4a; font-size: 12px; }
.loadMore { display: block; margin: 14px auto 2px; }
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
.accountPanel { display: grid; gap: 14px; padding: 14px 0 5px; border-top: 1px solid var(--color-primary-light-900-alpha-100); }
.accountHeader { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.accountIdentity { display: grid; gap: 2px; min-width: 150px; }
.accountIdentity strong { font-size: 13px; }
.accountIdentity small { opacity: .65; }
.syncSummary { display: grid; gap: 2px; margin-right: auto; }
.syncSummary small { opacity: .65; }
.syncError { color: #d84a4a; opacity: 1 !important; }
.accountGrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 18px; }
.accountForm { display: grid; align-content: start; gap: 7px; min-width: 0; margin: 0; padding-top: 12px; border-top: 1px solid var(--color-primary-light-900-alpha-100); }
.accountForm > strong { margin-bottom: 2px; font-size: 12px; }
.accountForm > label:not(.checkboxLabel), .authForm > label { font-size: 11px; opacity: .72; }
.accountForm input, .authForm input { width: 100%; min-width: 0; box-sizing: border-box; }
.accountForm > button { justify-self: start; }
.checkboxLabel { display: flex; align-items: center; gap: 8px; min-height: 30px; }
.checkboxLabel input { width: auto; }
.fieldAction { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: stretch; gap: 8px; }
.authModes, .authMethods { display: flex; align-items: center; gap: 4px; }
.authModes button, .authMethods button { border-color: transparent; background: transparent; }
.authModes button.activeAccountMode, .authMethods button.activeAccountMode { border-color: var(--color-primary-light-900-alpha-200); background: var(--color-primary-light-300-alpha-500); }
.authForm { display: grid; gap: 7px; width: min(100%, 560px); }
.authMethods { margin-bottom: 3px; }
.authForm > button { justify-self: start; margin-top: 3px; }
.accountMessage { min-height: 18px; margin: 0; font-size: 11px; opacity: .72; }
.accountPanel :is(button, input):focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.empty { margin: 30px 8px; text-align: center; opacity: .55; }
.error { color: #d84a4a; padding: 8px; }
.modalBackdrop { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; background: rgba(0, 0, 0, .42); }
.modal { width: min(460px, calc(100vw - 40px)); box-sizing: border-box; padding: 20px; border-radius: 6px; background: var(--color-primary-light-100); box-shadow: 0 14px 40px rgba(0, 0, 0, .28); }
.modal:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 3px; }
.modal p { line-height: 1.6; opacity: .72; }
.modal .modalError { color: #d84a4a; opacity: 1; }
.modal div { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
@media (max-width: 760px) {
  .toolbar { align-items: stretch; flex-direction: column; gap: 10px; padding: 14px; }
  .search { min-width: 0; }
  .content { grid-template-columns: 1fr; overflow: auto; }
  .sources { max-height: 40vh; border-right: 0; border-bottom: 1px solid var(--color-primary-light-900-alpha-100); }
  .episodes { overflow: visible; padding: 14px; }
  .showHeader { grid-template-columns: auto minmax(0, 1fr); }
  .settingGrid { grid-template-columns: 1fr; }
  .backendGrid { grid-template-columns: 1fr; }
  .accountGrid { grid-template-columns: 1fr; }
  .settings[open] { max-height: 80vh; }
  .settingGrid label, .settingGrid > div { grid-template-columns: 100px minmax(0, 1fr); }
  .settingGrid code { grid-column: 1 / -1; }
}
@media (max-width: 520px) {
  .episode { grid-template-columns: minmax(0, 1fr); gap: 10px; }
  .episodeActions { justify-content: flex-start; }
  .libraryItem { grid-template-columns: 48px minmax(0, 1fr); }
  .libraryItem .episodeActions { grid-column: 1 / -1; }
}
</style>
