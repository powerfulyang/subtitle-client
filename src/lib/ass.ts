import type { Subtitle } from '@/lib/srt'

export interface AssStyles {
  fontName: string
  fontSize: number
  primaryColor: string
  outlineColor: string
  backgroundColor: string
  alignment: number
  marginV: number
}

export const DEFAULT_ASS_STYLES: AssStyles = {
  fontName: 'KaiTi',
  fontSize: 54,
  primaryColor: '#FFFFFF',
  outlineColor: '#000000',
  backgroundColor: '#000000',
  alignment: 2,
  marginV: 36,
}

function toAssColor(hex: string) {
  const cleanHex = hex.replace('#', '')
  if (cleanHex.length !== 6)
    return '&H00FFFFFF'

  const red = cleanHex.slice(0, 2)
  const green = cleanHex.slice(2, 4)
  const blue = cleanHex.slice(4, 6)
  return `&H00${blue}${green}${red}`
}

function toAssTime(srtTime: string) {
  const [hours = '0', minutes = '00', seconds = '00,000'] = srtTime.split(':')
  const [whole = '00', millis = '000'] = seconds.split(',')
  const centiseconds = Math.floor(Number.parseInt(millis, 10) / 10).toString().padStart(2, '0')
  return `${Number.parseInt(hours, 10)}:${minutes.padStart(2, '0')}:${whole.padStart(2, '0')}.${centiseconds}`
}

export function generateAss(subtitles: Subtitle[], styles: AssStyles = DEFAULT_ASS_STYLES) {
  const header = `[Script Info]
Title: Subtitle Studio Export
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${styles.fontName},${styles.fontSize},${toAssColor(styles.primaryColor)},&H000000FF,${toAssColor(styles.outlineColor)},${toAssColor(styles.backgroundColor)},0,0,0,0,100,100,0,0,1,2,0,${styles.alignment},20,20,${styles.marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`

  const events = subtitles
    .map((subtitle) => {
      const text = subtitle.text.replace(/\n/g, '\\N')
      return `Dialogue: 0,${toAssTime(subtitle.startTime)},${toAssTime(subtitle.endTime)},Default,,0,0,0,,${text}`
    })
    .join('\n')

  return `${header}${events}`
}
