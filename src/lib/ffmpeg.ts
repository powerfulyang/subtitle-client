import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null;

const CORE_URL = '/ffmpeg/ffmpeg-core.js';
const WASM_URL = '/ffmpeg/ffmpeg-core.wasm';
const WORKER_URL = '/ffmpeg/ffmpeg-core.worker.js';

export async function getFFmpeg() {
  if (ffmpeg) {
    return ffmpeg;
  }

  ffmpeg = new FFmpeg();

  await ffmpeg.load({
    coreURL: await toBlobURL(CORE_URL, 'text/javascript'),
    wasmURL: await toBlobURL(WASM_URL, 'application/wasm'),
    workerURL: await toBlobURL(WORKER_URL, 'text/javascript'),
  });
  
  // log
  ffmpeg.on('log', (e) => {
    console.log(e)
  })

  return ffmpeg;
}

export async function burnSubtitles(
  videoFile: File,
  assContent: string,
  onProgress?: (progress: number) => void,
  customFont?: { blob: Blob; name: string; fileName: string }
) {
  const ffmpeg = await getFFmpeg();

  // Progress handling - clamp to 0-100 and filter invalid values
  const progressHandler = ({ progress }: { progress: number }) => {
    if (onProgress && !isNaN(progress) && progress >= 0) {
      const percent = Math.min(100, Math.max(0, Math.round(progress * 100)));
      onProgress(percent);
    }
  };
  ffmpeg.on('progress', progressHandler);

  try {
    const inputName = 'input.mp4';
    const outputName = 'output.mp4';
    const subName = 'subtitles.ass';
    // Use custom font filename or default
    const fontFileName = customFont ? customFont.fileName : 'youshe.ttf';

    // 1. Write video and ASS subtitles
    await ffmpeg.writeFile(inputName, await fetchFile(videoFile));
    await ffmpeg.writeFile(subName, assContent);

    // 2. Write font
    if (customFont) {
      await ffmpeg.writeFile(fontFileName, await fetchFile(customFont.blob));
    } else {
      // Use default YOUSHEhaoshenti font
      const fontUrl = '/jassub/youshe.ttf';
      await ffmpeg.writeFile(fontFileName, await fetchFile(fontUrl));
    }

    // 3. Execute burn command - ASS already contains all styling
    await ffmpeg.exec([
      '-i', inputName,
      '-vf', `ass=${subName}:fontsdir=/`,
      '-c:a', 'copy', // Copy audio stream (fast)
      '-preset', 'ultrafast', // Fast encoding for WASM
      "-threads", "4", // 必须使用，多线程的 ffmpeg wasm 有 BUG，不设置就报错
      outputName
    ]);

    // 4. Read output
    const data = await ffmpeg.readFile(outputName);
    return new Blob([data as unknown as ArrayBuffer], { type: 'video/mp4' });

  } finally {
    ffmpeg.off('progress', progressHandler);
    // Cleanup files could be done here:
    // try { await ffmpeg.deleteFile('input.mp4'); } catch(e) {}
  }
}

export async function extractAudio(videoFile: File) {
  const ffmpeg = await getFFmpeg();
  
  await ffmpeg.writeFile(`input`, await fetchFile(videoFile));
  
  try {
    // 首先尝试使用 -acodec copy 来保留原始音质
    // 使用 -map 0:a 选择所有音频流
    await ffmpeg.exec([
      '-i', `input`,
      '-map', '0:a',        // 选择所有音频流
      '-vn',                // 去除视频流
      '-acodec', 'copy',    // 复制音频流而不重新编码，保留原始质量
      // "-threads", "4",      // 必须使用，多线程的 ffmpeg wasm 有 BUG，不设置就报错
      'output.m4a'          // M4A 容器支持大多数音频编码（AAC、MP3等）
    ]);
    
    const data = await ffmpeg.readFile('output.m4a');
    return new Blob([data as unknown as ArrayBuffer], { type: 'audio/mp4' });
    
  } catch (error) {
    console.error('直接复制音频流失败，尝试使用高质量重新编码作为备选方案:', error);
    
    try {
      // 如果直接复制失败（可能是不兼容的编码格式），
      // 使用高质量AAC重新编码作为备选方案
      await ffmpeg.exec([
        '-i', `input`,
        '-vn',                    // 去除视频流
        '-map', '0:a',            // 选择所有音频流
        '-acodec', 'aac',         // 使用AAC编码
        '-b:a', '256k',           // 高比特率以保持质量
        '-ar', '48000',           // 高采样率
        // "-threads", "4",
        'output.m4a'
      ]);

      const data = await ffmpeg.readFile('output.m4a');
      return new Blob([data as unknown as ArrayBuffer], { type: 'audio/mp4' });
    } catch (err) {
      console.error('备选方案也失败了:', err);
    }
  }
}
