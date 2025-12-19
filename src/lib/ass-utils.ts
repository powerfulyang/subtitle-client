import { Subtitle } from './srt-parser';

export interface AssStyles {
  fontSize: number;
  primaryColor: string; // #RRGGBB
  outlineColor: string; // #RRGGBB
  backgroundColor: string; // #RRGGBB
  alignment: number; // 1-9, standard is 2 (bottom center)
  marginV: number; // Vertical margin
  fontName: string;
}

/**
 * Converts hex color (#RRGGBB) to ASS color (&H00BBGGRR)
 * ASS format is Alpha(00-FF) Blue Green Red
 * We assume fully opaque (00) for now, or user can provide alpha? 
 * Let's stick to opaque for simplicity.
 */
export function toAssColor(hex: string): string {
  // Strip #
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length !== 6) return '&H00FFFFFF'; // Fallback
  
  const r = cleanHex.substring(0, 2);
  const g = cleanHex.substring(2, 4);
  const b = cleanHex.substring(4, 6);
  
  return `&H00${b}${g}${r}`;
}

/**
 * Converts SRT timestamp (HH:MM:SS,mmm) to ASS timestamp (H:MM:SS.cc)
 */
function toAssTime(srtTime: string): string {
  const [h, m, s] = srtTime.split(':');
  const [seconds, ms] = s.split(',');

  // Parse numeric values to remove leading zeros if necessary for hours
  const hours = parseInt(h, 10);

  // ASS uses centiseconds (2 digits), SRT uses milliseconds (3 digits)
  const cs = Math.floor(parseInt(ms, 10) / 10).toString().padStart(2, '0');

  // Ensure minutes and seconds are padded to 2 digits
  const minutes = m.padStart(2, '0');
  const secs = seconds.padStart(2, '0');

  return `${hours}:${minutes}:${secs}.${cs}`;
}

export const DEFAULT_ASS_STYLES: AssStyles = {
  fontSize: 24, // Reduced from 60 for better default scaling on typical web players
  primaryColor: '#FFFFFF',
  outlineColor: '#000000',
  backgroundColor: '#000000',
  alignment: 2, // Bottom Center
  marginV: 30,
  fontName: 'Roboto'
};

/**
 * Generates a complete ASS file content from an array of Subtitles.
 * Includes a default style that mimics standard video player subtitles.
 */
export function generateAss(subtitles: Subtitle[], styles: AssStyles = DEFAULT_ASS_STYLES): string {
  const primary = toAssColor(styles.primaryColor);
  const outline = toAssColor(styles.outlineColor);
  const back = toAssColor(styles.backgroundColor);
  const fontName = styles.fontName || 'Roboto';
  const fontSize = styles.fontSize || 24;
  const alignment = styles.alignment || 2;
  const marginV = styles.marginV || 30;
  
  const header = `[Script Info]
Title: Generated Subtitles
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${primary},&H000000FF,${outline},${back},0,0,0,0,100,100,0,0,1,2,1,${alignment},10,10,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = subtitles.map(sub => {
    // ASS format: Dialogue: 0,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
    // Note: We strip HTML tags if any, or convert line breaks
    // Simple sanitization: replace newlines with \N
    const text = sub.text.replace(/\n/g, '\\N');
    const start = toAssTime(sub.startTime);
    const end = toAssTime(sub.endTime);
    
    return `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`;
  }).join('\n');

  return header + events;
}
