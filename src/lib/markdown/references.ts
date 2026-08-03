import { lineStartAt } from './line'

export type RefKind = 'inline-link' | 'ref-link' | 'ref-def' | 'footnote-ref' | 'footnote-def'

export interface RefSpan {
  kind: RefKind
  label: string
  start: number
  end: number
  defStart?: number
  defEnd?: number
}

const FOOTNOTE_REF_RE = /\[\^([^\]^\s]+)\]/g
const FOOTNOTE_DEF_RE = /^\[\^([^\]^\s]+)\]:\s*(.*)$/gm
const REF_LINK_RE = /\[([^\]\n]+)\]\[([^\]\s]*)\]/g
const REF_DEF_RE = /^\[([^\]\n]+)\]:\s+(\S+)/gm
const INLINE_LINK_RE = /\[([^\]\n]+)\]\(([^\)\s]+)(?:\s+"[^"]*")?\)/g

function addDefRanges(spans: RefSpan[], value: string) {
  for (const span of spans) {
    if (span.kind === 'footnote-ref') {
      const defRe = new RegExp(`^\\[\\^${escapeRe(span.label)}\\]:`, 'm')
      const m = defRe.exec(value)
      if (m) {
        span.defStart = m.index
        span.defEnd = value.indexOf('\n', m.index)
        if (span.defEnd === -1) span.defEnd = value.length
      }
    } else if (span.kind === 'ref-link') {
      const defRe = new RegExp(`^\\[${escapeRe(span.label)}\\]:`, 'm')
      const m = defRe.exec(value)
      if (m) {
        span.defStart = m.index
        span.defEnd = value.indexOf('\n', m.index)
        if (span.defEnd === -1) span.defEnd = value.length
      }
    }
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function parseReferences(value: string): RefSpan[] {
  const spans: RefSpan[] = []

  for (const m of value.matchAll(FOOTNOTE_REF_RE)) {
    if (m.index == null) continue
    spans.push({
      kind: 'footnote-ref',
      label: m[1]!,
      start: m.index,
      end: m.index + m[0].length
    })
  }

  for (const m of value.matchAll(FOOTNOTE_DEF_RE)) {
    if (m.index == null) continue
    spans.push({
      kind: 'footnote-def',
      label: m[1]!,
      start: m.index,
      end: m.index + m[0].length
    })
  }

  for (const m of value.matchAll(REF_LINK_RE)) {
    if (m.index == null) continue
    spans.push({
      kind: 'ref-link',
      label: m[2] !== '' ? m[2]! : m[1]!,
      start: m.index,
      end: m.index + m[0].length
    })
  }

  for (const m of value.matchAll(REF_DEF_RE)) {
    if (m.index == null) continue
    spans.push({
      kind: 'ref-def',
      label: m[1]!,
      start: m.index,
      end: m.index + m[0].length
    })
  }

  for (const m of value.matchAll(INLINE_LINK_RE)) {
    if (m.index == null) continue
    spans.push({
      kind: 'inline-link',
      label: m[2]!,
      start: m.index,
      end: m.index + m[0].length
    })
  }

  addDefRanges(spans, value)
  return spans.sort((a, b) => a.start - b.start)
}

export function findReferenceAtCursor(value: string, cursor: number): RefSpan | null {
  const spans = parseReferences(value)
  return (
    spans.find((s) => cursor >= s.start && cursor <= s.end) ??
    spans.find((s) => s.defStart != null && cursor >= s.defStart! && cursor <= s.defEnd!) ??
    null
  )
}

export interface JumpTarget {
  start: number
  end: number
  label: string
}

export function getJumpTarget(value: string, cursor: number, lastRef?: RefSpan | null): JumpTarget | null {
  const span = findReferenceAtCursor(value, cursor)
  if (!span) return null

  if (span.kind === 'footnote-ref' || span.kind === 'ref-link') {
    if (span.defStart != null && span.defEnd != null) {
      return { start: span.defStart, end: span.defEnd, label: span.label }
    }
    return null
  }

  if (span.kind === 'footnote-def' || span.kind === 'ref-def') {
    const refSpans = parseReferences(value)
    const ref = refSpans.find(
      (s) =>
        (s.kind === 'footnote-ref' || s.kind === 'ref-link') &&
        s.label === span.label
    )
    if (ref) {
      return { start: ref.start, end: ref.end, label: ref.label }
    }
  }

  if (lastRef && (span.kind === 'footnote-def' || span.kind === 'ref-def')) {
    return { start: lastRef.start, end: lastRef.end, label: lastRef.label }
  }

  return null
}

export function organizeFootnotes(value: string): string {
  const lines = value.split('\n')
  const body: string[] = []
  const defs: Array<{ id: string; raw: string; order: number }> = []
  let order = 0

  for (const line of lines) {
    const m = /^\[\^([^\]^\s]+)\]:\s*(.*)$/.exec(line)
    if (m) {
      defs.push({ id: m[1]!, raw: line, order: order++ })
    } else {
      body.push(line)
    }
  }

  if (defs.length === 0) return value

  defs.sort((a, b) => {
    const na = Number.parseInt(a.id, 10)
    const nb = Number.parseInt(b.id, 10)
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
    return a.id.localeCompare(b.id, undefined, { numeric: true })
  })

  while (body.length > 0 && body[body.length - 1]!.trim() === '') {
    body.pop()
  }

  const footnoteBlock = defs.map((d) => d.raw).join('\n')
  return body.join('\n') + '\n\n' + footnoteBlock + '\n'
}

export function scrollEditorToOffset(el: HTMLTextAreaElement, offset: number) {
  el.setSelectionRange(offset, offset)
  const lineStart = lineStartAt(el.value, offset)
  const textBefore = el.value.slice(0, lineStart)
  const lineIndex = textBefore.split('\n').length - 1
  const style = getComputedStyle(el)
  const lineHeight =
    Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.5
  el.scrollTop = Math.max(0, lineIndex * lineHeight - el.clientHeight / 3)
}
