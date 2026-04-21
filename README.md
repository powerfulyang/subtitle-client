# Subtitle Studio SPA

Cloudflare Pages 友好的纯前端字幕编辑器。基于 `Vite + React 19 + TypeScript + Tailwind CSS 4 + Zustand`，支持：

- 浏览器内上传视频或音频文件
- 使用 `captureStream() + MediaRecorder` 在前端抽取音频
- 直连外部 Whisper API 生成 SRT
- 使用 `JASSUB` 实时预览 ASS 字幕
- 默认导出 SRT
- 仅在需要时懒加载 `FFmpeg.wasm` 导出硬字幕视频

## 快速开始

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

## 环境变量

```bash
VITE_BASE_URL=https://your-api-host.example.com
```

- `VITE_BASE_URL`：可选，API 基础地址。程序会自动拼接 `/api/whisper/generate_subtitle` 与 `/api/ass/convert`。

## 开发命令

```bash
pnpm dev
pnpm build
pnpm preview
pnpm lint
```

## Cloudflare Pages 部署

- Build command: `pnpm build`
- Output directory: `dist`
- Node version: 建议 `20+`

项目已包含 `public/_headers`，部署后会为所有资源加上：

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

这对多线程 `FFmpeg.wasm` 与 `JASSUB` 的运行环境很重要。