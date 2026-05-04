/**
 * 花再音响文本布局
 */
export enum HaloPixelTextLayout {
  ScrollLeftToRight = 0,  // 从左到右滚动
  ScrollRightToLeft = 1,  // 从右到左滚动
  Left = 2,              // 左对齐
  Right = 3,             // 右对齐
  Center = 4,            // 居中
  Stretch = 5,           // 拉伸填充
}

/**
 * 花再歌词显示模式
 */
export type HaloPixelLyricMode = 'original' | 'translation' | 'roma'

/**
 * 花再音响设置
 */
export interface HaloPixelSettings {
  enable: boolean           // 是否启用
  autoScroll: boolean      // 歌词过长时自动滚动
  lyricMode: HaloPixelLyricMode  // 歌词显示模式
  scrollThreshold: number  // 滚动阈值，默认 30
}

/**
 * 歌词行数据
 */
export interface LyricLineData {
  line: number
  original: string
  translation?: string | null
  roma?: string | null
}
