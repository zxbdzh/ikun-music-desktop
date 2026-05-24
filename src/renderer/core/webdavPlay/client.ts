import fs from 'fs'
import { createClient, type WebDAVClient } from 'webdav'
import { appSetting } from '@renderer/store/setting'
import { getWebdavPlayConfig, saveWebdavPlayConfig } from '@renderer/utils/ipc'

// 独立单例,仅用于 WebDAV 远程播放的目录浏览/扫描/上传(播放流由主进程 lx-webdav 协议处理)
let client: WebDAVClient | null = null

export const getWebDAVBaseUrl = (): string => {
  const url = appSetting['webdavPlay.url'] || ''
  return url.trim().replace(/\/+$/, '')
}

export const getWebDAVPlayCredentials = (): { username: string; password: string } => {
  return {
    username: appSetting['webdavPlay.username'] || '',
    password: appSetting['webdavPlay.password'] || '',
  }
}

export const getClient = (): WebDAVClient | null => {
  if (client) return client

  const url = getWebDAVBaseUrl()
  const { username, password } = getWebDAVPlayCredentials()
  if (!url || !username) {
    console.warn('WebDAV 播放未配置: URL 或用户名为空')
    return null
  }

  client = createClient(url, { username, password })
  return client
}

/**
 * 配置变更(url/username/password)时调用,清空单例以便下次用新凭证重建。
 */
export const resetWebDAVPlayClient = (): void => {
  client = null
}

/**
 * 拼接可直连播放的真实文件 URL(不含凭证)。
 * 按 `/` 分段 encodeURIComponent 后拼接;鉴权由主进程会话注入,见 main/modules/webdavStream。
 */
export const buildWebDAVFileUrl = (filePath: string): string => {
  const base = getWebDAVBaseUrl()
  const encoded = filePath
    .split('/')
    .map((segment) => (segment ? encodeURIComponent(segment) : ''))
    .join('/')
  const path = encoded.startsWith('/') ? encoded : `/${encoded}`
  return `${base}${path}`
}

export const testWebDAVPlayConnection = async (): Promise<boolean> => {
  const cli = getClient()
  if (!cli) throw new Error('WebDAV 播放未配置')
  await cli.getDirectoryContents('/')
  return true
}

export const getWebDAVPlayConfig = async (): Promise<LX.WebDAVPlay.Config> => {
  const config = (await getWebdavPlayConfig()) ?? {
    selectedFolder: null,
    songs: [],
  }
  config.songs = config.songs ?? []
  return config
}

export const saveWebDAVPlayConfig = (config: LX.WebDAVPlay.Config): void => {
  // 配置里可能混入 Vue reactive proxy(如已选目录来自响应式列表),
  // 经 IPC 结构化克隆会报 "An object could not be cloned",故先深拷贝为纯数据。
  saveWebdavPlayConfig(JSON.parse(JSON.stringify(config)))
}

/**
 * 上传二进制/文本文件到 WebDAV(覆盖已存在文件)。
 * remotePath 为服务器绝对路径(原始未编码),交由库自行编码,与读路径一致。
 */
export const uploadWebDAVFile = async (
  remotePath: string,
  data: Buffer | string
): Promise<void> => {
  const cli = getClient()
  if (!cli) throw new Error('WebDAV 未配置')
  const ok = await cli.putFileContents(remotePath, data as any, { overwrite: true })
  if (!ok) throw new Error(`上传失败: ${remotePath}`)
}

/**
 * 从本地文件路径上传到 WebDAV。
 * 注意:渲染端 webpack 会把 webdav 内部的 `stream` 解析为 polyfill,真实 Node fs.ReadStream
 * 不满足其 `instanceof Stream.Readable` 判断,会落到 calculateDataLength 报「Invalid type」。
 * 故读为 Buffer 上传(带 Content-Length);桌面 Node Buffer 处理大文件无 OOM 风险(移动端 OOM 源于 base64)。
 */
export const uploadWebDAVFileFromPath = async (
  remotePath: string,
  localPath: string
): Promise<void> => {
  const cli = getClient()
  if (!cli) throw new Error('WebDAV 未配置')
  const buf = await fs.promises.readFile(localPath)
  const ok = await cli.putFileContents(remotePath, buf, { overwrite: true })
  if (!ok) throw new Error(`上传失败: ${remotePath}`)
}

/**
 * 确保目录存在(递归创建)。已存在则跳过。
 */
export const ensureWebDAVDirectory = async (dirPath: string): Promise<void> => {
  const cli = getClient()
  if (!cli) throw new Error('WebDAV 未配置')
  if (await cli.exists(dirPath)) return
  await cli.createDirectory(dirPath, { recursive: true })
}

export const webdavExists = async (remotePath: string): Promise<boolean> => {
  const cli = getClient()
  if (!cli) throw new Error('WebDAV 未配置')
  return cli.exists(remotePath)
}

/**
 * 读取并解析 JSON 文件;不存在/解析失败均返回 null。
 */
export const getWebDAVJsonFile = async <T>(remotePath: string): Promise<T | null> => {
  const cli = getClient()
  if (!cli) return null
  try {
    if (!(await cli.exists(remotePath))) return null
    const text = (await cli.getFileContents(remotePath, { format: 'text' })) as string
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

/**
 * 删除文件或目录(目录递归删除,WebDAV DELETE 对集合即递归)。
 */
export const deleteWebDAVFile = async (remotePath: string): Promise<void> => {
  const cli = getClient()
  if (!cli) throw new Error('WebDAV 未配置')
  await cli.deleteFile(remotePath)
}

/**
 * 移动/重命名文件或目录(用于歌单文件夹重命名)。
 */
export const moveWebDAVFile = async (from: string, to: string): Promise<void> => {
  const cli = getClient()
  if (!cli) throw new Error('WebDAV 未配置')
  await cli.moveFile(from, to)
}
