export interface EditSnapshot {
  content: string
  selectionStart: number
  selectionEnd: number
}

const MAX_UNDO = 100
const MERGE_MS = 400

export function createEditorUndo() {
  const undoStack: EditSnapshot[] = []
  const redoStack: EditSnapshot[] = []
  let lastTypingPushAt = 0
  let applying = false

  function readSnapshot(el: HTMLTextAreaElement): EditSnapshot {
    return {
      content: el.value,
      selectionStart: el.selectionStart,
      selectionEnd: el.selectionEnd
    }
  }

  function applySnapshot(el: HTMLTextAreaElement, snapshot: EditSnapshot, onApply: (content: string) => void) {
    applying = true
    el.value = snapshot.content
    onApply(snapshot.content)
    el.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd)
    applying = false
    lastTypingPushAt = 0
  }

  function pushUndo(el: HTMLTextAreaElement, force = false) {
    if (applying) return

    const snapshot = readSnapshot(el)
    const top = undoStack[undoStack.length - 1]
    if (top && top.content === snapshot.content && top.selectionStart === snapshot.selectionStart) {
      return
    }

    if (!force && Date.now() - lastTypingPushAt < MERGE_MS) {
      return
    }

    undoStack.push(snapshot)
    if (undoStack.length > MAX_UNDO) undoStack.shift()
    redoStack.length = 0
    lastTypingPushAt = Date.now()
  }

  function markTypingSession(el: HTMLTextAreaElement) {
    if (applying) return
    if (Date.now() - lastTypingPushAt >= MERGE_MS) {
      pushUndo(el, true)
    }
  }

  function undo(el: HTMLTextAreaElement, onApply: (content: string) => void): boolean {
    if (undoStack.length === 0) return false

    const current = readSnapshot(el)
    redoStack.push(current)

    const previous = undoStack.pop()
    if (!previous) return false

    applySnapshot(el, previous, onApply)
    return true
  }

  function redo(el: HTMLTextAreaElement, onApply: (content: string) => void): boolean {
    if (redoStack.length === 0) return false

    const current = readSnapshot(el)
    undoStack.push(current)

    const next = redoStack.pop()
    if (!next) return false

    applySnapshot(el, next, onApply)
    return true
  }

  function reset(initial?: EditSnapshot) {
    undoStack.length = 0
    redoStack.length = 0
    lastTypingPushAt = 0
    if (initial) {
      undoStack.push(initial)
    }
  }

  function isApplying() {
    return applying
  }

  return {
    pushUndo,
    markTypingSession,
    undo,
    redo,
    reset,
    isApplying,
    readSnapshot
  }
}

export type EditorUndo = ReturnType<typeof createEditorUndo>
