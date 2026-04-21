import type { JSONContent, NodeViewProps } from '@tiptap/react'
import { InputRule, mergeAttributes, Node } from '@tiptap/core'
import Placeholder from '@tiptap/extension-placeholder'
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
} from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { createElement, useEffect, useMemo, useRef } from 'react'
import { docPositionToSubtitleOffset, docToSubtitleText, subtitleTextToDoc } from '@/lib/subtitle-rich-text'
import 'mathlive'

function focusMathField(
  element: MathfieldElement,
  side: 'start' | 'end',
) {
  element.focus()

  if (side === 'start') {
    element.executeCommand('moveToMathfieldStart')
    return
  }

  element.executeCommand('moveToMathfieldEnd')
}

function MathFieldNodeView({ editor, getPos, node, updateAttributes }: NodeViewProps) {
  const mathFieldRef = useRef<MathfieldElement | null>(null)
  const latex = String(node.attrs.latex ?? '')

  useEffect(() => {
    const element = mathFieldRef.current
    if (!element)
      return

    if (element.value !== latex)
      element.value = latex

    element.defaultMode = 'inline-math'
    element.smartFence = true
    element.smartMode = false
    element.popoverPolicy = 'off'
    element.environmentPopoverPolicy = 'off'
    element.virtualKeyboardMode = 'manual'
    element.mathVirtualKeyboardPolicy = 'manual'

    const handleInput = () => {
      updateAttributes({ latex: element.value })
    }

    const handleMoveOut = (event: Event) => {
      const detail = (event as CustomEvent<{ direction?: string }>).detail
      const position = typeof getPos === 'function' ? getPos() : null
      if (typeof position !== 'number')
        return

      if (detail?.direction === 'backward') {
        event.preventDefault()

        editor.chain().setTextSelection(position).focus(position).run()
        return
      }

      if (detail?.direction === 'forward') {
        event.preventDefault()

        const target = position + node.nodeSize
        editor.chain().setTextSelection(target).focus(target).run()
      }
    }

    const handlePointerDown = () => {
      requestAnimationFrame(() => {
        element.focus()
      })
    }

    element.addEventListener('input', handleInput)
    element.addEventListener('move-out', handleMoveOut)
    element.addEventListener('pointerdown', handlePointerDown)
    return () => {
      element.removeEventListener('input', handleInput)
      element.removeEventListener('move-out', handleMoveOut)
      element.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [editor, getPos, latex, node.nodeSize, updateAttributes])

  return (
    <NodeViewWrapper className="math-node-inline">
      {createElement('math-field', {
        ref: mathFieldRef,
        className: 'math-node-field',
      })}
    </NodeViewWrapper>
  )
}

const inlineMath = Node.create({
  name: 'inlineMath',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: {
        default: '',
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-inline-math]' }, { tag: 'span[data-math-inline]' }]
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-inline-math': 'true', 'data-math-inline': 'true' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathFieldNodeView)
  },

  addInputRules() {
    return [
      new InputRule({
        find: /\${1,2}([^$\n]+)\${1,2}$/,
        handler: ({ state, range, match }) => {
          const latex = match[1]?.trim()
          if (!latex)
            return null

          const node = this.type.create({ latex })
          state.tr.replaceWith(range.from, range.to, node)
        },
      }),
    ]
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-M': () => this.editor.commands.insertContent({
        type: 'inlineMath',
        attrs: { latex: '' },
      }),
    }
  },
})

interface MathRichTextEditorProps {
  value: string
  active?: boolean
  onChange: (value: string) => void
  onSplitAtCursor?: (cursorOffset: number) => void
}

export function MathRichTextEditor({ value, active = false, onChange, onSplitAtCursor }: MathRichTextEditorProps) {
  const initialContent = useMemo(() => subtitleTextToDoc(value), [value]) as JSONContent

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Placeholder.configure({
        placeholder: '输入内容，或使用 $ 开始录入公式...',
      }),
      inlineMath,
    ],
    editorProps: {
      attributes: {
        class: 'subtitle-prose',
      },
      handleKeyDown: (view, event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          const cursorOffset = docPositionToSubtitleOffset(view.state.doc, view.state.selection.from)
          onSplitAtCursor?.(cursorOffset)
          event.preventDefault()
          return true
        }

        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
          return false

        const target = event.target
        if (target instanceof HTMLElement && target.closest('math-field'))
          return true

        const { selection } = view.state
        if (!selection.empty)
          return false

        const isRight = event.key === 'ArrowRight'
        const { $from } = selection
        const adjacentNode = isRight ? $from.nodeAfter : $from.nodeBefore
        if (adjacentNode?.type.name !== 'inlineMath')
          return false

        const nodePos = isRight ? selection.from : selection.from - adjacentNode.nodeSize
        const nodeDom = view.nodeDOM(nodePos)
        if (!(nodeDom instanceof HTMLElement))
          return false

        const mathField = nodeDom.querySelector('math-field')
        if (!(mathField instanceof HTMLElement))
          return false

        event.preventDefault()
        focusMathField(mathField as MathfieldElement, isRight ? 'start' : 'end')
        return true
      },
      handleDOMEvents: {
        keydown: (_view, event) => {
          const target = event.target
          if (target instanceof HTMLElement && target.closest('math-field'))
            return true

          return false
        },
        blur: (_view) => {
          const current = docToSubtitleText(editor?.getJSON() ?? initialContent)
          editor?.commands.setContent(subtitleTextToDoc(current), { emitUpdate: false })
          return false
        },
      },
    },
    content: initialContent,
    onUpdate: ({ editor }) => {
      onChange(docToSubtitleText(editor.getJSON()))
    },
  })

  useEffect(() => {
    if (!editor)
      return

    const current = docToSubtitleText(editor.getJSON())
    if (current === value)
      return

    editor.commands.setContent(subtitleTextToDoc(value), { emitUpdate: false })
  }, [editor, value])

  return (
    <div className={`editor-shell ${active ? 'editor-shell-active' : ''}`}>
      <EditorContent editor={editor} />
    </div>
  )
}
