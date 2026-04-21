import type { Subtitle } from '@/lib/srt'
import { ClockCircleOutlined, MergeCellsOutlined, PlayCircleOutlined } from '@ant-design/icons'
import { Button, Flex, Space, Typography } from 'antd'
import { useEffect, useMemo, useRef } from 'react'
import { MathRichTextEditor } from '@/components/math-rich-text-editor'
import { findActiveSubtitleIndex, srtTimeToSeconds } from '@/lib/srt'

const { Text } = Typography

interface SubtitleEditorProps {
  subtitles: Subtitle[]
  currentTime: number
  onChange: (index: number, text: string) => void
  onSplit: (index: number, cursorOffset: number) => void
  onMergeWithPrevious: (index: number) => void
  onMergeWithNext: (index: number) => void
  onSeek: (time: number) => void
  onSeekAndPlay: (time: number) => void
}

export function SubtitleEditor({
  subtitles,
  currentTime,
  onChange,
  onSplit,
  onMergeWithPrevious,
  onMergeWithNext,
  onSeek,
  onSeekAndPlay,
}: SubtitleEditorProps) {
  const activeIndex = useMemo(() => findActiveSubtitleIndex(subtitles, currentTime), [subtitles, currentTime])
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (activeIndex < 0)
      return
    const node = containerRef.current?.querySelector(`[data-index="${activeIndex}"]`)
    if (node instanceof HTMLElement) {
      node.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [activeIndex])

  return (
    <div ref={containerRef} className="custom-scrollbar h-full flex-1 min-h-0 overflow-y-auto pr-1">
      <Flex vertical gap={12}>
        {subtitles.map((subtitle, index) => {
          const active = index === activeIndex
          const startTimeInSeconds = srtTimeToSeconds(subtitle.startTime)

          return (
            <div
              key={subtitle.id}
              data-index={index}
              className={`subtitle-card ${active ? 'subtitle-card-active' : ''}`}
              onClick={() => onSeek(startTimeInSeconds)}
            >
              <Flex vertical gap={12}>
                <Flex justify="space-between" align="center">
                  <Space size={0} className="subtitle-time-group">
                    <Button
                      type="text"
                      size="middle"
                      icon={<ClockCircleOutlined />}
                      className={`subtitle-time-chip ${active ? 'subtitle-time-chip-active' : ''}`}
                      title="跳转到该时间"
                    >
                      <Text className="subtitle-time-text">
                        {subtitle.startTime}
                        →
                        {subtitle.endTime}
                      </Text>
                    </Button>
                    <Button
                      type="text"
                      size="middle"
                      icon={<PlayCircleOutlined />}
                      onClick={() => onSeekAndPlay(startTimeInSeconds)}
                      className={`subtitle-play-btn ${active ? 'subtitle-play-btn-active' : ''}`}
                      title="跳转并播放"
                    />
                  </Space>
                  <Text className="subtitle-index-text">
                    #
                    {index + 1}
                  </Text>
                </Flex>

                <Flex gap={8} wrap>
                  <Button
                    size="small"
                    icon={<MergeCellsOutlined />}
                    disabled={index === 0}
                    onClick={() => onMergeWithPrevious(index)}
                  >
                    合并上一条
                  </Button>
                  <Button
                    size="small"
                    icon={<MergeCellsOutlined />}
                    disabled={index === subtitles.length - 1}
                    onClick={() => onMergeWithNext(index)}
                  >
                    合并下一条
                  </Button>
                </Flex>

                <MathRichTextEditor
                  value={subtitle.text}
                  active={active}
                  onChange={nextValue => onChange(index, nextValue)}
                  onSplitAtCursor={cursorOffset => onSplit(index, cursorOffset)}
                />
              </Flex>
            </div>
          )
        })}
      </Flex>
    </div>
  )
}
