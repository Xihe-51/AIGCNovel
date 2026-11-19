<template>
	<div class="tp-ai-note">AI 能力独立在「AI 工作台」，这里只放快捷入口。</div>
	<button class="tp-ai-btn" @click="goAi('text')">
		<span class="tp-ai-icon">文</span>
		<div>
			<div class="tp-ai-title">文本生成</div>
			<div class="tp-ai-sub">续写、改写、对白</div>
		</div>
	</button>
	<button class="tp-ai-btn" @click="goAi('image')">
		<span class="tp-ai-icon">图</span>
		<div>
			<div class="tp-ai-title">图像生成</div>
			<div class="tp-ai-sub">立绘、背景、CG</div>
		</div>
	</button>
	<button class="tp-ai-btn" @click="goAi('music')">
		<span class="tp-ai-icon">音</span>
		<div>
			<div class="tp-ai-title">音乐合成</div>
			<div class="tp-ai-sub">BGM 片段</div>
		</div>
	</button>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

const goAi = (section: string) => {
	router.push({ path: '/ai', query: { tab: section } })
}
</script>
