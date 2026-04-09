import {
  ref,
  reactive,
  computed,
  watch,
  watchEffect,
  nextTick,
  onMounted,
  onBeforeUnmount,
  toRaw,
  useCssModule,
  toRef,
  toRefs,
  shallowRef,
  unref,
  markRaw,
  type ComputedRef,
  type Ref,
  type ShallowRef,
  shallowReactive,
  withDefaults,
} from 'vue'
// import { useStore } from 'vuex'

// export const useState = name => {
//   const store = useStore()
//   return store.state[name]
// }
// export const useGetter = (...names) => {
//   const store = useStore()
//   return store.getters[names.join('/')]
// }
// export const useRefGetter = (...names) => {
//   const store = useStore()
//   return computed(() => store.getters[names.join('/')])
// }

// export const useAction = (...names) => {
//   const store = useStore()
//   return params => {
//     return store.dispatch(names.join('/'), params)
//   }
// }
// export const useCommit = (...names) => {
//   const store = useStore()
//   return params => {
//     return store.commit(names.join('/'), params)
//   }
// }

export const markRawList = <T extends any[]>(list: T) => {
  for (const item of list) {
    markRaw(item)
  }
  return list
}

/**
 * 深度将响应式对象转换为普通对象，用于通过 IPC 传递数据
 */
export const toRawDeep = <T>(obj: T): T => {
  if (obj === null || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) {
    return obj.map(item => toRawDeep(item)) as unknown as T
  }
  const raw = toRaw(obj)
  const result: Record<string, any> = {}
  for (const key in raw) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      const value = raw[key]
      result[key] = value === null || typeof value !== 'object' ? value : toRawDeep(value)
    }
  }
  return result as T
}

export {
  nextTick,
  onBeforeUnmount,
  ref,
  toRaw,
  reactive,
  watch,
  watchEffect,
  computed,
  useCssModule,
  toRef,
  toRefs,
  shallowRef,
  unref,
  onMounted,
  markRaw,
  shallowReactive,
  withDefaults,
}

export type { ComputedRef, Ref, ShallowRef }
