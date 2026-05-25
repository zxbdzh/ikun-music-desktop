import type { HID as HIDInstance, Device } from 'node-hid'
import { DEVICE_NAME, DEVICE_USAGE_PAGE, PACKET_LEN } from './protocol'

// node-hid 是可选的 USB 外设依赖,这里惰性 + 容错加载:任何加载失败(打包缺少原生
// 二进制、平台不支持、驱动缺失等)都绝不能让主进程在启动时崩溃,只是禁用花再音响
// 设备功能。顶层若直接 import 'node-hid',打包遗漏其二进制会导致整个 app 无法启动。
type NodeHid = typeof import('node-hid')
let hidModule: NodeHid | null = null
let hidLoadFailed = false
const getHid = (): NodeHid | null => {
  if (hidModule || hidLoadFailed) return hidModule
  try {
    hidModule = require('node-hid') as NodeHid
  } catch (err) {
    hidLoadFailed = true
    console.warn('[haloPixel] node-hid 加载失败,设备功能已禁用:', err)
  }
  return hidModule
}

// The device enumerates several same-named HID interfaces; only the one on
// usage page 0xff14 (input/output report length 64) can send data.
const matchDevice = (info: Device): boolean =>
  (info.product ?? '').includes(DEVICE_NAME) && info.usagePage === DEVICE_USAGE_PAGE

export class HaloPixelDevice {
  private hid: HIDInstance | null = null
  // node-hid 的设备枚举是原生同步调用,在 HID 设备多的机器上会阻塞主线程数秒(尤其设备
  // 未连接时反复枚举)。因此枚举走 devicesAsync(libuv 工作线程),并用该标志保证 3s 重连
  // 循环与显示路径并发触发时同一时刻只跑一次枚举,避免任务堆叠。
  private opening = false

  get isConnected(): boolean {
    return this.hid != null
  }

  static async findDeviceInfoAsync(): Promise<Device | null> {
    const mod = getHid()
    if (!mod) return null
    let list: Device[]
    try {
      list = await mod.devicesAsync()
    } catch {
      return null
    }
    return list.find(matchDevice) ?? null
  }

  // 非阻塞打开:枚举在工作线程完成后再在主线程同步 new HID(path)。new HID 只在确实匹配到
  // 设备(即设备已连接)时才执行,开销很小,不是卡顿来源;真正昂贵的全量枚举已移出主线程。
  async openAsync(): Promise<boolean> {
    if (this.hid) return true
    if (this.opening) return false
    const mod = getHid()
    if (!mod) return false
    this.opening = true
    try {
      const info = await HaloPixelDevice.findDeviceInfoAsync()
      if (this.hid) return true // 期间已被其它调用打开
      if (!info?.path) return false
      this.hid = new mod.HID(info.path)
      return true
    } catch {
      this.hid = null
      return false
    } finally {
      this.opening = false
    }
  }

  write(packet: number[]): boolean {
    if (!this.hid) return false
    const buf = packet.length === PACKET_LEN ? packet : packet.slice(0, PACKET_LEN)
    try {
      this.hid.write(buf)
      return true
    } catch {
      // Most likely unplugged mid-write; drop the handle so the poller reconnects.
      this.close()
      return false
    }
  }

  close(): void {
    if (!this.hid) return
    try {
      this.hid.close()
    } catch {}
    this.hid = null
  }
}
