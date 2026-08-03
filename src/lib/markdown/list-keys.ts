import {
  type EditResult,
  type LineInfo,
  getLineAt,
  insertAt,
  isCursorAtLineEnd,
  replaceLine,
  replaceRange
} from './line'

const BULLETS: Array<'*' | '-' | '+'> = ['*', '-', '+']
const INDENT = '  '

function isEmptyListItem(line: LineInfo): boolean {
  return (line.kind === 'list' || line.kind === 'task') && line.content.trim() === ''
}

function nextBullet(bullet: '*' | '-' | '+', reverse = false): '*' | '-' | '+' {
  const idx = BULLETS.indexOf(bullet)
  const next = reverse ? (idx - 1 + BULLETS.length) % BULLETS.length : (idx + 1) % BULLETS.length
  return BULLETS[next]!
}

function buildListLine(line: LineInfo, indent: string, bullet?: '*' | '-' | '+', number?: number): string {
  if (line.kind === 'task') {
    const check = line.marker?.includes('[x]') || line.marker?.includes('[X]') ? '[x]' : '[ ]'
    return `${indent}- ${check} `
  }
  if (line.kind === 'list' && line.listNumber != null) {
    const n = number ?? line.listNumber
    return `${indent}${n}. `
  }
  const b = bullet ?? line.bullet ?? '-'
  return `${indent}${b} `
}

export function handleListEnter(value: string, cursor: number): EditResult | null {
  if (!isCursorAtLineEnd(value, cursor)) return null

  const line = getLineAt(value, cursor)

  if (line.kind === 'quote') {
    const body = line.content.trim()
    if (body === '') {
      return replaceLine(value, line, line.indent)
    }
    const prefix = `${line.indent}> `
    return insertAt(value, cursor, `\n${prefix}`)
  }

  if (line.kind !== 'list' && line.kind !== 'task') return null

  if (isEmptyListItem(line)) {
    return replaceLine(value, line, line.indent, line.indent.length)
  }

  let nextMarker: string
  if (line.kind === 'task') {
    nextMarker = buildListLine(line, line.indent)
  } else if (line.listNumber != null) {
    nextMarker = buildListLine(line, line.indent, undefined, line.listNumber + 1)
  } else {
    nextMarker = buildListLine(line, line.indent, line.bullet ?? '-')
  }

  return insertAt(value, cursor, `\n${nextMarker}`)
}

export function handleListTab(value: string, cursor: number, shiftKey: boolean): EditResult | null {
  const line = getLineAt(value, cursor)
  if (line.kind !== 'list' && line.kind !== 'task') return null
  if (!isEmptyListItem(line)) return null

  if (shiftKey) {
    if (!line.indent) return null
    const trim = line.indent.length >= INDENT.length ? line.indent.slice(INDENT.length) : ''
    const bullet = line.bullet ? nextBullet(line.bullet, true) : line.bullet
    const newText = buildListLine({ ...line, bullet }, trim)
    return replaceLine(value, line, newText, newText.length)
  }

  const newIndent = line.indent + INDENT
  let bullet = line.bullet
  if (line.kind === 'list' && line.bullet) {
    bullet = nextBullet(line.bullet)
  }
  const newText = buildListLine({ ...line, bullet }, newIndent)
  return replaceLine(value, line, newText, newText.length)
}

/** 在行首 Backspace：空列表项退出列表 */
export function handleListBackspace(value: string, cursor: number): EditResult | null {
  const line = getLineAt(value, cursor)
  if (line.kind !== 'list' && line.kind !== 'task') return null
  if (!isEmptyListItem(line)) return null

  const markerStart = line.start + line.indent.length
  const markerEnd = line.end
  if (cursor < markerStart || cursor > markerEnd) return null
  if (cursor !== markerStart && cursor !== line.start + line.text.length) return null

  return replaceLine(value, line, line.indent, line.start + line.indent.length)
}

/** 连续两行 Setext：上一行标题 + 当前行 ===/--- */
export function handleSetextEnter(value: string, cursor: number): EditResult | null {
  const line = getLineAt(value, cursor)
  if (line.kind !== 'text' && line.kind !== 'empty') return null
  if (!isCursorAtLineEnd(value, cursor)) return null

  const trimmed = line.text.trim()
  if (trimmed.startsWith('#') || trimmed === '') return null

  const prevIndex = line.index - 1
  if (prevIndex < 0) return null

  // 检查光标所在行是否刚输入完 === 或 ---
  const underlineMatch = /^(\s*)(=+|-+)\s*$/.exec(line.text)
  if (!underlineMatch) return null

  const prevStart = value.lastIndexOf('\n', line.start - 2) + 1
  const prevEnd = line.start - 1
  const prevText = value.slice(prevStart, prevEnd)
  if (!prevText.trim() || prevText.trim().startsWith('#')) return null

  const level = (underlineMatch[2] ?? '').startsWith('=') ? 1 : 2
  const hashes = '#'.repeat(level)
  const title = prevText.trim()
  const newBlock = `${hashes} ${title}`
  return replaceRange(value, prevStart, line.end, newBlock, prevStart + newBlock.length)
}
