<template lang="pug">
dt#halo_pixel {{ $t('setting__halo_pixel') }}
dd
  .gap-top
    base-checkbox(id="setting_halo_pixel_enable" :model-value="appSetting['haloPixel.enable']" :label="$t('setting__halo_pixel_enable')" @update:model-value="updateSetting({ 'haloPixel.enable': $event })")
  .gap-top
    base-checkbox(id="setting_halo_pixel_auto_scroll" :model-value="appSetting['haloPixel.autoScroll']" :label="$t('setting__halo_pixel_auto_scroll')" @update:model-value="updateSetting({ 'haloPixel.autoScroll': $event })")
dd
  h3#halo_pixel_scroll_threshold {{ $t('setting__halo_pixel_scroll_threshold', { num: appSetting['haloPixel.scrollThreshold'] }) }}
  div
    .p
      base-btn.btn(min @click="changeThreshold(-5)") {{ $t('setting__halo_pixel_scroll_threshold_dec') }}
      base-btn.btn(min @click="changeThreshold(5)") {{ $t('setting__halo_pixel_scroll_threshold_add') }}
dd
  h3#halo_pixel_device_status {{ $t('setting__halo_pixel_device_status') }}
  div
    .p {{ deviceConnected ? $t('setting__halo_pixel_device_connected') : $t('setting__halo_pixel_device_disconnected') }}
</template>

<script>
import { ref, onMounted, onBeforeUnmount } from '@common/utils/vueTools'
import { appSetting, updateSetting } from '@renderer/store/setting'
import { getHaloPixelStatus } from '@renderer/utils/ipc'

export default {
  name: 'SettingHaloPixel',
  setup() {
    const deviceConnected = ref(false)
    let timer = null

    const refreshStatus = () => {
      void getHaloPixelStatus().then((connected) => {
        deviceConnected.value = connected
      })
    }

    const changeThreshold = (step) => {
      const val = appSetting['haloPixel.scrollThreshold'] + step
      updateSetting({ 'haloPixel.scrollThreshold': Math.min(Math.max(val, 4), 100) })
    }

    onMounted(() => {
      refreshStatus()
      timer = setInterval(refreshStatus, 2000)
    })
    onBeforeUnmount(() => {
      if (timer) clearInterval(timer)
    })

    return {
      appSetting,
      updateSetting,
      changeThreshold,
      deviceConnected,
    }
  },
}
</script>
