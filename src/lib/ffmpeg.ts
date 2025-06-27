import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import {toast} from "react-toastify";

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

  return ffmpeg;
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
      'output.m4a'          // M4A 容器支持大多数音频编码（AAC、MP3等）
    ]);
    
    const data = await ffmpeg.readFile('output.m4a');
    return new Blob([data], { type: 'audio/mp4' });
    
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
        'output.m4a'
      ]);

      const data = await ffmpeg.readFile('output.m4a');
      return new Blob([data], { type: 'audio/mp4' });
    } catch (err) {
      console.error('备选方案也失败了:', err);
    }
  }
}
