<template>
	<div class="tp-ach-note">
		玩家达成结局、变量条件或首次通关时自动解锁；调试模式不计入。
	</div>
	<div class="tp-ach-form">
		<input v-model="achForm.title" class="tp-ach-input" placeholder="成就名称，如：逃出病房" />
		<input v-model="achForm.description" class="tp-ach-input" placeholder="描述（可选）" />
		<select v-model="achForm.type" class="tp-ach-select">
			<option value="ending">达成结局</option>
			<option value="variable">变量达到条件</option>
			<option value="finish">通关一次</option>
		</select>
		<template v-if="achForm.type === 'ending'">
			<select v-model.number="achForm.ending_id" class="tp-ach-select">
				<option :value="0" disabled>选择结局</option>
				<option v-for="e in endingOptions" :key="e.ending_id" :value="e.ending_id">
					{{ e.title }}
				</option>
			</select>
		</template>
		<template v-else-if="achForm.type === 'variable'">
			<select v-model="achForm.variable" class="tp-ach-select">
				<option value="" disabled>选择变量</option>
				<option v-for="v in variables" :key="v.variable_id" :value="v.name">
					{{ v.label }}（{{ v.name }}）
				</option>
			</select>
			<div class="tp-ach-var-row">
				<select v-model="achForm.op" class="tp-ach-op">
					<option value=">=">≥</option>
					<option value=">">＞</option>
					<option value="==">＝</option>
					<option value="<">＜</option>
					<option value="<=">≤</option>
					<option value="!=">≠</option>
				</select>
				<input v-model.number="achForm.value" class="tp-ach-num" type="number" placeholder="目标值" />
			</div>
		</template>
		<div class="tp-ach-actions">
			<button class="tp-ach-add" :disabled="savingAch" @click="submitAchievement">
				{{ savingAch ? '保存中…' : (editingAchId ? '保存修改' : '添加成就') }}
			</button>
			<button v-if="editingAchId" class="tp-ach-cancel" :disabled="savingAch" @click="cancelAchEdit">
				取消
			</button>
		</div>
	</div>

	<div v-if="loadingAch" class="tp-state">加载中…</div>
	<div v-else-if="!achievements.length" class="tp-state">还没有成就，先添加一个。</div>
	<div v-else class="tp-ach-list">
		<div v-for="a in achievements" :key="a.achievement_id" class="tp-ach-item">
			<div class="tp-ach-main">
				<span class="tp-ach-title">{{ a.title }}</span>
				<span class="tp-ach-cond">{{ achievementConditionLabel(a) }}</span>
				<span v-if="a.description" class="tp-ach-desc">{{ a.description }}</span>
			</div>
			<div class="tp-ach-btns">
				<button @click="editAchievement(a)">编辑</button>
				<button class="danger" @click="removeAchievement(a)">删除</button>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { confirmDanger } from '@/utils/confirm'
import {
	listAchievements,
	createAchievement,
	updateAchievement,
	deleteAchievement,
} from '@/api/achievement'
import type { Achievement, AchievementCondition } from '@/api/achievement'
import { listEndings } from '@/api/ending'
import type { Ending } from '@/api/ending'
import { listVariables } from '@/api/variable'
import type { ProjectVariable } from '@/api/variable'
import { formatErrorMessage } from '@/utils/errorMessage'

const props = defineProps<{ projectId: string | number }>()

const achievements = ref<Achievement[]>([])
const loadingAch = ref(false)
const savingAch = ref(false)
const editingAchId = ref<number | null>(null)
const endingOptions = ref<Ending[]>([])
const variables = ref<ProjectVariable[]>([])
const achForm = ref({
	title: '',
	description: '',
	type: 'ending' as 'ending' | 'variable' | 'finish',
	ending_id: 0,
	variable: '',
	op: '>=',
	value: 0,
})

const loadVariables = async () => {
	if (!props.projectId) return
	try {
		variables.value = (await listVariables(Number(props.projectId))) || []
	} catch (e) {
		console.error('加载变量失败:', e)
		variables.value = []
	}
}

const loadAchievements = async () => {
	if (!props.projectId) return
	loadingAch.value = true
	try {
		const [rows, endingRows] = await Promise.all([
			listAchievements(Number(props.projectId)),
			listEndings(Number(props.projectId)),
		])
		achievements.value = rows
		endingOptions.value = endingRows
	} catch (e) {
		console.warn('读取成就失败:', e)
		achievements.value = []
		endingOptions.value = []
	} finally {
		loadingAch.value = false
	}
}

const resetAchForm = () => {
	editingAchId.value = null
	achForm.value = {
		title: '',
		description: '',
		type: 'ending',
		ending_id: 0,
		variable: '',
		op: '>=',
		value: 0,
	}
}

const submitAchievement = async () => {
	const title = achForm.value.title.trim()
	if (!title) {
		ElMessage.warning('请填写成就名称')
		return
	}
	let condition: AchievementCondition
	if (achForm.value.type === 'ending') {
		if (!achForm.value.ending_id) {
			ElMessage.warning('请选择要达成的结局')
			return
		}
		condition = { type: 'ending', ending_id: achForm.value.ending_id }
	} else if (achForm.value.type === 'variable') {
		if (!achForm.value.variable) {
			ElMessage.warning('请选择变量')
			return
		}
		if (!Number.isFinite(Number(achForm.value.value))) {
			ElMessage.warning('目标值必须是数字')
			return
		}
		condition = {
			type: 'variable',
			variable: achForm.value.variable,
			op: achForm.value.op,
			value: Number(achForm.value.value),
		}
	} else {
		condition = { type: 'finish' }
	}

	savingAch.value = true
	try {
		const payload = {
			title,
			description: achForm.value.description.trim(),
			condition,
		}
		if (editingAchId.value) {
			await updateAchievement(Number(props.projectId), editingAchId.value, payload)
			ElMessage.success('成就已更新')
		} else {
			await createAchievement(Number(props.projectId), payload)
			ElMessage.success('成就已添加')
		}
		resetAchForm()
		await loadAchievements()
	} catch (e: any) {
		ElMessage.error(formatErrorMessage('保存成就失败', e))
	} finally {
		savingAch.value = false
	}
}

const editAchievement = (a: Achievement) => {
	const cond = a.condition || { type: 'finish' }
	editingAchId.value = a.achievement_id
	achForm.value = {
		title: a.title,
		description: a.description || '',
		type: cond.type,
		ending_id: cond.type === 'ending' ? Number(cond.ending_id) : 0,
		variable: cond.type === 'variable' ? cond.variable : '',
		op: cond.type === 'variable' ? cond.op : '>=',
		value: cond.type === 'variable' ? Number(cond.value) : 0,
	}
}

const cancelAchEdit = () => resetAchForm()

const removeAchievement = async (a: Achievement) => {
	const confirmed = await confirmDanger(
		`删除成就「${a.title}」？玩家已解锁记录也会一并删除。`,
		{ title: '删除成就' }
	)
	if (!confirmed) return
	try {
		await deleteAchievement(Number(props.projectId), a.achievement_id)
		if (editingAchId.value === a.achievement_id) resetAchForm()
		await loadAchievements()
		ElMessage.success('成就已删除')
	} catch (e: any) {
		ElMessage.error(formatErrorMessage('删除成就失败', e))
	}
}

const achievementConditionLabel = (a: Achievement) => {
	const cond = a.condition || { type: 'finish' }
	if (cond.type === 'ending') {
		const ending = endingOptions.value.find(e => Number(e.ending_id) === Number(cond.ending_id))
		return `达成结局：${ending?.title || '#' + cond.ending_id}`
	}
	if (cond.type === 'variable') {
		const variable = variables.value.find(v => v.name === cond.variable)
		const label = variable?.label || cond.variable
		return `变量 ${label} ${cond.op} ${cond.value}`
	}
	return '首次通关'
}

onMounted(() => {
	loadVariables()
	loadAchievements()
})

watch(() => props.projectId, () => {
	resetAchForm()
	loadVariables()
	loadAchievements()
})
</script>
