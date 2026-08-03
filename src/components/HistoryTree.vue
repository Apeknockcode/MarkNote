<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { HistoryStore } from '@/env.d'
import { buildHistoryTree, computeDisplayDepths, formatTime, type TreeNode } from '@/lib/history'
import { loadPref, savePref } from '@/lib/prefs'
import ContextMenu, { type ContextMenuItem } from '@/components/ContextMenu.vue'

const props = defineProps<{
  history: HistoryStore | null
  previewId: string | null
}>()

const emit = defineEmits<{
  preview: [nodeId: string]
  restore: [nodeId: string]
}>()

const contextMenuRef = ref<InstanceType<typeof ContextMenu>>()

const ZOOM_MIN = 0.75
const ZOOM_MAX = 1.5
const ZOOM_STEP = 0.1
const sidebarZoom = ref(1)
const historyExpanded = ref(true)

interface FlatNode {
  node: TreeNode['node']
  depth: number
  isBranch: boolean
}

function flatten(items: TreeNode[], parentHasSiblings = false): FlatNode[] {
  const result: FlatNode[] = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const childCount = item.children.length
    result.push({ node: item.node, depth: 0, isBranch: parentHasSiblings || i > 0 })
    result.push(...flatten(item.children, childCount > 1))
  }
  return result
}

const flatNodes = computed(() => {
  if (!props.history) return []
  const depthMap = computeDisplayDepths(props.history)
  return flatten(buildHistoryTree(props.history)).map(({ node, isBranch }) => ({
    node,
    depth: depthMap.get(node.id) ?? 0,
    isBranch
  }))
})

const zoomPercent = computed(() => `${Math.round(sidebarZoom.value * 100)}%`)

function zoomIn() {
  sidebarZoom.value = Math.min(ZOOM_MAX, Math.round((sidebarZoom.value + ZOOM_STEP) * 10) / 10)
  saveZoom()
}

function zoomOut() {
  sidebarZoom.value = Math.max(ZOOM_MIN, Math.round((sidebarZoom.value - ZOOM_STEP) * 10) / 10)
  saveZoom()
}

function resetZoom() {
  sidebarZoom.value = 1
  saveZoom()
}

function saveZoom() {
  savePref('sidebar-zoom', String(sidebarZoom.value))
}

function loadZoom() {
  const saved = loadPref('sidebar-zoom')
  if (saved) {
    const value = parseFloat(saved)
    if (!Number.isNaN(value) && value >= ZOOM_MIN && value <= ZOOM_MAX) {
      sidebarZoom.value = value
    }
  }
}

function toggleHistoryExpanded() {
  historyExpanded.value = !historyExpanded.value
  savePref('history-expanded', String(historyExpanded.value))
}

function loadHistoryExpanded() {
  const saved = loadPref('history-expanded')
  if (saved !== null) historyExpanded.value = saved === 'true'
}

function onNodeContextMenu(event: MouseEvent, nodeId: string) {
  const node = props.history?.nodes[nodeId]
  if (!node) return

  const isHead = props.history?.headId === nodeId
  const items: ContextMenuItem[] = [
    { label: '预览此版本', action: () => emit('preview', nodeId) },
    {
      label: '恢复此版本',
      action: () => emit('restore', nodeId),
      disabled: isHead
    },
    { divider: true, label: '' },
    {
      label: '复制版本名称',
      action: () => navigator.clipboard.writeText(node.label)
    },
    {
      label: '复制时间',
      action: () => navigator.clipboard.writeText(formatTime(node.timestamp))
    }
  ]

  contextMenuRef.value?.show(event, items)
}

function onPanelContextMenu(event: MouseEvent) {
  const items: ContextMenuItem[] = [
    { label: '放大', shortcut: '+', action: zoomIn },
    { label: '缩小', shortcut: '−', action: zoomOut },
    { label: '重置缩放', action: resetZoom }
  ]
  contextMenuRef.value?.show(event, items)
}

onMounted(() => {
  loadZoom()
  loadHistoryExpanded()
})
</script>

<template>
  <aside
    class="history-panel"
    :style="{ '--sidebar-zoom': sidebarZoom }"
    @contextmenu="onPanelContextMenu"
  >
    <div class="history-header">
      <div class="history-header-top">
        <button
          class="history-expand-btn"
          :title="historyExpanded ? '收起历史记录' : '展示历史记录'"
          @click="toggleHistoryExpanded"
        >
          <svg
            class="history-expand-icon"
            :class="{ collapsed: !historyExpanded }"
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M3 4.5L6 7.5L9 4.5"
              stroke="currentColor"
              stroke-width="1.3"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <h2>修改历史</h2>
        <div class="zoom-controls">
          <button class="zoom-btn" title="缩小" @click="zoomOut">−</button>
          <button class="zoom-label" title="重置缩放" @click="resetZoom">{{ zoomPercent }}</button>
          <button class="zoom-btn" title="放大" @click="zoomIn">+</button>
        </div>
      </div>
      <p v-if="history">{{ Object.keys(history.nodes).length }} 个版本</p>
      <p v-else>打开文件后自动记录</p>
    </div>

    <div v-if="historyExpanded && (!history || flatNodes.length === 0)" class="history-empty">
      保存文档后会在这里形成历史树
    </div>

    <div v-else-if="historyExpanded" class="history-tree">
      <div
        v-for="{ node, depth, isBranch } in flatNodes"
        :key="node.id"
        class="tree-node"
        :class="{
          'is-preview': previewId === node.id,
          'is-head': history?.headId === node.id,
          'is-branch': isBranch
        }"
        :style="{ paddingLeft: `${12 + depth * 14}px` }"
        @contextmenu="onNodeContextMenu($event, node.id)"
      >
        <button class="tree-node-main" @click="emit('preview', node.id)">
          <span class="tree-dot" />
          <div class="tree-content">
            <span class="tree-label">{{ node.label }}</span>
            <span class="tree-time">{{ formatTime(node.timestamp) }}</span>
          </div>
        </button>
        <button class="tree-action" title="恢复此版本" @click.stop="emit('restore', node.id)">
          恢复
        </button>
      </div>
    </div>

    <ContextMenu ref="contextMenuRef" />
  </aside>
</template>

<style scoped>
.history-panel {
  width: 280px;
  height: 100%;
  border-right: 1px solid #2a2a32;
  background: #16161a;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-size: calc(13px * var(--sidebar-zoom, 1));
}

.history-header {
  padding: 52px 16px 12px;
  border-bottom: 1px solid #2a2a32;
  flex-shrink: 0;
}

.history-header-top {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.history-expand-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 5px;
  color: #888894;
  flex-shrink: 0;
  transition: background 0.12s, color 0.12s;
}

.history-expand-btn:hover {
  background: #222228;
  color: #c8c8d2;
}

.history-expand-icon {
  transition: transform 0.2s ease;
}

.history-expand-icon.collapsed {
  transform: rotate(-90deg);
}

.history-header h2 {
  margin: 0;
  flex: 1;
  font-size: 1.08em;
  font-weight: 600;
  color: #f0f0f5;
  min-width: 0;
}

.history-header p {
  margin: 0;
  font-size: 0.92em;
  color: #7a7a88;
}

.zoom-controls {
  display: flex;
  align-items: center;
  gap: 2px;
  background: #222228;
  border-radius: 6px;
  padding: 2px;
  flex-shrink: 0;
}

.zoom-btn {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  font-size: 14px;
  color: #a0a0ac;
  line-height: 1;
  transition: background 0.12s, color 0.12s;
}

.zoom-btn:hover {
  background: #2e2e38;
  color: #e0e0e8;
}

.zoom-label {
  min-width: 38px;
  padding: 0 4px;
  font-size: 0.75em;
  color: #888894;
  text-align: center;
  border-radius: 4px;
  transition: background 0.12s, color 0.12s;
}

.zoom-label:hover {
  background: #2e2e38;
  color: #c8c8d2;
}

.history-empty {
  padding: 24px 16px;
  font-size: 1em;
  color: #6a6a78;
  line-height: 1.5;
}

.history-tree {
  flex: 1;
  overflow: auto;
  padding: 8px 8px 16px;
}

.tree-node {
  position: relative;
  display: flex;
  align-items: stretch;
  gap: 2px;
  border-radius: 8px;
  margin: 1px 0;
  transition: background 0.15s;
}

.tree-node.is-branch::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  border-radius: 1px;
  background: #3d5a99;
  opacity: 0.5;
}

.tree-node:hover {
  background: #222228;
}

.tree-node.is-preview {
  background: #1e2433;
  outline: 1px solid #3d5a99;
}

.tree-node.is-head .tree-dot {
  background: #4ade80;
  box-shadow: 0 0 6px #4ade8066;
}

.tree-node-main {
  flex: 1;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 7px 4px 7px 8px;
  text-align: left;
  color: inherit;
  min-width: 0;
}

.tree-dot {
  width: 0.62em;
  height: 0.62em;
  border-radius: 50%;
  background: #55555f;
  flex-shrink: 0;
  margin-top: 0.35em;
}

.tree-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tree-label {
  font-size: 0.92em;
  color: #c8c8d2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tree-time {
  font-size: 0.77em;
  color: #666670;
  font-variant-numeric: tabular-nums;
}

.tree-action {
  opacity: 0;
  align-self: center;
  font-size: 0.85em;
  color: #6eb6ff;
  padding: 4px 6px;
  border-radius: 4px;
  margin-right: 4px;
  flex-shrink: 0;
  transition: opacity 0.15s;
}

.tree-node:hover .tree-action {
  opacity: 1;
}

.tree-action:hover {
  background: #2a3344;
}
</style>
