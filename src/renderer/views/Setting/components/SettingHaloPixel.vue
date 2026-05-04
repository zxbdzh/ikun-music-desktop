<template lang="pug">
dt#halo_pixel {{ $t('setting__halo_pixel') }}
dd
  .gap-top
    base-checkbox(id="setting_halo_pixel_enable" :model-value="appSetting['haloPixel.enable']" :label="$t('setting__halo_pixel_enable')" @update:model-value="handleEnableChange")
  .gap-top(v-if="appSetting['haloPixel.enable']")
    .device-status
      span.status-label {{ $t('setting__halo_pixel_device_status') }}:
      span(:class="deviceStatusClass") {{ deviceStatusText }}
  .gap-top(v-if="appSetting['haloPixel.enable']")
    base-checkbox(id="setting_halo_pixel_auto_scroll" :model-value="appSetting['haloPixel.autoScroll']" :label="$t('setting__halo_pixel_auto_scroll')" @update:model-value="updateSetting({ 'haloPixel.autoScroll': $event })")

dd(v-if="appSetting['haloPixel.enable']")
  h3#halo_pixel_lyric_mode {{ $t('setting__halo_pixel_lyric_mode') }}
  div
    base-checkbox.gap-left(id="setting_halo_pixel_lyric_mode_original" :model-value="appSetting['haloPixel.lyricMode']" need value="original" :label="$t('setting__halo_pixel_lyric_mode_original')" @update:model-value="updateSetting({ 'haloPixel.lyricMode': $event })")
    base-checkbox.gap-left(id="setting_halo_pixel_lyric_mode_translation" :model-value="appSetting['haloPixel.lyricMode']" need value="translation" :label="$t('setting__halo_pixel_lyric_mode_translation')" @update:model-value="updateSetting({ 'haloPixel.lyricMode': $event })")
    base-checkbox.gap-left(id="setting_halo_pixel_lyric_mode_roma" :model-value="appSetting['haloPixel.lyricMode']" need value="roma" :label="$t('setting__halo_pixel_lyric_mode_roma')" @update:model-value="updateSetting({ 'haloPixel.lyricMode': $event })")

dd(v-if="appSetting['haloPixel.enable'] && appSetting['haloPixel.autoScroll']")
  h3#halo_pixel_scroll_threshold {{ $t('setting__halo_pixel_scroll_threshold', { num: appSetting['haloPixel.scrollThreshold'] }) }}
  div
    .p
      base-btn.btn(min @click="changeScrollThreshold(-5)") {{ $t('setting__halo_pixel_scroll_threshold_dec') }}
      base-btn.btn(min @click="changeScrollThreshold(5)") {{ $t('setting__halo_pixel_scroll_threshold_add') }}
</template>

<script>
import { ref, computed, onMounted, onBeforeUnmount } from '@common/utils/vueTools'
import { rendererInvoke, rendererSend } from '@common/rendererIpc'
import { HALO_PIXEL_EVENT_NAME } from '@common/ipcNames'
import { appSetting, updateSetting } from '@renderer/store/setting'
import { useI18n } from '@renderer/plugins/i18n'

export default {
  name: 'SettingHaloPixel',
  setup() {
    const t = useI18n()
    const deviceConnected = ref(false)

    const deviceStatusText = computed(() => {
      return deviceConnected.value ? t('setting__halo_pixel_device_connected') : t('setting__halo_pixel_device_disconnected')
    })

    const deviceStatusClass = computed(() => {
      return deviceConnected.value ? 'status-connected' : 'status-disconnected'
    })

    const initDevice = async () => {
      if (!appSetting['haloPixel.enable']) return
      try {
        deviceConnected.value = await rendererInvoke(HALO_PIXEL_EVENT_NAME.init_device)
      } catch (error) {
        console.error('[HaloPixel] Failed to init device:', error)
        deviceConnected.value = false
      }
    }

    const handleEnableChange = async (enabled) => {
      updateSetting({ 'haloPixel.enable': enabled })
      // 同步设置到主进程
      try {
        await rendererInvoke(HALO_PIXEL_EVENT_NAME.set_settings, {
          enable: enabled,
          autoScroll: appSetting['haloPixel.autoScroll'],
          lyricMode: appSetting['haloPixel.lyricMode'],
          scrollThreshold: appSetting['haloPixel.scrollThreshold'],
        })
      } catch (error) {
        console.error('[HaloPixel] Failed to sync settings:', error)
      }
      if (enabled) {
        try {
          deviceConnected.value = await rendererInvoke(HALO_PIXEL_EVENT_NAME.init_device)
        } catch (error) {
          console.error('[HaloPixel] Failed to init device:', error)
          deviceConnected.value = false
        }
      } else {
        try {
          await rendererInvoke(HALO_PIXEL_EVENT_NAME.close_device)
        } catch (error) {
          console.error('[HaloPixel] Failed to close device:', error)
        }
        deviceConnected.value = false
      }
    }

    const changeScrollThreshold = (step) => {
      let threshold = appSetting['haloPixel.scrollThreshold'] + step
      threshold = Math.min(Math.max(threshold, 15), 50)
      updateSetting({ 'haloPixel.scrollThreshold': threshold })
    }

    onMounted(() => {
      initDevice()
    })

    onBeforeUnmount(() => {
      if (deviceConnected.value) {
        rendererSend(HALO_PIXEL_EVENT_NAME.clear_lyric)
      }
    })

    return {
      appSetting,
      updateSetting,
      deviceStatusText,
      deviceStatusClass,
      handleEnableChange,
      changeScrollThreshold,
    }
  },
}
</script>

<style lang="less" module>
.device-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-label {
  color: var(--color-font);
}

.status-connected {
  color: var(--color-primary);
}

.status-disconnected {
  color: var(--color-disabled);
}
</style>
