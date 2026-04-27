'use client'

import type { CustomFont } from '@/lib/ffmpeg'
import { Button, Flex, Select, Slider, Tooltip } from 'antd'
import JASSUB from 'jassub'
import modernWasmUrl from 'jassub/dist/wasm/jassub-worker-modern.wasm?url'
import wasmUrl from 'jassub/dist/wasm/jassub-worker.wasm?url'
import workerUrl from 'jassub/dist/worker/worker.js?worker&url'
import { Maximize, Pause, Play, Volume2, VolumeX } from 'lucide-react'
import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'

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

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]
const PLAYBACK_RATE_OPTIONS = PLAYBACK_RATES.map(rate => ({
  value: rate,
  label: `${rate}x`,
}))

function formatControlTime(seconds: number) {
  if (!Number.isFinite(seconds))
    return '00:00'

  const safeSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const remain = safeSeconds % 60

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remain).padStart(2, '0')}`
  }

  return `${String(minutes).padStart(2, '0')}:${String(remain).padStart(2, '0')}`
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function resolveTimeFromClientX(clientX: number, element: HTMLElement, duration: number) {
  if (!duration)
    return 0

  const rect = element.getBoundingClientRect()
  const ratio = clamp((clientX - rect.left) / Math.max(rect.width, 1), 0, 1)
  return ratio * duration
}

function getBufferedEnd(video: HTMLVideoElement) {
  const { buffered, currentTime } = video
  if (buffered.length === 0)
    return 0

  for (let index = 0; index < buffered.length; index += 1) {
    const start = buffered.start(index)
    const end = buffered.end(index)
    if (currentTime >= start && currentTime <= end)
      return end
  }

  return buffered.end(buffered.length - 1)
}

interface VideoProgressProps {
  currentTime: number
  duration: number
  bufferedEnd: number
  onSeek: (time: number) => void
}

function VideoProgress({ currentTime, duration, bufferedEnd, onSeek }: VideoProgressProps) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const safeDuration = Math.max(duration, 0)
  const progressPercent = safeDuration > 0 ? clamp((currentTime / safeDuration) * 100, 0, 100) : 0
  const bufferedPercent = safeDuration > 0 ? clamp((bufferedEnd / safeDuration) * 100, 0, 100) : 0
  const hoverPercent = hoverTime !== null && safeDuration > 0 ? clamp((hoverTime / safeDuration) * 100, 0, 100) : 0

  const seekFromClientX = (clientX: number) => {
    const track = trackRef.current
    if (!track || safeDuration <= 0)
      return

    const nextTime = resolveTimeFromClientX(clientX, track, safeDuration)
    setHoverTime(nextTime)
    onSeek(nextTime)
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (safeDuration <= 0)
      return

    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setIsScrubbing(true)
    seekFromClientX(event.clientX)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const track = trackRef.current
    if (!track || safeDuration <= 0)
      return

    const nextTime = resolveTimeFromClientX(event.clientX, track, safeDuration)
    setHoverTime(nextTime)

    if (isScrubbing)
      onSeek(nextTime)
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)

    setIsScrubbing(false)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (safeDuration <= 0)
      return

    const step = event.shiftKey ? 5 : 0.5
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      onSeek(clamp(currentTime - step, 0, safeDuration))
    }
    else if (event.key === 'ArrowRight') {
      event.preventDefault()
      onSeek(clamp(currentTime + step, 0, safeDuration))
    }
    else if (event.key === 'Home') {
      event.preventDefault()
      onSeek(0)
    }
    else if (event.key === 'End') {
      event.preventDefault()
      onSeek(safeDuration)
    }
  }

  return (
    <div
      ref={trackRef}
      className={`video-progress-scrubber ${isScrubbing ? 'video-progress-scrubber-active' : ''}`}
      role="slider"
      tabIndex={0}
      aria-label="视频进度"
      aria-valuemin={0}
      aria-valuemax={Math.round(safeDuration)}
      aria-valuenow={Math.round(clamp(currentTime, 0, safeDuration))}
      aria-valuetext={`${formatControlTime(currentTime)} / ${formatControlTime(safeDuration)}`}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={() => {
        if (!isScrubbing)
          setHoverTime(null)
      }}
    >
      <span className="video-progress-track">
        <span className="video-progress-buffer" style={{ width: `${bufferedPercent}%` }} />
        <span className="video-progress-fill" style={{ width: `${progressPercent}%` }} />
        {hoverTime !== null && (
          <span className="video-progress-hover" style={{ left: `${hoverPercent}%` }}>
            {formatControlTime(hoverTime)}
          </span>
        )}
        <span className="video-progress-thumb" style={{ left: `${progressPercent}%` }} />
      </span>
    </div>
  )
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
  const stageRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const jassubRef = useRef<any>(null)
  const initPromiseRef = useRef<Promise<void> | null>(null)
  const lastContentRef = useRef('')
  const lastFontRef = useRef('')
  const rafRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [bufferedEnd, setBufferedEnd] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)

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
      setCurrentTime(video.currentTime)
      setBufferedEnd(getBufferedEnd(video))

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
    video.addEventListener('progress', handleTimeUpdate)
    video.addEventListener('seeking', handleTimeUpdate)

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('progress', handleTimeUpdate)
      video.removeEventListener('seeking', handleTimeUpdate)
      if (rafRef.current)
        cancelAnimationFrame(rafRef.current)
    }
  }, [onTimeUpdate])

  useEffect(() => {
    const video = videoRef.current
    if (!video)
      return

    const handleLoadedMetadata = () => {
      const nextDuration = Number.isFinite(video.duration) ? video.duration : 0
      setDuration(nextDuration)
      setBufferedEnd(getBufferedEnd(video))
      onDurationChange?.(nextDuration)
    }

    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    video.addEventListener('durationchange', handleLoadedMetadata)
    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('durationchange', handleLoadedMetadata)
    }
  }, [onDurationChange])

  useEffect(() => {
    const video = videoRef.current
    if (!video)
      return

    const syncPlayback = () => setIsPlaying(!video.paused)
    const syncVolume = () => {
      setVolume(video.volume)
      setMuted(video.muted)
    }
    const syncPlaybackRate = () => setPlaybackRate(video.playbackRate)

    syncPlayback()
    syncVolume()
    syncPlaybackRate()

    video.addEventListener('play', syncPlayback)
    video.addEventListener('pause', syncPlayback)
    video.addEventListener('volumechange', syncVolume)
    video.addEventListener('ratechange', syncPlaybackRate)

    return () => {
      video.removeEventListener('play', syncPlayback)
      video.removeEventListener('pause', syncPlayback)
      video.removeEventListener('volumechange', syncVolume)
      video.removeEventListener('ratechange', syncPlaybackRate)
    }
  }, [mediaUrl])

  const togglePlayback = () => {
    const video = videoRef.current
    if (!video)
      return

    if (video.paused) {
      void video.play()
      return
    }

    video.pause()
  }

  const handleSeek = (value: number) => {
    const video = videoRef.current
    if (!video)
      return

    video.currentTime = value
    setCurrentTime(value)
    setBufferedEnd(getBufferedEnd(video))
    onTimeUpdate?.(value)
  }

  const handleVolumeChange = (nextVolume: number) => {
    const video = videoRef.current
    if (!video)
      return

    video.volume = nextVolume
    video.muted = nextVolume === 0
  }

  const handlePlaybackRateChange = (nextPlaybackRate: number) => {
    const video = videoRef.current
    if (!video)
      return

    video.playbackRate = nextPlaybackRate
    setPlaybackRate(nextPlaybackRate)
  }

  const toggleMuted = () => {
    const video = videoRef.current
    if (!video)
      return

    video.muted = !video.muted
  }

  const toggleFullscreen = () => {
    const element = stageRef.current
    if (!element)
      return

    if (document.fullscreenElement) {
      void document.exitFullscreen()
      return
    }

    void element.requestFullscreen()
  }

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div ref={stageRef} className="video-stage">
      <div className="video-stage-viewport">
        <video
          ref={videoRef}
          src={mediaUrl}
          className="video-stage-media"
          onClick={togglePlayback}
        />
      </div>

      <Flex className="video-controls" aria-label="视频控制栏" gap={10} align="center">
        <Tooltip title={isPlaying ? '暂停' : '播放'}>
          <Button
            type="text"
            size="small"
            shape="circle"
            className="video-control-button ml-2"
            aria-label={isPlaying ? '暂停' : '播放'}
            icon={isPlaying ? <Pause size={16} /> : <Play size={16} />}
            onClick={togglePlayback}
          />
        </Tooltip>

        <span className="video-control-time">{formatControlTime(currentTime)}</span>

        <VideoProgress
          currentTime={currentTime}
          duration={duration}
          bufferedEnd={bufferedEnd}
          onSeek={handleSeek}
        />

        <span className="video-control-time">{formatControlTime(duration)}</span>

        <Select
          className="video-rate-select"
          size="small"
          value={playbackRate}
          options={PLAYBACK_RATE_OPTIONS}
          aria-label="播放速度"
          onChange={handlePlaybackRateChange}
        />

        <Tooltip title={muted || volume === 0 ? '取消静音' : '静音'}>
          <Button
            type="text"
            size="small"
            shape="circle"
            className="video-control-button"
            aria-label={muted || volume === 0 ? '取消静音' : '静音'}
            icon={muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
            onClick={toggleMuted}
          />
        </Tooltip>

        <Slider
          className="video-volume"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          tooltip={{ formatter: value => `${Math.round(Number(value ?? 0) * 100)}%` }}
          aria-label="视频音量"
          onChange={handleVolumeChange}
        />

        <Tooltip title="全屏">
          <Button
            type="text"
            size="small"
            shape="circle"
            className="video-control-button"
            aria-label="全屏"
            icon={<Maximize size={16} />}
            onClick={toggleFullscreen}
          />
        </Tooltip>
      </Flex>
    </div>
  )
}
