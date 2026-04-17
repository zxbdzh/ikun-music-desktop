<template lang="pug">
dt#lastfm {{ $t('setting__lastfm') }}
dd
  h3#lastfm_api {{ $t('setting__lastfm_api_title') }}
  div
    .p.gap-top
      base-input(
        :model-value="appSetting['common.lastfm_api_key']"
        :placeholder="$t('setting__lastfm_api_key_placeholder')"
        :class="$style.input"
        @update:model-value="updateSetting({'common.lastfm_api_key': $event})"
      )
    .p.gap-top
      base-input(
        :model-value="appSetting['common.lastfm_api_secret']"
        :placeholder="$t('setting__lastfm_api_secret_placeholder')"
        :class="$style.input"
        type="password"
        @update:model-value="updateSetting({'common.lastfm_api_secret': $event})"
      )
    .p.gap-top
      span(:class="$style.tip") {{ $t('setting__lastfm_api_tip') }}

  h3#lastfm_auth {{ $t('setting__lastfm_auth_title') }}
  div
    .p.gap-top
      span {{ $t('setting__lastfm_auth_status') }}:
      span(:class="$style.status") {{ authStatus }}
    .p.gap-top(v-if="!appSetting['common.lastfm_api_key'] || !appSetting['common.lastfm_api_secret']")
      span(:class="$style.tip") {{ $t('setting__lastfm_auth_need_api_key') }}
    .p.gap-top(v-else-if="!appSetting['common.lastfm_session_key']")
      base-btn(min @click="handleAuth" :disabled="!canAuth") {{ $t('setting__lastfm_auth_btn') }}
    .p.gap-top(v-if="appSetting['common.lastfm_session_key']")
      base-btn(min @click="handleLogout") {{ $t('setting__lastfm_auth_logout') }}
    .p.gap-top
      span(:class="$style.tip") {{ $t('setting__lastfm_auth_tip') }}
    .p.gap-top(v-if="appSetting['common.lastfm_session_key']")
      base-checkbox(
        id="setting_lastfm_enable_scrobble"
        :model-value="appSetting['common.lastfm_enable_scrobble']"
        :label="$t('setting__lastfm_enable_scrobble')"
        @update:model-value="updateSetting({'common.lastfm_enable_scrobble': $event})"
      )
    .p.gap-top(v-if="appSetting['common.lastfm_session_key'] && appSetting['common.lastfm_enable_scrobble']")
      base-checkbox(
        id="setting_lastfm_enable_now_playing"
        :model-value="appSetting['common.lastfm_enable_now_playing']"
        :label="$t('setting__lastfm_enable_now_playing')"
        @update:model-value="updateSetting({'common.lastfm_enable_now_playing': $event})"
      )
    .p(v-if="appSetting['common.lastfm_session_key'] && appSetting['common.lastfm_enable_scrobble']")
      span(:class="$style.tip") {{ $t('setting__lastfm_scrobble_tip') }}
</template>

<script>
import { computed } from '@common/utils/vueTools'
import { appSetting, updateSetting } from '@renderer/store/setting'
import { openUrl } from '@common/utils/electron'
import { getAuthUrl } from '@renderer/utils/musicSdk/lastfm'

export default {
  name: 'SettingLastfm',
  setup() {
    const authStatus = computed(() => {
      const username = appSetting['common.lastfm_username']
      return username
        ? `${appSetting['common.lastfm_auth_logged_in']} (${username})`
        : appSetting['common.lastfm_auth_not_logged_in']
    })

    const canAuth = computed(() => {
      return !!appSetting['common.lastfm_api_key'] && !!appSetting['common.lastfm_api_secret']
    })

    const handleAuth = () => {
      openUrl(getAuthUrl())
    }

    const handleLogout = () => {
      updateSetting({
        'common.lastfm_session_key': '',
        'common.lastfm_username': '',
        'common.lastfm_enable_scrobble': false,
        'common.lastfm_enable_now_playing': true,
      })
    }

    return {
      appSetting,
      updateSetting,
      authStatus,
      canAuth,
      handleAuth,
      handleLogout,
    }
  },
}
</script>

<style lang="less" module>
.status {
  font-weight: bold;
  color: var(--color-primary);
}

.tip {
  font-size: 12px;
  color: var(--color-font-label);
}

.input {
  width: 100%;
}
</style>
