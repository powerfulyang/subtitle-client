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

  // Initialize jassub only when there's ASS content
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Track if this effect has been cancelled
    let cancelled = false;

    // Always destroy existing instance first when dependencies change
    if (jassubRef.current) {
      console.log('[JASSUB] Destroying existing instance before re-initialization');
      jassubRef.current.destroy();
      jassubRef.current = null;
    }

    // No subtitles - just return after destroying
    if (subtitles.length === 0) {
      console.log('[JASSUB] No subtitles, skipping initialization');
      return;
    }

    // Generate ASS content
    const assContent = generateAss(subtitles, styles);

    // Initialize jassub with ASS content and optional custom font
    const initJassub = async () => {
      // Check if effect was cancelled before async operations complete
      if (cancelled) {
        console.log('[JASSUB] Initialization cancelled');
        return;
      }

      // Double-check and destroy any existing instance
      if (jassubRef.current) {
        jassubRef.current.destroy();
        jassubRef.current = null;
      }

      try {
        // Dynamically import jassub only on client-side
        const { default: JASSUB } = await import('jassub');

        // Check again after async import
        if (cancelled) {
          console.log('[JASSUB] Initialization cancelled after import');
          return;
        }

        // Prepare JASSUB options
        const jassubOptions: any = {
          video,
          subContent: assContent,
          workerUrl: '/jassub/jassub-worker.js',
          wasmUrl: '/jassub/jassub-worker.wasm',
          legacyWasmUrl: '/jassub/jassub-worker.wasm.js',
          modernWasmUrl: '/jassub/jassub-worker-modern.wasm',
          fonts: ['/jassub/youshe.ttf']
        };

        // If custom font is provided, add it to availableFonts
        if (customFont) {
          const arrayBuffer = await customFont.blob.arrayBuffer();
          
          // Check again after async font reading
          if (cancelled) {
            console.log('[JASSUB] Initialization cancelled after font read');
            return;
          }

          const uint8Array = new Uint8Array(arrayBuffer);
          
          jassubOptions.fallbackFont = customFont.name;
          jassubOptions.useLocalFonts = false;
          jassubOptions.availableFonts = {
            [customFont.name.toLowerCase()]: uint8Array
          };

          console.log('[JASSUB] Initializing with custom font:', {
            fontName: customFont.name,
            subtitleCount: subtitles.length
          });
        } else {
          console.log('[JASSUB] Initializing with ASS content:', {
            subtitleCount: subtitles.length,
            assLength: assContent.length,
            assPreview: assContent.substring(0, 500)
          });
        }

        jassubRef.current = new JASSUB(jassubOptions);

        console.log('[JASSUB] Initialized successfully with subtitles');
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
      cancelled = true;
      // Remove event listener in case it hasn't fired yet
      video.removeEventListener('loadedmetadata', initJassub);
      
      if (jassubRef.current) {
        console.log('[JASSUB] Cleanup: destroying instance');
        jassubRef.current.destroy();
        jassubRef.current = null;
      }
    };
  }, [videoUrl, subtitles, styles, customFont]);

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
