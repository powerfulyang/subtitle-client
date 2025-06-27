
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

  return ffmpeg;
}

export async function extractAudio(videoFile: File) {
  const ffmpeg = await getFFmpeg();
  await ffmpeg.writeFile('input.mp4', await fetchFile(videoFile));
  await ffmpeg.exec(['-i', 'input.mp4', '-vn', '-acodec', 'libmp3lame', 'output.mp3']);
  const data = await ffmpeg.readFile('output.mp3');
  return new Blob([data], { type: 'audio/mp3' });
}
