<template>
  <div
    ref="dragContainer"
    class="voice-generator-container"
    :style="containerStyle"
	@click="showButtons = true"
    @mouseenter="showButtons = true"
    @mouseleave="onMouseLeave"
  >
    <div
      ref="draggableCircle"
      class="voice-generator-circle"
      :class="{ dragging: isDragging }"
      @mousedown="startDrag"
    >
      <img :src="logo" alt="Voice Generator" class="logo" />
    </div>

    <transition name="fade">
      <div
        v-if="showButtons && !isDragging"
        class="navigation-buttons"
        :class="buttonPosition"
        @mouseenter="showButtons = true"
      >
        <button
          v-for="item in navItems"
          :key="item.path"
          class="nav-button"
          @click="navigateTo(item.path)"
        >
          {{ item.name }}
        </button>
      </div>
    </transition>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import logo from '@/assets/logo.webp'

export interface NavItem {
  name: string
  path: string
}

export default defineComponent({
  name: 'VoiceGenerator',
  setup() {
    const router = useRouter()
    const draggableCircle = ref<HTMLElement | null>(null)
    const dragContainer = ref<HTMLElement | null>(null)
    const isDragging = ref(false)
    const showButtons = ref(false)
    const position = ref({ x: 0, y: 0 })
    const isOnLeft = ref(true)

    const navItems: NavItem[] = [
      { name: '项目', path: '/home' },
      { name: '资源商店', path: '/store' },
      { name: 'AI魔法工坊', path: '/ai' },
	  { name: '个人中心', path: '/individual' },
      { name: '退出', path: '/login' },
    ]

    const containerStyle = computed(() => ({
      left: `${position.value.x}px`,
      top: `${position.value.y}px`,
    }))

    const buttonPosition = computed(() => ({
      'buttons-left': !isOnLeft.value,
      'buttons-right': isOnLeft.value,
    }))

    const navigateTo = (path: string) => {
		console.log(path)
	  if(path==="/login")
	  {
		localStorage.removeItem('token');
	  }
      router.push(path)
      showButtons.value = false
    }

    const startDrag = (e: MouseEvent) => {
      isDragging.value = true
      showButtons.value = false
      
      const startX = e.clientX
      const startY = e.clientY
      const startLeft = position.value.x
      const startTop = position.value.y

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const dx = moveEvent.clientX - startX
        const dy = moveEvent.clientY - startY
        
        position.value = {
          x: startLeft + dx,
          y: startTop + dy,
        }
        
        if (dragContainer.value) {
          const containerRect = dragContainer.value.getBoundingClientRect()
          const windowWidth = window.innerWidth
          isOnLeft.value = containerRect.left + containerRect.width / 2 < windowWidth / 2
        }
      }

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        isDragging.value = false
        
        snapToEdge()
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    const snapToEdge = () => {
      if (!dragContainer.value) return
      
      const containerRect = dragContainer.value.getBoundingClientRect()
      const windowWidth = window.innerWidth
      const windowHeight = window.innerHeight
      
      const isNearLeft = containerRect.left < windowWidth / 2
      isOnLeft.value = isNearLeft
      
      let newX = isNearLeft ? 0 : windowWidth - containerRect.width
      let newY = position.value.y
      
      newY = Math.max(0, Math.min(newY, windowHeight - containerRect.height))
      
      position.value = { x: newX, y: newY }
    }

    const onMouseLeave = () => {
      showButtons.value = false
    }

    onMounted(() => {
      if (dragContainer.value) {
        const windowHeight = window.innerHeight
        const containerHeight = dragContainer.value.offsetHeight
        position.value = {
          x: 0,
          y: 0,
        }
      }
    })

    onUnmounted(() => {
      document.removeEventListener('mousemove', () => {})
      document.removeEventListener('mouseup', () => {})
    })

    return {
      logo,
      navItems,
      draggableCircle,
      dragContainer,
      isDragging,
      showButtons,
      containerStyle,
      buttonPosition,
      startDrag,
      navigateTo,
      onMouseLeave,
    }
  },
})
</script>

<style scoped>
.voice-generator-container {
  position: fixed;
  z-index: 1000;
  cursor: grab;
}

.voice-generator-circle {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  border: 3px solid pink;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: white;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
  transition: transform 0.1s;
  user-select: none;
}

.voice-generator-circle.dragging {
  cursor: grabbing;
  transform: scale(1.05);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
}

.voice-generator-circle:hover:not(.dragging) {
  transform: scale(1.03);
}

.logo {
  width: 80%;
  height: 80%;
  object-fit: contain;
  border-radius: 50%;
  pointer-events: none;
}

.navigation-buttons {
  position: absolute;
  top: 50%;
  transform: translateY(-10%);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.buttons-right {
  left: 100%;
  margin-left: 10px;
}

.buttons-left {
  right: 100%;
  margin-right: 10px;
}

.nav-button {
  padding: 8px 15px;
  background-color: pink;
  border: none;
  border-radius: 20px;
  color: white;
  font-weight: bold;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
  transition: all 0.2s;
}

.nav-button:hover {
  background-color: #ff85a2;
  transform: translateX(5px);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>