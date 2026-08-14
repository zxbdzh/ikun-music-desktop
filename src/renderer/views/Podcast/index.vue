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
          <PodcastArtwork
            :src="source.artworkUrl"
            :alt="`${source.title} 封面`"
            :class="$style.sourceArtwork"
          />
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
            <PodcastArtwork
              :src="selectedSource.artworkUrl"
              :alt="`${selectedSource.title} 封面`"
              :class="$style.showArtwork"
            />
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
                  <span v-if="!hasEpisodeAudio(episode)"> · 博客正文</span>
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
                      v-if="shouldPollTranscription(transcriptionStatuses[episode.id]) || transcriptionProgress(transcriptionStatuses[episode.id]) != null"
                      :class="[
                        $style.segmentProgress,
                        { [$style.segmentProgressIndeterminate]: transcriptionProgress(transcriptionStatuses[episode.id]) == null },
                      ]"
                      role="progressbar"
                      :aria-valuenow="transcriptionProgress(transcriptionStatuses[episode.id]) ?? undefined"
                      aria-valuemin="0"
                      aria-valuemax="100"
                    >
                      <i
                        :style="transcriptionProgress(transcriptionStatuses[episode.id]) == null
                          ? undefined
                          : { transform: `scaleX(${(transcriptionProgress(transcriptionStatuses[episode.id]) ?? 0) / 100})` }"
                      />
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
                  v-if="hasEpisodeAudio(episode)"
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
                  :disabled="shareBusy.size > 0"
                  title="分享正文或逐字稿"
                  @click="shareEpisode(episode, selectedSource)"
                >
                  {{ shareBusy.has(episode.id) ? '准备中' : '分享' }}
                </button>
                <button
                  v-if="hasEpisodeAudio(episode)"
                  type="button"
                  title="播放"
                  @click="playEpisode(episode)"
                >播放</button>
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
        <button
          type="button"
          :disabled="loadingLibrary || loadingMoreLibrary"
          @click="loadLibrary"
        >刷新</button>
      </header>
      <p v-if="error" :class="$style.error" role="alert">{{ error }}</p>
      <div id="podcast-library-list" :class="$style.libraryList">
        <article
          v-for="item in libraryItems"
          :key="item.episode.id"
          :class="$style.libraryItem"
        >
          <PodcastArtwork
            :src="item.episode.artworkUrl || item.source.artworkUrl"
            :alt="`${item.episode.title} 封面`"
            :class="$style.libraryArtwork"
          />
          <div>
            <h3>{{ item.episode.title }}</h3>
            <p>
              {{ item.source.title }} · {{ formatDate(item.episode.publishedAt) }}
              <span v-if="!hasEpisodeAudio(item.episode)"> · 博客正文</span>
            </p>
            <small v-if="item.state.isFinished">已播完</small>
            <small v-else-if="item.state.positionSeconds">
              已播放至 {{ formatDuration(item.state.positionSeconds) }}
            </small>
            <small
              v-if="episodeActionErrors[item.episode.id]"
              :class="$style.episodeActionError"
              role="alert"
            >
              {{ episodeActionErrors[item.episode.id] }}
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
            <button
              type="button"
              :disabled="shareBusy.size > 0"
              @click="shareEpisode(item.episode, item.source)"
            >
              {{ shareBusy.has(item.episode.id) ? '准备中' : '分享' }}
            </button>
            <button
              v-if="hasEpisodeAudio(item.episode)"
              type="button"
              @click="playLibraryEpisode(item)"
            >播放</button>
          </div>
        </article>
        <button
          v-if="hasMoreLibraryItems"
          type="button"
          :class="$style.loadMore"
          aria-controls="podcast-library-list"
          :disabled="loadingMoreLibrary"
          @click="loadMoreLibrary"
        >
          {{ loadingMoreLibrary ? '加载中' : '加载更多' }}
        </button>
      </div>
      <p v-if="!loadingLibrary && !libraryItems.length" :class="$style.empty">
        {{ activeView === 'favorites' ? '还没有收藏单集' : '还没有播放记录' }}
      </p>
    </section>

    <details :class="$style.settings">
      <summary>播客设置</summary>
      <section :class="$style.voxrailPanel" aria-labelledby="podcast-voxrail-title">
        <header>
          <div>
            <strong id="podcast-voxrail-title">Voxrail 云端转写</strong>
            <small>IKUN 只提交博客元数据，音频、转写和 AI 说话人标注在云端完成</small>
          </div>
          <span :class="[$style.connectionBadge, { [$style.connectionReady]: voxrailConfig?.hasAccessKey }]">
            {{ voxrailConfig?.hasAccessKey ? 'Key 已配置' : '未连接' }}
          </span>
        </header>
        <div :class="$style.voxrailFields">
          <label>
            服务地址
            <input v-model="voxrailBaseUrl" type="url" placeholder="https://voxrail.example" autocomplete="url" />
          </label>
          <label>
            Access Key
            <input
              v-model="voxrailAccessKey"
              type="password"
              autocomplete="new-password"
              :placeholder="voxrailConfig?.hasAccessKey ? '已安全保存，输入新 Key 可轮换' : '粘贴 Access Key'"
            />
          </label>
        </div>
        <div :class="$style.voxrailActions">
          <button type="button" :disabled="voxrailSaving" @click="saveVoxrailConfig">
            {{ voxrailSaving ? '保存中' : '保存设置' }}
          </button>
          <button type="button" :disabled="voxrailTesting" @click="testVoxrailConnection">
            {{ voxrailTesting ? '测试中' : '测试连接' }}
          </button>
          <button
            v-if="voxrailConfig?.hasAccessKey"
            type="button"
            :disabled="voxrailSaving"
            @click="removeVoxrailKey"
          >移除 Key</button>
          <small
            v-if="voxrailMessage"
            :class="{ [$style.voxrailError]: voxrailMessageError }"
            :role="voxrailMessageError ? 'alert' : 'status'"
          >{{ voxrailMessage }}</small>
        </div>
      </section>
      <div :class="$style.settingGrid">
        <label>
          默认倍速
          <select :value="appSetting['podcast.playbackRate']" @change="changeRate">
            <option v-for="rate in rates" :key="rate" :value="rate">{{ rate }}x</option>
          </select>
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
import { openShareMusicCard } from '@renderer/store/shareMusicCard'
import {
  isTranscriptionWarning,
  shouldPollTranscription,
  transcriptionDetail,
  transcriptionProgress,
  transcriptionTitle,
  transcriptionWarning,
} from './transcriptionStatus'
import { syncStatusPresentation } from './syncStatus'
import PodcastArtwork from './PodcastArtwork.vue'

type ShareableEpisode = LX.Podcast.Episode | LX.Podcast.LibraryEpisode
type ShareableSource = LX.Podcast.Source | LX.Podcast.LibrarySource

const audioExtension = (audioUrl: string) => {
  if (!audioUrl.trim()) return 'audio'
  try {
    return new URL(audioUrl).pathname.split('.').pop() || 'audio'
  } catch {
    return 'audio'
  }
}

const hasEpisodeAudio = (episode: ShareableEpisode) => !!episode.audioUrl.trim()

const toMusicInfo = (
  episode: ShareableEpisode,
  source: ShareableSource
): LX.Music.MusicInfoPodcast => ({
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
    ext: audioExtension(episode.audioUrl),
    podcast: true,
    audioUrl: episode.audioUrl,
    originalUrl: episode.originalUrl,
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
  components: { PodcastArtwork },
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
    const loadedLibraryKind = ref<LX.Podcast.LibraryKind | null>(null)
    const libraryCursor = ref<LX.Podcast.LibraryCursor | null>(null)
    const hasMoreLibraryItems = computed(() => libraryCursor.value != null)
    const loadingLibrary = ref(false)
    const loadingMoreLibrary = ref(false)
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
    const shareBusy = ref(new Set<string>())
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
    const voxrailConfig = ref<LX.Podcast.VoxrailConfig | null>(null)
    const voxrailBaseUrl = ref(appSetting['podcast.voxrailBaseUrl'])
    const voxrailAccessKey = ref('')
    const voxrailSaving = ref(false)
    const voxrailTesting = ref(false)
    const voxrailMessage = ref('')
    const voxrailMessageError = ref(false)
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
      const audioItems = items.filter(hasEpisodeAudio)
      await Promise.all([
        loadEpisodeStates(episodeIds),
        loadDownloadStates(audioItems.map((episode) => episode.id)),
      ])
      void Promise.all(audioItems.map((episode) => refreshTranscriptionStatus(episode.id)))
        .then((statuses) => statuses.forEach((status, index) => {
          scheduleTranscriptionPoll(audioItems[index]?.id, status)
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
    const playEpisode = async (episode: LX.Podcast.Episode) => {
      if (!selectedSource.value) return
      const playableEpisodes = episodes.value.filter(hasEpisodeAudio)
      const index = playableEpisodes.findIndex((item) => item.id === episode.id)
      if (index < 0) return
      await setTempList(
        `podcast:${selectedSource.value.id}`,
        playableEpisodes.map((item) => toMusicInfo(item, selectedSource.value!))
      )
      updateSetting({ 'player.playbackRate': appSetting['podcast.playbackRate'] })
      playList(LIST_IDS.TEMP, index)
      trackEvent('podcast_play', episode.id, { source: 'show' })
    }
    const playLibraryEpisode = async (item: LX.Podcast.LibraryItem) => {
      const playableItems = libraryItems.value.filter(({ episode }) => hasEpisodeAudio(episode))
      const index = playableItems.findIndex(({ episode }) => episode.id === item.episode.id)
      if (index < 0) return
      await setTempList(
        `podcast:library:${activeView.value}`,
        playableItems.map(({ episode, source }) => toMusicInfo(episode, source))
      )
      updateSetting({ 'player.playbackRate': appSetting['podcast.playbackRate'] })
      playList(LIST_IDS.TEMP, index)
      trackEvent('podcast_play', item.episode.id, {
        source: activeView.value,
      })
    }
    const shareEpisode = async (episode: ShareableEpisode, source: ShareableSource) => {
      if (shareBusy.value.size > 0) return
      const generation = ++shareGeneration
      shareBusy.value = new Set([...shareBusy.value, episode.id])
      const nextErrors = { ...episodeActionErrors.value }
      delete nextErrors[episode.id]
      episodeActionErrors.value = nextErrors
      try {
        await sendPodcastCommand({ action: 'activate-episode', episodeId: episode.id })
        if (generation !== shareGeneration) return
        openShareMusicCard(toMusicInfo(episode, source))
      } catch (value) {
        episodeActionErrors.value = {
          ...episodeActionErrors.value,
          [episode.id]: value instanceof Error ? value.message : String(value),
        }
      } finally {
        const next = new Set(shareBusy.value)
        next.delete(episode.id)
        shareBusy.value = next
      }
    }
    let shareGeneration = 0
    let libraryLoadGeneration = 0
    const loadLibrary = async () => {
      if (activeView.value === 'discover') return
      const view = activeView.value
      const generation = ++libraryLoadGeneration
      loadingLibrary.value = true
      loadingMoreLibrary.value = false
      error.value = ''
      if (loadedLibraryKind.value !== view) {
        libraryItems.value = []
        libraryCursor.value = null
      }
      try {
        const page = await sendPodcastCommand<LX.Podcast.LibraryPage>({
          action: 'library',
          kind: view,
          limit: EPISODE_PAGE_SIZE,
        })
        if (generation !== libraryLoadGeneration || activeView.value !== view) return
        libraryItems.value = page.items
        libraryCursor.value = page.nextCursor
        loadedLibraryKind.value = view
      } catch (value) {
        if (generation !== libraryLoadGeneration || activeView.value !== view) return
        error.value = value instanceof Error ? value.message : String(value)
      } finally {
        if (generation === libraryLoadGeneration) loadingLibrary.value = false
      }
    }
    const changeView = (view: PodcastView) => {
      activeView.value = view
      if (view === 'discover') {
        libraryLoadGeneration++
        loadingLibrary.value = false
        loadingMoreLibrary.value = false
        return
      }
      void loadLibrary()
    }
    const loadMoreLibrary = async () => {
      const cursor = libraryCursor.value
      if (activeView.value === 'discover' || !cursor || loadingMoreLibrary.value) return
      const view = activeView.value
      const generation = libraryLoadGeneration
      loadingMoreLibrary.value = true
      error.value = ''
      try {
        const page = await sendPodcastCommand<LX.Podcast.LibraryPage>({
          action: 'library',
          kind: view,
          cursor,
          limit: EPISODE_PAGE_SIZE,
        })
        if (generation !== libraryLoadGeneration || activeView.value !== view) return
        const existingIds = new Set(libraryItems.value.map((item) => item.episode.id))
        libraryItems.value = [
          ...libraryItems.value,
          ...page.items.filter((item) => !existingIds.has(item.episode.id)),
        ]
        libraryCursor.value = page.nextCursor
      } catch (value) {
        if (generation !== libraryLoadGeneration || activeView.value !== view) return
        error.value = value instanceof Error ? value.message : String(value)
      } finally {
        if (generation === libraryLoadGeneration) loadingMoreLibrary.value = false
      }
    }
    const toggleFavorite = async (
      episode: ShareableEpisode,
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
        if (activeView.value !== 'discover') void loadLibrary()
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
    const loadVoxrailConfig = async () => {
      voxrailConfig.value = await sendPodcastCommand<LX.Podcast.VoxrailConfig>({
        action: 'voxrail-config',
      })
      voxrailBaseUrl.value = voxrailConfig.value.baseUrl
    }
    const setVoxrailFeedback = (message: string, isError = false) => {
      voxrailMessage.value = message
      voxrailMessageError.value = isError
    }
    const persistVoxrailConfig = async () => {
      voxrailConfig.value = await sendPodcastCommand<LX.Podcast.VoxrailConfig>({
        action: 'voxrail-config-save',
        baseUrl: voxrailBaseUrl.value.trim(),
        accessKey: voxrailAccessKey.value.trim() || undefined,
      })
      voxrailBaseUrl.value = voxrailConfig.value.baseUrl
      voxrailAccessKey.value = ''
    }
    const saveVoxrailConfig = async () => {
      voxrailSaving.value = true
      setVoxrailFeedback('')
      try {
        await persistVoxrailConfig()
        setVoxrailFeedback('Voxrail 设置已保存')
      } catch (value) {
        setVoxrailFeedback(value instanceof Error ? value.message : String(value), true)
      } finally {
        voxrailSaving.value = false
      }
    }
    const testVoxrailConnection = async () => {
      voxrailTesting.value = true
      setVoxrailFeedback('')
      try {
        if (
          voxrailAccessKey.value.trim() ||
          voxrailBaseUrl.value.trim() !== voxrailConfig.value?.baseUrl
        ) await persistVoxrailConfig()
        const quota = await sendPodcastCommand<LX.Podcast.VoxrailQuota>({ action: 'voxrail-test' })
        setVoxrailFeedback(`连接成功 · 剩余额度 ${quota.remainingMinutes} 分钟`)
      } catch (value) {
        setVoxrailFeedback(value instanceof Error ? value.message : String(value), true)
      } finally {
        voxrailTesting.value = false
      }
    }
    const removeVoxrailKey = async () => {
      voxrailSaving.value = true
      setVoxrailFeedback('')
      try {
        voxrailConfig.value = await sendPodcastCommand<LX.Podcast.VoxrailConfig>({
          action: 'voxrail-key-remove',
        })
        voxrailAccessKey.value = ''
        setVoxrailFeedback('Access Key 已移除')
      } catch (value) {
        setVoxrailFeedback(value instanceof Error ? value.message : String(value), true)
      } finally {
        voxrailSaving.value = false
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
    void loadVoxrailConfig()
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
      hasMoreLibraryItems,
      loadingLibrary,
      loadingMoreLibrary,
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
      shareBusy,
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
      voxrailConfig,
      voxrailBaseUrl,
      voxrailAccessKey,
      voxrailSaving,
      voxrailTesting,
      voxrailMessage,
      voxrailMessageError,
      now,
      rates,
      loadSources,
      loadPopular,
      changePopularPeriod,
      popularKey,
      popularRank,
      loadLibrary,
      loadMoreLibrary,
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
      shareEpisode,
      hasEpisodeAudio,
      toggleFavorite,
      downloadEpisode,
      transcriptionProgress,
      shouldPollTranscription,
      transcriptionTitle,
      transcriptionDetail,
      transcriptionWarning,
      isTranscriptionWarning,
      clearSearch,
      choosePath,
      changeRate,
      saveVoxrailConfig,
      testVoxrailConnection,
      removeVoxrailKey,
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
.page button, .page summary { touch-action: manipulation; }
.page button { cursor: pointer; }
.page button:not(:disabled):active { opacity: .72; }
.page button:disabled { opacity: .45; cursor: default; }
.page :is(button, input, select, summary):focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
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
.sourceArtwork { width: 44px; height: 44px; border-radius: 4px; }
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
.libraryArtwork { width: 48px; height: 48px; border-radius: 4px; }
.libraryItem h3 { font-size: 14px; }
.libraryItem small { display: block; margin-top: 4px; opacity: .7; }
.showHeader { display: grid; grid-template-columns: 56px minmax(0, 1fr) auto auto; align-items: center; gap: 10px; padding-bottom: 14px; }
.showArtwork { width: 56px; height: 56px; border-radius: 4px; }
.showActionMessage { margin: -7px 0 12px; font-size: 12px; opacity: .72; }
.showActionMessage.error { padding: 0; }
.episodeList { border-top: 1px solid var(--color-primary-light-900-alpha-100); }
.episode { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 16px; padding: 13px 4px; border-bottom: 1px solid var(--color-primary-light-900-alpha-100); }
.episodeActions { display: flex; justify-content: flex-end; gap: 6px; flex-wrap: wrap; }
.episode h3 { margin: 0; font-size: 14px; letter-spacing: 0; }
.episode p { margin: 5px 0 0; opacity: .62; font-size: 11px; }
.episodeActionError { display: block; margin-top: 7px; color: #d84a4a; font-size: 12px; }
.loadMore { display: block; min-height: 44px; margin: 14px auto 2px; }
.transcriptionStatus { display: grid; gap: 3px; min-height: 16px; margin-top: 7px; font-family: Consolas, "Microsoft YaHei UI", sans-serif; font-size: 11px; opacity: .82; }
.transcriptionHeadline { display: flex; align-items: center; gap: 9px; min-width: 0; }
.transcriptionHeadline strong { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 11px; font-weight: 600; }
.transcriptionStatus small { display: block; opacity: .76; }
.transcriptionWarning { opacity: 1; }
.transcriptionAlert { color: #c98316; opacity: 1 !important; }
.segmentProgress { position: relative; display: block; width: 112px; height: 4px; flex: none; overflow: hidden; border-radius: 2px; background: var(--color-primary-light-900-alpha-100); }
.segmentProgress i { position: absolute; inset: 0; display: block; background: var(--color-primary); transform-origin: left center; transition: transform 200ms cubic-bezier(.23, 1, .32, 1); }
.segmentProgressIndeterminate i { right: auto; width: 38%; animation: transcription-progress-indeterminate 1.2s cubic-bezier(.65, 0, .35, 1) infinite; }
@keyframes transcription-progress-indeterminate { from { transform: translateX(-100%); } to { transform: translateX(365%); } }
@media (prefers-reduced-motion: reduce) { .segmentProgressIndeterminate i { animation: none; transform: translateX(80%); } }
.settings { flex: none; border-top: 1px solid var(--color-primary-light-900-alpha-100); padding: 9px 24px; }
.settings[open] { max-height: 68vh; overflow-y: auto; }
.settings summary { position: sticky; top: 0; z-index: 1; cursor: pointer; margin: -9px 0 0; padding: 9px 0; font-weight: 600; background: var(--color-primary-light-100); }
.voxrailPanel { display: grid; gap: 12px; margin-top: 12px; padding: 14px; border: 1px solid var(--color-primary-light-900-alpha-100); border-radius: 6px; background: var(--color-primary-light-100-alpha-300); }
.voxrailPanel > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.voxrailPanel > header div { display: grid; gap: 3px; min-width: 0; }
.voxrailPanel > header small { opacity: .65; line-height: 1.5; }
.connectionBadge { flex: none; padding: 3px 7px; border-radius: 4px; background: var(--color-primary-light-900-alpha-100); font-size: 11px; }
.connectionReady { color: var(--color-primary); background: var(--color-primary-alpha-100); }
.voxrailFields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.voxrailFields label { display: grid; gap: 6px; min-width: 0; font-size: 11px; }
.voxrailFields input { width: 100%; min-width: 0; box-sizing: border-box; }
.voxrailActions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.voxrailActions small { overflow-wrap: anywhere; opacity: .7; }
.voxrailError { color: #d84a4a; opacity: 1 !important; }
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
.empty { margin: 30px 8px; text-align: center; opacity: .55; }
.error { color: #d84a4a; padding: 8px; }
.modalBackdrop { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; background: rgba(0, 0, 0, .42); }
.modal { width: min(460px, calc(100vw - 40px)); box-sizing: border-box; padding: 20px; border-radius: 6px; background: var(--color-primary-light-100); box-shadow: 0 14px 40px rgba(0, 0, 0, .28); }
.modal:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 3px; }
.modal p { line-height: 1.6; opacity: .72; }
.modal .modalError { color: #d84a4a; opacity: 1; }
.modal div { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
@media (prefers-reduced-motion: reduce) {
  .segmentProgress i { transition: none; }
}
@media (any-pointer: coarse), (max-width: 760px) {
  .page :is(button, input:not([type="checkbox"]), select) { min-height: 44px; box-sizing: border-box; }
  .page button { min-width: 44px; }
  .viewTabs, .popularFilters, .groupTools, .groupCreate, .groupHeading, .groupSources li, .episodeActions, .authModes, .authMethods { gap: 8px; }
  .popularList li, .checkboxLabel, .settings summary { min-height: 44px; }
  .groupHeading { grid-template-columns: 44px minmax(0, 1fr) 44px; }
  .groupHeading > button { width: 44px; justify-self: start; }
  .groupHeading > button:first-of-type { grid-column: 1; grid-row: 1; }
  .groupHeading > input { grid-column: 2; grid-row: 1; }
  .groupHeading > small { grid-column: 3; grid-row: 1; }
  .groupHeading > button:nth-of-type(2) { grid-column: 1; grid-row: 2; }
  .groupHeading > button:nth-of-type(3) { grid-column: 2; grid-row: 2; }
  .groupHeading > button:nth-of-type(4) { grid-column: 3; grid-row: 2; }
}
@media (max-width: 760px) {
  .toolbar { align-items: stretch; flex-direction: column; gap: 10px; padding: 14px; }
  .search { min-width: 0; }
  .content { grid-template-columns: 1fr; overflow: auto; }
  .sources { max-height: 40vh; border-right: 0; border-bottom: 1px solid var(--color-primary-light-900-alpha-100); }
  .episodes { overflow: visible; padding: 14px; }
  .showHeader { grid-template-columns: auto minmax(0, 1fr); }
  .settingGrid { grid-template-columns: 1fr; }
  .voxrailFields { grid-template-columns: 1fr; }
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
