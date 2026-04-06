/**
 * 图片缓存工具 - 使用内存缓存存储已加载的图片，避免重复下载
 */

// 最大缓存数量
const MAX_CACHE_SIZE = 500

// 缓存 Map: url -> promise of dataUrl
const cache = new Map<string, Promise<string>>()

/**
 * 加载图片并缓存为 data URL
 * @param url 原始图片 URL
 * @returns Promise<string> data URL
 */
export const loadImageToDataUrl = (url: string): Promise<string> => {
  if (!url) return Promise.resolve('')

  // 如果已缓存，直接返回缓存的 promise
  const cached = cache.get(url)
  if (cached) return cached

  // 创建新的加载 promise
  const promise = new Promise<string>((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      // 清理对象 URL 避免内存泄漏
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(img, 0, 0)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
          // 清理 canvas
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          resolve(dataUrl)
          return
        }
      } catch (e) {
        console.warn('Failed to convert image to data URL:', e)
      }
      // 降级：直接使用原始 URL
      resolve(url)
    }
    img.onerror = () => {
      console.warn('Failed to load image:', url)
      resolve('')
    }
    img.src = url
  }).then((result) => {
    // 缓存成功加载的结果
    // 如果缓存已满，删除最老的条目
    if (cache.size >= MAX_CACHE_SIZE) {
      const firstKey = cache.keys().next().value
      if (firstKey) cache.delete(firstKey)
    }
    return result
  })

  cache.set(url, promise)
  return promise
}

/**
 * 预加载图片到缓存
 * @param url 图片 URL
 */
export const preloadImage = (url: string): void => {
  if (url) loadImageToDataUrl(url)
}

/**
 * 清除图片缓存
 */
export const clearImageCache = (): void => {
  cache.clear()
}

/**
 * 获取当前缓存的图片数量
 */
export const getImageCacheSize = (): number => cache.size
