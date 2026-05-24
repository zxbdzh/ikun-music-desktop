/**
 * CeruMusic 分享服务接入配置
 *
 * ikun 卡片分享的二维码可调用 CeruMusic 后端创建分享记录,扫码后打开 CeruMusic
 * 官方落地页。登录复用 CeruMusic 的 Logto 应用(标准 OIDC + PKCE)。
 */

/** CeruMusic 后端 API 基址 */
export const CERUMUSIC_API_BASE = 'https://api.ceru.shiqianjiang.cn/api'

/** Logto OIDC 服务端点(末尾带 /) */
export const LOGTO_ENDPOINT = 'https://auth.shiqianjiang.cn/'

/** Logto 应用 ID(与 CeruMusic 共用同一应用) */
export const LOGTO_APP_ID = '2a22nn23flw9nyrwi6jw9'

/**
 * OAuth 回调地址。复用 ikun 已注册的 lxmusic:// 协议。
 * 注意:需在 Logto 应用的允许 Redirect URI 中加入此地址。
 */
export const LOGTO_REDIRECT_URI = 'lxmusic://oauth/callback'

/** 访问令牌对应的 API 资源(token 的 audience) */
export const LOGTO_API_RESOURCE = CERUMUSIC_API_BASE

/** 申请的 OIDC scope,offline_access 用于获取刷新令牌 */
export const LOGTO_SCOPES = 'openid profile offline_access'

/** 分享记录默认有效期(天) */
export const SHARE_DEFAULT_TTL_DAYS = 30
