import type { Region } from 'wavesurfer.js/plugins/regions'
import type { Subtitle } from '@/lib/srt'
import { Button, Slider, Space, Tooltip, Typography } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import HoverPlugin from 'wavesurfer.js/plugins/hover'
import RegionsPlugin from 'wavesurfer.js/plugins/regions'
import {
  findActiveSubtitleIndex,
  getSubtitleBounds,
  srtTimeToSeconds,
} from '@/lib/srt'

const { Text } = Typography

interface SubtitleTimelineProps {
  mediaUrl: string
  subtitles: Subtitle[]
  currentTime: number
  duration: number
  onSeek: (time: number) => void
  onTimingPreview: (index: number, start: number, end: number) => void
  onTimingCommit: (change: {
    index: number
    before: { start: number, end: number }
    after: { start: number, end: number }
  }) => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
}

type LoadState = 'idle' | 'loading' | 'ready' | 'fallback' | 'error'
interface SubtitleTimelineMetrics {
  lanesById: Map<number, number>
  overlapIds: Set<number>
}

const MIN_DURATION = 0.12
const DEFAULT_ZOOM = 56
const MIN_ZOOM = 18
const MAX_ZOOM = 260
const WHEEL_ZOOM_SENSITIVITY = 0.0024
const PREVIEW_THROTTLE_MS = 48
const REGION_ID_PREFIX = 'subtitle-region-'
const REGION_COLOR = 'rgba(37, 99, 235, 0.34)'
const ACTIVE_REGION_COLOR = 'rgba(249, 115, 22, 0.42)'
const OVERLAP_REGION_COLOR = 'rgba(239, 68, 68, 0.5)'
const LANE_TOPS = [5, 65]
const LANE_HEIGHT = 54
const SINGLE_LANE_TOP = 35
const RULER_INTERVALS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600]

function clamp(value: number, min: number, max: number) {
  const safeMax = Math.max(min, max)
  return Math.min(Math.max(value, min), safeMax)
}

function formatTimelineTime(seconds: number) {
  const totalSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remain = totalSeconds % 60

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remain).padStart(2, '0')}`
  }

  return `${String(minutes).padStart(2, '0')}:${String(remain).padStart(2, '0')}`
}

function previewText(text: string) {
  const compact = text.replace(/\s+/g, ' ').trim()
  if (!compact)
    return '空字幕'

  return compact.length > 72 ? `${compact.slice(0, 72)}...` : compact
}

function regionId(subtitleId: number) {
  return `${REGION_ID_PREFIX}${subtitleId}`
}

function subtitleIdFromRegion(region: Region) {
  if (!region.id.startsWith(REGION_ID_PREFIX))
    return null

  const parsed = Number(region.id.slice(REGION_ID_PREFIX.length))
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeRegionBounds(region: Region, totalDuration: number) {
  const start = clamp(region.start, 0, Math.max(totalDuration - MIN_DURATION, 0))
  const end = clamp(region.end, start + MIN_DURATION, totalDuration)
  return { start, end }
}

function getRegionColor(active: boolean, overlapping: boolean) {
  if (overlapping)
    return OVERLAP_REGION_COLOR
  return active ? ACTIVE_REGION_COLOR : REGION_COLOR
}

function chooseRulerInterval(pxPerSecond: number) {
  return RULER_INTERVALS.find(interval => interval * pxPerSecond >= 88) ?? RULER_INTERVALS.at(-1) ?? 60
}

function computeSubtitleTimelineMetrics(subtitles: Subtitle[]): SubtitleTimelineMetrics {
  const intervals = subtitles
    .map((subtitle, index) => ({
      id: subtitle.id,
      index,
      ...getSubtitleBounds(subtitle),
    }))
    .sort((left, right) => left.start - right.start || left.end - right.end || left.index - right.index)

  const lanesById = new Map<number, number>()
  const overlapIds = new Set<number>()
  const laneEnds = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY]
  let active: typeof intervals = []

  intervals.forEach((item) => {
    active = active.filter(activeItem => activeItem.end > item.start)
    if (active.length > 0) {
      overlapIds.add(item.id)
      active.forEach(activeItem => overlapIds.add(activeItem.id))
    }

    const lane = laneEnds[0] <= item.start
      ? 0
      : laneEnds[1] <= item.start
        ? 1
        : laneEnds[0] <= laneEnds[1] ? 0 : 1

    lanesById.set(item.id, lane)
    laneEnds[lane] = Math.max(laneEnds[lane], item.end)
    active.push(item)
  })

  return { lanesById, overlapIds }
}

function createFlatPeaks(totalDuration: number) {
  const peakCount = clamp(Math.ceil(totalDuration * 24), 24, 8000)

  return [
    Array.from({ length: peakCount }, (_, index) => {
      return index % 2 === 0 ? 0.015 : -0.015
    }),
  ]
}

function createRegionContent(subtitle: Subtitle, index: number, active: boolean, overlapping: boolean) {
  const content = document.createElement('div')
  content.className = 'subtitle-wave-region-content'
  content.style.display = 'inline-flex'
  content.style.maxWidth = '100%'
  content.style.height = '100%'
  content.style.alignItems = 'center'
  content.style.gap = '6px'
  content.style.overflow = 'hidden'
  content.style.padding = '0 10px'
  content.style.color = '#fff'
  content.style.fontSize = '12px'
  content.style.lineHeight = '1'
  content.style.marginTop = '0'
  content.style.whiteSpace = 'nowrap'

  const badge = document.createElement('strong')
  badge.textContent = `#${index + 1}`
  badge.style.display = 'inline-flex'
  badge.style.flex = '0 0 auto'
  badge.style.alignItems = 'center'
  badge.style.borderRadius = '999px'
  badge.style.background = overlapping
    ? 'rgba(254, 202, 202, 0.28)'
    : active ? 'rgba(255, 255, 255, 0.24)' : 'rgba(255, 255, 255, 0.16)'
  badge.style.padding = '2px 6px'
  badge.style.fontSize = '10px'
  badge.style.fontWeight = '700'
  badge.style.lineHeight = '1'

  const label = document.createElement('span')
  label.textContent = previewText(subtitle.text)
  label.style.minWidth = '0'
  label.style.overflow = 'hidden'
  label.style.textOverflow = 'ellipsis'

  content.append(badge, label)
  return content
}

export function SubtitleTimeline({
  mediaUrl,
  subtitles,
  currentTime,
  duration,
  onSeek,
  onTimingPreview,
  onTimingCommit,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: SubtitleTimelineProps) {
  const shellRef = useRef<HTMLDivElement | null>(null)
  const waveformContainerRef = useRef<HTMLDivElement | null>(null)
  const timelineContainerRef = useRef<HTMLDivElement | null>(null)
  const waveSurferRef = useRef<WaveSurfer | null>(null)
  const regionsPluginRef = useRef<RegionsPlugin | null>(null)
  const regionsRef = useRef(new Map<number, Region>())
  const regionMetaRef = useRef(new Map<number, string>())
  const dragBeforeRef = useRef(new Map<number, { start: number, end: number }>())
  const previewTimeRef = useRef(new Map<number, number>())
  const subtitleMetricsRef = useRef<SubtitleTimelineMetrics>({ lanesById: new Map(), overlapIds: new Set() })
  const activeSubtitleIdRef = useRef<number | null>(null)
  const fallbackModeRef = useRef(false)
  const activeMediaUrlRef = useRef(mediaUrl)
  const subtitlesRef = useRef(subtitles)
  const currentTimeRef = useRef(currentTime)
  const totalDurationRef = useRef(1)
  const onSeekRef = useRef(onSeek)
  const onTimingPreviewRef = useRef(onTimingPreview)
  const onTimingCommitRef = useRef(onTimingCommit)
  const zoomRef = useRef(DEFAULT_ZOOM)
  const previousActiveSubtitleIdRef = useRef<number | null>(null)
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [loadError, setLoadError] = useState('')
  const [rulerView, setRulerView] = useState({ scrollLeft: 0, width: 1 })

  const totalDuration = useMemo(() => {
    const maxSubtitleTime = subtitles.reduce((max, subtitle) => {
      return Math.max(max, srtTimeToSeconds(subtitle.endTime))
    }, 0)

    return Math.max(duration, maxSubtitleTime, 1)
  }, [duration, subtitles])

  const activeIndex = useMemo(() => findActiveSubtitleIndex(subtitles, currentTime), [subtitles, currentTime])
  const activeSubtitleId = activeIndex >= 0 ? subtitles[activeIndex]?.id ?? null : null
  const subtitleMetrics = useMemo(() => computeSubtitleTimelineMetrics(subtitles), [subtitles])
  const rulerPixelsPerSecond = Math.max(zoom, rulerView.width / totalDuration)
  const rulerPixelWidth = Math.max(Math.ceil(totalDuration * rulerPixelsPerSecond), rulerView.width)
  const rulerInterval = chooseRulerInterval(rulerPixelsPerSecond)
  const rulerTicks = useMemo(() => {
    const startTime = Math.max(0, Math.floor((rulerView.scrollLeft / rulerPixelsPerSecond) / rulerInterval) * rulerInterval)
    const endTime = Math.min(
      totalDuration,
      Math.ceil(((rulerView.scrollLeft + rulerView.width) / rulerPixelsPerSecond) / rulerInterval) * rulerInterval,
    )
    const ticks: Array<{ left: number, time: number }> = []

    for (let time = startTime; time <= endTime + 0.001; time += rulerInterval) {
      ticks.push({ time, left: time * rulerPixelsPerSecond })
    }

    return ticks
  }, [rulerInterval, rulerPixelsPerSecond, rulerView.scrollLeft, rulerView.width, totalDuration])

  activeMediaUrlRef.current = mediaUrl
  subtitleMetricsRef.current = subtitleMetrics

  useEffect(() => {
    subtitlesRef.current = subtitles
  }, [subtitles])

  useEffect(() => {
    currentTimeRef.current = currentTime
  }, [currentTime])

  useEffect(() => {
    totalDurationRef.current = totalDuration
  }, [totalDuration])

  useEffect(() => {
    onSeekRef.current = onSeek
    onTimingPreviewRef.current = onTimingPreview
    onTimingCommitRef.current = onTimingCommit
  }, [onSeek, onTimingCommit, onTimingPreview])

  const syncRulerView = useCallback((scrollLeft?: number) => {
    const waveSurfer = waveSurferRef.current
    const nextScrollLeft = scrollLeft ?? waveSurfer?.getScroll() ?? 0
    const nextWidth = waveSurfer?.getWidth()
      ?? waveformContainerRef.current?.clientWidth
      ?? timelineContainerRef.current?.clientWidth
      ?? 1

    setRulerView((previous) => {
      if (Math.abs(previous.scrollLeft - nextScrollLeft) < 0.5 && Math.abs(previous.width - nextWidth) < 0.5)
        return previous
      return { scrollLeft: nextScrollLeft, width: Math.max(nextWidth, 1) }
    })
  }, [])

  const applyRegionVisual = useCallback((subtitleId: number, active: boolean) => {
    const region = regionsRef.current.get(subtitleId)
    if (!region)
      return

    const metrics = subtitleMetricsRef.current
    const lane = metrics.lanesById.get(subtitleId) ?? 0
    const overlapping = metrics.overlapIds.has(subtitleId)

    region.setOptions({ color: getRegionColor(active, overlapping) })

    if (!region.element)
      return

    region.element.style.top = `${overlapping ? LANE_TOPS[lane] ?? LANE_TOPS[0] : SINGLE_LANE_TOP}px`
    region.element.style.height = `${LANE_HEIGHT}px`
    region.element.style.borderColor = overlapping
      ? 'rgba(248, 113, 113, 0.95)'
      : active ? 'rgba(254, 215, 170, 0.88)' : 'rgba(191, 219, 254, 0.58)'
    region.element.style.boxShadow = overlapping
      ? '0 10px 20px rgba(239, 68, 68, 0.24)'
      : '0 10px 20px rgba(14, 165, 233, 0.14)'
    region.element.style.zIndex = overlapping ? '7' : active ? '6' : '5'
  }, [])

  const updateRegionAppearance = useCallback((subtitleId: number, active: boolean) => {
    const region = regionsRef.current.get(subtitleId)
    if (!region)
      return

    const index = subtitlesRef.current.findIndex(subtitle => subtitle.id === subtitleId)
    const subtitle = subtitlesRef.current[index]
    if (!subtitle)
      return

    const { start, end } = getSubtitleBounds(subtitle)
    const lane = subtitleMetricsRef.current.lanesById.get(subtitleId) ?? 0
    const overlapping = subtitleMetricsRef.current.overlapIds.has(subtitleId)
    const signature = `${index}:${previewText(subtitle.text)}:${active}:${overlapping}:${lane}`
    applyRegionVisual(subtitleId, active)
    region.element?.setAttribute('title', `${formatTimelineTime(start)}-${formatTimelineTime(end)} ${previewText(subtitle.text)}`)

    if (regionMetaRef.current.get(subtitleId) !== signature) {
      region.setContent(createRegionContent(subtitle, index, active, overlapping))
      regionMetaRef.current.set(subtitleId, signature)
    }
  }, [applyRegionVisual])

  const syncRegions = useCallback(() => {
    const waveSurfer = waveSurferRef.current
    const regionsPlugin = regionsPluginRef.current
    if (!waveSurfer || !regionsPlugin || waveSurfer.getDuration() <= 0)
      return

    const nextIds = new Set<number>()
    const activeId = activeSubtitleIdRef.current
    const limit = Math.max(waveSurfer.getDuration(), totalDurationRef.current, 1)

    subtitlesRef.current.forEach((subtitle, index) => {
      const { start, end } = getSubtitleBounds(subtitle)
      const safeStart = clamp(start, 0, Math.max(limit - MIN_DURATION, 0))
      const safeEnd = clamp(end, safeStart + MIN_DURATION, limit)
      const active = subtitle.id === activeId
      const lane = subtitleMetricsRef.current.lanesById.get(subtitle.id) ?? 0
      const overlapping = subtitleMetricsRef.current.overlapIds.has(subtitle.id)
      const existing = regionsRef.current.get(subtitle.id)

      nextIds.add(subtitle.id)

      if (!existing) {
        const region = regionsPlugin.addRegion({
          id: regionId(subtitle.id),
          start: safeStart,
          end: safeEnd,
          drag: true,
          resize: true,
          resizeStart: true,
          resizeEnd: true,
          minLength: MIN_DURATION,
          color: getRegionColor(active, overlapping),
          content: createRegionContent(subtitle, index, active, overlapping),
        })

        regionsRef.current.set(subtitle.id, region)
        regionMetaRef.current.set(subtitle.id, `${index}:${previewText(subtitle.text)}:${active}:${overlapping}:${lane}`)
        applyRegionVisual(subtitle.id, active)
        region.element?.setAttribute('title', `${formatTimelineTime(start)}-${formatTimelineTime(end)} ${previewText(subtitle.text)}`)
        return
      }

      if (!dragBeforeRef.current.has(subtitle.id)) {
        const changed = Math.abs(existing.start - safeStart) > 0.001 || Math.abs(existing.end - safeEnd) > 0.001
        if (changed) {
          existing.setOptions({
            start: safeStart,
            end: safeEnd,
          })
        }
      }

      updateRegionAppearance(subtitle.id, active)
    })

    regionsRef.current.forEach((region, subtitleId) => {
      if (nextIds.has(subtitleId))
        return

      region.remove()
      regionsRef.current.delete(subtitleId)
      regionMetaRef.current.delete(subtitleId)
      dragBeforeRef.current.delete(subtitleId)
      previewTimeRef.current.delete(subtitleId)
    })
  }, [applyRegionVisual, updateRegionAppearance])

  const handleRegionUpdate = useCallback((region: Region) => {
    const subtitleId = subtitleIdFromRegion(region)
    if (subtitleId === null)
      return

    const index = subtitlesRef.current.findIndex(subtitle => subtitle.id === subtitleId)
    const subtitle = subtitlesRef.current[index]
    if (!subtitle)
      return

    if (!dragBeforeRef.current.has(subtitleId)) {
      dragBeforeRef.current.set(subtitleId, getSubtitleBounds(subtitle))
    }

    const now = Date.now()
    const previousPreviewAt = previewTimeRef.current.get(subtitleId) ?? 0
    if (now - previousPreviewAt < PREVIEW_THROTTLE_MS)
      return

    const { start, end } = normalizeRegionBounds(region, totalDurationRef.current)
    previewTimeRef.current.set(subtitleId, now)
    onTimingPreviewRef.current(index, start, end)
  }, [])

  const handleRegionUpdated = useCallback((region: Region) => {
    const subtitleId = subtitleIdFromRegion(region)
    if (subtitleId === null)
      return

    const before = dragBeforeRef.current.get(subtitleId)
    dragBeforeRef.current.delete(subtitleId)
    previewTimeRef.current.delete(subtitleId)

    if (!before)
      return

    const index = subtitlesRef.current.findIndex(subtitle => subtitle.id === subtitleId)
    if (index === -1)
      return

    const after = normalizeRegionBounds(region, totalDurationRef.current)
    onTimingPreviewRef.current(index, after.start, after.end)

    if (Math.abs(before.start - after.start) < 0.001 && Math.abs(before.end - after.end) < 0.001)
      return

    onTimingCommitRef.current({
      index,
      before,
      after,
    })
  }, [])

  const createWaveSurfer = useCallback((useFallback: boolean) => {
    const waveformContainer = waveformContainerRef.current
    if (!waveformContainer)
      return null

    const regionsPlugin = RegionsPlugin.create()
    const hoverPlugin = HoverPlugin.create({
      lineColor: 'rgba(125, 211, 252, 0.85)',
      labelBackground: 'rgba(15, 23, 42, 0.92)',
      labelColor: '#e2e8f0',
      formatTimeCallback: formatTimelineTime,
    })

    fallbackModeRef.current = useFallback
    regionsPluginRef.current = regionsPlugin
    regionsRef.current.clear()
    regionMetaRef.current.clear()
    dragBeforeRef.current.clear()
    previewTimeRef.current.clear()

    const options = {
      container: waveformContainer,
      height: 124,
      minPxPerSec: zoomRef.current,
      waveColor: 'rgba(148, 163, 184, 0.46)',
      progressColor: 'rgba(96, 165, 250, 0.58)',
      cursorColor: '#38bdf8',
      cursorWidth: 2,
      barWidth: 2,
      barGap: 2,
      barRadius: 2,
      dragToSeek: { debounceTime: 20 },
      autoScroll: true,
      autoCenter: false,
      normalize: true,
      interact: true,
      url: useFallback ? undefined : mediaUrl,
      peaks: useFallback ? createFlatPeaks(totalDurationRef.current) : undefined,
      duration: totalDurationRef.current,
      plugins: [regionsPlugin, hoverPlugin],
    }

    const waveSurfer = WaveSurfer.create(options)
    waveSurferRef.current = waveSurfer
    setLoadState(useFallback ? 'fallback' : 'loading')
    setLoadError('')

    waveSurfer.on('ready', () => {
      if (waveSurferRef.current !== waveSurfer || activeMediaUrlRef.current !== mediaUrl)
        return

      setLoadState(useFallback ? 'fallback' : 'ready')
      syncRegions()
      waveSurfer.setTime(clamp(currentTimeRef.current, 0, Math.max(waveSurfer.getDuration(), totalDurationRef.current)))
      syncRulerView()
    })

    waveSurfer.on('interaction', (time) => {
      if (waveSurferRef.current !== waveSurfer)
        return

      const nextTime = clamp(time, 0, Math.max(waveSurfer.getDuration(), totalDurationRef.current))
      onSeekRef.current(nextTime)
      waveSurfer.setTime(nextTime)
    })

    waveSurfer.on('zoom', (value) => {
      const nextZoom = clamp(value, MIN_ZOOM, MAX_ZOOM)
      zoomRef.current = nextZoom
      setZoom(nextZoom)
      syncRulerView()
    })

    waveSurfer.on('scroll', (_visibleStartTime, _visibleEndTime, scrollLeft) => {
      syncRulerView(scrollLeft)
    })

    waveSurfer.on('redraw', () => {
      syncRulerView()
    })

    waveSurfer.on('error', (error) => {
      if (activeMediaUrlRef.current !== mediaUrl)
        return

      if (fallbackModeRef.current) {
        setLoadState('error')
        setLoadError(error.message)
        return
      }

      setLoadError(error.message)
      waveSurfer.destroy()
      waveSurferRef.current = null
      regionsPluginRef.current = null
      void Promise.resolve().then(() => {
        if (activeMediaUrlRef.current === mediaUrl)
          createWaveSurfer(true)
      })
    })

    regionsPlugin.on('region-clicked', (region, event) => {
      event.preventDefault()
      event.stopPropagation()
      const nextTime = clamp(region.start, 0, Math.max(waveSurfer.getDuration(), totalDurationRef.current))
      onSeekRef.current(nextTime)
      waveSurfer.setTime(nextTime)
    })

    regionsPlugin.on('region-update', handleRegionUpdate)
    regionsPlugin.on('region-updated', handleRegionUpdated)

    return waveSurfer
  }, [handleRegionUpdate, handleRegionUpdated, mediaUrl, syncRegions, syncRulerView])

  useEffect(() => {
    activeMediaUrlRef.current = mediaUrl
    const waveSurfer = createWaveSurfer(false)

    return () => {
      const currentWaveSurfer = waveSurferRef.current ?? waveSurfer
      currentWaveSurfer?.destroy()
      waveSurferRef.current = null
      regionsPluginRef.current = null
      activeMediaUrlRef.current = ''
    }
  }, [createWaveSurfer, mediaUrl])

  useEffect(() => {
    syncRegions()
  }, [subtitles, syncRegions, totalDuration])

  useEffect(() => {
    const element = waveformContainerRef.current
    if (!element || typeof ResizeObserver === 'undefined')
      return

    const observer = new ResizeObserver(() => syncRulerView())
    observer.observe(element)
    return () => observer.disconnect()
  }, [syncRulerView])

  useEffect(() => {
    const previousActiveId = previousActiveSubtitleIdRef.current
    activeSubtitleIdRef.current = activeSubtitleId

    if (previousActiveId !== null && previousActiveId !== activeSubtitleId)
      updateRegionAppearance(previousActiveId, false)
    if (activeSubtitleId !== null)
      updateRegionAppearance(activeSubtitleId, true)

    previousActiveSubtitleIdRef.current = activeSubtitleId
  }, [activeSubtitleId, updateRegionAppearance])

  useEffect(() => {
    const waveSurfer = waveSurferRef.current
    if (!waveSurfer || loadState === 'loading' || waveSurfer.getDuration() <= 0)
      return

    const limit = Math.max(waveSurfer.getDuration(), totalDuration)
    waveSurfer.setTime(clamp(currentTime, 0, limit))
  }, [currentTime, loadState, totalDuration])

  useEffect(() => {
    const waveSurfer = waveSurferRef.current
    if (!waveSurfer || !fallbackModeRef.current)
      return

    void waveSurfer.load('', createFlatPeaks(totalDuration), totalDuration).then(() => {
      setLoadState('fallback')
      syncRegions()
      waveSurfer.setTime(clamp(currentTimeRef.current, 0, totalDuration))
      syncRulerView()
    })
  }, [syncRegions, syncRulerView, totalDuration])

  const handleZoomChange = (value: number) => {
    const nextZoom = clamp(value, MIN_ZOOM, MAX_ZOOM)
    zoomRef.current = nextZoom
    setZoom(nextZoom)

    try {
      waveSurferRef.current?.zoom(nextZoom)
    }
    catch {
      // WaveSurfer cannot zoom until it has rendered at least fallback peaks.
    }

    syncRulerView()
  }

  const handleWheelZoom = (event: React.WheelEvent<HTMLDivElement>) => {
    if (event.shiftKey)
      return

    const waveSurfer = waveSurferRef.current
    const waveformContainer = waveformContainerRef.current
    if (!waveSurfer || !waveformContainer)
      return

    event.preventDefault()

    const oldZoom = zoomRef.current
    const nextZoom = clamp(oldZoom * Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY), MIN_ZOOM, MAX_ZOOM)
    if (Math.abs(nextZoom - oldZoom) < 0.1)
      return

    const rect = waveformContainer.getBoundingClientRect()
    const pointerX = clamp(event.clientX - rect.left, 0, rect.width)
    const oldPixelsPerSecond = Math.max(oldZoom, rect.width / totalDurationRef.current)
    const nextPixelsPerSecond = Math.max(nextZoom, rect.width / totalDurationRef.current)
    const pointedTime = (waveSurfer.getScroll() + pointerX) / oldPixelsPerSecond

    handleZoomChange(nextZoom)

    requestAnimationFrame(() => {
      const maxScroll = Math.max(totalDurationRef.current * nextPixelsPerSecond - rect.width, 0)
      waveSurfer.setScroll(clamp(pointedTime * nextPixelsPerSecond - pointerX, 0, maxScroll))
      syncRulerView()
    })
  }

  const scrollToCurrentTime = () => {
    const waveSurfer = waveSurferRef.current
    if (!waveSurfer)
      return

    const width = waveformContainerRef.current?.clientWidth ?? 720
    const pixelsPerSecond = Math.max(zoom, width / totalDurationRef.current)
    const visibleSeconds = width / pixelsPerSecond
    const start = clamp(currentTimeRef.current - visibleSeconds * 0.45, 0, Math.max(totalDurationRef.current - visibleSeconds, 0))
    waveSurfer.setScrollTime(start)
    syncRulerView()
  }

  const resetZoom = () => handleZoomChange(DEFAULT_ZOOM)

  const statusText = (() => {
    if (loadState === 'loading')
      return '波形加载中'
    if (loadState === 'fallback')
      return '无波形模式'
    if (loadState === 'error')
      return '波形不可用'
    return ''
  })()

  return (
    <div
      ref={shellRef}
      className="timeline-shell"
      tabIndex={0}
      onKeyDown={(event) => {
        if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z')
          return

        event.preventDefault()
        if (event.shiftKey) {
          if (canRedo)
            onRedo()
          return
        }

        if (canUndo)
          onUndo()
      }}
    >
      <div className="timeline-header">
        <div className="timeline-heading">
          <Text className="timeline-kicker">Waveform</Text>
          <Text className="timeline-title">拖拽波形字幕块调整时间</Text>
        </div>
        <Space className="timeline-actions" size={10} wrap>
          <div className="timeline-zoom-controls">
            <Text className="timeline-zoom-label">缩放</Text>
            <Slider
              className="timeline-zoom-slider"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={2}
              value={zoom}
              tooltip={{ formatter: value => `${Math.round(Number(value ?? 0))} px/s` }}
              onChange={handleZoomChange}
            />
          </div>
          <Tooltip title="定位到当前播放位置">
            <Button size="small" onClick={scrollToCurrentTime}>定位当前</Button>
          </Tooltip>
          <Button size="small" onClick={resetZoom}>重置缩放</Button>
          <Text className="timeline-current">
            {formatTimelineTime(currentTime)}
          </Text>
          {statusText && (
            <Tooltip title={loadError || undefined}>
              <Text className="timeline-wave-state">{statusText}</Text>
            </Tooltip>
          )}
        </Space>
      </div>

      <div className="subtitle-wave-panel" onWheel={handleWheelZoom}>
        <div ref={waveformContainerRef} className="subtitle-waveform" />
        <div ref={timelineContainerRef} className="subtitle-wave-ruler">
          <div
            className="subtitle-wave-ruler-inner"
            style={{
              width: rulerPixelWidth,
              transform: `translateX(${-rulerView.scrollLeft}px)`,
            }}
          >
            {rulerTicks.map(tick => (
              <span
                key={tick.time}
                className="subtitle-wave-ruler-tick"
                style={{ left: tick.left }}
              >
                <i />
                <label>{formatTimelineTime(tick.time)}</label>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
