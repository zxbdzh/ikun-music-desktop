class CrossfadeAnalyzer {
  private windowSize = 1024

  calculateEnergy(audioBuffer: AudioBuffer): Float32Array {
    const channelData = audioBuffer.getChannelData(0)
    const energy: number[] = []

    for (let i = 0; i < channelData.length; i += this.windowSize) {
      let sum = 0
      const end = Math.min(i + this.windowSize, channelData.length)
      for (let j = i; j < end; j++) {
        sum += channelData[j] * channelData[j]
      }
      energy.push(Math.sqrt(sum / this.windowSize))
    }

    return new Float32Array(energy)
  }

  findOptimalCrossfadePoint(
    bufferA: AudioBuffer,
    bufferB: AudioBuffer,
    overlapDurationMs: number
  ): { point: number; similarity: number } {
    const energyA = this.calculateEnergy(bufferA)
    const energyB = this.calculateEnergy(bufferB)

    const sampleRate = bufferA.sampleRate
    const overlapSamples = (overlapDurationMs / 1000) * sampleRate
    const overlapWindows = Math.floor(overlapSamples / this.windowSize)

    // Find minimum energy point in bufferA's tail within overlap window
    let minEnergy = Infinity
    let bestPoint = 0

    const startIdx = Math.max(0, energyA.length - overlapWindows)
    for (let i = startIdx; i < energyA.length; i++) {
      if (energyA[i] < minEnergy) {
        minEnergy = energyA[i]
        bestPoint = i * this.windowSize
      }
    }

    // Calculate spectral similarity
    const similarity = this.calculateSpectralSimilarity(energyA, energyB)

    return { point: bestPoint, similarity }
  }

  calculateSpectralSimilarity(
    energyA: Float32Array,
    energyB: Float32Array
  ): number {
    const minLen = Math.min(energyA.length, energyB.length)
    let sumDiff = 0

    for (let i = 0; i < minLen; i++) {
      sumDiff += Math.abs(energyA[i] - energyB[i])
    }

    const avgDiff = sumDiff / minLen
    return 1 - Math.min(avgDiff, 1)
  }

  // Find the best transition point where both tracks have similar energy levels
  findSmoothTransitionPoint(
    bufferA: AudioBuffer,
    bufferB: AudioBuffer,
    durationMs: number
  ): number {
    const energyA = this.calculateEnergy(bufferA)
    const energyB = this.calculateEnergy(bufferB)

    const sampleRate = bufferA.sampleRate
    const durationSamples = (durationMs / 1000) * sampleRate
    const durationWindows = Math.floor(durationSamples / this.windowSize)

    // Look at the tail of bufferA and head of bufferB
    const tailStartIdx = Math.max(0, energyA.length - durationWindows)
    const headEndIdx = Math.min(energyB.length, durationWindows)

    let bestScore = -Infinity
    let bestIdx = 0

    for (let i = tailStartIdx; i < energyA.length; i++) {
      const j = i - tailStartIdx
      if (j >= headEndIdx) break

      // Score based on low energy in both tracks at the transition point
      const score = 1 / (energyA[i] + energyB[j] + 0.001)
      if (score > bestScore) {
        bestScore = score
        bestIdx = i * this.windowSize
      }
    }

    return bestIdx
  }
}

export default CrossfadeAnalyzer
