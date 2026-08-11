declare module 'sherpa-onnx-node' {
  export interface Wave {
    samples: Float32Array
    sampleRate: number
  }

  export interface SpeakerDiarizationSegment {
    start: number
    end: number
    speaker: number
  }

  export class OfflineSpeakerDiarization {
    readonly sampleRate: number
    constructor(config: {
      segmentation: {
        pyannote: { model: string }
        numThreads?: number
        debug?: boolean | number
        provider?: string
      }
      embedding: {
        model: string
        numThreads?: number
        debug?: boolean | number
        provider?: string
      }
      clustering?: { numClusters?: number; threshold?: number }
      minDurationOn?: number
      minDurationOff?: number
    })
    process(samples: Float32Array): SpeakerDiarizationSegment[]
  }

  export function readWave(filename: string, enableExternalBuffer?: boolean): Wave
}
