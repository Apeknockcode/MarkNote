<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

export interface ContextMenuItem {
  label: string
  action?: () => void
  disabled?: boolean
  divider?: boolean
  shortcut?: string
  icon?: string
  children?: ContextMenuItem[]
}

const visible = ref(false)
const x = ref(0)
const y = ref(0)
const items = ref<ContextMenuItem[]>([])

const subVisible = ref(false)
const subItems = ref<ContextMenuItem[]>([])
const subX = ref(0)
const subY = ref(0)
let subHideTimer: ReturnType<typeof setTimeout> | null = null

function show(event: MouseEvent, menuItems: ContextMenuItem[]) {
  event.preventDefault()
  event.stopPropagation()

  hideSubmenu()
  items.value = menuItems
  visible.value = true

  const menuWidth = 220
  const menuHeight = estimateHeight(menuItems)
  x.value = Math.min(event.clientX, window.innerWidth - menuWidth - 8)
  y.value = Math.min(event.clientY, window.innerHeight - menuHeight - 8)
}

function estimateHeight(menuItems: ContextMenuItem[]) {
  return menuItems.reduce((h, item) => h + (item.divider ? 9 : 32), 8)
}

function hide() {
  visible.value = false
  hideSubmenu()
}

function hideSubmenu() {
  subVisible.value = false
  subItems.value = []
  if (subHideTimer) {
    clearTimeout(subHideTimer)
    subHideTimer = null
  }
}

function onItemClick(item: ContextMenuItem) {
  if (item.disabled || item.divider || item.children?.length) return
  hide()
  item.action?.()
}

function onItemEnter(event: MouseEvent, item: ContextMenuItem, index: number) {
  if (subHideTimer) {
    clearTimeout(subHideTimer)
    subHideTimer = null
  }
  if (!item.children?.length) {
    subHideTimer = setTimeout(hideSubmenu, 120)
    return
  }

  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  subItems.value = item.children
  subVisible.value = true

  const subWidth = 200
  const subHeight = estimateHeight(item.children)
  let left = rect.right - 4
  if (left + subWidth > window.innerWidth - 8) {
    left = rect.left - subWidth + 4
  }
  subX.value = left
  subY.value = Math.min(rect.top, window.innerHeight - subHeight - 8)
}

function onSubItemClick(item: ContextMenuItem) {
  if (item.disabled || item.divider) return
  hide()
  item.action?.()
}

function onSubmenuEnter() {
  if (subHideTimer) {
    clearTimeout(subHideTimer)
    subHideTimer = null
  }
}

function onGlobalClick() {
  hide()
}

function onGlobalKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') hide()
}

onMounted(() => {
  window.addEventListener('click', onGlobalClick)
  window.addEventListener('keydown', onGlobalKeydown)
  window.addEventListener('scroll', hide, true)
})

onUnmounted(() => {
  window.removeEventListener('click', onGlobalClick)
  window.removeEventListener('keydown', onGlobalKeydown)
  window.removeEventListener('scroll', hide, true)
  if (subHideTimer) clearTimeout(subHideTimer)
})

defineExpose({ show, hide })
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="context-menu"
      :style="{ left: `${x}px`, top: `${y}px` }"
      @click.stop
    >
      <template v-for="(item, index) in items" :key="index">
        <div v-if="item.divider" class="context-menu-divider" />
        <button
          v-else
          class="context-menu-item"
          :class="{ disabled: item.disabled, 'has-children': item.children?.length }"
          :disabled="item.disabled"
          @click="onItemClick(item)"
          @mouseenter="onItemEnter($event, item, index)"
        >
          <span class="context-menu-label">
            <span v-if="item.icon" class="context-menu-icon">{{ item.icon }}</span>
            {{ item.label }}
          </span>
          <span v-if="item.children?.length" class="context-menu-chevron">›</span>
          <span v-else-if="item.shortcut" class="context-menu-shortcut">{{ item.shortcut }}</span>
        </button>
      </template>
    </div>

    <div
      v-if="subVisible"
      class="context-menu context-submenu"
      :style="{ left: `${subX}px`, top: `${subY}px` }"
      @click.stop
      @mouseenter="onSubmenuEnter"
      @mouseleave="hideSubmenu"
    >
      <template v-for="(item, index) in subItems" :key="index">
        <div v-if="item.divider" class="context-menu-divider" />
        <button
          v-else
          class="context-menu-item"
          :class="{ disabled: item.disabled }"
          :disabled="item.disabled"
          @click="onSubItemClick(item)"
        >
          <span class="context-menu-label">
            <span v-if="item.icon" class="context-menu-icon">{{ item.icon }}</span>
            {{ item.label }}
          </span>
          <span v-if="item.shortcut" class="context-menu-shortcut">{{ item.shortcut }}</span>
        </button>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.context-menu {
  position: fixed;
  z-index: 9999;
  min-width: 200px;
  padding: 4px;
  background: #1e1e24;
  border: 1px solid #3a3a44;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
}

.context-submenu {
  z-index: 10000;
}

.context-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 7px 12px;
  border-radius: 5px;
  font-size: 13px;
  color: #e0e0e8;
  text-align: left;
  transition: background 0.12s;
  gap: 16px;
}

.context-menu-item:hover:not(.disabled) {
  background: #2a2a34;
}

.context-menu-item.disabled {
  color: #55555f;
  cursor: not-allowed;
}

.context-menu-label {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.context-menu-icon {
  width: 16px;
  text-align: center;
  font-size: 12px;
  color: #888894;
  flex-shrink: 0;
}

.context-menu-shortcut {
  font-size: 11px;
  color: #666670;
  flex-shrink: 0;
}

.context-menu-chevron {
  font-size: 14px;
  color: #666670;
  flex-shrink: 0;
  line-height: 1;
}

.context-menu-divider {
  height: 1px;
  margin: 4px 8px;
  background: #33333a;
}
</style>
