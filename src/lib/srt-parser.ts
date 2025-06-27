export interface Subtitle {
  id: number;
  startTime: string;
  endTime: string;
  text: string;
}

// Parses SRT content into an array of Subtitle objects
export function parseSrt(srt: string): Subtitle[] {
  const subtitles: Subtitle[] = [];
  const lines = srt.trim().split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    if (lines[i].trim() === '') {
      i++;
      continue;
    }

    const id = parseInt(lines[i], 10);
    i++;

    if (!lines[i] || !lines[i].includes('-->')) {
      // Invalid format, skip this block
      while(i < lines.length && lines[i].trim() !== '') {
        i++;
      }
      continue;
    }

    const [startTime, endTime] = lines[i].split('-->').map(time => time.trim());
    i++;

    let text = '';
    while (i < lines.length && lines[i].trim() !== '') {
      text += lines[i] + '\n';
      i++;
    }

    subtitles.push({ id, startTime, endTime, text: text.trim() });
    i++; // Move to the next subtitle block
  }

  return subtitles;
}

// Converts an array of Subtitle objects back into SRT format string
export function stringifySrt(subtitles: Subtitle[]): string {
  return subtitles
    .map(sub => {
      return `${sub.id}\n${sub.startTime} --> ${sub.endTime}\n${sub.text}`;
    })
    .join('\n\n');
}
