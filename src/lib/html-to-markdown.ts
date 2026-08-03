import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'

export type ClipboardSource = 'word' | 'excel' | 'notion' | 'generic'

export interface HtmlToMarkdownOptions {
  resolveImage?: (url: string, alt: string) => Promise<string>
}

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  strongDelimiter: '**'
})

turndown.use(gfm)

turndown.addRule('strikethrough', {
  filter: ['del', 's', 'strike'],
  replacement: (content) => `~~${content}~~`
})

turndown.addRule('underline', {
  filter: ['u'],
  replacement: (content) => content
})

function escapeTableCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()
}

function getCellPlainText(cell: Element): string {
  const raw = (cell as HTMLElement).innerText ?? cell.textContent ?? ''
  return escapeTableCell(raw)
}

function cellInnerToMarkdown(cell: Element): string {
  const element = cell as HTMLElement
  const hasStructure = element.querySelector('ul, ol, li, p, div, br, table, h1, h2, h3, h4, h5, h6')

  if (!hasStructure) {
    return getCellPlainText(cell)
  }

  let md = turndown.turndown(element.innerHTML).trim()
  md = md
    .replace(/^[\t ]*[-*+]\s+/gm, '• ')
    .replace(/^[\t ]*\d+\.\s+/gm, (match) => match.trim() + ' ')
    .replace(/\n+/g, ' / ')
    .replace(/\s+/g, ' ')
    .trim()

  return escapeTableCell(md)
}

function detectClipboardSource(html: string, doc: Document): ClipboardSource {
  const lower = html.toLowerCase()
  if (
    lower.includes('microsoft excel') ||
    lower.includes('xmlns:x="urn:schemas-microsoft-com:office:excel"') ||
    lower.includes('progId="Excel.Sheet"')
  ) {
    return 'excel'
  }
  if (
    lower.includes('microsoft word') ||
    lower.includes('mso-') ||
    lower.includes('urn:schemas-microsoft-com:office:word') ||
    doc.querySelector('[class*="Mso"]')
  ) {
    return 'word'
  }
  if (
    lower.includes('notion') ||
    doc.querySelector('[data-block-id]') ||
    doc.querySelector('.notion-')
  ) {
    return 'notion'
  }
  return 'generic'
}

function normalizeWordHtml(doc: Document): void {
  doc.querySelectorAll('o\\:p, w\\:br').forEach((node) => {
    node.replaceWith(doc.createTextNode('\n'))
  })

  doc.querySelectorAll('[class*="Mso"]').forEach((node) => {
    if (node instanceof HTMLElement) {
      node.removeAttribute('class')
      node.removeAttribute('style')
    }
  })
}

function normalizeExcelHtml(doc: Document): void {
  doc.querySelectorAll('col, colgroup').forEach((node) => node.remove())
  doc.querySelectorAll('td, th').forEach((cell) => {
    if (cell instanceof HTMLElement) {
      cell.removeAttribute('style')
      cell.removeAttribute('width')
      cell.removeAttribute('height')
    }
  })
}

function normalizeNotionHtml(doc: Document): void {
  doc.querySelectorAll('[data-block-id]').forEach((block) => {
    if (!(block instanceof HTMLElement)) return

    if (block.querySelector('ul, ol, table, h1, h2, h3, h4, h5, h6')) return

    const tag = block.getAttribute('data-block-type') || block.tagName.toLowerCase()
    if (tag.includes('header') || block.querySelector('[role="heading"]')) {
      const level = Number(block.getAttribute('data-heading-level') || '2')
      const heading = doc.createElement(`h${Math.min(Math.max(level, 1), 6)}`)
      heading.textContent = block.textContent?.trim() || ''
      block.replaceWith(heading)
      return
    }

    if (tag.includes('bulleted') || block.className.includes('bulleted')) {
      const li = doc.createElement('li')
      li.textContent = block.textContent?.trim() || ''
      const ul = doc.createElement('ul')
      ul.appendChild(li)
      block.replaceWith(ul)
      return
    }

    if (block.textContent?.trim()) {
      const p = doc.createElement('p')
      p.textContent = block.textContent.trim()
      block.replaceWith(p)
    }
  })
}

function normalizeBySource(doc: Document, source: ClipboardSource): void {
  if (source === 'word') normalizeWordHtml(doc)
  if (source === 'excel') normalizeExcelHtml(doc)
  if (source === 'notion') normalizeNotionHtml(doc)
}

function isHeadingRow(row: HTMLTableRowElement): boolean {
  const parent = row.parentElement
  if (!parent) return false
  if (parent.tagName === 'THEAD') return true

  const isFirstRow =
    parent.tagName === 'TABLE'
      ? parent.querySelector('tr') === row
      : parent.tagName === 'TBODY' &&
        (!parent.previousElementSibling || parent.previousElementSibling.tagName === 'THEAD') &&
        parent.querySelector('tr') === row

  return isFirstRow && Array.from(row.cells).every((cell) => cell.tagName === 'TH')
}

function promoteFirstRowToHeader(table: HTMLTableElement): void {
  const firstRow = table.rows[0]
  if (!firstRow || isHeadingRow(firstRow)) return

  for (let i = firstRow.cells.length - 1; i >= 0; i--) {
    const cell = firstRow.cells[i]
    if (cell.tagName === 'TH') continue

    const th = table.ownerDocument.createElement('th')
    th.textContent = cellInnerToMarkdown(cell)
    if (cell.hasAttribute('colspan')) th.setAttribute('colspan', cell.getAttribute('colspan')!)
    if (cell.hasAttribute('rowspan')) th.setAttribute('rowspan', cell.getAttribute('rowspan')!)
    cell.replaceWith(th)
  }
}

function buildTableGrid(table: HTMLTableElement): string[][] {
  const grid: string[][] = []
  const occupied: boolean[][] = []

  const ensureRow = (rowIndex: number, colCount: number) => {
    if (!grid[rowIndex]) grid[rowIndex] = []
    if (!occupied[rowIndex]) occupied[rowIndex] = []
    while (grid[rowIndex].length < colCount) grid[rowIndex].push('')
  }

  let maxCols = 0

  Array.from(table.rows).forEach((row, rowIndex) => {
    let colIndex = 0

    Array.from(row.cells).forEach((cell) => {
      while (occupied[rowIndex]?.[colIndex]) colIndex++

      const colspan = Math.max(1, Number.parseInt(cell.getAttribute('colspan') || '1', 10) || 1)
      const rowspan = Math.max(1, Number.parseInt(cell.getAttribute('rowspan') || '1', 10) || 1)
      const text = cellInnerToMarkdown(cell)

      for (let r = 0; r < rowspan; r++) {
        for (let c = 0; c < colspan; c++) {
          const targetRow = rowIndex + r
          const targetCol = colIndex + c
          ensureRow(targetRow, targetCol + 1)
          occupied[targetRow][targetCol] = true

          if (r === 0 && c === 0) {
            grid[targetRow][targetCol] = text
          } else if (c === 0 && text) {
            grid[targetRow][targetCol] = '↑'
          } else {
            grid[targetRow][targetCol] = grid[targetRow][targetCol] || ''
          }

          maxCols = Math.max(maxCols, targetCol + 1)
        }
      }

      colIndex += colspan
    })
  })

  return grid.map((row) => {
    const normalized = [...row]
    while (normalized.length < maxCols) normalized.push('')
    return normalized.slice(0, maxCols)
  })
}

function tableElementToMarkdown(table: HTMLTableElement): string {
  if (table.rows.length === 0) return ''

  promoteFirstRowToHeader(table)
  const rows = buildTableGrid(table)
  if (rows.length === 0) return ''

  const header = rows[0]
  const colCount = header.length
  const formatRow = (cells: string[]) => {
    const padded = [...cells]
    while (padded.length < colCount) padded.push('')
    return `| ${padded.slice(0, colCount).join(' | ')} |`
  }

  const separator = `| ${Array(colCount).fill('---').join(' | ')} |`
  return [formatRow(header), separator, ...rows.slice(1).map(formatRow)].join('\n')
}

function prepareClipboardDocument(html: string): { doc: Document; source: ClipboardSource } {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('meta, style, script, link').forEach((node) => node.remove())

  const source = detectClipboardSource(html, doc)
  normalizeBySource(doc, source)

  return { doc, source }
}

function extractTables(doc: Document): Map<string, string> {
  const placeholders = new Map<string, string>()

  doc.querySelectorAll('table').forEach((node, index) => {
    const table = node.cloneNode(true) as HTMLTableElement
    const markdown = tableElementToMarkdown(table)
    if (!markdown) return

    const key = `TABLEPLACEHOLDER${index}END`
    placeholders.set(key, markdown)
    node.replaceWith(doc.createTextNode(key))
  })

  return placeholders
}

async function resolveImagesInMarkdown(
  markdown: string,
  resolveImage?: HtmlToMarkdownOptions['resolveImage']
): Promise<string> {
  if (!resolveImage) return markdown

  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g
  const matches = [...markdown.matchAll(imageRegex)]
  if (matches.length === 0) return markdown

  let result = markdown
  for (const match of matches) {
    const [full, alt, url] = match
    if (!/^https?:\/\//i.test(url)) continue

    try {
      const localPath = await resolveImage(url, alt)
      if (localPath && localPath !== url) {
        result = result.replace(full, `![${alt}](${localPath})`)
      }
    } catch {
      // 保留原 URL
    }
  }

  return result
}

export async function htmlToMarkdown(
  html: string,
  options: HtmlToMarkdownOptions = {}
): Promise<string | null> {
  const { doc } = prepareClipboardDocument(html)
  const placeholders = extractTables(doc)

  const bodyHtml = doc.body.innerHTML
    .replace(/<!--StartFragment-->|<!--EndFragment-->/g, '')
    .trim()

  if (!bodyHtml && placeholders.size === 0) {
    const text = doc.body.textContent?.trim()
    return text || null
  }

  try {
    let markdown = turndown.turndown(bodyHtml || ' ').trim()

    for (const [key, tableMarkdown] of placeholders) {
      const block = `\n\n${tableMarkdown}\n\n`
      markdown = markdown.includes(key) ? markdown.replace(key, block) : `${markdown}${block}`
    }

    markdown = markdown.replace(/\n{3,}/g, '\n\n').trim()
    markdown = await resolveImagesInMarkdown(markdown, options.resolveImage)
    return markdown || null
  } catch {
    return null
  }
}

export function readClipboardHtml(dataTransfer: DataTransfer | null): string | null {
  if (!dataTransfer) return null
  const html = dataTransfer.getData('text/html')
  return html?.trim() ? html : null
}

export async function readClipboardHtmlAsync(): Promise<string | null> {
  if (!navigator.clipboard?.read) return null

  try {
    const items = await navigator.clipboard.read()
    for (const item of items) {
      if (item.types.includes('text/html')) {
        const blob = await item.getType('text/html')
        const html = await blob.text()
        if (html.trim()) return html
      }
    }
  } catch {
    // 无 clipboard 读权限时回退纯文本
  }

  return null
}

export async function readClipboardImageBlob(dataTransfer?: DataTransfer | null): Promise<Blob | null> {
  if (dataTransfer?.items) {
    for (const item of dataTransfer.items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) return file
      }
    }
  }

  if (!navigator.clipboard?.read) return null

  try {
    const items = await navigator.clipboard.read()
    for (const item of items) {
      const imageType = item.types.find((type) => type.startsWith('image/'))
      if (imageType) {
        return item.getType(imageType)
      }
    }
  } catch {
    // ignore
  }

  return null
}
