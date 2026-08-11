import {
  OfflineSpeakerDiarization,
  readWave,
  type SpeakerDiarizationSegment,
} from 'sherpa-onnx-node'
import { createSpeakerClusteringConfig } from './speakerClustering'

interface Request {
  wavPath: string
  segmentationModelPath: string
  embeddingModelPath: string
  provider: 'directml' | 'cpu'
  expectedSpeakerCount?: number
}

const parentPort = process.parentPort
const post = (message: unknown) => {
  try {
    parentPort?.postMessage(message)
  } catch {}
}

parentPort?.once('message', (event: Electron.MessageEvent) => {
  const request = event.data as Request
  try {
    post({ type: 'progress', progress: null })
    const wave = readWave(request.wavPath, false)
    if (wave.sampleRate !== 16_000) {
      throw new Error(`说话人分离要求 16000 Hz 音频，实际为 ${wave.sampleRate} Hz`)
    }
    const diarizer = new OfflineSpeakerDiarization({
      segmentation: {
        pyannote: { model: request.segmentationModelPath },
        numThreads: 4,
        provider: request.provider,
      },
      embedding: {
        model: request.embeddingModelPath,
        numThreads: 4,
        provider: request.provider,
      },
      clustering: createSpeakerClusteringConfig(request.expectedSpeakerCount),
      minDurationOn: 0.3,
      minDurationOff: 0.5,
    })
    post({ type: 'progress', progress: null })
    const segments: SpeakerDiarizationSegment[] = diarizer.process(wave.samples)
    post({ type: 'result', segments })
  } catch (error) {
    post({
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    })
  }
})
