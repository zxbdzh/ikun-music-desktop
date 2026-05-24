import { HID, devices, type Device } from 'node-hid'
import { DEVICE_NAME, DEVICE_USAGE_PAGE, PACKET_LEN } from './protocol'

// The device enumerates several same-named HID interfaces; only the one on
// usage page 0xff14 (input/output report length 64) can send data.
const matchDevice = (info: Device): boolean =>
  (info.product ?? '').includes(DEVICE_NAME) && info.usagePage === DEVICE_USAGE_PAGE

export class HaloPixelDevice {
  private hid: HID | null = null

  get isConnected(): boolean {
    return this.hid != null
  }

  static findDeviceInfo(): Device | null {
    let list: Device[]
    try {
      list = devices()
    } catch {
      return null
    }
    return list.find(matchDevice) ?? null
  }

  open(): boolean {
    if (this.hid) return true
    const info = HaloPixelDevice.findDeviceInfo()
    if (!info?.path) return false
    try {
      this.hid = new HID(info.path)
      return true
    } catch {
      this.hid = null
      return false
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
