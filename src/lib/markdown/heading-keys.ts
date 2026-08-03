import {
  type EditResult,
  getLineAt,
  getLineByIndex,
  replaceLine,
  replaceRange
} from './line'

function stripBlockPrefix(text: string): string {
  return text
    .replace(/^#{1,6}\s+/, '')
    .replace(/^>\s?/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/^-\s\[[ xX]\]\s+/, '')
}

export function setHeadingLevel(value: string, cursor: number, level: number): EditResult {
  const line = getLineAt(value, cursor)
  const body = stripBlockPrefix(line.text.trim())
  const indent = line.indent

  if (level <= 0) {
    const newText = body ? `${indent}${body}` : indent
    const pos = line.start + newText.length
    return replaceLine(value, line, newText, pos)
  }

  const hashes = '#'.repeat(Math.min(6, Math.max(1, level)))
  const newText = body ? `${indent}${hashes} ${body}` : `${indent}${hashes} `
  const pos = line.start + newText.length
  return replaceLine(value, line, newText, pos)
}

export function toggleHeadingLevel(value: string, cursor: number, level: number): EditResult {
  const line = getLineAt(value, cursor)
  if (line.kind === 'heading-atx' && line.headingLevel === level) {
    return setHeadingLevel(value, cursor, 0)
  }
  return setHeadingLevel(value, cursor, level)
}

/** 在当前行下方插入 Setext 下划线 */
export function insertSetextUnderline(value: string, cursor: number, level: 1 | 2): EditResult {
  const line = getLineAt(value, cursor)
  const char = level === 1 ? '=' : '-'
  const underline = char.repeat(Math.max(3, line.text.trim().length || 3))
  const insertPos = line.end
  const prefix = value[insertPos - 1] === '\n' || insertPos === 0 ? '' : '\n'
  const text = `${prefix}${underline}`
  const newValue = value.slice(0, insertPos) + text + value.slice(insertPos)
  const newCursor = insertPos + text.length
  return { newValue, selectionStart: newCursor, selectionEnd: newCursor }
}

/** 将 Setext 标题块转为 ATX */
export function setextToAtx(value: string, cursor: number): EditResult | null {
  const line = getLineAt(value, cursor)

  let titleLine = line
  let underlineLine = getLineByIndex(value, line.index + 1)

  if (line.kind === 'heading-setext-underline') {
    underlineLine = line
    titleLine = getLineByIndex(value, line.index - 1)!
    if (!titleLine) return null
  } else if (underlineLine?.kind === 'heading-setext-underline') {
    // title is current line
  } else {
    return null
  }

  if (!underlineLine || underlineLine.kind !== 'heading-setext-underline') return null
  if (titleLine.kind !== 'text' && titleLine.kind !== 'empty') return null

  const title = titleLine.text.trim()
  if (!title) return null

  const level = underlineLine.content.startsWith('=') ? 1 : 2
  const hashes = '#'.repeat(level)
  const newText = `${titleLine.indent}${hashes} ${title}`
  const blockEnd = underlineLine.end
  return replaceRange(value, titleLine.start, blockEnd, newText, titleLine.start + newText.length)
}

export function handleHeadingShortcut(
  value: string,
  cursor: number,
  key: string,
  shiftKey: boolean,
  altKey: boolean
): EditResult | null {
  if (altKey && key === '1') {
    return setextToAtx(value, cursor)
  }

  if (shiftKey && key === '=') {
    return insertSetextUnderline(value, cursor, 1)
  }
  if (shiftKey && key === '-') {
    return insertSetextUnderline(value, cursor, 2)
  }

  const num = Number.parseInt(key, 10)
  if (Number.isNaN(num) || num < 0 || num > 6) return null

  if (num === 0) {
    return setHeadingLevel(value, cursor, 0)
  }
  return toggleHeadingLevel(value, cursor, num)
}
