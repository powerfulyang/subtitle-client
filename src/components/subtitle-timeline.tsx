import type { Subtitle } from '@/lib/srt'
import { Typography } from 'antd'
import { createElement, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  findActiveSubtitleIndex,
  getSubtitleBounds,
  srtTimeToSeconds,
} from '@/lib/srt'
import 'mathlive'

const { Text } = Typography

type DragMode = 'move' | 'start' | 'end'

type PreviewToken
  = | { type: 'text', value: string, id: string }
    | { type: 'math', value: string, id: string }

interface DragState {
  index: number
  mode: DragMode
  originX: number
  originalStart: number
  originalEnd: number
  latestStart: number
  latestEnd: number
}

interface SubtitleTimelineProps {
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

const MIN_DURATION = 0.12
const TRACK_ROW_HEIGHT = 56
const TRACK_ROW_GAP = 10
const TRACK_TOP_PADDING = 14
const TRACK_BOTTOM_PADDING = 16

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function formatTimelineTime(seconds: number) {
  const totalSeconds = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(totalSeconds / 60)
  const remain = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remain).padStart(2, '0')}`
}

function tokenizePreviewLine(line: string, lineIndex: number) {
  const tokens: PreviewToken[] = []
  const inlineMathPattern = /\${1,2}([^$\n]+)\${1,2}/g
  let lastIndex = 0
  let tokenCount = 0

  for (const match of line.matchAll(inlineMathPattern)) {
    const matchIndex = match.index ?? 0
    const before = line.slice(lastIndex, matchIndex)
    if (before) {
      tokens.push({ type: 'text', value: before, id: `t-${lineIndex}-${tokenCount++}` })
    }

    tokens.push({ type: 'math', value: match[1] ?? '', id: `m-${lineIndex}-${tokenCount++}` })
    lastIndex = matchIndex + match[0].length
  }

  const trailing = line.slice(lastIndex)
  if (trailing) {
    tokens.push({ type: 'text', value: trailing, id: `t-${lineIndex}-${tokenCount++}` })
  }

  if (tokens.length === 0) {
    tokens.push({ type: 'text', value: line, id: `t-${lineIndex}-0` })
  }

  return tokens
}

function tokenizeSubtitlePreview(text: string) {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean)
  if (lines.length === 0)
    return [{ type: 'text', value: '空字幕', id: 'empty' }] satisfies PreviewToken[]

  const previewTokens: PreviewToken[] = []

  lines.slice(0, 2).forEach((line, lineIndex) => {
    previewTokens.push(...tokenizePreviewLine(line, lineIndex))
  })

  return previewTokens
}

function assignTimelineRows(subtitles: Subtitle[]) {
  const positioned = subtitles
    .map((subtitle, index) => ({ index, ...getSubtitleBounds(subtitle) }))
    .sort((a, b) => a.start - b.start || a.end - b.end)

  const rowEnds: number[] = []
  const rowsByIndex = Array.from<number>({ length: subtitles.length }).fill(0)

  positioned.forEach(({ index, start, end }) => {
    let rowIndex = rowEnds.findIndex(rowEnd => rowEnd <= start)
    if (rowIndex === -1) {
      rowIndex = rowEnds.length
      rowEnds.push(end)
    }
    else {
      rowEnds[rowIndex] = end
    }

    rowsByIndex[index] = rowIndex
  })

  return {
    rowsByIndex,
    rowCount: Math.max(rowEnds.length, 1),
  }
}

function StaticMathPreview({ latex }: { latex: string }) {
  const fieldRef = useRef<MathfieldElement | null>(null)

  useEffect(() => {
    const element = fieldRef.current
    if (!element)
      return

    if (element.value !== latex)
      element.value = latex

    element.defaultMode = 'inline-math'
    element.readOnly = true
    element.disabled = true
    element.smartFence = true
    element.virtualKeyboardMode = 'manual'
    element.popoverPolicy = 'off'
    element.environmentPopoverPolicy = 'off'
    element.menuItems = []
    element.mathVirtualKeyboardPolicy = 'manual'
  }, [latex])

  return (
    <span className="timeline-math-preview">
      {createElement('math-field', {
        'ref': fieldRef,
        'className': 'timeline-math-field',
        'aria-hidden': 'true',
      })}
    </span>
  )
}

function TimelineSegmentPreview({ text }: { text: string }) {
  const tokens = useMemo(() => tokenizeSubtitlePreview(text), [text])

  return (
    <span className="timeline-preview-content">
      {tokens.map((token) => {
        if (token.type === 'math') {
          return <StaticMathPreview key={token.id} latex={token.value} />
        }

        return (
          <span key={token.id} className="timeline-preview-text">
            {token.value}
          </span>
        )
      })}
    </span>
  )
}

export function SubtitleTimeline({
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
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [trackWidth, setTrackWidth] = useState(0)

  const totalDuration = useMemo(() => {
    const maxSubtitleTime = subtitles.reduce((max, subtitle) => {
      return Math.max(max, srtTimeToSeconds(subtitle.endTime))
    }, 0)

    return Math.max(duration, maxSubtitleTime, 1)
  }, [duration, subtitles])

  const { rowsByIndex, rowCount } = useMemo(() => assignTimelineRows(subtitles), [subtitles])
  const trackHeight = useMemo(() => {
    return TRACK_TOP_PADDING + TRACK_BOTTOM_PADDING + rowCount * TRACK_ROW_HEIGHT + Math.max(rowCount - 1, 0) * TRACK_ROW_GAP
  }, [rowCount])

  const activeIndex = useMemo(() => findActiveSubtitleIndex(subtitles, currentTime), [subtitles, currentTime])

  useLayoutEffect(() => {
    const element = trackRef.current
    if (!element)
      return

    const updateWidth = () => {
      requestAnimationFrame(() => {
        setTrackWidth(element.clientWidth)
      })
    }

    updateWidth()

    const observer = new ResizeObserver(updateWidth)
    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!dragState || !trackWidth)
      return

    const handlePointerMove = (event: PointerEvent) => {
      const deltaSeconds = ((event.clientX - dragState.originX) / trackWidth) * totalDuration
      const originalLength = dragState.originalEnd - dragState.originalStart

      if (dragState.mode === 'move') {
        const nextStart = clamp(dragState.originalStart + deltaSeconds, 0, totalDuration - originalLength)
        const nextEnd = nextStart + originalLength
        onTimingPreview(dragState.index, nextStart, nextEnd)
        setDragState(current => current ? { ...current, latestStart: nextStart, latestEnd: nextEnd } : current)
        return
      }

      if (dragState.mode === 'start') {
        const nextStart = clamp(
          dragState.originalStart + deltaSeconds,
          0,
          dragState.originalEnd - MIN_DURATION,
        )
        onTimingPreview(dragState.index, nextStart, dragState.originalEnd)
        setDragState(current => current ? { ...current, latestStart: nextStart, latestEnd: dragState.originalEnd } : current)
        return
      }

      const nextEnd = clamp(
        dragState.originalEnd + deltaSeconds,
        dragState.originalStart + MIN_DURATION,
        totalDuration,
      )
      onTimingPreview(dragState.index, dragState.originalStart, nextEnd)
      setDragState(current => current ? { ...current, latestStart: dragState.originalStart, latestEnd: nextEnd } : current)
    }

    const handlePointerUp = () => {
      if (dragState && (dragState.latestStart !== dragState.originalStart || dragState.latestEnd !== dragState.originalEnd)) {
        onTimingCommit({
          index: dragState.index,
          before: {
            start: dragState.originalStart,
            end: dragState.originalEnd,
          },
          after: {
            start: dragState.latestStart,
            end: dragState.latestEnd,
          },
        })
      }
      setDragState(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [dragState, onTimingCommit, onTimingPreview, totalDuration, trackWidth])

  const handleTrackSeek = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect)
      return

    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1)
    onSeek(ratio * totalDuration)
  }

  const tickMarks = useMemo(() => {
    const count = Math.min(Math.max(Math.floor(totalDuration / 2), 4), 8)
    return Array.from({ length: count + 1 }, (_, index) => {
      const ratio = index / count
      return {
        ratio,
        label: formatTimelineTime(totalDuration * ratio),
      }
    })
  }, [totalDuration])

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
        <div>
          <Text className="timeline-kicker">Timeline</Text>
          <Text className="timeline-title">拖拽字幕块直接调整时间</Text>
        </div>
        <div className="timeline-status-group">
          <Text className="timeline-current">
            播放位置
            {' '}
            {formatTimelineTime(currentTime)}
          </Text>
          <Text className="timeline-shortcut">
            Ctrl/Cmd+Z 撤销 · Ctrl/Cmd+Shift+Z 重做
          </Text>
        </div>
      </div>

      <div className="timeline-ruler">
        {tickMarks.map(mark => (
          <div
            key={mark.ratio}
            className="timeline-tick"
            style={{ left: `${mark.ratio * 100}%` }}
          >
            <span />
            <label>{mark.label}</label>
          </div>
        ))}
      </div>

      <div
        ref={trackRef}
        className="timeline-track"
        style={{ height: `${trackHeight}px` }}
        onClick={(event) => {
          if (dragState)
            return
          handleTrackSeek(event.clientX)
        }}
      >
        <div
          className="timeline-playhead"
          style={{ left: `${(currentTime / totalDuration) * 100}%` }}
        />

        {subtitles.map((subtitle, index) => {
          const { start, end } = getSubtitleBounds(subtitle)
          const widthPercent = Math.max(((end - start) / totalDuration) * 100, 1.2)
          const leftPercent = (start / totalDuration) * 100
          const active = index === activeIndex
          const row = rowsByIndex[index] ?? 0
          const widthPx = trackWidth ? ((end - start) / totalDuration) * trackWidth : 0
          const compact = widthPx > 0 && widthPx < 140
          const top = TRACK_TOP_PADDING + row * (TRACK_ROW_HEIGHT + TRACK_ROW_GAP)

          return (
            <div
              key={subtitle.id}
              className={`timeline-segment ${active ? 'timeline-segment-active' : ''} ${compact ? 'timeline-segment-compact' : ''}`}
              style={{ left: `${leftPercent}%`, width: `${widthPercent}%`, top: `${top}px`, height: `${TRACK_ROW_HEIGHT}px` }}
              onPointerDown={(event) => {
                event.stopPropagation()
                shellRef.current?.focus()
                setDragState({
                  index,
                  mode: 'move',
                  originX: event.clientX,
                  originalStart: start,
                  originalEnd: end,
                  latestStart: start,
                  latestEnd: end,
                })
              }}
            >
              <button
                type="button"
                aria-label="调整字幕开始时间"
                className="timeline-handle timeline-handle-start"
                onPointerDown={(event) => {
                  event.stopPropagation()
                  shellRef.current?.focus()
                  setDragState({
                    index,
                    mode: 'start',
                    originX: event.clientX,
                    originalStart: start,
                    originalEnd: end,
                    latestStart: start,
                    latestEnd: end,
                  })
                }}
              />
              <div className="timeline-segment-body">
                <strong>
                  #
                  {index + 1}
                </strong>
                <span className="timeline-segment-preview">
                  <TimelineSegmentPreview text={subtitle.text} />
                </span>
              </div>
              <button
                type="button"
                aria-label="调整字幕结束时间"
                className="timeline-handle timeline-handle-end"
                onPointerDown={(event) => {
                  event.stopPropagation()
                  shellRef.current?.focus()
                  setDragState({
                    index,
                    mode: 'end',
                    originX: event.clientX,
                    originalStart: start,
                    originalEnd: end,
                    latestStart: start,
                    latestEnd: end,
                  })
                }}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
