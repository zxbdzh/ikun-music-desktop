<template lang="pug">
dt#webdav {{ $t('setting__webdav') }}
dd
  h3#webdav_play_title {{ $t('setting__webdav_play_title') }}
  div
    .p
      base-input(:class="$style.input" :model-value="appSetting['webdavPlay.url']" :placeholder="$t('setting__webdav_play_url')" @update:model-value="setUrl")
    .p
      base-input(:class="$style.input" :model-value="appSetting['webdavPlay.username']" :placeholder="$t('setting__webdav_play_username')" @update:model-value="setUsername")
    .p
      base-input(:class="$style.input" type="password" :model-value="appSetting['webdavPlay.password']" :placeholder="$t('setting__webdav_play_password')" @update:model-value="setPassword")
    .p.gap-top
      base-btn.btn(min :disabled="testing || !appSetting['webdavPlay.url']" @click="handleTest") {{ $t('setting__webdav_play_test') }}
      span(v-if="statusText" :class="$style.status") {{ statusText }}
    .p.gap-top
      span(:class="$style.tip") {{ $t('setting__webdav_play_tip') }}
</template>

<script>
import { ref } from '@common/utils/vueTools'
import { appSetting, updateSetting } from '@renderer/store/setting'
import { debounce } from '@common/utils'
import { dialog } from '@renderer/plugins/Dialog'
import { useI18n } from '@root/lang'
import { resetWebDAVPlayClient, testWebDAVPlayConnection } from '@renderer/core/webdavPlay/client'

export default {
  name: 'SettingWebdav',
  setup() {
    const t = useI18n()
    const testing = ref(false)
    const statusText = ref('')

    const setUrl = debounce((url) => {
      updateSetting({ 'webdavPlay.url': url.trim() })
      resetWebDAVPlayClient()
      statusText.value = ''
    }, 500)
    const setUsername = debounce((username) => {
      updateSetting({ 'webdavPlay.username': username })
      resetWebDAVPlayClient()
      statusText.value = ''
    }, 500)
    const setPassword = debounce((password) => {
      updateSetting({ 'webdavPlay.password': password })
      resetWebDAVPlayClient()
      statusText.value = ''
    }, 500)

    const handleTest = async () => {
      if (!appSetting['webdavPlay.url']?.trim()) return
      testing.value = true
      statusText.value = t('setting__webdav_play_testing')
      resetWebDAVPlayClient()
      try {
        await testWebDAVPlayConnection()
        statusText.value = t('setting__webdav_play_test_success')
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        statusText.value = `${t('setting__webdav_play_test_failed')}: ${message}`
        void dialog({
          message: `${t('setting__webdav_play_test_failed')}: ${message}`,
          confirmButtonText: t('ok'),
        })
      } finally {
        testing.value = false
      }
    }

    return {
      appSetting,
      updateSetting,
      testing,
      statusText,
      setUrl,
      setUsername,
      setPassword,
      handleTest,
    }
  },
}
</script>

<style lang="less" module>
.input {
  width: 360px;
  max-width: 100%;
}
.status {
  margin-left: 10px;
  font-size: 12px;
  color: var(--color-primary);
}
.tip {
  font-size: 12px;
  color: var(--color-font-label);
}
</style>
