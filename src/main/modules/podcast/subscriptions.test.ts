import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PodcastModule } from './module'
import { parseOpml } from './opml'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString(),
  },
}))

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

const group: LX.Podcast.SubscriptionGroup = {
  id: 'default_group',
  name: '默认',
  isExpanded: true,
  sortOrder: 0,
}

const source: LX.Podcast.Source = {
  id: 'source-1',
  title: '节目 A',
  author: '',
  description: '',
  artworkUrl: '',
  feedUrl: 'https://example.com/feed.xml',
  categories: [],
  subscribed: true,
  autoDownload: false,
  groupId: group.id,
  subscriptionOrder: 0,
  updatedAt: 1,
}

describe('podcast subscription management', () => {
  it('creates a stable group record and rejects deleting the default group', async () => {
    const module = localModule()
    const podcastSubscriptionGroupSave = vi.fn()
    global.lx = globals({
      podcastSubscriptionGroupsGet: vi.fn(async () => [group]),
      podcastSubscriptionGroupSave,
    })

    await expect((module as any).saveSubscriptionGroup({ name: '访谈' })).resolves.toMatchObject({
      id: expect.stringMatching(/^group_/),
      name: '访谈',
      sortOrder: 1,
    })
    expect(podcastSubscriptionGroupSave).toHaveBeenCalled()
    await expect((module as any).deleteSubscriptionGroup('default_group')).rejects.toThrow(
      '默认分组不能删除'
    )
  })

  it('imports and exports grouped OPML through the main process', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ikun-opml-'))
    roots.push(root)
    const inputPath = path.join(root, 'input.opml')
    const outputPath = path.join(root, 'output.opml')
    await writeFile(inputPath, `
      <opml version="2.0"><body><outline text="默认" id="default_group">
        <outline type="rss" text="节目 A" xmlUrl="https://example.com/feed.xml" id="source-1" />
      </outline></body></opml>
    `)
    const module = localModule()
    const podcastSubscriptionSnapshotReplace = vi.fn()
    global.lx = globals({
      podcastSubscriptionSnapshotReplace,
      podcastSubscriptionGroupsGet: vi.fn(async () => [group]),
      podcastSourcesGet: vi.fn(async () => [source]),
    })

    await (module as any).importOpml(inputPath)
    expect(podcastSubscriptionSnapshotReplace).toHaveBeenCalledWith(expect.objectContaining({
      groups: [expect.objectContaining({ id: 'default_group' })],
      sources: [expect.objectContaining({ id: 'source-1' })],
    }))

    await (module as any).exportOpml(outputPath)
    expect(parseOpml(await readFile(outputPath, 'utf8'))).toMatchObject({
      groups: [group],
      sources: [expect.objectContaining({ id: source.id, groupId: group.id })],
    })
  })
})

const localModule = () => {
  const module = new PodcastModule()
  ;(module as any).session = { account: null, syncEnabled: false, syncState: 'local' }
  return module
}

const globals = (dbService: Record<string, unknown>) => ({
  worker: { dbService },
}) as unknown as typeof global.lx
