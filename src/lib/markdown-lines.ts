import type MarkdownIt from 'markdown-it'

const SOURCE_LINE_BLOCKS = new Set([
  'heading_open',
  'paragraph_open',
  'blockquote_open',
  'bullet_list_open',
  'ordered_list_open',
  'list_item_open',
  'table_open',
  'fence',
  'code_block',
  'hr'
])

function injectLineAttr(html: string, line: number): string {
  if (!html.startsWith('<')) return html
  return html.replace(/^<(\w+)/, `<$1 data-source-line="${line}"`)
}

/** 为渲染后的块级元素注入源码行号（预留） */
export function enhanceMarkdownIt(md: MarkdownIt): MarkdownIt {
  const defaultRenderToken = md.renderer.renderToken.bind(md.renderer)

  md.renderer.renderToken = (tokens, idx, options) => {
    const token = tokens[idx]
    let html = defaultRenderToken(tokens, idx, options)
    const line = token.map?.[0]
    if (line == null || !html.startsWith('<')) return html

    if (SOURCE_LINE_BLOCKS.has(token.type)) {
      html = injectLineAttr(html, line)
    }
    return html
  }

  return md
}

/** 视口中心在文档中的位置比例（0~1），用于双向滚动同步 */
export function getScrollCenterRatio(el: HTMLElement): number {
  if (el.scrollHeight <= el.clientHeight) return 0
  return (el.scrollTop + el.clientHeight / 2) / el.scrollHeight
}

/** 按视口中心比例设置滚动位置 */
export function setScrollCenterRatio(el: HTMLElement, ratio: number): void {
  const max = el.scrollHeight - el.clientHeight
  if (max <= 0) {
    el.scrollTop = 0
    return
  }
  const target = ratio * el.scrollHeight - el.clientHeight / 2
  el.scrollTop = Math.max(0, Math.min(max, target))
}

export function getScrollRatio(el: HTMLElement): number {
  const max = el.scrollHeight - el.clientHeight
  if (max <= 0) return 0
  return el.scrollTop / max
}

export function setScrollRatio(el: HTMLElement, ratio: number): void {
  const max = el.scrollHeight - el.clientHeight
  if (max <= 0) {
    el.scrollTop = 0
    return
  }
  el.scrollTop = Math.max(0, Math.min(max, ratio * max))
}
