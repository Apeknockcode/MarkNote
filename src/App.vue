<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import MarkdownIt from 'markdown-it'
import HistoryTree from '@/components/HistoryTree.vue'
import ContextMenu, { type ContextMenuItem } from '@/components/ContextMenu.vue'
import type { HistoryStore, OpenResult } from '@/env.d'
import { fileName } from '@/lib/history'
import { enhanceMarkdownIt } from '@/lib/markdown-lines'
import { loadPref, savePref } from '@/lib/prefs'
import { useScrollSync } from '@/composables/useScrollSync'
import { createEditorUndo } from '@/composables/useEditorUndo'
import {
  insertAtCursor,
  insertBlock,
  insertTable,
  prefixLines,
  setHeading,
  wrapSelection
} from '@/lib/markdown-edit'
import {
  htmlToMarkdown,
  readClipboardHtml,
  readClipboardHtmlAsync,
  readClipboardImageBlob
} from '@/lib/html-to-markdown'

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })
enhanceMarkdownIt(md)

const editorUndo = createEditorUndo()

const content = ref('# 欢迎使用 Marknote\n\n点击 **打开** 选择 Markdown 文件，或 **新建** 开始写作。\n\n- 左侧：修改历史树\n- 中间：编辑器\n- 右侧：实时预览\n\n按 `⌘S` 保存，每次保存会自动记录一个历史版本。')
const filePath = ref<string | null>(null)
const history = ref<HistoryStore | null>(null)
const previewNodeId = ref<string | null>(null)
const isDirty = ref(false)
const statusMessage = ref('')
const editorRef = ref<HTMLTextAreaElement>()
const previewRef = ref<HTMLElement>()
const articleRef = ref<HTMLElement>()
const editorContextMenuRef = ref<InstanceType<typeof ContextMenu>>()
const previewContextMenuRef = ref<InstanceType<typeof ContextMenu>>()
const sidebarVisible = ref(true)
const dragDepth = ref(0)
const isDraggingFile = computed(() => dragDepth.value > 0)
const isMac = window.mdNotes.platform === 'darwin'

const isPreviewingHistory = computed(
  () =>
    previewNodeId.value !== null &&
    history.value?.headId !== null &&
    previewNodeId.value !== history.value?.headId
)

const editorContent = computed({
  get() {
    if (isPreviewingHistory.value && previewNodeId.value && history.value?.nodes[previewNodeId.value]) {
      return history.value.nodes[previewNodeId.value].content
    }
    return content.value
  },
  set(value: string) {
    if (!isPreviewingHistory.value) {
      content.value = value
      isDirty.value = true
    }
  }
})

const renderedHtml = ref('')

async function updatePreviewHtml() {
  let html = md.render(editorContent.value)
  const localImages = [...editorContent.value.matchAll(/!\[[^\]]*\]\((\.\/[^)]+)\)/g)]

  for (const match of localImages) {
    const rel = match[1]
    try {
      const previewUrl = await window.mdNotes.resolveAssetPath(filePath.value, rel)
      if (previewUrl && previewUrl !== rel) {
        html = html.split(rel).join(previewUrl)
      }
    } catch {
      // 保留相对路径
    }
  }

  renderedHtml.value = html
}

watch([editorContent, filePath, previewNodeId], () => {
  void updatePreviewHtml()
}, { immediate: true })

const { onEditorScroll, onPreviewScroll } = useScrollSync(editorRef, previewRef)

const title = computed(() => {
  const name = fileName(filePath.value)
  return isDirty.value ? `${name} •` : name
})

function showStatus(msg: string) {
  statusMessage.value = msg
  setTimeout(() => {
    if (statusMessage.value === msg) statusMessage.value = ''
  }, 2500)
}

async function confirmDiscardChanges(): Promise<boolean> {
  if (!isDirty.value) return true
  return window.mdNotes.confirmOpen('当前文档有未保存的修改，确定打开新文件吗？')
}

async function applyOpenResult(result: OpenResult) {
  filePath.value = result.filePath
  content.value = result.content
  history.value = result.history
  previewNodeId.value = result.history.headId
  isDirty.value = false
  editorUndo.reset()
  showStatus(`已打开 ${fileName(result.filePath)}`)
}

async function openFileAtPath(path: string) {
  if (!(await confirmDiscardChanges())) return

  const result = await window.mdNotes.openFilePath(path)
  if (!result) {
    showStatus('无法打开该文件')
    return
  }
  await applyOpenResult(result)
}

async function openFile() {
  if (!(await confirmDiscardChanges())) return

  const result = await window.mdNotes.openFile()
  if (!result) return
  await applyOpenResult(result)
}

function newFile() {
  filePath.value = null
  history.value = null
  previewNodeId.value = null
  content.value = '# 新文档\n\n开始写作吧…'
  isDirty.value = false
  editorUndo.reset()
  showStatus('新建文档')
}

async function saveFile() {
  const result = await window.mdNotes.saveFile(filePath.value, content.value)
  if (!result) return
  filePath.value = result.filePath
  history.value = result.history
  previewNodeId.value = result.history.headId
  isDirty.value = false
  showStatus('已保存')
}

function previewHistory(nodeId: string) {
  previewNodeId.value = nodeId
}

async function restoreHistory(nodeId: string) {
  if (!history.value || !filePath.value) return
  const node = history.value.nodes[nodeId]
  if (!node) return

  content.value = node.content
  history.value = await window.mdNotes.setHead(filePath.value, nodeId)
  previewNodeId.value = nodeId
  isDirty.value = true
  editorUndo.reset()
  showStatus(`已恢复到 ${node.label}`)
}

function backToCurrent() {
  if (history.value?.headId) {
    previewNodeId.value = history.value.headId
    const head = history.value.nodes[history.value.headId]
    if (head) content.value = head.content
  } else {
    previewNodeId.value = null
  }
}

function setContentFromEditor(value: string) {
  content.value = value
  isDirty.value = true
}

function syncEditorFromDom(el: HTMLTextAreaElement) {
  if (editorUndo.isApplying() || isPreviewingHistory.value) return
  setContentFromEditor(el.value)
}

async function resolvePastedImage(url: string, _alt: string): Promise<string> {
  try {
    const saved = await window.mdNotes.saveImage({ filePath: filePath.value, url })
    return saved.markdownPath
  } catch {
    return url
  }
}

async function saveClipboardImageBlob(blob: Blob): Promise<string | null> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  try {
    const saved = await window.mdNotes.saveImage({
      filePath: filePath.value,
      dataBase64: btoa(binary),
      mimeType: blob.type
    })
    return `![image](${saved.markdownPath})`
  } catch {
    return null
  }
}

function applyEditorEdit(el: HTMLTextAreaElement, edit: () => void) {
  editorUndo.pushUndo(el, true)
  edit()
  setContentFromEditor(el.value)
}

function withEditor(fn: (el: HTMLTextAreaElement) => void) {
  const el = editorRef.value
  if (!el || isPreviewingHistory.value) return
  el.focus()
  applyEditorEdit(el, () => fn(el))
}

async function convertClipboardToMarkdown(html: string): Promise<string | null> {
  return htmlToMarkdown(html, { resolveImage: resolvePastedImage })
}

async function pasteSmart(clipboardData?: DataTransfer | null, asPlainText = false) {
  if (isPreviewingHistory.value) return
  const el = editorRef.value
  if (!el) return

  if (asPlainText) {
    let text = clipboardData?.getData('text/plain')?.trim() ?? ''
    if (!text) text = await navigator.clipboard.readText()
    if (text) applyEditorEdit(el, () => insertAtCursor(el, text))
    return
  }

  let html = clipboardData ? readClipboardHtml(clipboardData) : null
  if (!html) html = await readClipboardHtmlAsync()

  if (html) {
    const markdown = await convertClipboardToMarkdown(html)
    if (markdown) {
      applyEditorEdit(el, () => insertAtCursor(el, markdown))
      return
    }
  }

  const imageBlob = await readClipboardImageBlob(clipboardData ?? null)
  if (imageBlob) {
    const markdown = await saveClipboardImageBlob(imageBlob)
    if (markdown) {
      applyEditorEdit(el, () => insertAtCursor(el, markdown))
      return
    }
  }

  let plain = clipboardData?.getData('text/plain')?.trim() ?? ''
  if (!plain) plain = await navigator.clipboard.readText()
  if (plain) applyEditorEdit(el, () => insertAtCursor(el, plain))
}

function onEditorPaste(event: ClipboardEvent) {
  if (isPreviewingHistory.value) return
  event.preventDefault()
  event.stopPropagation()
  void pasteSmart(event.clipboardData ?? null)
}

function onEditorInput(event: Event) {
  const el = event.target as HTMLTextAreaElement
  syncEditorFromDom(el)
}

function onEditorKeydown(event: KeyboardEvent) {
  if (isPreviewingHistory.value) return
  const el = editorRef.value
  if (!el) return

  const mod = event.metaKey || event.ctrlKey
  if (mod && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    if (event.shiftKey) {
      editorUndo.redo(el, setContentFromEditor)
    } else {
      editorUndo.undo(el, setContentFromEditor)
    }
    return
  }

  if (mod && event.key.toLowerCase() === 'y') {
    event.preventDefault()
    editorUndo.redo(el, setContentFromEditor)
    return
  }

  if (event.key.length === 1 && !mod && !event.altKey) {
    editorUndo.markTypingSession(el)
  } else if (event.key === 'Enter' || event.key === 'Backspace' || event.key === 'Delete') {
    editorUndo.markTypingSession(el)
  }
}

function execEditorCommand(command: string) {
  const el = editorRef.value
  if (!el || isPreviewingHistory.value) return
  el.focus()

  if (command === 'undo') {
    editorUndo.undo(el, setContentFromEditor)
    return
  }
  if (command === 'redo') {
    editorUndo.redo(el, setContentFromEditor)
    return
  }

  if (command === 'paste') {
    void pasteSmart()
    return
  }

  document.execCommand(command)
  setContentFromEditor(el.value)
}

function buildParagraphMenu(): ContextMenuItem[] {
  return [
    { label: '标题 1', action: () => withEditor((el) => setHeading(el, 1)) },
    { label: '标题 2', action: () => withEditor((el) => setHeading(el, 2)) },
    { label: '标题 3', action: () => withEditor((el) => setHeading(el, 3)) },
    { label: '标题 4', action: () => withEditor((el) => setHeading(el, 4)) },
    { divider: true, label: '' },
    { label: '正文段落', action: () => withEditor((el) => prefixLines(el, '')) },
    { label: '引用', action: () => withEditor((el) => prefixLines(el, '> ')) },
    { label: '无序列表', action: () => withEditor((el) => prefixLines(el, '- ')) },
    { label: '有序列表', action: () => withEditor((el) => prefixLines(el, '', true)) },
    { label: '任务列表', action: () => withEditor((el) => prefixLines(el, '- [ ] ')) },
    { divider: true, label: '' },
    {
      label: '代码块',
      action: () => withEditor((el) => insertBlock(el, '```\n代码\n```'))
    }
  ]
}

function buildFormatMenu(): ContextMenuItem[] {
  return [
    {
      label: '粗体',
      shortcut: '⌘B',
      action: () => withEditor((el) => wrapSelection(el, '**', '**', '粗体'))
    },
    {
      label: '斜体',
      shortcut: '⌘I',
      action: () => withEditor((el) => wrapSelection(el, '*', '*', '斜体'))
    },
    {
      label: '删除线',
      action: () => withEditor((el) => wrapSelection(el, '~~', '~~', '删除'))
    },
    {
      label: '行内代码',
      action: () => withEditor((el) => wrapSelection(el, '`', '`', 'code'))
    },
    { divider: true, label: '' },
    {
      label: '链接',
      action: () => withEditor((el) => wrapSelection(el, '[', '](url)', '链接文字'))
    },
    {
      label: '图片',
      action: () => withEditor((el) => wrapSelection(el, '![', '](url)', '描述'))
    },
    {
      label: '高亮',
      action: () => withEditor((el) => wrapSelection(el, '==', '==', '高亮'))
    }
  ]
}

function buildInsertMenu(): ContextMenuItem[] {
  return [
    {
      label: '链接',
      action: () => withEditor((el) => insertAtCursor(el, '[链接文字](url)', true))
    },
    {
      label: '图片',
      action: () => withEditor((el) => insertAtCursor(el, '![描述](url)', true))
    },
    {
      label: '表格',
      action: () => withEditor((el) => insertTable(el))
    },
    {
      label: '分隔线',
      action: () => withEditor((el) => insertBlock(el, '---'))
    },
    { divider: true, label: '' },
    {
      label: '代码块',
      action: () => withEditor((el) => insertBlock(el, '```\n\n```'))
    },
    {
      label: '数学公式',
      action: () => withEditor((el) => insertBlock(el, '$$\n\n$$'))
    },
    {
      label: '脚注',
      action: () => withEditor((el) => insertAtCursor(el, '[^1]', true))
    }
  ]
}

function onEditorContextMenu(event: MouseEvent) {
  if (isPreviewingHistory.value) return

  const el = editorRef.value
  const hasSelection = el ? el.selectionStart !== el.selectionEnd : false

  const items: ContextMenuItem[] = [
    { label: '撤销', shortcut: '⌘Z', action: () => execEditorCommand('undo') },
    { label: '重做', shortcut: '⇧⌘Z', action: () => execEditorCommand('redo') },
    { divider: true, label: '' },
    {
      label: '剪切',
      shortcut: '⌘X',
      action: () => execEditorCommand('cut'),
      disabled: !hasSelection
    },
    {
      label: '拷贝',
      shortcut: '⌘C',
      action: () => execEditorCommand('copy'),
      disabled: !hasSelection
    },
    {
      label: '粘贴',
      shortcut: '⌘V',
      action: () => void pasteSmart()
    },
    {
      label: '复制 / 粘贴为…',
      icon: '⎘',
      children: [
        {
          label: '复制为 Markdown',
          action: () => execEditorCommand('copy'),
          disabled: !hasSelection
        },
        {
          label: '复制全部 Markdown',
          action: () => navigator.clipboard.writeText(content.value)
        },
        {
          label: '复制为 HTML',
          action: () => navigator.clipboard.writeText(md.render(content.value))
        },
        { divider: true, label: '' },
        {
          label: '粘贴为纯文本',
          action: () => void pasteSmart(undefined, true)
        }
      ]
    },
    { divider: true, label: '' },
    {
      label: '段落',
      icon: '¶',
      children: buildParagraphMenu()
    },
    {
      label: '格式',
      icon: 'Aa',
      children: buildFormatMenu()
    },
    {
      label: '插入',
      icon: '+',
      children: buildInsertMenu()
    },
    { divider: true, label: '' },
    { label: '全选', shortcut: '⌘A', action: () => execEditorCommand('selectAll') }
  ]

  editorContextMenuRef.value?.show(event, items)
}

function onPreviewContextMenu(event: MouseEvent) {
  const items: ContextMenuItem[] = [
    {
      label: '复制全部内容',
      action: () => navigator.clipboard.writeText(editorContent.value)
    },
    {
      label: '复制为 HTML',
      action: () => navigator.clipboard.writeText(renderedHtml.value)
    }
  ]
  previewContextMenuRef.value?.show(event, items)
}

function isFileDrag(event: DragEvent): boolean {
  const types = event.dataTransfer?.types
  if (!types) return false
  return Array.from(types).some((type) => type === 'Files' || type === 'application/x-electron-file-path')
}

function resolveDropPath(dataTransfer: DataTransfer): string | null {
  for (const file of dataTransfer.files) {
    const path = window.mdNotes.getPathForFile(file)
    if (path && /\.(md|markdown|txt)$/i.test(path)) return path
  }

  const uriLine = (dataTransfer.getData('text/uri-list') || dataTransfer.getData('text/plain'))
    .trim()
    .split('\n')
    .find((line) => line.startsWith('file://'))

  if (uriLine) {
    try {
      const url = new URL(uriLine.trim())
      if (url.protocol === 'file:') {
        const path = decodeURIComponent(url.pathname)
        if (/\.(md|markdown|txt)$/i.test(path)) return path
      }
    } catch {
      // ignore malformed uri
    }
  }

  return null
}

function onDragEnter(event: DragEvent) {
  if (!isFileDrag(event)) return
  event.preventDefault()
  dragDepth.value++
}

function onDragLeave(event: DragEvent) {
  if (!isFileDrag(event)) return
  event.preventDefault()
  dragDepth.value = Math.max(0, dragDepth.value - 1)
}

function onDragOver(event: DragEvent) {
  if (!isFileDrag(event)) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
}

async function onDrop(event: DragEvent) {
  event.preventDefault()
  event.stopPropagation()
  dragDepth.value = 0

  const dataTransfer = event.dataTransfer
  if (!dataTransfer || !isFileDrag(event)) return

  const path = resolveDropPath(dataTransfer)
  if (!path) {
    showStatus('仅支持 .md / .markdown / .txt 文件')
    return
  }

  await openFileAtPath(path)
}

function onWindowDragEnd() {
  dragDepth.value = 0
}

function toggleSidebar() {
  sidebarVisible.value = !sidebarVisible.value
  savePref('sidebar-visible', String(sidebarVisible.value))
}

function loadSidebarVisible() {
  const saved = loadPref('sidebar-visible')
  if (saved !== null) sidebarVisible.value = saved === 'true'
}

function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault()
    saveFile()
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
    e.preventDefault()
    openFile()
  }
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'b') {
    e.preventDefault()
    toggleSidebar()
  }
}

let removeOpenFileListener: (() => void) | undefined

onMounted(() => {
  loadSidebarVisible()
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('dragend', onWindowDragEnd)
  document.addEventListener('dragenter', onDragEnter, true)
  document.addEventListener('dragleave', onDragLeave, true)
  document.addEventListener('dragover', onDragOver, true)
  document.addEventListener('drop', onDrop, true)
  removeOpenFileListener = window.mdNotes.onOpenFilePath((path) => {
    void openFileAtPath(path)
  })
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('dragend', onWindowDragEnd)
  document.removeEventListener('dragenter', onDragEnter, true)
  document.removeEventListener('dragleave', onDragLeave, true)
  document.removeEventListener('dragover', onDragOver, true)
  document.removeEventListener('drop', onDrop, true)
  removeOpenFileListener?.()
})
</script>

<template>
  <div class="app" :class="{ 'is-mac': isMac }">
    <div v-if="isDraggingFile" class="drop-overlay">
      <div class="drop-overlay-panel">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 3v10m0 0l3.5-3.5M12 13L8.5 9.5M4 14v4a2 2 0 002 2h12a2 2 0 002-2v-4"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <p>松开以打开 Markdown 文件</p>
        <span>.md · .markdown · .txt</span>
      </div>
    </div>

    <header class="toolbar">
      <div class="toolbar-drag" />
      <div class="toolbar-brand">Marknote</div>
      <div class="toolbar-actions">
        <button class="btn" @click="newFile">新建</button>
        <button class="btn" @click="openFile">打开</button>
        <button class="btn btn-primary" @click="saveFile">保存 ⌘S</button>
      </div>
      <div class="toolbar-title">{{ title }}</div>
      <div v-if="statusMessage" class="toolbar-status">{{ statusMessage }}</div>
    </header>

    <div class="workspace">
      <div class="sidebar-wrap" :class="{ collapsed: !sidebarVisible }">
        <HistoryTree
          :history="history"
          :preview-id="previewNodeId"
          @preview="previewHistory"
          @restore="restoreHistory"
        />
      </div>

      <main class="editor-pane">
        <div class="editor-toolbar">
          <button
            class="pane-toggle-btn"
            :title="sidebarVisible ? '收起侧边栏 (⇧⌘B)' : '展示侧边栏 (⇧⌘B)'"
            @click="toggleSidebar"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" stroke-width="1.2" />
              <path d="M5.5 2.5v11" stroke="currentColor" stroke-width="1.2" />
              <path
                v-if="sidebarVisible"
                d="M3.5 8L4.8 6.5L3.5 5"
                stroke="currentColor"
                stroke-width="1.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                v-else
                d="M4.5 8L3.2 6.5L4.5 5"
                stroke="currentColor"
                stroke-width="1.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        </div>
        <div v-if="isPreviewingHistory" class="history-banner">
          <span>正在预览历史版本</span>
          <button @click="backToCurrent">回到当前版本</button>
        </div>
        <textarea
          ref="editorRef"
          :value="editorContent"
          class="editor"
          :readonly="isPreviewingHistory"
          spellcheck="false"
          placeholder="在此输入 Markdown…"
          @contextmenu="onEditorContextMenu"
          @input="onEditorInput"
          @keydown="onEditorKeydown"
          @paste="onEditorPaste"
          @scroll="onEditorScroll"
        />
      </main>

      <section class="preview-pane" @contextmenu="onPreviewContextMenu">
        <div class="pane-label">预览</div>
        <div ref="previewRef" class="preview-scroll" @scroll="onPreviewScroll">
          <article ref="articleRef" class="markdown-preview" v-html="renderedHtml" />
        </div>
      </section>
    </div>

    <ContextMenu ref="editorContextMenuRef" />
    <ContextMenu ref="previewContextMenuRef" />
  </div>
</template>

<style scoped>
.app {
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
}

.drop-overlay {
  position: absolute;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10, 10, 14, 0.72);
  backdrop-filter: blur(4px);
  pointer-events: none;
}

.drop-overlay-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 32px 48px;
  border: 2px dashed #4a7cff;
  border-radius: 16px;
  background: rgba(30, 36, 51, 0.92);
  color: #e8e8ed;
  text-align: center;
}

.drop-overlay-panel svg {
  color: #8ab4ff;
}

.drop-overlay-panel p {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.drop-overlay-panel span {
  font-size: 12px;
  color: #888894;
}

.toolbar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  height: 44px;
  padding: 0 16px;
  background: #121216;
  border-bottom: 1px solid #2a2a32;
  flex-shrink: 0;
}

.app.is-mac .toolbar {
  padding-left: 80px;
}

.toolbar-drag {
  position: absolute;
  inset: 0;
  -webkit-app-region: drag;
}

.toolbar-brand,
.toolbar-actions,
.toolbar-title,
.toolbar-status,
.btn {
  position: relative;
  z-index: 1;
  -webkit-app-region: no-drag;
}

.toolbar-brand {
  font-size: 13px;
  font-weight: 700;
  color: #8ab4ff;
  letter-spacing: 0.02em;
}

.toolbar-actions {
  display: flex;
  gap: 6px;
}

.btn {
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 12px;
  color: #c8c8d2;
  background: #222228;
  transition: background 0.15s;
}

.btn:hover {
  background: #2e2e38;
}

.btn-primary {
  background: #2d4a8a;
  color: #e8f0ff;
}

.btn-primary:hover {
  background: #3a5ca0;
}

.toolbar-title {
  margin-left: auto;
  font-size: 12px;
  color: #888894;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toolbar-status {
  font-size: 11px;
  color: #4ade80;
}

.workspace {
  flex: 1;
  display: flex;
  min-height: 0;
}

.sidebar-wrap {
  flex-shrink: 0;
  width: 280px;
  overflow: hidden;
  transition: width 0.22s ease;
}

.sidebar-wrap.collapsed {
  width: 0;
}

.editor-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border-right: 1px solid #2a2a32;
}

.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: #18181c;
  border-bottom: 1px solid #2a2a32;
  flex-shrink: 0;
}

.pane-toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: #888894;
  transition: background 0.12s, color 0.12s;
}

.pane-toggle-btn:hover {
  background: #222228;
  color: #c8c8d2;
}

.history-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  background: #1a2438;
  border-bottom: 1px solid #2d4060;
  font-size: 12px;
  color: #8ab4ff;
}

.history-banner button {
  color: #6eb6ff;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 4px;
  background: #243048;
}

.history-banner button:hover {
  background: #2e3d58;
}

.editor {
  flex: 1;
  width: 100%;
  min-height: 0;
  padding: 20px 22px;
  background: #1a1a1e;
  color: #e8e8ed;
  font-size: 14px;
  line-height: 1.65;
  font-family: 'SF Mono', Menlo, 'Courier New', monospace;
  overflow-y: auto;
  resize: none;
}

.editor:read-only {
  opacity: 0.75;
}

.preview-pane {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #16161a;
  overflow: hidden;
}

.preview-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 28px 40px;
}

.pane-label {
  flex-shrink: 0;
  padding: 20px 28px 0;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #55555f;
  margin-bottom: 0;
}
</style>
