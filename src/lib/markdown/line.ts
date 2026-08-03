export type LineKind =
  | 'empty'
  | 'heading-atx'
  | 'heading-setext-underline'
  | 'list'
  | 'task'
  | 'quote'
  | 'text'

export interface LineInfo {
  index: number
  start: number
  end: number
  text: string
  indent: string
  kind: LineKind
  /** 完整 marker，如 "- "、"1. "、"- [ ] " */
  marker?: string
  bullet?: '*' | '-' | '+'
  listNumber?: number
  headingLevel?: number
  /** marker 之后的内容 */
  content: string
}

export interface EditResult {
  newValue: string
  selectionStart: number
  selectionEnd: number
}

const ATX_RE = /^(\s*)(#{1,6})(?:\s+(.*))?$/
const SETEXT_UNDERLINE_RE = /^(\s*)(=+|-+)\s*$/
const TASK_RE = /^(\s*)(-\s\[[ xX]\])(\s*)(.*)$/
const ORDERED_RE = /^(\s*)(\d+)\.(\s+)(.*)$/
const UNORDERED_RE = /^(\s*)([-*+])(\s+)(.*)$/
const QUOTE_RE = /^(\s*)(>)(\s?)(.*)$/

export function lineStartAt(value: string, offset: number): number {
  const idx = value.lastIndexOf('\n', offset - 1)
  return idx === -1 ? 0 : idx + 1
}

export function lineEndAt(value: string, offset: number): number {
  const idx = value.indexOf('\n', offset)
  return idx === -1 ? value.length : idx
}

export function getLineIndex(value: string, offset: number): number {
  let index = 0
  for (let i = 0; i < offset && i < value.length; i++) {
    if (value[i] === '\n') index++
  }
  return index
}

export function parseLine(text: string, index: number, start: number, end: number): LineInfo {
  const base: LineInfo = {
    index,
    start,
    end,
    text,
    indent: '',
    kind: 'text',
    content: text
  }

  if (text.trim() === '') {
    return { ...base, kind: 'empty', content: '' }
  }

  const setext = SETEXT_UNDERLINE_RE.exec(text)
  if (setext) {
    return {
      ...base,
      indent: setext[1] ?? '',
      kind: 'heading-setext-underline',
      content: setext[2] ?? ''
    }
  }

  const atx = ATX_RE.exec(text)
  if (atx) {
    const level = atx[2]!.length
    return {
      ...base,
      indent: atx[1] ?? '',
      kind: 'heading-atx',
      marker: atx[2]! + ' ',
      headingLevel: level,
      content: atx[3] ?? ''
    }
  }

  const task = TASK_RE.exec(text)
  if (task) {
    const marker = task[2]! + task[3]!
    return {
      ...base,
      indent: task[1] ?? '',
      kind: 'task',
      marker,
      bullet: '-',
      content: task[4] ?? ''
    }
  }

  const ordered = ORDERED_RE.exec(text)
  if (ordered) {
    return {
      ...base,
      indent: ordered[1] ?? '',
      kind: 'list',
      marker: `${ordered[2]}.${ordered[3]!}`,
      listNumber: Number.parseInt(ordered[2]!, 10),
      content: ordered[4] ?? ''
    }
  }

  const unordered = UNORDERED_RE.exec(text)
  if (unordered) {
    const bullet = unordered[2] as '*' | '-' | '+'
    return {
      ...base,
      indent: unordered[1] ?? '',
      kind: 'list',
      marker: `${bullet}${unordered[3]!}`,
      bullet,
      content: unordered[4] ?? ''
    }
  }

  const quote = QUOTE_RE.exec(text)
  if (quote) {
    const marker = `>${quote[3] === ' ' ? ' ' : ''}`
    return {
      ...base,
      indent: quote[1] ?? '',
      kind: 'quote',
      marker,
      content: quote[4] ?? ''
    }
  }

  return base
}

export function getLineAt(value: string, offset: number): LineInfo {
  const start = lineStartAt(value, offset)
  const end = lineEndAt(value, offset)
  const text = value.slice(start, end)
  const index = getLineIndex(value, start)
  return parseLine(text, index, start, end)
}

export function getLineByIndex(value: string, lineIndex: number): LineInfo | null {
  let idx = 0
  let start = 0
  while (start <= value.length) {
    const end = value.indexOf('\n', start)
    const lineEnd = end === -1 ? value.length : end
    if (idx === lineIndex) {
      return parseLine(value.slice(start, lineEnd), idx, start, lineEnd)
    }
    if (end === -1) break
    start = end + 1
    idx++
  }
  return null
}

export function isCursorAtLineEnd(value: string, cursor: number): boolean {
  const end = lineEndAt(value, cursor)
  return cursor === end || value.slice(cursor, end).trim() === ''
}

export function replaceRange(
  value: string,
  start: number,
  end: number,
  replacement: string,
  cursorStart: number,
  cursorEnd = cursorStart
): EditResult {
  return {
    newValue: value.slice(0, start) + replacement + value.slice(end),
    selectionStart: cursorStart,
    selectionEnd: cursorEnd
  }
}

export function replaceLine(value: string, line: LineInfo, newText: string, cursorInLine?: number): EditResult {
  const cursor = cursorInLine ?? newText.length
  return replaceRange(value, line.start, line.end, newText, line.start + cursor)
}

export function insertAt(value: string, offset: number, text: string): EditResult {
  return {
    newValue: value.slice(0, offset) + text + value.slice(offset),
    selectionStart: offset + text.length,
    selectionEnd: offset + text.length
  }
}

export function deleteRange(value: string, start: number, end: number, cursor: number): EditResult {
  const len = end - start
  const newCursor = cursor > end ? cursor - len : cursor > start ? start : cursor
  return {
    newValue: value.slice(0, start) + value.slice(end),
    selectionStart: newCursor,
    selectionEnd: newCursor
  }
}
