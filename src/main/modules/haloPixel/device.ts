/**
 * 花再音响设备通信模块
 * 使用 node-hid 与花再 Halo PixelBar 设备通信
 */

import * as nodeHID from 'node-hid'
import { HaloPixelTextLayout } from './types'
import { HidPacketBuilder } from './packetBuilder'

// 设备名称
const DEVICE_NAME = '花再 Halo PixelBar'

// 设备单例
let device: nodeHID.HID | null = null
let devicePath: string | null = null
let deviceVid: number | null = null
let devicePid: number | null = null

/**
 * HID 设备操作
 */
export const haloPixelDevice = {
  /**
   * 设备是否已连接（通过路径判断）
   */
  get isConnected(): boolean {
    return devicePath !== null
  },

  /**
   * 初始化设备连接
   */
  async initialize(): Promise<boolean> {
    try {
      // 如果已连接，先关闭
      if (device) {
        this.close()
      }

      // 查找 HID 设备
      const devices = nodeHID.devices()
      console.log('[HaloPixel] All HID devices:', devices.map(d => ({
        product: d.product,
        manufacturer: d.manufacturer,
        vendorId: d.vendorId,
        productId: d.productId,
        path: d.path ? d.path.substring(0, 50) : 'null'
      })))

      // 查找花再设备 - 更宽松的匹配，收集所有匹配的设备
      const haloDevices = devices.filter(
        d => {
          const product = d.product || ''
          const manufacturer = d.manufacturer || ''
          const isMatch = product.includes('Halo') ||
            product.includes('Pixel') ||
            product.includes('花再') ||
            manufacturer.includes('Halo') ||
            manufacturer.includes('Pixel') ||
            manufacturer.includes('花再')
          if (isMatch) {
            console.log('[HaloPixel] Found device:', d.product, d.manufacturer, 'path:', d.path, 'interface:', d.path?.includes('MI_03') ? 'MI_03' : d.path?.includes('MI_04&Col01') ? 'MI_04&Col01' : 'MI_04&Col02')
          }
          return isMatch
        }
      )

      if (haloDevices.length === 0) {
        console.warn('[HaloPixel] Device not found:', DEVICE_NAME)
        return false
      }

      // 选择一个设备进行测试
      // 优先选择 MI_04&Col02 接口
      let targetDevice = haloDevices.find(d => d.path?.includes('MI_04&Col02'))
      if (!targetDevice) {
        targetDevice = haloDevices.find(d => d.path?.includes('MI_03'))
      }
      if (!targetDevice) {
        targetDevice = haloDevices[0]
      }

      console.log('[HaloPixel] Selected device:', targetDevice.product, 'path:', targetDevice.path)

      // 保存设备路径和 VID/PID
      devicePath = targetDevice.path ?? null
      deviceVid = targetDevice.vendorId
      devicePid = targetDevice.productId
      console.log('[HaloPixel] Device info - VID:', deviceVid, 'PID:', devicePid)

      // 测试使用 VID/PID 打开设备并发送测试数据
      // 这可以验证设备是否真正可用
      try {
        const testDevice = new nodeHID.HID(targetDevice.vendorId, targetDevice.productId)
        console.log('[HaloPixel] Device opened via VID/PID successfully')

        // 尝试发送一个居中布局命令来"唤醒"设备
        const layoutPacket = HidPacketBuilder.buildLayout(1) // Center layout
        console.log('[HaloPixel] Trying to send layout packet to wake device')
        const layoutResult = testDevice.write(layoutPacket)
        console.log('[HaloPixel] Layout write result:', layoutResult)

        // 等待一小段时间
        const startTime = Date.now()
        while (Date.now() - startTime < 100) {}

        // 尝试发送一个文本包
        const textPacket = Buffer.alloc(64)
        textPacket.fill(0)
        const textResult = testDevice.write(textPacket)
        console.log('[HaloPixel] Empty text write result:', textResult)

        testDevice.close()
      } catch (e) {
        console.log('[HaloPixel] VID/PID open/test failed:', e)
      }

      // 测试打开设备（然后立即关闭）
      const testDevice = new nodeHID.HID(devicePath!)
      testDevice.close()
      console.log('[HaloPixel] Device path found and verified:', targetDevice.product, 'path:', devicePath)
      return true
    } catch (error) {
      console.error('[HaloPixel] Failed to initialize device:', error)
      device = null
      devicePath = null
      return false
    }
  },

  /**
   * 关闭设备连接
   */
  close(): void {
    if (device) {
      try {
        console.log('[HaloPixel] Closing device')
        device.close()
      } catch (error) {
        console.error('[HaloPixel] Error closing device:', error)
      }
      device = null
      devicePath = null
      deviceVid = null
      devicePid = null
    }
  },

  /**
   * 重新连接设备
   */
  reconnect(): boolean {
    if (!devicePath) {
      console.warn('[HaloPixel] Cannot reconnect: no device path')
      return false
    }

    try {
      console.log('[HaloPixel] Reconnecting to device at path:', devicePath)
      device = new nodeHID.HID(devicePath)
      console.log('[HaloPixel] Reconnected successfully')
      return true
    } catch (error) {
      console.error('[HaloPixel] Failed to reconnect:', error)
      device = null
      return false
    }
  },

  /**
   * 发送文本到设备
   * 每次写入时打开新连接
   */
  sendText(text: string): boolean {
    if (!devicePath && !deviceVid && !devicePid) {
      console.warn('[HaloPixel] Device info not available')
      return false
    }

    let tempDevice: nodeHID.HID | null = null
    try {
      const packet = HidPacketBuilder.buildText(text)
      console.log('[HaloPixel] Sending text packet, length:', packet.length, 'first bytes:', Array.from(packet.slice(0, 8)))

      // 优先使用 VID/PID 打开设备
      if (deviceVid && devicePid) {
        tempDevice = new nodeHID.HID(deviceVid, devicePid)
        console.log('[HaloPixel] Device opened via VID/PID:', deviceVid, devicePid)
      } else {
        tempDevice = new nodeHID.HID(devicePath!)
        console.log('[HaloPixel] Device opened via path')
      }

      // 尝试使用 Feature Report 发送数据（某些 HID 设备需要这种方式）
      // Feature Report 需要在数据前加上 report ID (0x00)
      const dataWithReportId = new Uint8Array(packet.length + 1)
      dataWithReportId[0] = 0x00 // Report ID
      dataWithReportId.set(new Uint8Array(packet), 1)

      console.log('[HaloPixel] Trying sendFeatureReport, data length:', dataWithReportId.length)
      const featureResult = tempDevice.sendFeatureReport(Array.from(dataWithReportId))
      console.log('[HaloPixel] sendFeatureReport result:', featureResult)

      if (featureResult > 0) {
        tempDevice.close()
        tempDevice = null
        return true
      }

      // 如果 Feature Report 失败，尝试普通 write
      console.log('[HaloPixel] Trying write instead')
      const result = tempDevice.write(packet)
      console.log('[HaloPixel] write result:', result)

      // 关闭设备
      tempDevice.close()
      tempDevice = null

      return result > 0
    } catch (error: unknown) {
      console.error('[HaloPixel] Failed to send text:', error)
      console.error('[HaloPixel] Error name:', (error as Error)?.name)
      console.error('[HaloPixel] Error message:', (error as Error)?.message)
      if (tempDevice) {
        try { tempDevice.close() } catch {}
      }
      return false
    }
  },

  /**
   * 设置文本布局
   * 每次写入时打开新连接
   */
  setLayout(layout: HaloPixelTextLayout): boolean {
    if (!devicePath && !deviceVid && !devicePid) {
      console.warn('[HaloPixel] Device info not available')
      return false
    }

    let tempDevice: nodeHID.HID | null = null
    try {
      const packet = HidPacketBuilder.buildLayout(layout)
      console.log('[HaloPixel] Sending layout packet, length:', packet.length, 'bytes:', Array.from(packet.slice(0, 8)))

      // 优先使用 VID/PID 打开设备
      if (deviceVid && devicePid) {
        tempDevice = new nodeHID.HID(deviceVid, devicePid)
        console.log('[HaloPixel] Device opened via VID/PID:', deviceVid, devicePid)
      } else {
        tempDevice = new nodeHID.HID(devicePath!)
        console.log('[HaloPixel] Device opened via path')
      }

      // 尝试使用 Feature Report 发送数据
      const dataWithReportId = new Uint8Array(packet.length + 1)
      dataWithReportId[0] = 0x00 // Report ID
      dataWithReportId.set(new Uint8Array(packet), 1)

      console.log('[HaloPixel] Trying sendFeatureReport for layout')
      const featureResult = tempDevice.sendFeatureReport(Array.from(dataWithReportId))
      console.log('[HaloPixel] sendFeatureReport result:', featureResult)

      if (featureResult > 0) {
        tempDevice.close()
        tempDevice = null
        return true
      }

      // 如果 Feature Report 失败，尝试普通 write
      console.log('[HaloPixel] Trying write instead')
      const result = tempDevice.write(packet)
      console.log('[HaloPixel] write result:', result)

      // 关闭设备
      tempDevice.close()
      tempDevice = null

      return result > 0
    } catch (error: unknown) {
      console.error('[HaloPixel] Failed to set layout:', error)
      console.error('[HaloPixel] Error name:', (error as Error)?.name)
      console.error('[HaloPixel] Error message:', (error as Error)?.message)
      if (tempDevice) {
        try { tempDevice.close() } catch {}
      }
      return false
    }
  },
}
