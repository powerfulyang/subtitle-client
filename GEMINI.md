# Gemini Context: Subtitle Client

This `GEMINI.md` file provides essential context and instructions for working on the `subtitle-client` project.

## Project Overview

**Subtitle Client** is an AI-powered web application for generating and editing video subtitles. It leverages client-side processing (FFmpeg.wasm) to extract audio from videos and sends it to an external AI service (likely Whisper) for transcription. The interface provides a synchronized video player and subtitle editor for real-time adjustments.

### Key Features
*   **Client-Side Audio Extraction:** Uses FFmpeg.wasm to extract audio in the browser, reducing server bandwidth usage.
*   **AI Transcription:** Integrates with backend GPU/CPU services to generate subtitles from audio.
*   **Real-time Editing:** Interactive subtitle editor synchronized with a custom video player.
*   **Resilient Architecture:** Implements a fallback mechanism for transcription services (GPU primary -> CPU backup).

## Tech Stack

*   **Framework:** Next.js 15 (App Router)
*   **Language:** TypeScript
*   **UI Library:** React 19
*   **Styling:** Tailwind CSS 4, Framer Motion (animations), Lucide React (icons)
*   **Media Processing:** `@ffmpeg/ffmpeg` (Wasm), `@ffmpeg/core-mt` (Multi-threaded)
*   **HTTP Client:** `ky`
*   **Package Manager:** `pnpm` (recommended)

## Architecture & Data Flow

### 1. Audio Extraction (Client-Side)
Located in `src/lib/ffmpeg.ts`.
*   **Process:** When a user selects a video, the browser loads `ffmpeg.wasm`.
*   **Strategy:**
    1.  **Direct Copy:** Attempts `ffmpeg -i input -map 0:a -acodec copy output.m4a` first to preserve quality and speed.
    2.  **Fallback Re-encode:** If copy fails, re-encodes to AAC (`-acodec aac -b:a 256k`).
*   **Output:** Generates a `Blob` (audio/mp4) sent to the API.

### 2. Transcription API
*   **Primary Route:** Client POSTs to `/api/transcribe` (Next.js API Route).
    *   The Next.js API acts as a proxy to the GPU server defined in `SERVER_PREFIX` / `TRANSCRIBE_API_URL`.
*   **Fallback Route:** If the primary request fails, the **client** (`src/app/page.tsx`) catches the error and directly requests the backup CPU server (`BACKUP_TRANSCRIBE_API_URL`).

### 3. State Management
*   Managed locally in `src/app/page.tsx` using `useState`.
*   **Key States:**
    *   `videoUrl`: Object URL of the uploaded file.
    *   `subtitles`: Array of `Subtitle` objects (parsed from SRT).
    *   `currentTime`: synchronized playback time.

## Key Files & Directories

*   **`src/app/page.tsx`**: Main entry point. Handles file upload, coordinates audio extraction, manages transcription state, and renders the player/editor layout.
*   **`src/lib/ffmpeg.ts`**: Singleton wrapper for FFmpeg. Handles WASM loading and audio extraction logic.
*   **`src/app/api/transcribe/route.ts`**: Proxy route for the primary transcription service.
*   **`src/lib/srt-parser.ts`**: Utilities for parsing SRT strings into JSON and stringifying them back.
*   **`src/components/`**:
    *   `video-player.tsx`: Custom player with subtitle overlay and binary search for subtitle syncing.
    *   `subtitle-editor.tsx`: List view for editing subtitle text and timing.
*   **`public/ffmpeg/`**: Contains the FFmpeg WASM binaries (`ffmpeg-core.js`, `.wasm`, `.worker.js`) copied during the build process.

## Development

### Setup & Run
```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev
# App runs at http://localhost:3000
```

### Build
```bash
# Build for production
pnpm build

# Start production server
pnpm start
```

### Docker
The project includes a `Dockerfile` for containerized deployment, using a multi-stage build (deps -> builder -> runner) and Next.js standalone output.

## Conventions

*   **Styling:** Use Tailwind utility classes. The design uses a "glass-morphism" dark theme with gradients and semi-transparent backgrounds.
*   **Components:** Prefer functional components with strict TypeScript typing.
*   **Async/Await:** Use `async/await` for asynchronous operations (FFmpeg, API calls).
*   **Error Handling:** gracefully handle FFmpeg failures and API errors (using `react-toastify` for user feedback).

## Common Issues / Notes
*   **FFmpeg Headers:** `SharedArrayBuffer` requires specific HTTP headers (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`). These are configured in `next.config.mjs` (verify if you encounter WASM errors).
*   **CORS:** The backup transcription server is called directly from the browser, so it must support CORS.
*   **Performance:** The video player uses `requestAnimationFrame` for smooth time updates. Subtitle lookups use binary search for efficiency.
