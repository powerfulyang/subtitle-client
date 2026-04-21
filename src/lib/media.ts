export interface ExtractedAudio {
  blob: Blob
  fileName: string
  mimeType: string
}

export async function extractAudioFromMedia(file: File): Promise<ExtractedAudio> {
  const arrayBuffer = await file.arrayBuffer()
  const audioCtx = new (window.OfflineAudioContext || window.AudioContext)(1, 1, 16000)

  try {
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
    const blob = audioBufferToWav(audioBuffer)

    return {
      blob,
      mimeType: 'audio/wav',
      fileName: `${file.name.replace(/\.[^/.]+$/, '')}.wav`,
    }
  }
  catch (error) {
    console.error('Failed to decode audio data natively:', error)
    throw new Error('This media format is not supported for native audio extraction. Please try a different browser or file format.')
  }
}

/**
 * Converts an AudioBuffer to a WAV Blob.
 */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numOfChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const format = 1 // PCM
  const bitDepth = 16

  const numSamples = buffer.length * numOfChannels
  const blockAlign = numOfChannels * (bitDepth / 8)
  const byteRate = sampleRate * blockAlign
  const dataSize = numSamples * (bitDepth / 8)

  const bufferArr = new ArrayBuffer(44 + dataSize)
  const view = new DataView(bufferArr)

  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i))
    }
  }

  /* RIFF identifier */
  writeString(0, 'RIFF')
  /* RIFF chunk length */
  view.setUint32(4, 36 + dataSize, true)
  /* RIFF type */
  writeString(8, 'WAVE')
  /* format chunk identifier */
  writeString(12, 'fmt ')
  /* format chunk length */
  view.setUint32(16, 16, true)
  /* sample format (raw) */
  view.setUint16(20, format, true)
  /* channel count */
  view.setUint16(22, numOfChannels, true)
  /* sample rate */
  view.setUint32(24, sampleRate, true)
  /* byte rate (sample rate * block align) */
  view.setUint32(28, byteRate, true)
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, blockAlign, true)
  /* bits per sample */
  view.setUint16(34, bitDepth, true)
  /* data chunk identifier */
  writeString(36, 'data')
  /* data chunk length */
  view.setUint32(40, dataSize, true)

  const channels = []
  for (let i = 0; i < numOfChannels; i++) {
    channels.push(buffer.getChannelData(i))
  }

  let offset = 44
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numOfChannels; channel++) {
      let sample = channels[channel][i]
      sample = Math.max(-1, Math.min(1, sample))
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF
      view.setInt16(offset, sample, true)
      offset += 2
    }
  }

  return new Blob([bufferArr], { type: 'audio/wav' })
}
