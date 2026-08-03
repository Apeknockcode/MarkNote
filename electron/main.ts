import { createHash, randomUUID } from 'crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { basename, dirname, extname, join } from 'path'
import { pathToFileURL } from 'url'
import { app, BrowserWindow, dialog, ipcMain, nativeImage, net } from 'electron'

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

interface OpenResult {
  filePath: string
  content: string
  history: HistoryStore
}

function migrateLegacyUserData(): void {
  if (process.platform !== 'darwin') return

  try {
    const historyDirPath = join(app.getPath('userData'), 'history')
    if (!existsSync(historyDirPath)) mkdirSync(historyDirPath, { recursive: true })

    const legacyRoots = ['md-notes', 'moji-notes', '墨记', 'Marknote', 'marknote']
    for (const legacyName of legacyRoots) {
      const legacyHistory = join(homedir(), 'Library/Application Support', legacyName, 'history')
      if (!existsSync(legacyHistory)) continue

      for (const file of readdirSync(legacyHistory)) {
        const source = join(legacyHistory, file)
        const target = join(historyDirPath, file)
        if (!existsSync(target)) {
          cpSync(source, target)
        }
      }
    }
  } catch (error) {
    console.error('[Marknote] migrate legacy data failed:', error)
  }
}

function historyDir(): string {
  const dir = join(app.getPath('userData'), 'history')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function historyKey(filePath: string): string {
  return createHash('sha256').update(filePath).digest('hex')
}

function historyPath(filePath: string): string {
  return join(historyDir(), `${historyKey(filePath)}.json`)
}

function loadHistory(filePath: string): HistoryStore {
  const path = historyPath(filePath)
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, 'utf-8')) as HistoryStore
  }
  return { filePath, headId: null, nodes: {} }
}

function saveHistory(store: HistoryStore): void {
  writeFileSync(historyPath(store.filePath), JSON.stringify(store, null, 2), 'utf-8')
}

function getFileIdentity(filePath: string): FileIdentity {
  const stat = statSync(filePath)
  return { inode: stat.ino, birthtimeMs: stat.birthtimeMs }
}

function identityMatches(a: FileIdentity, b: FileIdentity): boolean {
  return a.inode === b.inode && a.birthtimeMs === b.birthtimeMs
}

/** 判断磁盘上的文件是否与历史记录对应同一物理文件 */
function isRecreatedFile(history: HistoryStore, identity: FileIdentity): boolean {
  if (history.fileIdentity) {
    return !identityMatches(history.fileIdentity, identity)
  }
  if (!history.headId || Object.keys(history.nodes).length === 0) return false

  // 兼容旧历史：若文件创建时间晚于最早版本，说明是删除后重建的同名文件
  const oldest = Math.min(...Object.values(history.nodes).map((n) => n.timestamp))
  return identity.birthtimeMs > oldest + 1000
}

function freshHistory(filePath: string, content: string, identity: FileIdentity): HistoryStore {
  const store: HistoryStore = {
    filePath,
    fileIdentity: identity,
    headId: null,
    nodes: {}
  }
  createNode(store, content, null, '初始打开')
  return store
}

function resolveHistory(filePath: string, content: string): HistoryStore {
  const identity = getFileIdentity(filePath)
  let history = loadHistory(filePath)

  if (isRecreatedFile(history, identity)) {
    history = freshHistory(filePath, content, identity)
    saveHistory(history)
    return history
  }

  if (!history.fileIdentity) {
    history.fileIdentity = identity
  }

  if (!history.headId) {
    createNode(history, content, null, '初始打开')
    saveHistory(history)
  }

  return history
}

function createNode(
  store: HistoryStore,
  content: string,
  parentId: string | null,
  label: string
): HistoryNode {
  const node: HistoryNode = {
    id: randomUUID(),
    parentId,
    timestamp: Date.now(),
    content,
    label
  }
  store.nodes[node.id] = node
  store.headId = node.id
  return node
}

function getIconPath(): string | null {
  const isMac = process.platform === 'darwin'
  const packagedCandidates = isMac
    ? [join(process.resourcesPath, 'icon.icns'), join(process.resourcesPath, 'icon.png')]
    : [
        join(process.resourcesPath, 'icon.ico'),
        join(process.resourcesPath, 'icon.png'),
        join(process.resourcesPath, 'icon.icns')
      ]

  const devCandidates = isMac
    ? [
        join(process.cwd(), 'build/icon.icns'),
        join(app.getAppPath(), 'build/icon.icns'),
        join(process.cwd(), 'build/icon-dock-512.png'),
        join(process.cwd(), 'build/icon.png')
      ]
    : [
        join(process.cwd(), 'build/icon.ico'),
        join(app.getAppPath(), 'build/icon.ico'),
        join(process.cwd(), 'build/icon.png'),
        join(app.getAppPath(), 'build/icon.png')
      ]

  const candidates = app.isPackaged ? packagedCandidates : devCandidates
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

function setDockIcon(): void {
  if (process.platform !== 'darwin' || !app.dock || app.isPackaged) return

  try {
    const dockCandidates = [
      join(process.cwd(), 'build/icon-dock-512.png'),
      join(app.getAppPath(), 'build/icon-dock-512.png'),
      join(process.cwd(), 'build/icon.icns'),
      join(app.getAppPath(), 'build/icon.icns')
    ]
    const iconPath = dockCandidates.find((candidate) => existsSync(candidate))
    if (!iconPath) return

    const image = nativeImage.createFromPath(iconPath)
    if (!image.isEmpty()) app.dock.setIcon(image)
  } catch (error) {
    console.error('[Marknote] set dock icon failed:', error)
  }
}

function openFileByPath(filePath: string): OpenResult | null {
  if (!existsSync(filePath)) return null
  const ext = extname(filePath).toLowerCase()
  if (!['.md', '.markdown', '.txt'].includes(ext)) return null

  const content = readFileSync(filePath, 'utf-8')
  const history = resolveHistory(filePath, content)
  return { filePath, content, history }
}

function assetsDirForFile(filePath: string | null): string {
  if (filePath) {
    const base = basename(filePath, extname(filePath))
    return join(dirname(filePath), `${base}.assets`)
  }
  return join(app.getPath('userData'), 'draft-assets')
}

function markdownRelativeAsset(filePath: string | null, filename: string): string {
  if (filePath) {
    const base = basename(filePath, extname(filePath))
    return `./${base}.assets/${filename}`
  }
  return `./draft-assets/${filename}`
}

function extensionFromMime(mimeType?: string, url?: string): string {
  if (mimeType?.includes('jpeg') || mimeType?.includes('jpg')) return '.jpg'
  if (mimeType?.includes('gif')) return '.gif'
  if (mimeType?.includes('webp')) return '.webp'
  if (mimeType?.includes('svg')) return '.svg'
  if (url) {
    const match = url.match(/\.(png|jpe?g|gif|webp|svg)(?:\?|$)/i)
    if (match) return `.${match[1].toLowerCase().replace('jpeg', 'jpg')}`
  }
  return '.png'
}

function mimeFromExtension(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    case '.svg':
      return 'image/svg+xml'
    default:
      return 'image/png'
  }
}

function resolveAbsoluteAssetPath(filePath: string | null, relativePath: string): string {
  const clean = relativePath.replace(/^\.\//, '')
  return filePath ? join(dirname(filePath), clean) : join(app.getPath('userData'), clean)
}

function previewUrlForAsset(absolutePath: string): string {
  const ext = extname(absolutePath).toLowerCase()
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) {
    const data = readFileSync(absolutePath)
    const mime = mimeFromExtension(ext)
    return `data:${mime};base64,${data.toString('base64')}`
  }
  return pathToFileURL(absolutePath).href
}

function downloadBinary(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const request = net.request(url)
    const chunks: Buffer[] = []

    request.on('response', (response) => {
      if (response.statusCode && response.statusCode >= 400) {
        reject(new Error(`HTTP ${response.statusCode}`))
        return
      }

      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      response.on('end', () => resolve(Buffer.concat(chunks)))
      response.on('error', reject)
    })

    request.on('error', reject)
    request.end()
  })
}

function registerAssetHandlers(): void {
  ipcMain.handle(
    'assets:save-image',
    async (
      _event,
      payload: {
        filePath: string | null
        url?: string
        dataBase64?: string
        mimeType?: string
      }
    ) => {
      const dir = assetsDirForFile(payload.filePath)
      mkdirSync(dir, { recursive: true })

      let buffer: Buffer
      let ext = extensionFromMime(payload.mimeType, payload.url)

      if (payload.dataBase64) {
        buffer = Buffer.from(payload.dataBase64, 'base64')
      } else if (payload.url) {
        buffer = await downloadBinary(payload.url)
      } else {
        throw new Error('缺少图片数据')
      }

      const filename = `image-${Date.now()}-${randomUUID().slice(0, 8)}${ext}`
      const absolutePath = join(dir, filename)
      writeFileSync(absolutePath, buffer)

      return {
        absolutePath,
        markdownPath: markdownRelativeAsset(payload.filePath, filename)
      }
    }
  )

  ipcMain.handle(
    'assets:resolve-path',
    (_event, payload: { filePath: string | null; relativePath: string }) => {
      const absolutePath = resolveAbsoluteAssetPath(payload.filePath, payload.relativePath)
      if (!existsSync(absolutePath)) return payload.relativePath
      return previewUrlForAsset(absolutePath)
    }
  )
}

function registerIpcHandlers(): void {
  ipcMain.handle('dialog:open', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }]
    })
    if (result.canceled || !result.filePaths[0]) return null
    return openFileByPath(result.filePaths[0])
  })

  ipcMain.handle('file:open-path', (_event, filePath: string) => openFileByPath(filePath))

  ipcMain.handle('dialog:confirm-open', async (_event, message: string) => {
    const { response } = await dialog.showMessageBox({
      type: 'warning',
      title: 'Marknote',
      message,
      buttons: ['取消', '继续打开'],
      defaultId: 0,
      cancelId: 0
    })
    return response === 1
  })

  ipcMain.handle('dialog:save', async (_event, payload: { filePath: string | null; content: string }) => {
    let filePath = payload.filePath

    if (!filePath) {
      const result = await dialog.showSaveDialog({
        filters: [{ name: 'Markdown', extensions: ['md'] }],
        defaultPath: 'untitled.md'
      })
      if (result.canceled || !result.filePath) return null
      filePath = result.filePath
    }

    writeFileSync(filePath, payload.content, 'utf-8')

    const identity = getFileIdentity(filePath)
    let history = loadHistory(filePath)

    if (isRecreatedFile(history, identity)) {
      history = freshHistory(filePath, payload.content, identity)
    } else {
      if (!history.fileIdentity) history.fileIdentity = identity

      const head = history.headId ? history.nodes[history.headId] : null
      const changed = !head || head.content !== payload.content

      if (changed) {
        const parentId = history.headId
        const existingChildren = parentId
          ? Object.values(history.nodes).filter((n) => n.parentId === parentId)
          : []
        const label = existingChildren.length > 0 ? '分支保存' : '保存'
        createNode(history, payload.content, parentId, label)
      }
    }

    history.fileIdentity = identity
    history.filePath = filePath
    saveHistory(history)
    return { filePath, history }
  })

  ipcMain.handle('history:load', (_event, filePath: string) => loadHistory(filePath))

  ipcMain.handle(
    'history:snapshot',
    (_event, payload: { filePath: string; content: string; parentId: string | null; label: string }) => {
      const history = loadHistory(payload.filePath)
      const node = createNode(history, payload.content, payload.parentId, payload.label)
      saveHistory(history)
      return { history, node }
    }
  )

  ipcMain.handle('history:set-head', (_event, payload: { filePath: string; nodeId: string }) => {
    const history = loadHistory(payload.filePath)
    if (!history.nodes[payload.nodeId]) {
      throw new Error('节点不存在')
    }
    history.headId = payload.nodeId
    saveHistory(history)
    return history
  })
}

function sendOpenFileToRenderer(win: BrowserWindow, filePath: string): void {
  if (!existsSync(filePath)) return
  const ext = extname(filePath).toLowerCase()
  if (!['.md', '.markdown', '.txt'].includes(ext)) return
  win.webContents.send('app:open-file', filePath)
}

function createWindow(): BrowserWindow {
  const iconPath = getIconPath()
  const isMac = process.platform === 'darwin'

  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#1a1a1e',
    ...(isMac ? { titleBarStyle: 'hiddenInset' as const } : {}),
    ...(process.platform === 'win32' ? { autoHideMenuBar: true } : {}),
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.once('ready-to-show', () => {
    win.show()
    win.focus()
  })

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, url) => {
    console.error('[Marknote] page load failed:', errorCode, errorDescription, url)
  })

  win.webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (app.isPackaged || !rendererUrl) {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  } else {
    win.loadURL(rendererUrl)
  }

  return win
}

app.whenReady().then(() => {
  app.setName('Marknote')
  registerIpcHandlers()
  registerAssetHandlers()

  let pendingOpenPath: string | null = null

  app.on('open-file', (event, filePath) => {
    event.preventDefault()
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    if (win && !win.webContents.isLoading()) {
      sendOpenFileToRenderer(win, filePath)
    } else {
      pendingOpenPath = filePath
    }
  })

  const win = createWindow()
  win.webContents.once('did-finish-load', () => {
    if (pendingOpenPath) {
      sendOpenFileToRenderer(win, pendingOpenPath)
      pendingOpenPath = null
    }
  })

  migrateLegacyUserData()
  setDockIcon()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
