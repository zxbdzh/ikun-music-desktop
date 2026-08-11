export const MIN_PODCAST_SPEAKER_COUNT = 1
export const MAX_PODCAST_SPEAKER_COUNT = 8
export const AUTO_CLUSTERING_THRESHOLD = 0.8

export interface SpeakerClusteringConfig {
  numClusters: number
  threshold: number
}

export const isBoundedSpeakerCount = (value: unknown): value is number =>
  Number.isSafeInteger(value) &&
  Number(value) >= MIN_PODCAST_SPEAKER_COUNT &&
  Number(value) <= MAX_PODCAST_SPEAKER_COUNT

export const createSpeakerClusteringConfig = (
  expectedSpeakerCount?: number
): SpeakerClusteringConfig => ({
  numClusters: isBoundedSpeakerCount(expectedSpeakerCount) ? expectedSpeakerCount : -1,
  threshold: AUTO_CLUSTERING_THRESHOLD,
})
