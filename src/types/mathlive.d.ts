import type { DetailedHTMLProps, HTMLAttributes } from 'react'

declare global {
  interface MathfieldElement extends HTMLElement {
    value: string
    defaultMode: 'inline-math' | 'math'
    smartMode: boolean
    smartFence: boolean
    menuItems: unknown[]
    popoverPolicy: 'auto' | 'off'
    environmentPopoverPolicy: 'auto' | 'on' | 'off'
    readOnly: boolean
    disabled: boolean
    mathVirtualKeyboardPolicy: 'auto' | 'manual' | 'sandboxed'
    virtualKeyboardMode: 'auto' | 'manual' | 'onfocus' | 'off'
    position: number
    lastOffset: number
    selectionIsCollapsed: boolean
    focus: () => void
    executeCommand: (selector: string | [string, ...unknown[]]) => boolean
  }

  namespace JSX {
    interface IntrinsicElements {
      'math-field': DetailedHTMLProps<HTMLAttributes<MathfieldElement>, MathfieldElement>
    }
  }
}

export {}
