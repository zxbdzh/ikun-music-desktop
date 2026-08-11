import { describe, expect, it } from 'vitest'
import { createSpeakerClusteringConfig } from './speakerClustering'

describe('podcast speaker clustering', () => {
  it('uses the bounded AI estimate instead of unconstrained threshold clustering', () => {
    expect(createSpeakerClusteringConfig(3)).toEqual({ numClusters: 3, threshold: 0.8 })
    expect(createSpeakerClusteringConfig(1)).toEqual({ numClusters: 1, threshold: 0.8 })
    expect(createSpeakerClusteringConfig(8)).toEqual({ numClusters: 8, threshold: 0.8 })
  })

  it('uses a conservative automatic threshold when no reliable estimate is available', () => {
    expect(createSpeakerClusteringConfig()).toEqual({ numClusters: -1, threshold: 0.8 })
    expect(createSpeakerClusteringConfig(64)).toEqual({ numClusters: -1, threshold: 0.8 })
  })
})
