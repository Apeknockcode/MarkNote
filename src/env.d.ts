/// <reference types="vite/client" />

import type { HistoryNode, HistoryStore, OpenResult, MdNotesAPI } from '../electron/preload'

declare global {
  interface Window {
    mdNotes: MdNotesAPI
  }
}

export type { HistoryNode, HistoryStore, OpenResult }
