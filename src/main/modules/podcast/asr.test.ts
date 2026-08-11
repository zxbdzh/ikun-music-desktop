import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  PodcastAsr,
  PodcastAsrCancelledError,
  PriorityTaskQueue,
  SerialTaskQueue,
  createWhisperProcessEnv,
  createWhisperArguments,
  createAsrSegments,
  detectWhisperBackend,
  resolvePodcastAsrBinaryDir,
  runProcess,
} from './asr'

describe('podcast ASR sidecars', () => {
  it('uses unpacked Electron resources in production', () => {
    expect(resolvePodcastAsrBinaryDir('C:\\repo\\src\\static', 'C:\\app\\resources', true)).toBe(
      path.join('C:\\app\\resources', 'podcast', 'whisper')
    )
  })

  it('uses source static files during development', () => {
    expect(resolvePodcastAsrBinaryDir('C:\\repo\\src\\static', 'C:\\app\\resources', false)).toBe(
      path.join('C:\\repo\\src\\static', 'podcast', 'whisper')
    )
  })

  it('detects the backend that whisper actually initialized', () => {
    expect(detectWhisperBackend('whisper_backend_init_gpu: using CUDA0 backend')).toBe('cuda')
    expect(detectWhisperBackend('whisper_backend_init_gpu: using Vulkan0 backend')).toBe('vulkan')
    expect(detectWhisperBackend('whisper_init_with_params_no_state: use gpu = 0')).toBe('cpu')
  })

  it('does not mistake loading the CPU support library for selecting the CPU executor', () => {
    expect(detectWhisperBackend('load_backend: loaded CPU backend')).toBeUndefined()
    expect(detectWhisperBackend([
      'load_backend: loaded CPU backend',
      'whisper_backend_init_gpu: using CUDA0 backend',
    ].join('\n'))).toBe('cuda')
  })

  it('prepends discovered CUDA runtime directories to the existing process path', () => {
    const env = createWhisperProcessEnv(
      { Path: 'C:\\Windows\\System32', TEST_VALUE: 'kept' },
      ['C:\\CUDA\\v12.9\\bin']
    )

    expect(env.Path).toBe(`C:\\CUDA\\v12.9\\bin${path.delimiter}C:\\Windows\\System32`)
    expect(env.TEST_VALUE).toBe('kept')
  })

  it('requests full JSON so ASR token timings reach lyric clients', () => {
    expect(createWhisperArguments('model.bin', 'segment.wav', 'result', 'auto')).toEqual([
      '-m', 'model.bin',
      '-f', 'segment.wav',
      '-ojf',
      '-of', 'result',
      '-l', 'auto',
    ])
  })
})

describe('podcast ASR queue', () => {
  it('runs transcription tasks one at a time', async () => {
    const queue = new SerialTaskQueue()
    const events: string[] = []
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })

    const first = queue.enqueue(async () => {
      events.push('first:start')
      await firstGate
      events.push('first:end')
      return 'first'
    })
    const second = queue.enqueue(async () => {
      events.push('second:start')
      return 'second'
    })

    await Promise.resolve()
    expect(events).toEqual(['first:start'])
    releaseFirst()

    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second'])
    expect(events).toEqual(['first:start', 'first:end', 'second:start'])
  })

  it('continues after a failed transcription task', async () => {
    const queue = new SerialTaskQueue()
    const failed = queue.enqueue(async () => {
      throw new Error('failed')
    })
    const next = queue.enqueue(async () => 'next')

    await expect(failed).rejects.toThrow('failed')
    await expect(next).resolves.toBe('next')
  })

  it('selects the next pending task by live priority without interrupting the active task', async () => {
    const queue = new PriorityTaskQueue()
    const events: string[] = []
    let position = 0
    let releaseFirst!: () => void
    const gate = new Promise<void>((resolve) => { releaseFirst = resolve })
    const first = queue.enqueue('segment-0', () => Math.abs(position - 0), async () => {
      events.push('segment-0:start')
      await gate
      events.push('segment-0:end')
    })
    const second = queue.enqueue('segment-1', () => Math.abs(position - 1), async () => {
      events.push('segment-1')
    })
    const tenth = queue.enqueue('segment-10', () => Math.abs(position - 10), async () => {
      events.push('segment-10')
    })

    await Promise.resolve()
    position = 10
    releaseFirst()
    await Promise.all([first, second, tenth])

    expect(events).toEqual(['segment-0:start', 'segment-0:end', 'segment-10', 'segment-1'])
  })

  it('cancels pending tasks for one episode without affecting the active or other episodes', async () => {
    const queue = new PriorityTaskQueue()
    const events: string[] = []
    let releaseActive!: () => void
    const activeGate = new Promise<void>((resolve) => { releaseActive = resolve })
    const active = queue.enqueue('episode-a:segment-0', () => 0, async () => {
      events.push('active')
      await activeGate
    })
    const cancelled = queue.enqueue('episode-a:segment-1', () => 1, async () => {
      events.push('cancelled-task')
    })
    const other = queue.enqueue('episode-b:segment-0', () => 2, async () => {
      events.push('other')
    })
    const cancelledExpectation = expect(cancelled).rejects.toBeInstanceOf(PodcastAsrCancelledError)

    expect(queue.cancelPending('episode-a:')).toBe(1)
    releaseActive()

    await Promise.all([active, cancelledExpectation, other])
    expect(events).toEqual(['active', 'other'])
  })
})

describe('podcast ASR cancellation', () => {
  it('does not start segment tools when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const asr = new PodcastAsr({} as any)

    await expect(asr.transcribeSegment({} as any, {} as any, undefined, controller.signal))
      .rejects.toBeInstanceOf(PodcastAsrCancelledError)
  })

  it('terminates an active child process when cancellation is requested', async () => {
    const controller = new AbortController()
    const startedAt = Date.now()
    const running = runProcess(
      process.execPath,
      ['-e', 'setTimeout(() => undefined, 10000)'],
      controller.signal
    )
    setTimeout(() => controller.abort(), 25)

    await expect(running).rejects.toBeInstanceOf(PodcastAsrCancelledError)
    expect(Date.now() - startedAt).toBeLessThan(2_000)
  })
})

describe('podcast ASR segmentation', () => {
  it('creates 30 second ownership windows with bounded overlap', () => {
    expect(createAsrSegments(95_000)).toEqual([
      { index: 0, startMs: 0, endMs: 30_000, recognitionStartMs: 0, recognitionEndMs: 32_000 },
      { index: 1, startMs: 30_000, endMs: 60_000, recognitionStartMs: 28_000, recognitionEndMs: 62_000 },
      { index: 2, startMs: 60_000, endMs: 90_000, recognitionStartMs: 58_000, recognitionEndMs: 92_000 },
      { index: 3, startMs: 90_000, endMs: 95_000, recognitionStartMs: 88_000, recognitionEndMs: 95_000 },
    ])
  })
})
