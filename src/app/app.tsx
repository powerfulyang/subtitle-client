import type { VideoStageRef } from '@/components/video-stage'
import type { Subtitle } from '@/lib/srt'
import { CloudUploadOutlined, PlayCircleOutlined } from '@ant-design/icons'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  App as AntdApp,
  Button,
  Flex,
  Popover,
  Progress,
  Typography,
  Upload,
} from 'antd'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Download,
  FileCode,
  FileVideo,
  Loader2,
  Plus,
  Settings2,
  Sparkles,
  Wand2,
} from 'lucide-react'
import { lazy, Suspense, useCallback, useRef, useState } from 'react'
import { useDebounce } from 'use-debounce'
import { generateAss } from '@/lib/ass'
import { convertAssLatexViaApi } from '@/lib/ass-convert'
import { API_BASE_URL, API_PATHS } from '@/lib/constants'
import { burnSubtitlesIntoVideo } from '@/lib/ffmpeg'
import { extractAudioFromMedia } from '@/lib/media'
import { buildCharTimingsFromWords, mergeSubtitleWithNext, parseSrt, secondsToSrtTime, splitSubtitleAtCursor, stringifySrt } from '@/lib/srt'
import { computeBlobHash, downloadBlob, fileNameBase } from '@/lib/utils'
import { useEditorStore } from '@/store/editor-store'

const StylePanel = lazy(() => import('@/components/style-panel').then(m => ({ default: m.StylePanel })))
const SubtitleEditor = lazy(() => import('@/components/subtitle-editor').then(m => ({ default: m.SubtitleEditor })))
const SubtitleTimeline = lazy(() => import('@/components/subtitle-timeline').then(m => ({ default: m.SubtitleTimeline })))
const VideoStage = lazy(() => import('@/components/video-stage').then(m => ({ default: m.VideoStage })))

const { Title, Text } = Typography

const DEMO_VIDEO_URL = '/demo.mp4'

const DEMO_SUBTITLES: Subtitle[] = [
  {
    id: 1,
    startTime: '00:00:00,000',
    endTime: '00:00:04,000',
    text: 'JASSUB demo loaded on home page $-1a$ $-a$ $-d$ $a_1$',
  },
  {
    id: 2,
    startTime: '00:00:04,000',
    endTime: '00:00:08,000',
    text: 'Inline formula: $E = mc^2$',
  },
  {
    id: 3,
    startTime: '00:00:08,000',
    endTime: '00:00:12,000',
    text: '$$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$',
  },
]

async function fetchDemoFile() {
  const response = await fetch(DEMO_VIDEO_URL)
  const blob = await response.blob()
  return new File([blob], 'demo.mp4', { type: blob.type || 'video/mp4' })
}

interface TimelineHistoryEntry {
  index: number
  before: { start: number, end: number }
  after: { start: number, end: number }
}

function LoadingFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center py-12">
      <Loader2 className="animate-spin text-blue-600" size={32} />
    </div>
  )
}

function BurnModalContent() {
  const { isBurning, burnProgress } = useEditorStore()

  if (isBurning) {
    return (
      <div className="py-4">
        <Progress
          percent={burnProgress}
          status="active"
          size={[0, 10]}
          strokeColor={{
            '0%': '#1677ff',
            '100%': '#52c41a',
          }}
        />
        <div className="mt-3 text-center text-sm font-medium text-slate-600">
          正在处理:
          {' '}
          <span className="text-blue-600">
            {burnProgress}
            %
          </span>
        </div>
        <div className="mt-1 text-center text-xs text-slate-400">
          请勿关闭或刷新页面，视频处理中...
        </div>
      </div>
    )
  }

  return (
    <div className="py-2">
      <p>首次导出会懒加载 FFmpeg.wasm（约 30MB），请确保网络通畅。</p>
      <p className="mt-2 font-medium text-slate-700">是否继续导出硬字幕视频？</p>
    </div>
  )
}

export function App() {
  const { message, modal, notification } = AntdApp.useApp()
  const stageRef = useRef<VideoStageRef>(null)
  const [videoDuration, setVideoDuration] = useState(0)
  const undoStackRef = useRef<TimelineHistoryEntry[]>([])
  const redoStackRef = useRef<TimelineHistoryEntry[]>([])
  const [_timelineVersion, setTimelineVersion] = useState(0)

  const {
    media,
    subtitles,
    currentTime,
    styles,
    customFont,
    isGenerating,
    isBurning,
    generationMessage,
    setMedia,
    setSubtitles,
    updateSubtitle,
    updateSubtitleTiming,
    setCurrentTime,
    setStyles,
    setCustomFont,
    setGenerating,
    setBurning,
    setBurnProgress,
    resetProject,
  } = useEditorStore()

  const [debouncedSubtitles] = useDebounce(subtitles, 500)
  const [debouncedStyles] = useDebounce(styles, 500)

  const { data: resolvedAssContent = '', isFetching } = useQuery({
    queryKey: ['ass-content', debouncedSubtitles, debouncedStyles],
    enabled: subtitles.length > 0,
    queryFn: async ({ signal }) => {
      const rawAss = generateAss(subtitles, styles)
      try {
        const { ass } = await convertAssLatexViaApi(rawAss, {
          fontSize: styles.fontSize,
          signal,
        })
        return ass || rawAss
      }
      catch (error) {
        if ((error as Error).name === 'AbortError')
          throw error
        return rawAss
      }
    },
    placeholderData: keepPreviousData,
  })

  const canUndoTimeline = undoStackRef.current.length > 0
  const canRedoTimeline = redoStackRef.current.length > 0

  const clearTimelineHistory = useCallback(() => {
    undoStackRef.current = []
    redoStackRef.current = []
    setTimelineVersion(version => version + 1)
  }, [])

  const handleMediaSelect = useCallback((file: File) => {
    setMedia({
      file,
      url: URL.createObjectURL(file),
      kind: 'video',
    })
    setVideoDuration(0)
    clearTimelineHistory()
  }, [clearTimelineHistory, setMedia])

  const handleGenerateSubtitles = useCallback(async () => {
    if (!media) {
      message.error('请先导入一个视频文件。')
      return
    }

    const endpoint = `${API_BASE_URL}${API_PATHS.TRANSCRIBE}`
    if (!endpoint) {
      notification.error({
        title: 'API 配置缺失',
        description: '缺少 VITE_BASE_URL，无法发起转录。',
      })
      return
    }

    setGenerating(true, 'Extracting audio in browser')
    try {
      const extracted = await extractAudioFromMedia(media.file)
      setGenerating(true, 'Uploading audio to Whisper API')

      const hash = await computeBlobHash(extracted.blob)
      const urlWithHash = `${endpoint}?hash=${hash}`

      const response = await fetch(urlWithHash, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        body: extracted.blob,
      })

      if (!response.ok)
        throw new Error(`Transcribe request failed: ${response.status}`)

      const data = (await response.json()) as {
        srt_content?: string
        segments?: Array<{
          start: number
          end: number
          text: string
          words?: Array<{ word: string, start: number, end: number }>
        }>
      }

      let parsed: Subtitle[] = []
      if (data.srt_content) {
        parsed = parseSrt(data.srt_content)
      }
      else if (data.segments) {
        parsed = data.segments.map((s, i) => ({
          id: i + 1,
          startTime: secondsToSrtTime(s.start),
          endTime: secondsToSrtTime(s.end),
          text: s.text.trim(),
          charTimings: s.words ? buildCharTimingsFromWords(s.words) : undefined,
        }))
      }
      else {
        throw new Error('The transcription response did not include srt_content or segments.')
      }

      setSubtitles(parsed)
      clearTimelineHistory()
      message.success(`已生成 ${parsed.length} 条字幕。`)
    }
    catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown transcription error'
      message.error(msg)
    }
    finally {
      setGenerating(false, '')
    }
  }, [clearTimelineHistory, media, message, notification, setGenerating, setSubtitles])

  const handleImportSrt = useCallback(async (file: File) => {
    try {
      const content = await file.text()
      const parsed = parseSrt(content)
      setSubtitles(parsed)
      clearTimelineHistory()
      message.success(`已导入 ${parsed.length} 条字幕。`)
    }
    catch {
      message.error('SRT 文件解析失败。')
    }
  }, [clearTimelineHistory, message, setSubtitles])

  const handleExportSrt = useCallback(() => {
    if (subtitles.length === 0) {
      message.warning('当前没有字幕可导出。')
      return
    }

    const blob = new Blob([stringifySrt(subtitles)], { type: 'text/plain;charset=utf-8' })
    downloadBlob(blob, `${fileNameBase(media?.file.name ?? 'subtitle-project')}.srt`)
  }, [media, message, subtitles])

  const handleBurn = useCallback(async () => {
    if (!media) {
      message.error('请先导入视频文件。')
      return
    }

    if (!resolvedAssContent) {
      message.warning('还没有可用于烧录的字幕内容。')
      return
    }

    modal.confirm({
      title: '导出硬字幕视频',
      content: <BurnModalContent />,
      centered: true,
      okText: '立即导出',
      cancelText: '取消',
      onOk: async () => {
        setBurning(true)
        setBurnProgress(0)

        try {
          const blob = await burnSubtitlesIntoVideo(media.file, resolvedAssContent, customFont, setBurnProgress)
          downloadBlob(blob, `${fileNameBase(media.file.name)}-burned.mp4`)
          notification.success({
            title: '导出成功',
            description: '硬字幕视频已保存到您的设备。',
          })
        }
        catch (error) {
          console.error(error)
          const msg = error instanceof Error ? error.message : 'Unknown burn error'
          notification.error({
            title: '导出失败',
            description: msg,
          })
        }
        finally {
          setBurning(false)
          setBurnProgress(0)
        }
      },
    })
    // eslint-disable-next-line react/exhaustive-deps
  }, [resolvedAssContent, customFont, media, message, modal, notification])

  const handleImportSrtClick = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.srt,text/plain,application/x-subrip'
    input.onchange = (event) => {
      const file = (event.target as HTMLInputElement).files?.[0]
      if (file)
        void handleImportSrt(file)
    }
    input.click()
  }, [handleImportSrt])

  const handleUploadMediaBeforeUpload = useCallback((file: File) => {
    handleMediaSelect(file)
    return false
  }, [handleMediaSelect])

  const handleLoadDemo = useCallback(async () => {
    try {
      const demoFile = await fetchDemoFile()
      handleMediaSelect(demoFile)
      setSubtitles(DEMO_SUBTITLES)
      clearTimelineHistory()
    }
    catch {
      message.error('加载演示文件失败')
    }
  }, [clearTimelineHistory, handleMediaSelect, message, setSubtitles])

  const applyTimelineTiming = useCallback((index: number, start: number, end: number) => {
    updateSubtitleTiming(index, {
      startTime: secondsToSrtTime(start),
      endTime: secondsToSrtTime(end),
    })
  }, [updateSubtitleTiming])

  const handleSplitSubtitle = useCallback((index: number, cursorOffset: number) => {
    const result = splitSubtitleAtCursor(subtitles, index, cursorOffset)

    if (!result) {
      message.warning('当前光标位置无法分割字幕，请把光标放到两段文本之间。')
      return
    }

    setSubtitles(result.subtitles)
    clearTimelineHistory()
    stageRef.current?.seekTo(result.splitTime)
    message.success('字幕已按光标位置分割。')
  }, [clearTimelineHistory, message, setSubtitles, subtitles])

  const handleMergeWithNext = useCallback((index: number) => {
    const merged = mergeSubtitleWithNext(subtitles, index)

    if (!merged) {
      message.warning('没有可合并的相邻字幕。')
      return
    }

    setSubtitles(merged)
    clearTimelineHistory()
    message.success('已合并相邻字幕。')
  }, [clearTimelineHistory, message, setSubtitles, subtitles])

  const handleMergeWithPrevious = useCallback((index: number) => {
    if (index <= 0) {
      message.warning('已经是第一条字幕。')
      return
    }

    const merged = mergeSubtitleWithNext(subtitles, index - 1)
    if (!merged) {
      message.warning('没有可合并的相邻字幕。')
      return
    }

    setSubtitles(merged)
    clearTimelineHistory()
    message.success('已合并相邻字幕。')
  }, [clearTimelineHistory, message, setSubtitles, subtitles])

  const handleTimelineCommit = useCallback((entry: TimelineHistoryEntry) => {
    if (entry.before.start === entry.after.start && entry.before.end === entry.after.end)
      return

    undoStackRef.current = [...undoStackRef.current, entry]
    redoStackRef.current = []
    setTimelineVersion(version => version + 1)
  }, [])

  const handleTimelineUndo = useCallback(() => {
    const lastEntry = undoStackRef.current.at(-1)
    if (!lastEntry)
      return

    undoStackRef.current = undoStackRef.current.slice(0, -1)
    redoStackRef.current = [...redoStackRef.current, lastEntry]
    applyTimelineTiming(lastEntry.index, lastEntry.before.start, lastEntry.before.end)
    setTimelineVersion(version => version + 1)
  }, [applyTimelineTiming])

  const handleTimelineRedo = useCallback(() => {
    const lastEntry = redoStackRef.current.at(-1)
    if (!lastEntry)
      return

    redoStackRef.current = redoStackRef.current.slice(0, -1)
    undoStackRef.current = [...undoStackRef.current, lastEntry]
    applyTimelineTiming(lastEntry.index, lastEntry.after.start, lastEntry.after.end)
    setTimelineVersion(version => version + 1)
  }, [applyTimelineTiming])

  return (
    <div className={`app-shell ${!media ? 'app-shell-landing' : ''}`}>
      <AnimatePresence mode="wait">
        {!media
          ? (
              <motion.div
                key="landing"
                className="landing-shell"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -14 }}
              >
                <div className="glass-panel landing-card">
                  <div className="landing-grid">
                    <div className="landing-copy">
                      <span className="hero-eyebrow">
                        <Sparkles size={14} />
                        字幕编辑工作台
                      </span>
                      <Title level={1} className="hero-title">
                        Subtitle
                        <span>Studio</span>
                      </Title>
                      <p className="hero-copy">
                        导入视频、生成字幕、直接在时间轴上微调，并在同一个工作台里处理公式文本与硬字幕导出。
                      </p>

                      <div className="formula-guide">
                        <div className="formula-guide-copy">
                          <span>公式字幕示例</span>
                          <p>
                            在字幕文本里输入
                            {' '}
                            <code>$E=mc^2$</code>
                            ，预览和导出会按数学公式显示。
                          </p>
                        </div>
                        <div className="formula-guide-preview" aria-label="公式字幕显示示例">
                          E = mc
                          <sup>2</sup>
                        </div>
                      </div>

                      <div className="hero-chip-row">
                        <span className="hero-chip">单轨时间轴剪辑</span>
                        <span className="hero-chip">TipTap 文本编辑</span>
                        <span className="hero-chip">mathfield 公式输入</span>
                        <span className="hero-chip">ASS 实时预览</span>
                      </div>

                      <Flex gap="middle" wrap className="pt-6!">
                        <Button
                          type="link"
                          size="large"
                          icon={<PlayCircleOutlined />}
                          onClick={handleLoadDemo}
                        >
                          体验演示素材
                        </Button>
                        <Upload
                          accept="video/*"
                          showUploadList={false}
                          beforeUpload={handleUploadMediaBeforeUpload}
                        >
                          <Button
                            size="large"
                            type="primary"
                            icon={<CloudUploadOutlined />}
                          >
                            自定义上传
                          </Button>
                        </Upload>
                      </Flex>
                    </div>

                  </div>
                </div>
              </motion.div>
            )
          : (
              <motion.div
                key="workspace"
                className="workspace-shell"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <header className="glass-panel studio-header">
                  <div className="studio-header-meta">
                    <span className="studio-kicker">Workspace</span>
                    <div className="studio-file-title">{media.file.name}</div>
                    <div className="studio-file-subtitle">
                      {Math.round(media.file.size / 1024 / 1024)}
                      {' '}
                      MB ·
                      {' '}
                      {subtitles.length}
                      {' '}
                      条字幕
                    </div>
                  </div>

                  <div className="studio-actions">
                    <Button size="middle" icon={<Plus size={16} />} onClick={handleImportSrtClick}>
                      导入 SRT
                    </Button>
                    <Button
                      size="middle"
                      type="primary"
                      icon={isGenerating ? <Loader2 className="animate-spin" size={16} /> : <Wand2 size={16} />}
                      onClick={() => void handleGenerateSubtitles()}
                      disabled={isGenerating}
                    >
                      ASR 生成字幕
                    </Button>
                    <Button
                      size="middle"
                      icon={<FileCode size={16} />}
                      onClick={handleExportSrt}
                      disabled={subtitles.length === 0}
                    >
                      导出 SRT
                    </Button>
                    <Button
                      size="middle"
                      type="primary"
                      icon={isBurning ? <Loader2 className="animate-spin" size={16} /> : <FileVideo size={16} />}
                      onClick={() => void handleBurn()}
                      disabled={subtitles.length === 0 || isBurning}
                    >
                      烧录字幕
                    </Button>
                    <Button
                      size="middle"
                      danger
                      onClick={() => {
                        clearTimelineHistory()
                        resetProject()
                      }}
                    >
                      重置
                    </Button>
                  </div>
                </header>

                <div className="studio-main">
                  <div className="preview-column">
                    <div className="glass-panel preview-card">
                      <div className="preview-toolbar">
                        <Popover
                          trigger="click"
                          placement="leftTop"
                          content={(
                            <Suspense fallback={<div className="p-8 flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>}>
                              <StylePanel
                                styles={styles}
                                customFont={customFont}
                                onStylesChange={setStyles}
                                onFontChange={setCustomFont}
                              />
                            </Suspense>
                          )}
                        >
                          <Button size="middle" icon={<Settings2 size={16} />}>
                            样式设定
                          </Button>
                        </Popover>

                        <AnimatePresence>
                          {(isGenerating || isFetching) && (
                            <motion.div
                              className="status-chip"
                              initial={{ opacity: 0, x: 12 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: 12 }}
                            >
                              <Loader2 className="animate-spin text-blue-600" size={14} />
                              <Text strong className="text-xs">
                                {isGenerating ? (generationMessage || 'AI 正在分析...') : '字幕样式同步中'}
                              </Text>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      <div className="preview-frame">
                        <Suspense fallback={<LoadingFallback />}>
                          <VideoStage
                            ref={stageRef}
                            mediaUrl={media.url}
                            mediaKind={media.kind}
                            assContent={resolvedAssContent}
                            onTimeUpdate={setCurrentTime}
                            onDurationChange={setVideoDuration}
                            customFont={customFont}
                          />
                        </Suspense>
                      </div>
                    </div>

                    <Suspense fallback={<div className="h-32" />}>
                      <SubtitleTimeline
                        mediaUrl={media.url}
                        subtitles={subtitles}
                        currentTime={currentTime}
                        duration={videoDuration}
                        onSeek={time => stageRef.current?.seekTo(time)}
                        onTimingPreview={applyTimelineTiming}
                        onTimingCommit={handleTimelineCommit}
                        onUndo={handleTimelineUndo}
                        onRedo={handleTimelineRedo}
                        canUndo={canUndoTimeline}
                        canRedo={canRedoTimeline}
                      />
                    </Suspense>
                  </div>

                  <div className="glass-panel editor-panel">
                    <div className="editor-panel-header">
                      <div>
                        <span className="panel-kicker">Captions</span>
                        <h2 className="panel-title">字幕编辑</h2>
                      </div>
                      <div className="editor-panel-tips">
                        <div className="tip-item">
                          <kbd className="tip-kbd">LaTex</kbd>
                          <span>公式渲染</span>
                        </div>
                        <div className="tip-item">
                          <kbd className="tip-kbd">Ctrl</kbd>
                          <kbd className="tip-kbd">Enter</kbd>
                          <span>在光标处拆分</span>
                        </div>
                      </div>
                    </div>

                    {subtitles.length === 0
                      ? (
                          <div className="empty-state">
                            <div className="text-center">
                              <Download size={36} className="mx-auto mb-3" />
                              <Text>等待生成或导入字幕</Text>
                            </div>
                          </div>
                        )
                      : (
                          <Suspense fallback={<LoadingFallback />}>
                            <SubtitleEditor
                              subtitles={subtitles}
                              currentTime={currentTime}
                              onChange={updateSubtitle}
                              onSplit={handleSplitSubtitle}
                              onMergeWithPrevious={handleMergeWithPrevious}
                              onMergeWithNext={handleMergeWithNext}
                              onSeek={time => stageRef.current?.seekTo(time)}
                              onSeekAndPlay={(time) => {
                                stageRef.current?.seekTo(time)
                                stageRef.current?.play()
                              }}
                            />
                          </Suspense>
                        )}
                  </div>
                </div>
              </motion.div>
            )}
      </AnimatePresence>
    </div>
  )
}
