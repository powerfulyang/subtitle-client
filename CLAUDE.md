# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an AI-powered subtitle editor built with Next.js 15, React 19, and TypeScript. The application allows users to upload video/audio files, automatically generate subtitles using AI transcription (Whisper API), and edit them in real-time with a synchronized video player.

## Key Technologies

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS 4, Framer Motion for animations
- **Audio Processing**: FFmpeg.wasm (multi-threaded) for client-side audio extraction
- **HTTP Client**: ky for API requests
- **UI Components**: Lucide React icons, custom glass-morphism design
- **Development**: Code Inspector Plugin for DOM-to-source mapping

## Development Commands

```bash
# Install dependencies (uses pnpm)
pnpm install

# Run development server (http://localhost:3000)
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Run linter
pnpm lint
```

## Architecture

### Client-Side Audio Processing Flow

1. User uploads video file → `FileUploader` component creates object URL
2. "AI生成字幕" button clicked → video blob fetched from object URL
3. FFmpeg.wasm extracts audio:
   - Primary: Copy audio stream directly (`-acodec copy`) to preserve quality
   - Fallback: Re-encode with high-quality AAC (256k bitrate, 48kHz) if copy fails
   - Output: M4A file (better compatibility than MP3)
4. Audio blob sent to transcription API with optional vocal separation

### API Architecture

The app uses a **two-tier fallback system** for transcription:

1. Primary: `/api/transcribe` Next.js API route → forwards to GPU server at `TRANSCRIBE_API_URL`
2. Fallback: Direct client call to `BACKUP_TRANSCRIBE_API_URL` (CPU server) if primary fails

**Important**: External API endpoints are defined in `src/constants/index.ts`:
- `SERVER_PREFIX`: Primary GPU server endpoint
- `BACKUP_SERVER_PREFIX`: Backup CPU server endpoint
- Both append `/whisper/generate_subtitle` for the full URL

### Component Structure

**Main Page** (`src/app/page.tsx`):
- Central orchestrator managing video state, subtitles, and transcription flow
- Handles file selection, subtitle generation, time synchronization
- Features vocal separation toggle for better transcription accuracy

**FileUploader** (`src/components/file-uploader.tsx`):
- Drag-and-drop and click-to-upload functionality
- Accepts video/audio files
- Creates object URLs for immediate playback

**VideoPlayer** (`src/components/video-player.tsx`):
- Custom video player with subtitle overlay
- Exposes ref methods: `seekTo()`, `play()`, `pause()`
- Uses RAF (requestAnimationFrame) for optimized time updates (>0.1s threshold)
- Binary search for efficient subtitle lookup during playback

**SubtitleEditor** (`src/components/subtitle-editor.tsx`):
- Real-time subtitle editing with auto-scroll to active subtitle
- Binary search for O(log n) active subtitle detection
- SRT export functionality with timestamp-based filename
- Character count and playback status indicators

### SRT Parser (`src/lib/srt-parser.ts`)

- `parseSrt()`: Converts SRT string to `Subtitle[]` array
- `stringifySrt()`: Converts `Subtitle[]` back to SRT format
- Handles malformed SRT gracefully by skipping invalid blocks

### FFmpeg Integration (`src/lib/ffmpeg.ts`)

- Lazy-loads FFmpeg.wasm from `/public/ffmpeg/` (copied via webpack)
- Singleton pattern: `getFFmpeg()` returns cached instance
- Uses multi-threaded core (`@ffmpeg/core-mt`) for better performance
- Two-stage extraction: direct copy first, high-quality re-encode as fallback

### Webpack Configuration (`next.config.mjs`)

The webpack config copies FFmpeg WASM files from `node_modules/@ffmpeg/core-mt/dist/umd/` to `public/ffmpeg/`:
- `ffmpeg-core.js`
- `ffmpeg-core.wasm`
- `ffmpeg-core.worker.js`

These files must be in `public/` because FFmpeg.wasm loads them via HTTP fetch.

## Docker Deployment

The Dockerfile uses multi-stage builds for optimization:

1. **deps**: Installs dependencies with pnpm
2. **builder**: Builds Next.js app with `output: 'standalone'` mode
3. **runner**: Minimal production image with only runtime files

Note: `output: 'standalone'` in `next.config.mjs` creates a self-contained `server.js` with all dependencies bundled.

## Performance Optimizations

1. **Binary Search**: Both VideoPlayer and SubtitleEditor use binary search for O(log n) subtitle lookup instead of O(n) linear search
2. **RAF Throttling**: VideoPlayer batches time updates using requestAnimationFrame and only triggers updates when time changes >0.1s
3. **React Optimization**: Uses `useCallback`, `useMemo`, and `forwardRef` to minimize re-renders
4. **Audio Quality**: Prioritizes audio stream copying over re-encoding to preserve quality and reduce processing time

## State Management

The app uses React state for all data management (no Redux/Zustand):

- `videoUrl`: Object URL for video playback
- `subtitles`: Array of subtitle objects synchronized between VideoPlayer and SubtitleEditor
- `currentTime`: Shared time state for highlighting active subtitle
- `isGenerating`: Loading state for transcription
- `enableVocalSeparation`: Toggle for vocal isolation (improves transcription of music/noisy videos)

## API Request Format

The transcription endpoint expects:
- **Method**: POST with `multipart/form-data`
- **Fields**:
  - `file`: Audio blob (MP3/M4A)
  - `enable_vocal_separation`: String boolean ("true"/"false")
- **Response**: JSON with `{ srt_content: string }`

## Styling Patterns

The app uses a **glass-morphism dark theme** with:
- Gradient backgrounds (`from-slate-900 via-gray-900 to-slate-800`)
- Frosted glass cards (`.glass-card` class with `backdrop-filter: blur()`)
- Animated gradient accents (blue-purple theme)
- Framer Motion for micro-interactions (hover, tap, page transitions)

## CI/CD

GitHub Actions workflow (`.github/workflows/docker-image.yml`):
- Triggers on push to `master` or manual dispatch
- Builds multi-arch Docker image using BuildX
- Publishes to GitHub Container Registry (`ghcr.io`)
- Generates artifact attestation for supply chain security
- Uses GitHub Actions cache for faster builds

## Common Gotchas

1. **FFmpeg Files Missing**: If FFmpeg fails to load, check that webpack copied files to `public/ffmpeg/` during build
2. **CORS Issues**: The transcription API must have proper CORS headers since requests come from browser
3. **Audio Extraction Failure**: Some video codecs may fail both direct copy and AAC re-encode; ensure ffmpeg.wasm supports the input format
4. **Memory Leaks**: Always revoke object URLs with `URL.revokeObjectURL()` when changing videos
5. **Subtitle Timing**: SRT format uses `HH:MM:SS,mmm` (comma for milliseconds), not periods
