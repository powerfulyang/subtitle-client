import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

const CORE_MT_BASE_URL = 'https://file.powerfulyang.com/ffmpeg-mt'

let ffmpegPromise: Promise<FFmpeg> | null = null

async function getFFmpeg() {
  if (ffmpegPromise)
    return ffmpegPromise

  ffmpegPromise = (async () => {
    try {
      const ffmpeg = new FFmpeg()
      const [coreURL, wasmURL, workerURL] = await Promise.all([
        toBlobURL(`${CORE_MT_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
        toBlobURL(`${CORE_MT_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
        toBlobURL(`${CORE_MT_BASE_URL}/ffmpeg-core.worker.js`, 'text/javascript'),
      ])
      await ffmpeg.load({
        coreURL,
        wasmURL,
        workerURL,
      })
      return ffmpeg
    }
    catch (error) {
      ffmpegPromise = null
      throw error
    }
  })()

  return ffmpegPromise
}

export interface CustomFont {
  blob: Blob
  name: string
  fileName: string
}

let isProcessing = false

export async function burnSubtitlesIntoVideo(
  videoFile: File,
  assContent: string,
  customFont: CustomFont | null,
  onProgress?: (value: number) => void,
) {
  if (isProcessing) {
    throw new Error('A burning process is already in progress.')
  }

  isProcessing = true
  try {
    const ffmpeg = await getFFmpeg()
    const inputName = 'input.mp4'
    const subtitleName = 'subtitles.ass'
    const outputName = 'output.mp4'

    const progressHandler = ({ progress }: { progress: number }) => {
      if (Number.isFinite(progress)) {
        onProgress?.(Math.max(0, Math.min(100, Math.round(progress * 100))))
      }
    }

    ffmpeg.on('progress', progressHandler)

    try {
      await ffmpeg.writeFile(inputName, await fetchFile(videoFile))
      console.log(assContent)
      await ffmpeg.writeFile(subtitleName, assContent)

      if (customFont) {
        await ffmpeg.writeFile(customFont.fileName, await fetchFile(customFont.blob))
      }
      else if (typeof window !== 'undefined' && 'queryLocalFonts' in window) {
        try {
          // 尝试从 ASS 内容中提取字体名称（提取 Default 样式的字体）
          const fontNameMatch = assContent.match(/^Style:\s*Default,\s*([^,]+)/m)
          const targetFontName = fontNameMatch ? fontNameMatch[1].trim() : null

          if (targetFontName) {
            const localFonts = await (window as any).queryLocalFonts() as any[]
            // 寻找匹配的字体家族或全名
            const foundFont = localFonts.find(f =>
              f.family.toLowerCase() === targetFontName.toLowerCase()
              || f.fullName.toLowerCase() === targetFontName.toLowerCase(),
            )

            if (foundFont) {
              const blob = await foundFont.blob()
              const fileName = `${foundFont.postscriptName || foundFont.family}.ttf`
              await ffmpeg.writeFile(fileName, await fetchFile(blob))
            }
          }
        }
        catch (error) {
          console.warn('Failed to fetch font from Local Font API:', error)
        }
      }

      const threads = Math.min(navigator.hardwareConcurrency || 4, 8)
      const code = await ffmpeg.exec([
        '-i',
        inputName,
        '-vf',
        `ass=${subtitleName}:fontsdir=.`,
        '-c:a',
        'copy',
        '-preset',
        'ultrafast',
        '-threads',
        String(threads),
        outputName,
      ])

      if (code !== 0) {
        throw new Error(`FFmpeg exited with code ${code}`)
      }

      const data = await ffmpeg.readFile(outputName)
      return new Blob([data as unknown as ArrayBuffer], { type: 'video/mp4' })
    }
    finally {
      ffmpeg.off('progress', progressHandler)
    }
  }
  finally {
    isProcessing = false
  }
}
