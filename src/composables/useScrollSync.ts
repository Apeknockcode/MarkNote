import type { Ref } from 'vue'

import { getScrollCenterRatio, setScrollCenterRatio } from '@/lib/markdown-lines'

type ScrollSource = 'editor' | 'preview'

export function useScrollSync(
  editorRef: Ref<HTMLTextAreaElement | undefined>,
  previewRef: Ref<HTMLElement | undefined>
) {
  let syncing: ScrollSource | null = null
  let releaseTimer = 0

  function lock(source: ScrollSource) {
    syncing = source
    window.clearTimeout(releaseTimer)
    releaseTimer = window.setTimeout(() => {
      syncing = null
    }, 100)
  }

  function onEditorScroll() {
    if (syncing === 'preview') return

    const editor = editorRef.value
    const preview = previewRef.value
    if (!editor || !preview) return

    lock('editor')
    setScrollCenterRatio(preview, getScrollCenterRatio(editor))
  }

  function onPreviewScroll() {
    if (syncing === 'editor') return

    const editor = editorRef.value
    const preview = previewRef.value
    if (!editor || !preview) return

    lock('preview')
    setScrollCenterRatio(editor, getScrollCenterRatio(preview))
  }

  return { onEditorScroll, onPreviewScroll }
}
