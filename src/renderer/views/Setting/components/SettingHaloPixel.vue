<template lang="pug">
dt#halo_pixel {{ $t('setting__halo_pixel') }}
dd
  .gap-top
    base-checkbox(id="setting_halo_pixel_enable" :model-value="appSetting['haloPixel.enable']" :label="$t('setting__halo_pixel_enable')" @update:model-value="updateSetting({ 'haloPixel.enable': $event })")
  .gap-top
    base-checkbox(id="setting_halo_pixel_auto_scroll" :model-value="appSetting['haloPixel.autoScroll']" :label="$t('setting__halo_pixel_auto_scroll')" @update:model-value="toggleAutoScroll")
  .gap-top
    base-checkbox(id="setting_halo_pixel_alternate_split" :model-value="appSetting['haloPixel.alternateSplit']" :label="$t('setting__halo_pixel_alternate_split')" @update:model-value="toggleAlternate")
  .gap-top
    base-checkbox(id="setting_halo_pixel_typewriter" :model-value="appSetting['haloPixel.typewriter']" :label="$t('setting__halo_pixel_typewriter')" @update:model-value="updateSetting({ 'haloPixel.typewriter': $event })")
  .gap-top(v-if="appSetting['haloPixel.typewriter']")
    base-checkbox(id="setting_halo_pixel_typewriter_sync" :model-value="appSetting['haloPixel.typewriterSync']" :label="$t('setting__halo_pixel_typewriter_sync')" @update:model-value="updateSetting({ 'haloPixel.typewriterSync': $event })")
dd(v-if="appSetting['haloPixel.alternateSplit']")
  h3#halo_pixel_alternate_interval {{ $t('setting__halo_pixel_alternate_interval', { num: appSetting['haloPixel.alternateInterval'] }) }}
  div
    .p
      base-btn.btn(min @click="changeAlternateInterval(-500)") {{ $t('setting__halo_pixel_alternate_interval_faster') }}
      base-btn.btn(min @click="changeAlternateInterval(500)") {{ $t('setting__halo_pixel_alternate_interval_slower') }}
dd(v-if="appSetting['haloPixel.typewriter'] && appSetting['haloPixel.typewriterSync']")
  h3#halo_pixel_latency_comp {{ $t('setting__halo_pixel_latency_comp', { num: appSetting['haloPixel.latencyCompMs'] }) }}
  div
    .p
      base-btn.btn(min @click="changeLatencyComp(-20)") {{ $t('setting__halo_pixel_latency_comp_dec') }}
      base-btn.btn(min @click="changeLatencyComp(20)") {{ $t('setting__halo_pixel_latency_comp_inc') }}
dd(v-if="appSetting['haloPixel.typewriter'] && !appSetting['haloPixel.typewriterSync']")
  h3#halo_pixel_typewriter_speed {{ $t('setting__halo_pixel_typewriter_speed', { num: appSetting['haloPixel.typewriterSpeed'] }) }}
  div
    .p
      base-btn.btn(min @click="changeTypewriterSpeed(-20)") {{ $t('setting__halo_pixel_typewriter_speed_faster') }}
      base-btn.btn(min @click="changeTypewriterSpeed(20)") {{ $t('setting__halo_pixel_typewriter_speed_slower') }}
dd
  h3#halo_pixel_lyric_mode {{ $t('setting__halo_pixel_lyric_mode') }}
  div
    base-checkbox.gap-left(id="setting_halo_pixel_lyric_mode_original" :model-value="appSetting['haloPixel.lyricMode']" need value="original" :label="$t('setting__halo_pixel_lyric_mode_original')" @update:model-value="updateSetting({ 'haloPixel.lyricMode': $event })")
    base-checkbox.gap-left(id="setting_halo_pixel_lyric_mode_translation" :model-value="appSetting['haloPixel.lyricMode']" need value="translation" :label="$t('setting__halo_pixel_lyric_mode_translation')" @update:model-value="updateSetting({ 'haloPixel.lyricMode': $event })")
    base-checkbox.gap-left(id="setting_halo_pixel_lyric_mode_roma" :model-value="appSetting['haloPixel.lyricMode']" need value="roma" :label="$t('setting__halo_pixel_lyric_mode_roma')" @update:model-value="updateSetting({ 'haloPixel.lyricMode': $event })")
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

    const changeTypewriterSpeed = (step) => {
      const val = appSetting['haloPixel.typewriterSpeed'] + step
      updateSetting({ 'haloPixel.typewriterSpeed': Math.min(Math.max(val, 30), 500) })
    }

    const changeLatencyComp = (step) => {
      const val = appSetting['haloPixel.latencyCompMs'] + step
      updateSetting({ 'haloPixel.latencyCompMs': Math.min(Math.max(val, -200), 1000) })
    }

    const changeAlternateInterval = (step) => {
      const val = appSetting['haloPixel.alternateInterval'] + step
      updateSetting({ 'haloPixel.alternateInterval': Math.min(Math.max(val, 1000), 10000) })
    }

    // 来回切换与硬件滚动是处理超长歌词的两种互斥方式,开启其一自动关闭另一
    const toggleAutoScroll = (val) => {
      updateSetting(
        val
          ? { 'haloPixel.autoScroll': true, 'haloPixel.alternateSplit': false }
          : { 'haloPixel.autoScroll': false }
      )
    }
    const toggleAlternate = (val) => {
      updateSetting(
        val
          ? { 'haloPixel.alternateSplit': true, 'haloPixel.autoScroll': false }
          : { 'haloPixel.alternateSplit': false }
      )
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
      changeTypewriterSpeed,
      changeLatencyComp,
      changeAlternateInterval,
      toggleAutoScroll,
      toggleAlternate,
      deviceConnected,
    }
  },
}
</script>
