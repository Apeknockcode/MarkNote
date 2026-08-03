import type { EditResult } from '@/lib/markdown/line'
import { handleHeadingShortcut } from '@/lib/markdown/heading-keys'
import {
  handleListBackspace,
  handleListEnter,
  handleListTab,
  handleSetextEnter
} from '@/lib/markdown/list-keys'
import {
  findReferenceAtCursor,
  getJumpTarget,
  organizeFootnotes,
  scrollEditorToOffset,
  type RefSpan
} from '@/lib/markdown/references'

export interface MarkdownKeysContext {
  getEditor: () => HTMLTextAreaElement | undefined
  isReadonly: () => boolean
  applyEdit: (el: HTMLTextAreaElement, apply: () => EditResult | null) => boolean
}

export function createMarkdownKeys() {
  let lastJumpFrom: RefSpan | null = null

  function applyResult(el: HTMLTextAreaElement, ctx: MarkdownKeysContext, result: EditResult): boolean {
    return ctx.applyEdit(el, () => result)
  }

  function handleKeydown(event: KeyboardEvent, ctx: MarkdownKeysContext): boolean {
    if (ctx.isReadonly()) return false
    const el = ctx.getEditor()
    if (!el) return false

    const mod = event.metaKey || event.ctrlKey
    const { key, shiftKey, altKey } = event
    const cursor = el.selectionStart
    const value = el.value

    if (key === 'F12' || (mod && shiftKey && key.toLowerCase() === 'd')) {
      const span = findReferenceAtCursor(value, cursor)
      const target = getJumpTarget(value, cursor, lastJumpFrom)
      if (target) {
        event.preventDefault()
        if (span && (span.kind === 'footnote-ref' || span.kind === 'ref-link')) {
          lastJumpFrom = span
        }
        scrollEditorToOffset(el, target.start)
        el.setSelectionRange(target.start, target.end)
        return true
      }
    }

    if (mod && shiftKey && key.toLowerCase() === 'f') {
      event.preventDefault()
      const organized = organizeFootnotes(value)
      if (organized !== value) {
        return ctx.applyEdit(el, () => ({
          newValue: organized,
          selectionStart: cursor,
          selectionEnd: cursor
        }))
      }
      return true
    }

    if (mod) {
      const isHeadingKey =
        (key >= '0' && key <= '6') ||
        (shiftKey && (key === '=' || key === '-')) ||
        (altKey && key === '1')
      if (isHeadingKey) {
        const result = handleHeadingShortcut(value, cursor, key, shiftKey, altKey)
        if (result) {
          event.preventDefault()
          return applyResult(el, ctx, result)
        }
      }
    }

    if (key === 'Enter' && !mod) {
      const listResult = handleListEnter(value, cursor)
      if (listResult) {
        event.preventDefault()
        return applyResult(el, ctx, listResult)
      }
      const setextResult = handleSetextEnter(value, cursor)
      if (setextResult) {
        event.preventDefault()
        return applyResult(el, ctx, setextResult)
      }
    }

    if (key === 'Tab' && !mod) {
      const tabResult = handleListTab(value, cursor, shiftKey)
      if (tabResult) {
        event.preventDefault()
        return applyResult(el, ctx, tabResult)
      }
    }

    if (key === 'Backspace' && !mod && !shiftKey && el.selectionStart === el.selectionEnd) {
      const bsResult = handleListBackspace(value, cursor)
      if (bsResult) {
        event.preventDefault()
        return applyResult(el, ctx, bsResult)
      }
    }

    return false
  }

  return {
    handleKeydown,
    resetJump: () => {
      lastJumpFrom = null
    }
  }
}

export type MarkdownKeys = ReturnType<typeof createMarkdownKeys>
