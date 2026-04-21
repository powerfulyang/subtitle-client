import type { JSONContent } from '@tiptap/react'

interface ProseMirrorNodeLike {
  isText?: boolean
  text?: string | null
  attrs?: Record<string, unknown>
  content: {
    size: number
  }
  type: {
    name: string
  }
  forEach: (callback: (node: ProseMirrorNodeLike, offset: number, index: number) => void) => void
}

function createTextNode(text: string): JSONContent | null {
  if (!text)
    return null

  return {
    type: 'text',
    text,
  }
}

function createInlineNodes(line: string): JSONContent[] {
  const nodes: JSONContent[] = []
  const inlineMathPattern = /\${1,2}([^$\n]+)\${1,2}/g
  let lastIndex = 0

  for (const match of line.matchAll(inlineMathPattern)) {
    const matchIndex = match.index ?? 0
    const before = line.slice(lastIndex, matchIndex)
    const textNode = createTextNode(before)

    if (textNode)
      nodes.push(textNode)

    nodes.push({
      type: 'inlineMath',
      attrs: {
        latex: match[1] ?? '',
      },
    })

    lastIndex = matchIndex + match[0].length
  }

  const after = createTextNode(line.slice(lastIndex))
  if (after)
    nodes.push(after)

  return nodes.length > 0
    ? nodes
    : [{ type: 'text', text: '' }]
}

export function subtitleTextToDoc(text: string): JSONContent {
  const lines = text.split('\n')
  const content: JSONContent[] = lines.map(line => ({
    type: 'paragraph',
    content: createInlineNodes(line),
  }))

  return {
    type: 'doc',
    content: content.length > 0
      ? content
      : [{
          type: 'paragraph',
        }],
  }
}

function normalizeMathLatex(latex: string) {
  const trimmed = latex.trim()
  if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length >= 4)
    return trimmed.slice(2, -2).trim()

  if (trimmed.startsWith('$') && trimmed.endsWith('$') && trimmed.length >= 2)
    return trimmed.slice(1, -1).trim()

  return latex
}

function serializeInlineMath(latex: string) {
  return `$${normalizeMathLatex(latex)}$`
}

function stringifyInlineContent(content: JSONContent[] = []) {
  return content.map((node) => {
    if (node.type === 'text')
      return node.text ?? ''

    if (node.type === 'hardBreak')
      return '\n'

    if (node.type === 'inlineMath')
      return serializeInlineMath(String(node.attrs?.latex ?? ''))

    return ''
  }).join('')
}

export function docToSubtitleText(doc: JSONContent) {
  const lines = (doc.content ?? []).map((node) => {
    if (node.type === 'paragraph')
      return stringifyInlineContent(node.content)

    return ''
  })

  return lines.join('\n').trimEnd()
}

function getOffsetWithinParagraph(node: ProseMirrorNodeLike, relativePosition: number) {
  let offset = 0

  node.forEach((child: ProseMirrorNodeLike, childOffset: number) => {
    if (relativePosition <= childOffset)
      return

    if (child.isText) {
      const text = child.text ?? ''
      offset += Math.min(text.length, relativePosition - childOffset)
      return
    }

    if (child.type.name === 'inlineMath') {
      offset += serializeInlineMath(String(child.attrs?.latex ?? '')).length
      return
    }

    if (child.type.name === 'hardBreak') {
      offset += 1
    }
  })

  return offset
}

export function docPositionToSubtitleOffset(doc: ProseMirrorNodeLike, position: number) {
  let offset = 0

  doc.forEach((node: ProseMirrorNodeLike, childOffset: number, index: number) => {
    if (position <= childOffset)
      return

    if (index > 0)
      offset += 1

    const contentStart = childOffset + 1
    const relativePosition = Math.min(Math.max(position - contentStart, 0), node.content.size)

    offset += getOffsetWithinParagraph(node, relativePosition)
  })

  return offset
}
