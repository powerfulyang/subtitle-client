'use client'

import type { CustomFont } from '@/lib/ffmpeg'
import JASSUB from 'jassub'
import modernWasmUrl from 'jassub/dist/wasm/jassub-worker-modern.wasm?url'
import wasmUrl from 'jassub/dist/wasm/jassub-worker.wasm?url'
import workerUrl from 'jassub/dist/worker/worker.js?worker&url'
import { useCallback, useEffect, useImperativeHandle, useRef } from 'react'

// ── Types ──────────────────────────────────────────────────────────

export interface VideoStageRef {
  seekTo: (time: number) => void
  play: () => void
  pause: () => void
}

interface VideoStageProps {
  mediaUrl: string
  mediaKind: 'video'
  /** Pre-generated ASS subtitle content. Empty string = no subtitles. */
  assContent: string
  onTimeUpdate?: (time: number) => void
  onDurationChange?: (duration: number) => void
  customFont?: CustomFont | null
}

// ── Component ──────────────────────────────────────────────────────

export function VideoStage({
  mediaUrl,
  mediaKind,
  assContent,
  onTimeUpdate,
  onDurationChange,
  customFont,
  ref,
}: VideoStageProps & { ref?: React.Ref<VideoStageRef> }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const jassubRef = useRef<any>(null)
  const initPromiseRef = useRef<Promise<void> | null>(null)
  const lastContentRef = useRef('')
  const lastFontRef = useRef('')
  const rafRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)

  // ── Imperative video controls ──────────────────────────────────

  useImperativeHandle(ref, () => ({
    seekTo: (time: number) => {
      if (videoRef.current) {
        videoRef.current.currentTime = time
      }
    },
    play: () => void videoRef.current?.play(),
    pause: () => void videoRef.current?.pause(),
  }))

  // ── JASSUB lifecycle: react to assContent or font changes ──────────

  const destroyJassub = useCallback(async () => {
    if (jassubRef.current) {
      console.log('[JASSUB] Destroying instance')
      await jassubRef.current?.destroy()
      jassubRef.current = null
      lastContentRef.current = ''
      lastFontRef.current = ''
    }
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video || mediaKind !== 'video')
      return

    if (!assContent) {
      void destroyJassub()
      return
    }

    const fontKey = customFont ? `${customFont.name}-${customFont.fileName}` : 'no-font'

    const sync = async () => {
      // Serialize: wait for any in-progress initialization
      if (initPromiseRef.current) {
        try {
          await initPromiseRef.current
        }
        catch { /* ignore */ }
      }

      // Nothing changed → skip
      if (assContent === lastContentRef.current
        && fontKey === lastFontRef.current
        && jassubRef.current?.renderer) {
        console.log('[JASSUB] Nothing changed, skipping')
        return
      }

      // Content-only change with existing renderer → fast-path via setTrack
      if (jassubRef.current?.renderer) {
        if (fontKey !== lastFontRef.current) {
          console.log('[JASSUB] Font changed, updating via addFonts')
          const buffer = await customFont?.blob.arrayBuffer()
          if (buffer) {
            await jassubRef.current.renderer.addFonts([new Uint8Array(buffer)])
            // fixme 清理旧字体
            lastFontRef.current = fontKey
          }
        }
        await jassubRef.current.renderer.setTrack(assContent)
        lastContentRef.current = assContent
        if (jassubRef.current._lastDemandTime) {
          await jassubRef.current._demandRender()
        }
        return
      }

      // Full (re-)initialization
      await destroyJassub()

      initPromiseRef.current = (async () => {
        try {
          console.log('[JASSUB] Initializing')
          const buffer = await customFont?.blob.arrayBuffer()

          const instance = new JASSUB({
            video,
            subContent: assContent,
            fonts: buffer ? [new Uint8Array(buffer)] : [],
            workerUrl,
            wasmUrl,
            modernWasmUrl,
          })
          await instance.ready

          console.log('[JASSUB] Initialized successfully')
          jassubRef.current = instance
          lastContentRef.current = assContent
          lastFontRef.current = fontKey
        }
        catch (err) {
          console.error('[JASSUB] Init failed:', err)
          jassubRef.current = null
        }
        finally {
          initPromiseRef.current = null
        }
      })()

      await initPromiseRef.current
    }

    const isDevFirstBootstrap
      = import.meta.env.DEV
        && !jassubRef.current
        && !initPromiseRef.current
        && !lastContentRef.current

    if (!isDevFirstBootstrap) {
      void sync()
      return
    }

    // In React StrictMode (dev), first mount is intentionally torn down.
    // Delay bootstrap by one macrotask so the fake mount can be cancelled.
    const timer = window.setTimeout(() => {
      void sync()
    }, 0)

    return () => {
      window.clearTimeout(timer)
    }
  }, [assContent, destroyJassub, customFont, mediaKind])

  useEffect(() => {
    return () => {
      void destroyJassub()
    }
  }, [destroyJassub])

  // ── Time updates → notify parent ──────────────────────────────

  useEffect(() => {
    const video = videoRef.current
    if (!video)
      return

    const handleTimeUpdate = () => {
      if (rafRef.current)
        cancelAnimationFrame(rafRef.current)

      rafRef.current = requestAnimationFrame(() => {
        const t = video.currentTime
        if (Math.abs(t - lastTimeRef.current) > 0.05) {
          lastTimeRef.current = t
          onTimeUpdate?.(t)
        }
      })
    }

    video.addEventListener('timeupdate', handleTimeUpdate)

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate)
      if (rafRef.current)
        cancelAnimationFrame(rafRef.current)
    }
  }, [onTimeUpdate])

  useEffect(() => {
    const video = videoRef.current
    if (!video)
      return

    const handleLoadedMetadata = () => {
      onDurationChange?.(Number.isFinite(video.duration) ? video.duration : 0)
    }

    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
    }
  }, [onDurationChange])

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
      <video
        ref={videoRef}
        src={mediaUrl}
        controls
        className="max-w-full max-h-full object-contain"
      />
    </div>
  )
}
