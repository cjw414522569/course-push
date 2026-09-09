<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="ctx-menu"
      :style="{ left: x + 'px', top: y + 'px' }"
      @mousedown.stop
      @contextmenu.prevent
    >
      <div v-for="item in items" :key="item.cmd" class="ctx-item" :class="{ disabled: item.disabled }" @click="onPick(item)">
        {{ item.label }}
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

export interface CtxItem {
  cmd: string
  label: string
  disabled?: boolean
}

const visible = ref(false)
const x = ref(0)
const y = ref(0)
const items = ref<CtxItem[]>([])
let emitPick: ((cmd: string) => void) | null = null

function open(e: MouseEvent, list: CtxItem[], onPick: (cmd: string) => void): void {
  items.value = list
  emitPick = onPick
  x.value = Math.min(e.clientX, window.innerWidth - 130)
  y.value = Math.min(e.clientY, window.innerHeight - list.length * 32 - 10)
  visible.value = true
}

function close(): void {
  visible.value = false
}

function onPick(item: CtxItem): void {
  if (item.disabled) return
  emitPick?.(item.cmd)
  close()
}

function onGlobalClick(): void {
  close()
}

onMounted(() => {
  window.addEventListener('click', onGlobalClick)
  window.addEventListener('resize', close)
  window.addEventListener('scroll', close, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('click', onGlobalClick)
  window.removeEventListener('resize', close)
  window.removeEventListener('scroll', close, true)
})

defineExpose({ open, close })
</script>

<style>
/* 组件挂在 body 下，用全局样式 */
.ctx-menu {
  position: fixed;
  z-index: 3000;
  background: #fff;
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  padding: 4px 0;
  min-width: 110px;
  user-select: none;
}
.ctx-item {
  padding: 7px 16px;
  font-size: 13px;
  color: #303133;
  cursor: pointer;
}
.ctx-item:hover { background: #ecf5ff; color: #409eff; }
.ctx-item.disabled { color: #c0c4cc; cursor: not-allowed; }
.ctx-item.disabled:hover { background: transparent; color: #c0c4cc; }
</style>
