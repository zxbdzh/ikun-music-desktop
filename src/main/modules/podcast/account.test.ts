import { describe, expect, it, vi } from 'vitest'
import type { AurioClubClient } from './aurioClubClient'
import { PodcastModule } from './module'

vi.mock('electron', () => ({
  app: { getVersion: () => '1.4.1' },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString(),
  },
}))

describe('PodcastModule account workflows', () => {
  it('reuses the login workflow after password registration', async () => {
    const client = {
      registerPassword: vi.fn(async () => ({ token: 'token-1', user: aurioUser })),
      me: vi.fn(async () => ({ user: aurioUser })),
    }
    const module = preparedModule(client)
    const persistSession = vi.fn()
    ;(module as any).persistSession = persistSession
    ;(module as any).syncNow = vi.fn(async () => (module as any).session)

    const session = await module.execute({
      action: 'register-password',
      email: 'user@example.com',
      code: '123456',
      password: 'password-1',
    })

    expect(client.registerPassword).toHaveBeenCalledWith(
      'user@example.com',
      '123456',
      'password-1'
    )
    expect(client.me).toHaveBeenCalledOnce()
    expect(session).toMatchObject({
      account: { id: 'user-1', username: 'AurioUser' },
      syncEnabled: true,
      syncState: 'idle',
    })
    expect((module as any).token).toBe('token-1')
    expect(persistSession).toHaveBeenCalledOnce()
  })

  it('refreshes the in-memory account after a profile update', async () => {
    const client = {
      updateProfile: vi.fn(async () => ({
        user: { ...aurioUser, username: 'NewName' },
      })),
    }
    const module = preparedModule(client, signedInSession())

    const session = await module.execute({ action: 'update-profile', username: 'NewName' })

    expect(client.updateProfile).toHaveBeenCalledWith('NewName')
    expect(session).toMatchObject({ account: { id: 'user-1', username: 'NewName' } })
    await expect(module.execute({ action: 'session' })).resolves.toMatchObject({
      account: { username: 'NewName' },
    })
  })

  it('routes reset, change-password, and current-device linking commands', async () => {
    const client = {
      resetPassword: vi.fn(async () => undefined),
      changePassword: vi.fn(async () => undefined),
      linkDevice: vi.fn(async () => undefined),
    }
    const module = preparedModule(client, signedInSession())
    const syncNow = vi.fn(async () => (module as any).session)
    ;(module as any).syncNow = syncNow

    await module.execute({
      action: 'reset-password',
      email: 'user@example.com',
      code: '123456',
      newPassword: 'password-2',
    })
    await module.execute({
      action: 'change-password',
      oldPassword: 'password-1',
      newPassword: 'password-2',
    })
    await module.execute({ action: 'link-device', migrateGuestData: true })

    expect(client.resetPassword).toHaveBeenCalledWith(
      'user@example.com',
      '123456',
      'password-2'
    )
    expect(client.changePassword).toHaveBeenCalledWith('password-1', 'password-2')
    expect(client.linkDevice).toHaveBeenCalledWith('device-1', true)
    expect(syncNow).toHaveBeenCalledOnce()
  })

  it('builds a complete analytics event and does not surface delivery failures', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-11T08:00:00Z'))
    const track = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('offline'))
    const client = { track }
    const module = preparedModule(client, signedInSession())
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    await module.execute({
      action: 'track-event',
      event: ' podcast_play ',
      targetId: 'episode-1',
      properties: { source: 'library' },
    })
    await expect(module.execute({
      action: 'track-event',
      event: 'podcast_pause',
      targetId: 'episode-1',
    })).resolves.toBeUndefined()

    expect(track).toHaveBeenNthCalledWith(1, [{
      d_id: 'device-1',
      u_id: 'user-1',
      s_id: expect.any(String),
      p_form: 'desktop',
      v_name: '1.4.1',
      event: 'podcast_play',
      t_id: 'episode-1',
      ts: Date.now(),
      props: { source: 'library' },
    }])
    expect(warn).toHaveBeenCalledWith(
      '[podcast] analytics event podcast_pause was not sent:',
      'offline'
    )
    warn.mockRestore()
    vi.useRealTimers()
  })
})

const signedInSession = (): LX.Podcast.Session => ({
  account: { id: 'user-1', email: 'user@example.com', username: 'AurioUser' },
  syncEnabled: true,
  syncState: 'idle',
})

const aurioUser = {
  id: 'user-1',
  email: 'user@example.com',
  username: 'AurioUser',
  points: 0,
  membership_tier: 'free',
  is_premium: 0,
} as const

const preparedModule = (
  client: Record<string, unknown>,
  session: LX.Podcast.Session = { account: null, syncEnabled: false, syncState: 'local' }
) => {
  const module = new PodcastModule(client as unknown as AurioClubClient)
  ;(module as any).initialized = true
  ;(module as any).deviceId = 'device-1'
  ;(module as any).session = session
  return module
}
