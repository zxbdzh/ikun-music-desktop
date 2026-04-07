<template lang="pug">
dt#wy_login {{ $t('setting__wy_login') }}
dd
  h3#wy_login_title {{ $t('setting__wy_login_title') }}
  div
    .p.gap-top
      span {{ $t('setting__wy_login_status') }}:
      span(:class="$style.status") {{ loginStatus }}
    .p.gap-top(v-if="appSetting['common.wy_cookie']")
      base-btn(min @click="handleLogout") {{ $t('setting__wy_login_logout') }}
    .p.gap-top(v-else)
      base-btn(min @click="showManualInput") {{ $t('setting__wy_login_manual') }}
    .p.gap-top
      span(:class="$style.tip") {{ $t('setting__wy_login_tip') }}
    .p.gap-top(v-if="appSetting['common.wy_cookie']")
      base-checkbox(id="setting_wy_enable_scrobble" :model-value="appSetting['common.wy_enableScrobble']" :label="$t('setting__wy_enable_scrobble')" @update:model-value="handleToggleScrobble")
    .p(v-if="appSetting['common.wy_cookie'] && appSetting['common.wy_enableScrobble']")
      span(:class="$style.tip") {{ $t('setting__wy_enable_scrobble_tip') }}

  //- Cookie 输入弹窗
  material-modal(:show="isShowInputModal" bg-close teleport="#view" @close="closeModal")
    main(:class="$style.modalMain")
      h2 {{ $t('setting__wy_login_input_title') }}
      p {{ $t('setting__wy_login_input_desc') }}
      textarea(
        v-model="cookieInput"
        :class="$style.cookieInput"
        :placeholder="$t('setting__wy_login_input_placeholder')"
      )
      div(:class="$style.modalActions")
        base-btn(min @click="closeModal") {{ $t('cancel') }}
        base-btn(min :disabled="!cookieInput.trim()" @click="handleSaveCookie") {{ $t('confirm') }}
</template>

<script>
import { ref, computed } from '@common/utils/vueTools'
import { appSetting, updateSetting } from '@renderer/store/setting'
import { dialog } from '@renderer/plugins/Dialog'
import { useI18n } from '@root/lang'

export default {
  name: 'SettingWyLogin',
  setup() {
    const t = useI18n()
    const isLoading = ref(false)
    const isShowInputModal = ref(false)
    const cookieInput = ref('')

    const loginStatus = computed(() => {
      return appSetting['common.wy_cookie']
        ? t('setting__wy_login_logged_in')
        : t('setting__wy_login_not_logged_in')
    })

    const showManualInput = () => {
      isShowInputModal.value = true
    }

    const closeModal = () => {
      isShowInputModal.value = false
      cookieInput.value = ''
    }

    const handleSaveCookie = async () => {
      const cookie = cookieInput.value.trim()
      if (!cookie) return

      isLoading.value = true
      try {
        // 验证 Cookie
        const wyUtilImport = await import('@renderer/utils/musicSdk/wy/wyUtil')
        const result = await wyUtilImport.default.verifyCookie(cookie)

        // 保存 Cookie（即使无法获取 UID，只要 Cookie 格式正确就保存）
        if (result.valid) {
          updateSetting({ 'common.wy_cookie': cookie })
          void dialog({
            message: result.uid > 0
              ? t('setting__wy_login_success')
              : t('setting__wy_login_success_no_uid'),
            confirmButtonText: t('ok'),
          })
          closeModal()
        } else {
          void dialog({
            message: t('setting__wy_login_invalid_cookie'),
            confirmButtonText: t('ok'),
          })
        }
      } catch (err) {
        console.error('Cookie verification error:', err)
        void dialog({
          message: t('setting__wy_login_failed'),
          confirmButtonText: t('ok'),
        })
      } finally {
        isLoading.value = false
      }
    }

    const handleLogout = () => {
      updateSetting({ 'common.wy_cookie': '' })
      void dialog({
        message: t('setting__wy_login_logout_success'),
        confirmButtonText: t('ok'),
      })
    }

    const handleToggleScrobble = (checked) => {
      updateSetting({ 'common.wy_enableScrobble': checked })
    }

    return {
      appSetting,
      loginStatus,
      isShowInputModal,
      cookieInput,
      showManualInput,
      closeModal,
      handleSaveCookie,
      handleLogout,
      handleToggleScrobble,
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

.modalMain {
  padding: 15px;
  max-width: 500px;
  min-width: 300px;

  h2 {
    font-size: 16px;
    margin-bottom: 15px;
    text-align: center;
  }

  p {
    font-size: 13px;
    color: var(--color-font-label);
    margin-bottom: 15px;
    line-height: 1.5;
  }
}

.cookieInput {
  width: 100%;
  height: 120px;
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-secondary-background);
  color: var(--color-font);
  font-size: 12px;
  font-family: monospace;
  resize: vertical;
  margin-bottom: 15px;

  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }
}

.modalActions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
