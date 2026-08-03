import type { HistoryNode, HistoryStore } from '@/env.d'

export interface TreeNode {
  node: HistoryNode
  children: TreeNode[]
}

export function buildHistoryTree(store: HistoryStore): TreeNode[] {
  const nodes = Object.values(store.nodes)
  const childrenMap = new Map<string | null, HistoryNode[]>()

  for (const node of nodes) {
    const key = node.parentId
    if (!childrenMap.has(key)) childrenMap.set(key, [])
    childrenMap.get(key)!.push(node)
  }

  for (const [, list] of childrenMap) {
    list.sort((a, b) => a.timestamp - b.timestamp)
  }

  function build(parentId: string | null): TreeNode[] {
    const children = childrenMap.get(parentId) ?? []
    return children.map((node) => ({
      node,
      children: build(node.id)
    }))
  }

  return build(null)
}

/** 线性保存链不增加缩进，仅在有兄弟节点（分支）时加深层级 */
export function computeDisplayDepths(store: HistoryStore): Map<string, number> {
  const depths = new Map<string, number>()

  function walk(items: TreeNode[], displayDepth: number) {
    for (const item of items) {
      depths.set(item.node.id, displayDepth)
      if (item.children.length === 0) continue
      const nextDepth = item.children.length > 1 ? displayDepth + 1 : displayDepth
      walk(item.children, nextDepth)
    }
  }

  walk(buildHistoryTree(store), 0)
  return depths
}

export function formatTime(timestamp: number): string {
  const d = new Date(timestamp)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function fileName(path: string | null): string {
  if (!path) return '未命名文档'
  return path.split(/[/\\]/).pop() ?? path
}
