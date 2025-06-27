
import CopyPlugin from 'copy-webpack-plugin';
import { fileURLToPath } from 'url';
import { codeInspectorPlugin } from 'code-inspector-plugin'
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  webpack: (config, { dev }) => {
    if (dev) {
      config.plugins.push(codeInspectorPlugin({ bundler: 'webpack' }))
    }

    // Copy FFmpeg files
    config.plugins.push(
      new CopyPlugin({
        patterns: [
          {
            from: path.join(__dirname, 'node_modules', '@ffmpeg', 'core-mt', 'dist', 'umd', 'ffmpeg-core.js'),
            to: path.join(__dirname, 'public', 'ffmpeg'),
          },
          {
            from: path.join(__dirname, 'node_modules', '@ffmpeg', 'core-mt', 'dist', 'umd', 'ffmpeg-core.wasm'),
            to: path.join(__dirname, 'public', 'ffmpeg'),
          },
          {
            from: path.join(__dirname, 'node_modules', '@ffmpeg', 'core-mt', 'dist', 'umd', 'ffmpeg-core.worker.js'),
            to: path.join(__dirname, 'public', 'ffmpeg'),
          },
        ],
      })
    );

    return config;
  },
};

export default nextConfig;
