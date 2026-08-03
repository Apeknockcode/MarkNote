export interface TextSelection {
  start: number
  end: number
  text: string
}

export function getSelection(el: HTMLTextAreaElement): TextSelection {
  return {
    start: el.selectionStart,
    end: el.selectionEnd,
    text: el.value.slice(el.selectionStart, el.selectionEnd)
  }
}

export function applyEdit(
  el: HTMLTextAreaElement,
  newValue: string,
  cursorStart: number,
  cursorEnd?: number
) {
  el.value = newValue
  el.focus()
  el.setSelectionRange(cursorStart, cursorEnd ?? cursorStart)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

/** 包裹选中文本 */
export function wrapSelection(el: HTMLTextAreaElement, before: string, after: string, placeholder = '文本') {
  const { start, end, text } = getSelection(el)
  const value = el.value
  const selected = text || placeholder
  const inserted = before + selected + after
  const newValue = value.slice(0, start) + inserted + value.slice(end)
  const cursorStart = start + before.length
  const cursorEnd = cursorStart + selected.length
  applyEdit(el, newValue, cursorStart, cursorEnd)
}

/** 在光标处插入文本 */
export function insertAtCursor(el: HTMLTextAreaElement, text: string, selectInserted = false) {
  const { start, end } = getSelection(el)
  const value = el.value
  const newValue = value.slice(0, start) + text + value.slice(end)
  const cursorStart = selectInserted ? start : start + text.length
  const cursorEnd = selectInserted ? start + text.length : cursorStart
  applyEdit(el, newValue, cursorStart, cursorEnd)
}

/** 为当前行或选中行添加前缀 */
export function prefixLines(el: HTMLTextAreaElement, prefix: string, numbered = false) {
  const { start, end } = getSelection(el)
  const value = el.value
  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  const lineEnd = value.indexOf('\n', end)
  const blockEnd = lineEnd === -1 ? value.length : lineEnd
  const block = value.slice(lineStart, blockEnd)
  const lines = block.split('\n')
  const prefixed = lines
    .map((line, i) => {
      const trimmed = line.replace(/^#{1,6}\s|^>\s|^[-*+]\s|^\d+\.\s|^-\s\[ \]\s/, '')
      if (numbered) return `${i + 1}. ${trimmed}`
      return prefix + trimmed
    })
    .join('\n')
  const newValue = value.slice(0, lineStart) + prefixed + value.slice(blockEnd)
  applyEdit(el, newValue, lineStart, lineStart + prefixed.length)
}

/** 将当前行设为标题级别 */
export function setHeading(el: HTMLTextAreaElement, level: number) {
  const hashes = '#'.repeat(level) + ' '
  prefixLines(el, hashes)
}

/** 插入块级元素（在光标处或新行） */
export function insertBlock(el: HTMLTextAreaElement, block: string) {
  const { start } = getSelection(el)
  const value = el.value
  const needsLeadingNewline = start > 0 && value[start - 1] !== '\n'
  const needsTrailingNewline = !block.endsWith('\n')
  const text =
    (needsLeadingNewline ? '\n\n' : start === 0 ? '' : '\n') +
    block +
    (needsTrailingNewline ? '\n' : '')
  insertAtCursor(el, text)
}

export function insertTable(el: HTMLTextAreaElement, cols = 3, rows = 3) {
  const header = '| ' + Array.from({ length: cols }, (_, i) => `列 ${i + 1}`).join(' | ') + ' |'
  const sep = '| ' + Array.from({ length: cols }, () => '---').join(' | ') + ' |'
  const body = Array.from({ length: rows - 1 }, () =>
    '| ' + Array.from({ length: cols }, () => '    ').join(' | ') + ' |'
  ).join('\n')
  insertBlock(el, `${header}\n${sep}\n${body}`)
}
