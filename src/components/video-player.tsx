'use client';

import { Subtitle } from '@/lib/srt-parser';
import { AssStyles, DEFAULT_ASS_STYLES, generateAss } from '@/lib/ass-utils';
import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

interface VideoPlayerProps {
  videoUrl: string;
  onTimeUpdate?: (time: number) => void;
  subtitles?: Subtitle[];
  styles?: AssStyles;
  customFont?: { blob: Blob; name: string };
}

export interface VideoPlayerRef {
  seekTo: (time: number) => void;
  play: () => void;
  pause: () => void;
}

const VideoPlayer = forwardRef<VideoPlayerRef, VideoPlayerProps>(({
  videoUrl,
  onTimeUpdate,
  subtitles = [],
  styles = DEFAULT_ASS_STYLES,
  customFont
}, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const jassubRef = useRef<any>(null);
  const rafRef = useRef<number>(0);
  const lastUpdateRef = useRef<number>(0);

  useImperativeHandle(ref, () => ({
    seekTo: (time: number) => {
      if (videoRef.current) {
        videoRef.current.currentTime = time;
        videoRef.current.play();
      }
    },
    play: () => {
      if (videoRef.current) {
        videoRef.current.play();
      }
    },
    pause: () => {
      if (videoRef.current) {
        videoRef.current.pause();
      }
    }
  }));

  // Initialize jassub when video is ready
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Wait for video metadata to be loaded before initializing jassub
    const initJassub = async () => {
      if (jassubRef.current) {
        jassubRef.current.destroy();
      }

      try {
        // Dynamically import jassub only on client-side
        const { default: JASSUB } = await import('jassub');

        console.log('[JASSUB] Initializing with paths:', {
          workerUrl: '/jassub/jassub-worker.js',
          wasmUrl: '/jassub/jassub-worker.wasm',
          legacyWasmUrl: '/jassub/jassub-worker.wasm.js',
          modernWasmUrl: '/jassub/jassub-worker-modern.wasm'
        });

        jassubRef.current = new JASSUB({
          video,
          workerUrl: '/jassub/jassub-worker.js',
          wasmUrl: '/jassub/jassub-worker.wasm',
          legacyWasmUrl: '/jassub/jassub-worker.wasm.js',
          modernWasmUrl: '/jassub/jassub-worker-modern.wasm',
          // Performance options
          prescaleFactor: 1.0,
          targetFps: 24,
          maxRenderHeight: 1080,
          // Font options
          useLocalFonts: false,
          availableFonts: {
            'liberation sans': '/jassub/default.woff2'
          },
          fallbackFont: 'liberation sans'
        });

        console.log('[JASSUB] Initialized successfully');
      } catch (err) {
        console.error('[JASSUB] Failed to initialize:', err);
      }
    };

    if (video.readyState >= 1) {
      // Metadata already loaded
      initJassub();
    } else {
      video.addEventListener('loadedmetadata', initJassub, { once: true });
    }

    return () => {
      if (jassubRef.current) {
        jassubRef.current.destroy();
        jassubRef.current = null;
      }
    };
  }, [videoUrl, customFont]);

  // Update subtitles when they change
  useEffect(() => {
    if (!jassubRef.current) return;

    if (subtitles.length === 0) {
      // Clear subtitles
      console.log('[JASSUB] Clearing subtitles');
      jassubRef.current.freeTrack();
    } else {
      // Convert SRT subtitles to ASS format and set them
      const assContent = generateAss(subtitles, styles);
      console.log('[JASSUB] Setting track with ASS content:', {
        subtitleCount: subtitles.length,
        assLength: assContent.length,
        assPreview: assContent.substring(0, 500)
      });

      try {
        jassubRef.current.setTrack(assContent);
        console.log('[JASSUB] Track set successfully');
      } catch (err) {
        console.error('[JASSUB] Failed to set track:', err);
      }
    }
  }, [subtitles, styles]);

  // Handle custom font loading
  useEffect(() => {
    if (!customFont || !jassubRef.current) return;

    // Convert Blob to Uint8Array and add font to jassub
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result && jassubRef.current) {
        const uint8Array = new Uint8Array(reader.result as ArrayBuffer);
        jassubRef.current.addFont(uint8Array);
      }
    };
    reader.readAsArrayBuffer(customFont.blob);
  }, [customFont]);

  // Handle time updates for parent component
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }

      rafRef.current = requestAnimationFrame(() => {
        const time = video.currentTime;
        // Update roughly every frame for smooth subtitle sync
        if (Math.abs(time - lastUpdateRef.current) > 0.05) {
          lastUpdateRef.current = time;
          onTimeUpdate?.(time);
        }
      });
    };

    video.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [onTimeUpdate]);

  return (
    <div className="relative w-full flex items-center justify-center bg-transparent group">
      <div className="w-full aspect-video">
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          className="h-full w-full"
        />
      </div>
    </div>
  );
});

VideoPlayer.displayName = 'VideoPlayer';

export default VideoPlayer;
