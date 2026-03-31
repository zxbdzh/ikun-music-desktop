import {inflate} from 'zlib'
import iconv from 'iconv-lite'

const handleInflate = async (data: Buffer) => {
  return new Promise((resolve: (result: Buffer) => void, reject) => {
    inflate(data, (err, result) => {
      if (err) {
        reject(err)
        return
      }
      resolve(result)
    })
  })
}

const buf_key = Buffer.from('yeelion')
const buf_key_len = buf_key.length

export const decodeLyric = async (buf: Buffer, isGetLyricx: boolean) => {
  if (buf.toString('utf8', 0, 10) != 'tp=content') return ''
  const lrcData = await handleInflate(buf.subarray(buf.indexOf('\r\n\r\n') + 4))

  if (!isGetLyricx) return iconv.decode(lrcData, 'gb18030')

  const buf_str = Buffer.from(lrcData.toString(), 'base64')
  const buf_str_len = buf_str.length
  const output = new Uint8Array(buf_str_len)
  let i = 0
  while (i < buf_str_len) {
    let j = 0
    while (j < buf_key_len && i < buf_str_len) {
      output[i] = buf_str[i] ^ buf_key[j]
      i++
      j++
    }
  }

  return iconv.decode(Buffer.from(output), 'gb18030')
}
