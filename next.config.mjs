
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
          // Copy JASSUB worker and wasm files specifically
          {
            from: path.join(__dirname, 'node_modules', 'jassub', 'dist', 'jassub-worker.js'),
            to: path.join(__dirname, 'public', 'jassub', 'jassub-worker.js'),
          },
          {
            from: path.join(__dirname, 'node_modules', 'jassub', 'dist', 'jassub-worker.wasm'),
            to: path.join(__dirname, 'public', 'jassub', 'jassub-worker.wasm'),
          },
          {
            from: path.join(__dirname, 'node_modules', 'jassub', 'dist', 'jassub-worker.wasm.js'),
            to: path.join(__dirname, 'public', 'jassub', 'jassub-worker.wasm.js'),
          },
          {
            from: path.join(__dirname, 'node_modules', 'jassub', 'dist', 'jassub-worker-modern.wasm'),
            to: path.join(__dirname, 'public', 'jassub', 'jassub-worker-modern.wasm'),
          },
          {
            from: path.join(__dirname, 'node_modules', 'jassub', 'dist', 'default.woff2'),
            to: path.join(__dirname, 'public', 'jassub', 'default.woff2'),
          },
        ],
      })
    );

    return config;
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'require-corp',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
