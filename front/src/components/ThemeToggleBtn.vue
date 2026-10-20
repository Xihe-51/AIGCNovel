<template>
  <div class="theme-toggle-btn">
    <el-button circle class="theme-btn" @click="toggleTheme">
      <component :is="isDark ? Sunny : MoonNight" />
    </el-button>
  </div>
</template>

<script setup>
import { Sunny, MoonNight } from '@element-plus/icons-vue'
import { computed, onMounted } from 'vue'

// 初始化：页面刷新保持主题
onMounted(() => {
  const theme = localStorage.getItem('theme')
  if (theme === 'light') {
    document.documentElement.classList.add('light')
  }
})

// 计算属性：判断当前是否为日间模式
const isDark = computed(() => {
  return !document.documentElement.classList.contains('light')
})

// 切换主题
function toggleTheme() {
  const el = document.documentElement
  if (el.classList.contains('light')) {
    el.classList.remove('light')
    localStorage.setItem('theme', 'dark')
  } else {
    el.classList.add('light')
    localStorage.setItem('theme', 'light')
  }
}
</script>

<style scoped>
.theme-toggle-btn {
  position: fixed;
  top: 90px;
  right: 30px;
  z-index: 999;
}

.theme-btn {
  background: linear-gradient(135deg, #ffb7c5, #c9a9e8);
  color: white;
  border: none;
  box-shadow: 0 4px 15px rgba(255, 183, 197, 0.3);
  transition: all 0.4s ease;
}

.theme-btn:hover {
  transform: scale(1.1) rotate(15deg);
  box-shadow: 0 6px 20px rgba(255, 183, 197, 0.4);
}
</style>