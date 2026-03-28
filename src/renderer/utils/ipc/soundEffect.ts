import { rendererSend, rendererInvoke } from '@common/rendererIpc'
import { WIN_MAIN_RENDERER_EVENT_NAME } from '@common/ipcNames'

export const getUserSoundEffectEQPresetList = async () => {
  return rendererInvoke<LX.SoundEffect.EQPreset[]>(
    WIN_MAIN_RENDERER_EVENT_NAME.get_sound_effect_eq_preset
  )
}

export const saveUserSoundEffectEQPresetList = (list: LX.SoundEffect.EQPreset[]) => {
  rendererSend<LX.SoundEffect.EQPreset[]>(
    WIN_MAIN_RENDERER_EVENT_NAME.save_sound_effect_eq_preset,
    list
  )
}

export const getUserSoundEffectConvolutionPresetList = async () => {
  return rendererInvoke<LX.SoundEffect.ConvolutionPreset[]>(
    WIN_MAIN_RENDERER_EVENT_NAME.get_sound_effect_convolution_preset
  )
}

export const saveUserSoundEffectConvolutionPresetList = (
  list: LX.SoundEffect.ConvolutionPreset[]
) => {
  rendererSend<LX.SoundEffect.ConvolutionPreset[]>(
    WIN_MAIN_RENDERER_EVENT_NAME.save_sound_effect_convolution_preset,
    list
  )
}
