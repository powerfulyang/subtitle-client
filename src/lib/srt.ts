export interface SubtitleWord {
  word: string
  start: number
  end: number
}

export interface SubtitleCharTiming {
  value: string
  start: number
  end: number
}

export interface Subtitle {
  id: number
  startTime: string
  endTime: string
  text: string
  charTimings?: SubtitleCharTiming[]
}

const MIN_SPLIT_DURATION = 0.08
const SPLIT_GAP = 0.001

export function parseSrt(srt: string): Subtitle[] {
  const subtitles: Subtitle[] = []
  const lines = srt.trim().split(/\r?\n/)
  let index = 0

  while (index < lines.length) {
    if (!lines[index]?.trim()) {
      index += 1
      continue
    }

    const id = Number.parseInt(lines[index] ?? '0', 10) || subtitles.length + 1
    index += 1

    if (!lines[index]?.includes('-->')) {
      while (index < lines.length && lines[index]?.trim()) {
        index += 1
      }
      continue
    }

    const [startTime, endTime] = lines[index].split('-->').map(value => value.trim())
    index += 1

    const textLines: string[] = []
    while (index < lines.length && lines[index]?.trim()) {
      textLines.push(lines[index] ?? '')
      index += 1
    }

    subtitles.push({
      id,
      startTime,
      endTime,
      text: textLines.join('\n').trim(),
    })
  }

  return subtitles
}

export function stringifySrt(subtitles: Subtitle[]) {
  return subtitles
    .map((subtitle, index) => `${index + 1}\n${subtitle.startTime} --> ${subtitle.endTime}\n${subtitle.text}`)
    .join('\n\n')
}

export function srtTimeToSeconds(time: string) {
  const [hours = '0', minutes = '0', seconds = '0,0'] = time.split(':')
  const [whole = '0', millis = '0'] = seconds.split(',')
  return Number.parseInt(hours, 10) * 3600
    + Number.parseInt(minutes, 10) * 60
    + Number.parseInt(whole, 10)
    + Number.parseInt(millis, 10) / 1000
}

export function secondsToSrtTime(seconds: number) {
  const safeSeconds = Math.max(0, seconds)
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const wholeSeconds = Math.floor(safeSeconds % 60)
  const milliseconds = Math.round((safeSeconds - Math.floor(safeSeconds)) * 1000)

  const carrySeconds = milliseconds === 1000 ? wholeSeconds + 1 : wholeSeconds
  const finalMilliseconds = milliseconds === 1000 ? 0 : milliseconds
  const carryMinutes = carrySeconds === 60 ? minutes + 1 : minutes
  const finalSeconds = carrySeconds === 60 ? 0 : carrySeconds
  const carryHours = carryMinutes === 60 ? hours + 1 : hours
  const finalMinutes = carryMinutes === 60 ? 0 : carryMinutes

  return `${String(carryHours).padStart(2, '0')}:${String(finalMinutes).padStart(2, '0')}:${String(finalSeconds).padStart(2, '0')},${String(finalMilliseconds).padStart(3, '0')}`
}

export function getSubtitleBounds(subtitle: Subtitle) {
  return {
    start: srtTimeToSeconds(subtitle.startTime),
    end: srtTimeToSeconds(subtitle.endTime),
  }
}

export function findActiveSubtitleIndex(subtitles: Subtitle[], currentTime: number) {
  let left = 0
  let right = subtitles.length - 1

  while (left <= right) {
    const middle = Math.floor((left + right) / 2)
    const item = subtitles[middle]
    const start = srtTimeToSeconds(item.startTime)
    const end = srtTimeToSeconds(item.endTime)

    if (currentTime >= start && currentTime <= end)
      return middle
    if (currentTime < start) {
      right = middle - 1
    }
    else {
      left = middle + 1
    }
  }

  return -1
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function normalizeSubtitleIds(subtitles: Subtitle[]) {
  return subtitles.map((subtitle, index) => ({
    ...subtitle,
    id: index + 1,
  }))
}

function computeLcsMatches(source: string, target: string) {
  const sourceLength = source.length
  const targetLength = target.length
  const dp = Array.from({ length: sourceLength + 1 }, () => Array.from({ length: targetLength + 1 }).fill(0)) as number[][]

  for (let i = sourceLength - 1; i >= 0; i -= 1) {
    for (let j = targetLength - 1; j >= 0; j -= 1) {
      dp[i][j] = source[i] === target[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const matches: Array<{ sourceIndex: number, targetIndex: number }> = []
  let i = 0
  let j = 0

  while (i < sourceLength && j < targetLength) {
    if (source[i] === target[j]) {
      matches.push({ sourceIndex: i, targetIndex: j })
      i += 1
      j += 1
      continue
    }

    if (dp[i + 1][j] >= dp[i][j + 1]) {
      i += 1
    }
    else {
      j += 1
    }
  }

  return matches
}

function interpolateAnchors(
  targetBoundary: number,
  previousAnchor: { editedBoundary: number, sourceBoundary: number, time: number },
  nextAnchor: { editedBoundary: number, sourceBoundary: number, time: number },
) {
  if (previousAnchor.editedBoundary === nextAnchor.editedBoundary) {
    return {
      sourceBoundary: previousAnchor.sourceBoundary,
      time: previousAnchor.time,
    }
  }

  const ratio = (targetBoundary - previousAnchor.editedBoundary) / (nextAnchor.editedBoundary - previousAnchor.editedBoundary)

  return {
    sourceBoundary: previousAnchor.sourceBoundary + ratio * (nextAnchor.sourceBoundary - previousAnchor.sourceBoundary),
    time: previousAnchor.time + ratio * (nextAnchor.time - previousAnchor.time),
  }
}

function resolveCursorTiming(subtitle: Subtitle, cursorOffset: number) {
  const { start, end } = getSubtitleBounds(subtitle)
  const textLength = subtitle.text.length
  const safeCursorOffset = clamp(cursorOffset, 0, textLength)
  const charTimings = subtitle.charTimings ?? []
  const fallbackRatio = textLength === 0 ? 0.5 : safeCursorOffset / textLength

  if (charTimings.length === 0) {
    return {
      time: start + (end - start) * fallbackRatio,
      sourceBoundaryIndex: Math.round(fallbackRatio * textLength),
    }
  }

  const sourceText = charTimings.map(item => item.value).join('')
  const matches = computeLcsMatches(sourceText, subtitle.text)
  const minRequiredMatches = Math.max(2, Math.floor(Math.min(sourceText.length, subtitle.text.length) * 0.2))

  if (matches.length < minRequiredMatches) {
    return {
      time: start + (end - start) * fallbackRatio,
      sourceBoundaryIndex: Math.round(fallbackRatio * charTimings.length),
    }
  }

  const boundaryTimes = [charTimings[0]?.start ?? start]
  charTimings.forEach((item) => {
    boundaryTimes.push(item.end)
  })

  const anchors = [
    { editedBoundary: 0, sourceBoundary: 0, time: start },
    { editedBoundary: subtitle.text.length, sourceBoundary: sourceText.length, time: end },
  ]

  matches.forEach(({ sourceIndex, targetIndex }) => {
    anchors.push({
      editedBoundary: targetIndex,
      sourceBoundary: sourceIndex,
      time: boundaryTimes[sourceIndex] ?? start,
    })
    anchors.push({
      editedBoundary: targetIndex + 1,
      sourceBoundary: sourceIndex + 1,
      time: boundaryTimes[sourceIndex + 1] ?? end,
    })
  })

  anchors.sort((left, right) => {
    if (left.editedBoundary !== right.editedBoundary)
      return left.editedBoundary - right.editedBoundary
    return left.sourceBoundary - right.sourceBoundary
  })

  let previousAnchor = anchors[0]
  let nextAnchor = anchors[anchors.length - 1]

  for (const anchor of anchors) {
    if (anchor.editedBoundary <= safeCursorOffset)
      previousAnchor = anchor
    if (anchor.editedBoundary >= safeCursorOffset) {
      nextAnchor = anchor
      break
    }
  }

  const resolved = interpolateAnchors(safeCursorOffset, previousAnchor, nextAnchor)

  return {
    time: clamp(resolved.time, start, end),
    sourceBoundaryIndex: clamp(Math.round(resolved.sourceBoundary), 0, charTimings.length),
  }
}

export function buildCharTimingsFromWords(words: SubtitleWord[]) {
  const charTimings: SubtitleCharTiming[] = []

  words.forEach((word) => {
    const value = word.word ?? ''
    if (!value)
      return

    const duration = Math.max(word.end - word.start, 0)
    const characters = value.split('')

    characters.forEach((character, index) => {
      const nextStart = word.start + duration * (index / characters.length)
      const nextEnd = index === characters.length - 1
        ? word.end
        : word.start + duration * ((index + 1) / characters.length)

      charTimings.push({
        value: character,
        start: nextStart,
        end: nextEnd,
      })
    })
  })

  return charTimings
}

export function splitSubtitleAtCursor(subtitles: Subtitle[], index: number, cursorOffset: number) {
  const subtitle = subtitles[index]
  if (!subtitle)
    return null

  const safeCursorOffset = clamp(cursorOffset, 0, subtitle.text.length)
  const leftText = subtitle.text.slice(0, safeCursorOffset).trimEnd()
  const rightText = subtitle.text.slice(safeCursorOffset).trimStart()

  if (!leftText || !rightText)
    return null

  const { start, end } = getSubtitleBounds(subtitle)
  if (end - start <= MIN_SPLIT_DURATION * 2 + SPLIT_GAP)
    return null

  const resolved = resolveCursorTiming(subtitle, safeCursorOffset)
  const splitTime = clamp(resolved.time, start + MIN_SPLIT_DURATION, end - MIN_SPLIT_DURATION - SPLIT_GAP)
  const rightStartTime = splitTime + SPLIT_GAP
  const charTimings = subtitle.charTimings ?? []
  const leftCharTimings = charTimings.slice(0, resolved.sourceBoundaryIndex)
  const rightCharTimings = charTimings.slice(resolved.sourceBoundaryIndex)

  const next = [
    ...subtitles.slice(0, index),
    {
      ...subtitle,
      endTime: secondsToSrtTime(splitTime),
      text: leftText,
      charTimings: leftCharTimings.length > 0 ? leftCharTimings : undefined,
    },
    {
      ...subtitle,
      startTime: secondsToSrtTime(rightStartTime),
      endTime: subtitle.endTime,
      text: rightText,
      charTimings: rightCharTimings.length > 0 ? rightCharTimings : undefined,
    },
    ...subtitles.slice(index + 1),
  ]

  return {
    subtitles: normalizeSubtitleIds(next),
    splitTime,
  }
}

export function mergeSubtitleWithNext(subtitles: Subtitle[], index: number) {
  const current = subtitles[index]
  const nextSubtitle = subtitles[index + 1]

  if (!current || !nextSubtitle)
    return null

  const mergedText = [current.text.trimEnd(), nextSubtitle.text.trimStart()].filter(Boolean).join('\n')
  const mergedCharTimings = [...(current.charTimings ?? []), ...(nextSubtitle.charTimings ?? [])]

  const next = [
    ...subtitles.slice(0, index),
    {
      ...current,
      endTime: nextSubtitle.endTime,
      text: mergedText,
      charTimings: mergedCharTimings.length > 0 ? mergedCharTimings : undefined,
    },
    ...subtitles.slice(index + 2),
  ]

  return normalizeSubtitleIds(next)
}
