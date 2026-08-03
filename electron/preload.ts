import { contextBridge, ipcRenderer, webUtils } from 'electron'

export interface HistoryNode {
  id: string
  parentId: string | null
  timestamp: number
  content: string
  label: string
}

export interface FileIdentity {
  inode: number
  birthtimeMs: number
}

export interface HistoryStore {
  filePath: string
  fileIdentity?: FileIdentity
  headId: string | null
  nodes: Record<string, HistoryNode>
}

export interface OpenResult {
  filePath: string
  content: string
  history: HistoryStore
}

export interface SaveResult {
  filePath: string
  history: HistoryStore
}

export interface SavedImageResult {
  absolutePath: string
  markdownPath: string
}

function getPathForFile(file: File): string | null {
  try {
    return webUtils.getPathForFile(file)
  } catch {
    const legacy = (file as File & { path?: string }).path
    return legacy ?? null
  }
}

const api = {
  platform: process.platform as NodeJS.Platform,
  openFile: (): Promise<OpenResult | null> => ipcRenderer.invoke('dialog:open'),
  openFilePath: (filePath: string): Promise<OpenResult | null> =>
    ipcRenderer.invoke('file:open-path', filePath),
  saveFile: (filePath: string | null, content: string): Promise<SaveResult | null> =>
    ipcRenderer.invoke('dialog:save', { filePath, content }),
  loadHistory: (filePath: string): Promise<HistoryStore> => ipcRenderer.invoke('history:load', filePath),
  snapshot: (
    filePath: string,
    content: string,
    parentId: string | null,
    label: string
  ): Promise<{ history: HistoryStore; node: HistoryNode }> =>
    ipcRenderer.invoke('history:snapshot', { filePath, content, parentId, label }),
  setHead: (filePath: string, nodeId: string): Promise<HistoryStore> =>
    ipcRenderer.invoke('history:set-head', { filePath, nodeId }),
  getPathForFile,
  confirmOpen: (message: string): Promise<boolean> => ipcRenderer.invoke('dialog:confirm-open', message),
  saveImage: (payload: {
    filePath: string | null
    url?: string
    dataBase64?: string
    mimeType?: string
  }): Promise<SavedImageResult> => ipcRenderer.invoke('assets:save-image', payload),
  resolveAssetPath: (filePath: string | null, relativePath: string): Promise<string> =>
    ipcRenderer.invoke('assets:resolve-path', { filePath, relativePath }),
  onOpenFilePath: (callback: (filePath: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, filePath: string) => callback(filePath)
    ipcRenderer.on('app:open-file', handler)
    return () => ipcRenderer.removeListener('app:open-file', handler)
  }
}

contextBridge.exposeInMainWorld('mdNotes', api)

export type MdNotesAPI = typeof api
