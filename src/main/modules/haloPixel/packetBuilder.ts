/**
 * HID 协议包构建器
 * 移植自 HaloPixelToolBox.Core.Utilities.HidPacketBuilder
 */

import { HaloPixelTextLayout } from './types'

/**
 * HID 包构建器
 */
export class HidPacketBuilder {
  // 文本头: 0x2E, 0xAA, 0xEC, 0xE8, 0x00
  static readonly TEXT_HEADER: number[] = [0x2e, 0xaa, 0xec, 0xe8, 0x00]

  // 布局头: 0x2E, 0xAA, 0xEC, 0xEF, 0x00, 0x09, 0x01, 0xf0, 0xb4, 0xc8, 0x00, 0x02, 0x00
  static readonly LAYOUT_HEADER: number[] = [0x2e, 0xaa, 0xec, 0xef, 0x00, 0x09, 0x01, 0xf0, 0xb4, 0xc8, 0x00, 0x02, 0x00]

  // 固定包长度
  static readonly PACKET_LENGTH = 64

  /**
   * 校验算法: 从 128 开始，每个字节字符累加 (ch + 2)，然后对 256 取模
   */
  static checksum(textBytes: Buffer): number {
    let acc = 128
    for (let i = 0; i < textBytes.length; i++) {
      acc += textBytes[i] + 2
    }
    return acc % 256
  }

  /**
   * 构造文本 HID 包
   * @param text 要发送的文本
   * @returns 64 字节的 HID 数据包
   */
  static buildText(text: string): Buffer {
    // 最大可用字节数: 64 - header(5) - totalLen(2) - textLen(1) - checksum(1) = 55
    const MAX_TEXT_BYTES = 55
    const META_SIZE = 4 // totalLen(2) + textLen(1) + checksum(1)

    // 按字节数截断文本，确保不超过 Buffer 大小
    let textBytes = Buffer.from(text, 'utf8')
    if (textBytes.length > MAX_TEXT_BYTES) {
      // 逐字符减少直到符合大小要求
      let truncatedText = text
      while (Buffer.byteLength(truncatedText, 'utf8') > MAX_TEXT_BYTES && truncatedText.length > 0) {
        truncatedText = truncatedText.substring(0, truncatedText.length - 1)
      }
      textBytes = Buffer.from(truncatedText, 'utf8')
    }

    const textLen = textBytes.length
    const totalLen = textLen + META_SIZE

    const packet = Buffer.alloc(this.PACKET_LENGTH)

    // Header
    packet.set(this.TEXT_HEADER, 0)

    // TotalLen (little-endian)
    packet.writeUInt16LE(totalLen, this.TEXT_HEADER.length)

    // TextLen
    packet.writeUInt8(textLen, this.TEXT_HEADER.length + 2)

    // Text bytes
    textBytes.copy(packet, this.TEXT_HEADER.length + 3)

    // Checksum
    packet.writeUInt8(this.checksum(textBytes), this.TEXT_HEADER.length + 3 + textLen)

    return packet
  }

  /**
   * 构造布局 HID 包
   * @param layout 文本布局
   * @returns 64 字节的 HID 数据包
   */
  static buildLayout(layout: HaloPixelTextLayout): Buffer {
    const layoutBytes = this.convertLayout(layout)
    const packet = Buffer.alloc(this.PACKET_LENGTH)
    packet.set(layoutBytes, 0)
    return packet
  }

  /**
   * 将布局枚举转换为 HID 字节数组
   */
  private static convertLayout(layout: HaloPixelTextLayout): number[] {
    switch (layout) {
      case HaloPixelTextLayout.Left:
        return [0x2e, 0xaa, 0xec, 0xef, 0x00, 0x09, 0x01, 0xf0, 0xb4, 0xc8, 0x00, 0x02, 0x00, 0x00, 0xff, 0xfc, 0x00]
      case HaloPixelTextLayout.Right:
        return [0x2e, 0xaa, 0xec, 0xef, 0x00, 0x09, 0x01, 0xf0, 0xb4, 0xc8, 0x00, 0x02, 0x00, 0x02, 0xff, 0xfe, 0x00]
      case HaloPixelTextLayout.Center:
        return [0x2e, 0xaa, 0xec, 0xef, 0x00, 0x09, 0x01, 0xf0, 0xb4, 0xc8, 0x00, 0x02, 0x00, 0x01, 0xff, 0xfd, 0x00]
      case HaloPixelTextLayout.Stretch:
        return [0x2e, 0xaa, 0xec, 0xef, 0x00, 0x09, 0x01, 0xf0, 0xb4, 0xc8, 0x00, 0x02, 0x00, 0x03, 0xff, 0xff, 0x00]
      case HaloPixelTextLayout.ScrollLeftToRight:
        return [0x2e, 0xaa, 0xec, 0xef, 0x00, 0x09, 0x01, 0xf0, 0xb4, 0xc8, 0x00, 0x02, 0x01, 0x00, 0xff, 0xfd, 0x00]
      case HaloPixelTextLayout.ScrollRightToLeft:
        return [0x2e, 0xaa, 0xec, 0xef, 0x00, 0x09, 0x01, 0xf0, 0xb4, 0xc8, 0x00, 0x02, 0x01, 0x01, 0xff, 0xfe, 0x00]
      default:
        return [0x2e, 0xaa, 0xec, 0xef, 0x00, 0x09, 0x01, 0xf0, 0xb4, 0xc8, 0x00, 0x02, 0x00, 0x01, 0xff, 0xfd, 0x00]
    }
  }
}
