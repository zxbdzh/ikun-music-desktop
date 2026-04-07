<template lang="pug">
dt#wy {{ $t('setting__wy') }}
dd
  h3#wy_login_title {{ $t('setting__wy_login_title') }}
  div
    .p.gap-top
      span {{ $t('setting__wy_login_status') }}:
      span(:class="$style.status") {{ loginStatus }}
    .p.gap-top(v-if="!appSetting['common.wy_cookie']")
      //- 登录方式切换
      div(:class="$style.tabContainer")
        button(
          :class="[$style.tabBtn, { [$style.active]: loginMethod === 'captcha' }]"
          @click="loginMethod = 'captcha'"
        ) {{ $t('setting__wy_login_method_captcha') }}
        button(
          :class="[$style.tabBtn, { [$style.active]: loginMethod === 'cookie' }]"
          @click="loginMethod = 'cookie'"
        ) {{ $t('setting__wy_login_method_cookie') }}

      //- 验证码登录表单
      div(v-if="loginMethod === 'captcha'" :class="$style.formContainer")
        div(:class="$style.inputGroup")
          base-input(
            v-model="phoneNumber"
            :placeholder="$t('setting__wy_login_phone_placeholder')"
            type="tel"
            maxlength="11"
            :class="$style.input"
          )
          base-btn(
            min
            :disabled="!canSendCaptcha"
            @click="handleSendCaptcha"
          )
            span(v-if="captchaCooldown > 0") {{ $t('setting__wy_login_send_captcha_retry', { seconds: captchaCooldown }) }}
            span(v-else) {{ $t('setting__wy_login_send_captcha') }}
        div(:class="$style.inputGroup")
          base-input(
            v-model="captchaCode"
            :placeholder="$t('setting__wy_login_captcha_placeholder')"
            type="tel"
            maxlength="6"
            :class="$style.input"
          )
        div(:class="$style.inputGroup")
          base-btn(
            min
            :disabled="isLoading || !isCaptchaValid"
            @click="handleCaptchaLogin"
          ) {{ $t('setting__wy_login_btn') }}

      //- Cookie 登录按钮
      div(v-if="loginMethod === 'cookie'")
        base-btn(min @click="showManualInput") {{ $t('setting__wy_login_manual') }}

    .p.gap-top
      span(:class="$style.tip") {{ $t('setting__wy_login_tip') }}
    .p.gap-top(v-if="appSetting['common.wy_cookie']")
      base-btn(min @click="handleLogout") {{ $t('setting__wy_login_logout') }}
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
  name: 'SettingWy',
  setup() {
    const t = useI18n()
    const isLoading = ref(false)
    const isShowInputModal = ref(false)
    const cookieInput = ref('')
    const loginMethod = ref('captcha')

    // 验证码登录
    const phoneNumber = ref('')
    const captchaCode = ref('')
    const captchaCooldown = ref(0)
    let captchaTimer = null

    const isCaptchaValid = computed(() => {
      return captchaCode.value && captchaCode.value.length >= 4
    })

    const isPhoneValid = computed(() => {
      return phoneNumber.value && phoneNumber.value.length === 11
    })

    const canSendCaptcha = computed(() => {
      return captchaCooldown.value === 0 && isPhoneValid.value
    })

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

    const handleSendCaptcha = async () => {
      const phone = phoneNumber.value.trim()
      if (!phone || phone.length !== 11) return

      const wyUser = await import('@renderer/utils/musicSdk/wy/user')
      const result = await wyUser.default.sendCaptcha(phone)

      if (result.success) {
        void dialog({
          message: '验证码已发送',
          confirmButtonText: t('ok'),
        })
        // 开始倒计时
        captchaCooldown.value = 60
        if (captchaTimer) clearInterval(captchaTimer)
        captchaTimer = setInterval(() => {
          captchaCooldown.value--
          if (captchaCooldown.value <= 0) {
            if (captchaTimer) clearInterval(captchaTimer)
            captchaTimer = null
          }
        }, 1000)
      } else {
        void dialog({
          message: result.message || t('setting__wy_login_failed'),
          confirmButtonText: t('ok'),
        })
      }
    }

    const handleCaptchaLogin = async () => {
      const phone = phoneNumber.value.trim()
      const captcha = captchaCode.value.trim()
      if (!phone || !captcha) return

      isLoading.value = true
      try {
        const wyUser = await import('@renderer/utils/musicSdk/wy/user')
        const result = await wyUser.default.loginByCaptcha(phone, captcha)

        if (result.success) {
          updateSetting({ 'common.wy_cookie': result.cookie })
          void dialog({
            message: t('setting__wy_login_success'),
            confirmButtonText: t('ok'),
          })
          // 清空表单
          phoneNumber.value = ''
          captchaCode.value = ''
          if (captchaTimer) {
            clearInterval(captchaTimer)
            captchaTimer = null
          }
          captchaCooldown.value = 0
        } else {
          void dialog({
            message: result.message || t('setting__wy_login_failed'),
            confirmButtonText: t('ok'),
          })
        }
      } catch (err) {
        console.error('Captcha login error:', err)
        void dialog({
          message: t('setting__wy_login_failed'),
          confirmButtonText: t('ok'),
        })
      } finally {
        isLoading.value = false
      }
    }

    const handleSaveCookie = async () => {
      const cookie = cookieInput.value.trim()
      if (!cookie) return

      isLoading.value = true
      try {
        const wyUser = await import('@renderer/utils/musicSdk/wy/user')
        const result = await wyUser.default.verifyCookie(cookie)

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
      loginMethod,
      phoneNumber,
      captchaCode,
      captchaCooldown,
      isCaptchaValid,
      isPhoneValid,
      canSendCaptcha,
      isLoading,
      isShowInputModal,
      cookieInput,
      showManualInput,
      closeModal,
      handleSendCaptcha,
      handleCaptchaLogin,
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

.tabContainer {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.tabBtn {
  padding: 6px 16px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-secondary-background);
  color: var(--color-font-label);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;

  &:hover {
    border-color: var(--color-primary);
    color: var(--color-font);
  }

  &.active {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: #fff;
  }
}

.formContainer {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.inputGroup {
  display: flex;
  gap: 8px;
  align-items: center;
}

.input {
  flex: 1;
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
