<script setup>
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
import AppIcon from './AppIcon.vue'
const props = defineProps({ open: Boolean, title: String, wide: Boolean })
const emit = defineEmits(['close'])
const dialog = ref(null)
let previousFocus
watch(() => props.open, async open => {
  await nextTick()
  if (open) {
    previousFocus = document.activeElement
    dialog.value?.showModal()
    document.body.style.overflow = 'hidden'
  } else {
    dialog.value?.close()
    document.body.style.overflow = ''
    if (previousFocus?.isConnected) previousFocus.focus()
  }
})
onBeforeUnmount(() => { document.body.style.overflow = '' })
function backdrop(event) {
  if (event.target !== dialog.value) return
  const rect = dialog.value.getBoundingClientRect()
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) emit('close')
}
</script>
<template>
  <Teleport to="body">
    <dialog ref="dialog" class="base-modal" :class="{ wide }" aria-labelledby="modal-title" @cancel.prevent="emit('close')" @click="backdrop">
      <div v-if="open" class="modal-content">
        <header class="modal-header"><h2 id="modal-title">{{ title }}</h2><button class="icon-button" aria-label="Закрыть окно" @click="emit('close')"><AppIcon name="X" /></button></header>
        <div class="modal-body"><slot /></div>
        <footer v-if="$slots.footer" class="modal-footer"><slot name="footer" /></footer>
      </div>
    </dialog>
  </Teleport>
</template>
