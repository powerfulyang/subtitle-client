import type { AssStyles } from '@/lib/ass'
import type { CustomFont } from '@/lib/ffmpeg'
import type { Subtitle } from '@/lib/srt'
import { create } from 'zustand'
import { DEFAULT_ASS_STYLES } from '@/lib/ass'

export interface MediaAsset {
  file: File
  url: string
  kind: 'video'
}

interface EditorState {
  media: MediaAsset | null
  subtitles: Subtitle[]
  currentTime: number
  styles: AssStyles
  customFont: CustomFont | null
  isGenerating: boolean
  isBurning: boolean
  burnProgress: number
  generationMessage: string
  setMedia: (media: MediaAsset | null) => void
  setSubtitles: (subtitles: Subtitle[]) => void
  updateSubtitle: (index: number, text: string) => void
  updateSubtitleTiming: (index: number, range: { startTime: string, endTime: string }) => void
  setCurrentTime: (time: number) => void
  setStyles: (styles: AssStyles) => void
  setCustomFont: (font: CustomFont | null) => void
  setGenerating: (value: boolean, message?: string) => void
  setBurning: (value: boolean) => void
  setBurnProgress: (progress: number) => void
  resetProject: () => void
}

const STORAGE_KEY = 'subtitle-styles'

function getSavedStyles(): AssStyles {
  if (typeof window === 'undefined')
    return DEFAULT_ASS_STYLES

  const saved = localStorage.getItem(STORAGE_KEY)
  if (!saved)
    return DEFAULT_ASS_STYLES

  try {
    return { ...DEFAULT_ASS_STYLES, ...JSON.parse(saved) }
  }
  catch (e) {
    console.error('Failed to load saved styles:', e)
    return DEFAULT_ASS_STYLES
  }
}

export const useEditorStore = create<EditorState>((set, get) => ({
  media: null,
  subtitles: [],
  currentTime: 0,
  styles: getSavedStyles(),
  customFont: null,
  isGenerating: false,
  isBurning: false,
  burnProgress: 0,
  generationMessage: '',
  setMedia: (media) => {
    const previous = get().media
    if (previous?.url && previous.url !== media?.url) {
      URL.revokeObjectURL(previous.url)
    }
    set({
      media,
      subtitles: [],
      currentTime: 0,
      burnProgress: 0,
    })
  },
  setSubtitles: subtitles => set({ subtitles }),
  updateSubtitle: (index, text) => {
    const next = [...get().subtitles]
    if (!next[index])
      return
    next[index] = { ...next[index], text }
    set({ subtitles: next })
  },
  updateSubtitleTiming: (index, range) => {
    const next = [...get().subtitles]
    if (!next[index])
      return
    next[index] = { ...next[index], ...range }
    set({ subtitles: next })
  },
  setCurrentTime: currentTime => set({ currentTime }),
  setStyles: (styles) => {
    set({ styles })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(styles))
  },
  setCustomFont: customFont => set({ customFont }),
  setGenerating: (isGenerating, generationMessage = '') => set({ isGenerating, generationMessage }),
  setBurning: isBurning => set({ isBurning }),
  setBurnProgress: burnProgress => set({ burnProgress }),
  resetProject: () => {
    const previous = get().media
    if (previous?.url) {
      URL.revokeObjectURL(previous.url)
    }
    set({
      media: null,
      subtitles: [],
      currentTime: 0,
      styles: DEFAULT_ASS_STYLES,
      customFont: null,
      isGenerating: false,
      isBurning: false,
      burnProgress: 0,
      generationMessage: '',
    })
    // Also reset localStorage if needed?
    // Usually resetProject might want to clear saved styles too, or keep them.
    // The reference hook doesn't have a reset that clears localStorage.
    // Let's keep it in sync with the state.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_ASS_STYLES))
  },
}))
