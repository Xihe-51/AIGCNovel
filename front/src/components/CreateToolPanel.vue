<template>
	<div class="tp-root">
		<div class="tp-groups">
			<button
				v-for="g in tabGroups"
				:key="g.key"
				type="button"
				:class="['tp-group', { 'is-active': activeGroup === g.key }]"
				@click="selectGroup(g)"
			>{{ g.label }}</button>
		</div>
		<div class="tp-tabs">
			<button
				v-for="t in visibleTabs"
				:key="t.key"
				:class="['tp-tab', { 'is-active': tab === t.key }]"
				@click="tab = t.key"
			>
				{{ t.label }}
				<span v-if="t.badge" class="tp-badge">{{ t.badge }}</span>
			</button>
		</div>

		<div class="tp-body">
			<!-- 角色 -->
			<template v-if="tab === 'characters'">
				<div v-if="loadingChars" class="tp-state">加载中…</div>
				<div v-else-if="!characters.length" class="tp-state">
					还没有角色，先去项目信息页添加
				</div>
				<div v-else class="tp-list">
					<div
						v-for="c in characters"
						:key="c.character_id"
						class="tp-char"
					>
						<div class="tp-char-head" @click="toggleChar(c.character_id)">
							<div class="tp-char-avatar">
								<img
									v-if="c.avatar_url && !brokenChars.includes(c.character_id)"
									:src="BASE_URL + c.avatar_url"
									alt=""
									loading="lazy"
									@error="markCharBroken(c.character_id)"
								/>
								<span v-else>{{ c.name.slice(0, 1) }}</span>
							</div>
							<div class="tp-char-meta">
								<div class="tp-char-name">
									{{ c.name }}
									<span v-if="c.is_main" class="tp-tag">主角</span>
								</div>
								<div class="tp-char-sub">
									{{ avatarCount(c.character_id) }} 张立绘
								</div>
							</div>
							<span class="tp-char-arrow">{{ openChar === c.character_id ? '−' : '+' }}</span>
						</div>

						<div v-if="openChar === c.character_id" class="tp-char-voice">
							<span class="tp-char-voice-label">默认音色</span>
							<select
								class="tp-char-voice-select"
								:value="c.voice_type || ''"
								title="批量配音时会优先使用该角色的音色"
								@change="onCharacterVoiceChange(c, $event)"
							>
								<option value="">未设置（用批量配音选择的音色）</option>
								<option v-for="v in voiceOptions" :key="v.value" :value="v.value">{{ v.label }}</option>
							</select>
						</div>

						<div v-if="openChar === c.character_id" class="tp-char-avatars">
							<div
								v-for="a in avatarsOf(c.character_id)"
								:key="a.avatar_id"
								class="tp-avatar"
								:title="a.avatar_type || '立绘'"
							>
								<img
									v-if="a.image_url && !brokenAvatars.includes(a.avatar_id)"
									:src="BASE_URL + a.image_url"
									alt=""
									loading="lazy"
									@error="markAvatarBroken(a.avatar_id)"
								/>
								<span v-else class="tp-avatar-missing">缺图</span>
								<span class="tp-avatar-type">{{ a.avatar_type || '立绘' }}</span>
								<span v-if="a.is_default" class="tp-avatar-default">默认</span>
								<div class="tp-avatar-acts">
									<button
										v-if="!a.is_default"
										type="button"
										class="tp-av-act"
										title="设为默认立绘"
										@click.stop="setDefaultAvatar(a)"
									>★</button>
									<button
										type="button"
										class="tp-av-act"
										title="删除这张立绘"
										@click.stop="removeAvatar(a)"
									>×</button>
								</div>
							</div>

							<button type="button" class="tp-avatar-add" @click="openUpload(c)">
								<span class="tp-avatar-add-icon">＋</span>
								<span class="tp-avatar-add-text">加立绘</span>
							</button>
						</div>
					</div>
				</div>
			</template>

			<!-- 变量 -->
			<template v-else-if="tab === 'variables'">
				<div v-if="loadingVars" class="tp-state">加载中…</div>
				<div v-else-if="!variables.length" class="tp-state">
					还没有变量，去项目信息页的「变量」里添加
				</div>
				<div v-else class="tp-list">
					<div v-for="v in variables" :key="v.variable_id" class="tp-var">
						<div class="tp-var-top">
							<span class="tp-var-label">{{ v.label }}</span>
							<span class="tp-var-init">初值 {{ v.initial_value }}</span>
						</div>
						<div class="tp-var-key">{{ v.name }}</div>
					</div>
				</div>
			</template>

			<!-- 工程概览 -->
			<template v-else-if="tab === 'overview'">
				<div v-if="loadingOverview" class="tp-state">加载中…</div>
				<div v-else-if="!overview" class="tp-state">读取工程数据失败</div>
				<div v-else class="tp-overview">
					<div class="tp-ov-grid">
						<div class="tp-ov-card">
							<span class="tp-ov-num">{{ overview.word_count }}</span>
							<span class="tp-ov-label">总字数</span>
						</div>
						<div class="tp-ov-card">
							<span class="tp-ov-num">{{ overview.scene_count }}</span>
							<span class="tp-ov-label">场景</span>
						</div>
						<div class="tp-ov-card">
							<span class="tp-ov-num">{{ overview.branch_count }}</span>
							<span class="tp-ov-label">分支</span>
						</div>
						<div class="tp-ov-card">
							<span class="tp-ov-num">{{ overview.ending_count }}</span>
							<span class="tp-ov-label">结局</span>
						</div>
					</div>

					<div class="tp-ov-brief">
						<span>预计阅读 {{ overview.reading_minutes }} 分钟</span>
					</div>

					<div v-if="overview.target_words" class="tp-ov-goal">
						<div class="tp-ov-goal-head">
							<span>全书进度</span>
							<span>{{ overview.word_count }} / {{ overview.target_words }} 字（{{ overview.completion_percent }}%）</span>
						</div>
						<el-progress
							:percentage="overview.completion_percent || 0"
							:stroke-width="8"
							color="#e8467c"
						/>
					</div>

					<div class="tp-ov-section">章节字数</div>
					<div v-if="!overview.chapters.length" class="tp-state tp-ov-empty">
						还没有章节分组，左侧「章节」里可以建第一幕
					</div>
					<div v-else class="tp-ov-list">
						<div v-for="ch in overview.chapters" :key="ch.chapter_id" class="tp-ov-row-wrap">
							<div class="tp-ov-row">
								<span class="tp-ov-chapter">{{ ch.title }}</span>
								<span class="tp-ov-scenes">{{ ch.scene_count }} 场</span>
								<span class="tp-ov-words">{{ ch.word_count }} 字</span>
							</div>
							<div v-if="ch.target_words" class="tp-ov-ch-goal">
								<el-progress
									:percentage="ch.completion_percent || 0"
									:stroke-width="5"
									:show-text="false"
									color="#e8467c"
								/>
								<span>{{ ch.completion_percent }}% · 目标 {{ ch.target_words }} 字 · 约 {{ ch.reading_minutes }} 分钟</span>
							</div>
						</div>
					</div>
					<div v-if="overview.ungrouped.scene_count" class="tp-ov-row tp-ov-ungrouped">
						<span class="tp-ov-chapter">未分组</span>
						<span class="tp-ov-scenes">{{ overview.ungrouped.scene_count }} 场</span>
						<span class="tp-ov-words">{{ overview.ungrouped.word_count }} 字</span>
					</div>

					<div class="tp-ov-section">工程规模</div>
					<div class="tp-ov-meta">
						<span>{{ overview.character_count }} 角色</span>
						<span>{{ overview.variable_count }} 变量</span>
						<span>{{ overview.cg_count }} CG</span>
						<span :class="{ 'is-warn': overview.asset_missing > 0 }">
							{{ overview.asset_total }} 素材 / 缺失 {{ overview.asset_missing }}
						</span>
					</div>
				</div>
			</template>

				<!-- 试玩数据统计 -->
				<template v-else-if="tab === 'analytics'">
					<div class="tp-an-note">
						统计真实试玩行为（调试模式与作者埋点不会计入）。
					</div>
					<div class="tp-an-actions">
						<select v-model.number="analyticsDays" class="tp-an-range" @change="loadAnalytics">
							<option :value="7">近 7 天</option>
							<option :value="30">近 30 天</option>
							<option :value="90">近 90 天</option>
						</select>
						<button class="tp-an-refresh" :disabled="loadingAnalytics" @click="loadAnalytics">
							{{ loadingAnalytics ? '加载中…' : '刷新' }}
						</button>
					</div>

					<div v-if="loadingAnalytics" class="tp-state">加载中…</div>
					<div v-else-if="!analytics" class="tp-state">还没有试玩数据</div>
					<template v-else>
						<div class="tp-an-summary">
							<div class="tp-an-stat">
								<span class="tp-an-value">{{ analytics.summary.total_sessions }}</span>
								<span class="tp-an-label">试玩会话</span>
							</div>
							<div class="tp-an-stat">
								<span class="tp-an-value">{{ analytics.summary.completion_rate }}%</span>
								<span class="tp-an-label">完成率</span>
							</div>
							<div class="tp-an-stat wide">
								<span class="tp-an-value">{{ analytics.summary.avg_duration_text }}</span>
								<span class="tp-an-label">平均时长</span>
							</div>
						</div>

						<div v-if="analytics.summary.top_dropoff" class="tp-an-dropoff">
							最大流失点：
							<button class="tp-an-link" @click="onLocate(analytics.summary.top_dropoff.scene_id)">
								{{ analytics.summary.top_dropoff.title }}
							</button>
							· {{ analytics.summary.top_dropoff.drop_offs }} 人
							（到达后流失 {{ analytics.summary.top_dropoff.rate }}%）
						</div>

						<div class="tp-an-section">场景到达率（卡点）</div>
						<div v-if="!analytics.scenes.length" class="tp-an-empty">还没有场景数据</div>
						<div
							v-for="s in analytics.scenes"
							:key="s.scene_id"
							class="tp-an-scene is-clickable"
							@click="onLocate(s.scene_id)"
						>
							<div class="tp-an-scene-top">
								<span class="tp-an-scene-name">{{ s.order_num }}. {{ s.title }}</span>
								<span class="tp-an-scene-meta">
									{{ s.reached }} 人 · {{ s.rate }}%
									<template v-if="s.drop_offs"> · 流失 {{ s.drop_offs }}（{{ s.drop_rate }}%）</template>
								</span>
							</div>
							<div class="tp-an-bar">
								<div class="tp-an-bar-fill" :style="{ width: Math.min(100, s.rate) + '%' }"></div>
							</div>
						</div>

						<div class="tp-an-section">章节完成率</div>
						<div v-if="!analytics.chapters?.length" class="tp-an-empty">还没有章节分组</div>
						<div
							v-for="c in analytics.chapters"
							:key="c.chapter_id"
							class="tp-an-scene is-clickable"
							@click="onLocate(c.first_scene_id)"
						>
							<div class="tp-an-scene-top">
								<span class="tp-an-scene-name">{{ c.order_num }}. {{ c.title }}</span>
								<span class="tp-an-scene-meta">{{ c.reached }} 人 · {{ c.rate }}%</span>
							</div>
							<div class="tp-an-bar">
								<div class="tp-an-bar-fill" :style="{ width: Math.min(100, c.rate) + '%' }"></div>
							</div>
						</div>

						<div class="tp-an-section">选项分布</div>
						<div v-if="!analytics.choices.length" class="tp-an-empty">还没有选项数据</div>
						<div v-for="g in analytics.choices" :key="g.content_id" class="tp-an-choice">
							<div class="tp-an-choice-title is-clickable" @click="onLocate(g.scene_id, g.content_id)">
								{{ g.scene_title }} · {{ g.node_text }}
							</div>
							<div
								v-for="o in g.options"
								:key="o.path_id || o.choice_text"
								:class="['tp-an-option', { 'is-cold': g.options.length > 1 && o.percent === g.least_percent }]"
							>
								<span class="tp-an-option-text">{{ o.choice_text }}</span>
								<span class="tp-an-option-meta">
									{{ o.count }} 次 · {{ o.percent }}%
									<span v-if="g.options.length > 1 && o.percent === g.least_percent" class="tp-an-cold-tag">最少人选</span>
								</span>
							</div>
						</div>

						<div class="tp-an-section">结局达成</div>
						<div v-if="!analytics.endings.length" class="tp-an-empty">还没有结局定义</div>
						<div
							v-for="e in analytics.endings"
							:key="e.ending_id"
							class="tp-an-ending is-clickable"
							@click="e.scene_id && onLocate(e.scene_id, e.content_id)"
						>
							<span class="tp-an-ending-name">{{ e.title }}</span>
							<span class="tp-an-ending-meta">{{ e.count }} 人 · {{ e.rate }}%</span>
						</div>
					</template>
				</template>

				<!-- 存档检查器 -->
				<template v-else-if="tab === 'saves'">
					<SaveInspectorPanel :project-id="projectId" @locate="onLocateSave" />
				</template>

				<!-- 成就 -->
				<template v-else-if="tab === 'achievements'">
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

				<!-- 剧本统计报表 -->
				<template v-else-if="tab === 'report'">
					<div class="tp-rep-note">
						按场景、章节与角色统计剧本规模，可导出 CSV 在 Excel 中查看。
					</div>
					<div class="tp-rep-actions">
						<button class="tp-rep-refresh" :disabled="loadingReport" @click="loadReport">
							{{ loadingReport ? '统计中…' : '刷新统计' }}
						</button>
						<button class="tp-rep-export" :disabled="!report" @click="exportReportCsv">导出 CSV</button>
					</div>

					<div v-if="loadingReport" class="tp-state">统计中…</div>
					<div v-else-if="!report" class="tp-state">读取统计失败</div>
					<template v-else>
						<div class="tp-rep-summary">
							<span>{{ report.summary.scene_count }} 场景</span>
							<span>{{ report.summary.node_count }} 节点</span>
							<span>{{ report.summary.word_count }} 字</span>
							<span>{{ report.summary.character_count }} 角色</span>
							<span>{{ report.summary.branch_count }} 分支</span>
							<span>{{ report.summary.ending_count }} 结局</span>
						</div>

						<div v-if="report.chapters.length" class="tp-rep-section">章节</div>
						<div v-for="ch in report.chapters" :key="ch.chapter_id" class="tp-rep-chapter">
							<span class="tp-rep-title">{{ ch.order_num }}. {{ ch.title }}</span>
							<span class="tp-rep-meta">
								{{ ch.scene_count }} 场 · {{ ch.word_count }} 字
								<span v-if="ch.target_words">/ 目标 {{ ch.target_words }}</span>
							</span>
						</div>

						<div class="tp-rep-section">场景统计</div>
						<div class="tp-rep-scene-row tp-rep-head">
							<span>场景</span><span>节点</span><span>台词</span><span>字数</span>
						</div>
						<div v-for="s in report.scenes" :key="s.scene_id" class="tp-rep-scene-row">
							<span class="tp-rep-scene-name" :title="s.title">{{ s.order_num }}. {{ s.title }}</span>
							<span>{{ s.node_count }}</span>
							<span>{{ s.dialogue_count }}</span>
							<span>{{ s.word_count }}</span>
						</div>

						<div class="tp-rep-section">角色统计</div>
						<div class="tp-rep-char-row tp-rep-head">
							<span>角色</span><span>台词</span><span>字数</span>
						</div>
						<div v-for="c in report.characters" :key="c.character_id" class="tp-rep-char-row">
							<span class="tp-rep-char-name">
								{{ c.name }}<span v-if="c.is_main" class="tp-rep-main">主角</span>
							</span>
							<span>{{ c.line_count }}</span>
							<span>{{ c.word_count }}</span>
						</div>
						<div v-if="!report.characters.length" class="tp-an-empty">还没有角色数据</div>
					</template>
				</template>

				<!-- 剧本版本 -->
				<template v-else-if="tab === 'versions'">
					<div class="tp-ver-note">
						保存全部对话、场景设置或剧情图时会自动生成版本；也可以手动存一份快照。
					</div>
					<div class="tp-ver-actions">
						<button class="tp-ver-save" :disabled="savingVersion" @click="saveVersionNow">
							{{ savingVersion ? '保存中…' : '立即存快照' }}
						</button>
						<button class="tp-ver-refresh" :disabled="loadingVersions" @click="loadVersions">刷新</button>
					</div>

					<div v-if="loadingVersions" class="tp-state">加载中…</div>
					<div v-else-if="!versions.length" class="tp-state">
						还没有版本，点「立即存快照」，或先保存一次剧本。
					</div>
					<div v-else class="tp-ver-list">
						<div v-for="v in versions" :key="v.version_id" class="tp-ver-item">
							<div class="tp-ver-top">
								<span class="tp-ver-label">{{ v.label || '版本' }}</span>
								<span class="tp-ver-time">{{ formatVersionTime(v.created_at) }}</span>
							</div>
							<div class="tp-ver-meta">
								<span>#{{ v.version_id }}</span>
								<span>{{ v.scene_count }} 场景</span>
								<span>{{ v.content_count }} 节点</span>
								<span>{{ v.branch_count }} 分支</span>
							</div>
							<div class="tp-ver-acts">
								<button
									class="tp-ver-act"
									:disabled="diffLoadingId === v.version_id"
									@click="showDiff(v)"
								>{{ diffLoadingId === v.version_id ? '对比中…' : '查看差异' }}</button>
								<button
									class="tp-ver-act danger"
									:disabled="restoringId !== null"
									@click="restoreVersion(v)"
								>{{ restoringId === v.version_id ? '恢复中…' : '恢复此版' }}</button>
							</div>
						</div>
					</div>

					<el-dialog
						v-model="diffVisible"
						title="版本差异"
						width="760px"
						append-to-body
						class="tp-ver-dialog"
					>
						<div v-if="diffLoading" class="tp-state">正在对比…</div>
						<div v-else-if="diffData" class="tp-diff">
							<div class="tp-diff-summary">
								<span>场景 {{ diffData.summary.scene_changed }}</span>
								<span>剧情节点 {{ diffData.summary.content_changed }}</span>
								<span>分支 {{ diffData.summary.branch_changed }}</span>
								<span>结局 {{ diffData.endings.total }}</span>
							</div>
							<div class="tp-diff-note">下面是「该版本 → 当前内容」的变化。</div>
							<div
								v-if="!diffData.contents.total && !diffData.summary.scene_changed && !diffData.branches.total"
								class="tp-state tp-ov-empty"
							>剧本内容与当前一致。</div>

							<template v-if="diffData.summary.scene_changed">
								<div class="tp-diff-title">场景</div>
								<div v-for="s in diffData.scenes.added" :key="'sa' + s.scene_id" class="tp-diff-row add">
									+ 新增场景「{{ s.title }}」<span class="tp-diff-sub">#{{ s.scene_id }}</span>
								</div>
								<div v-for="s in diffData.scenes.removed" :key="'sr' + s.scene_id" class="tp-diff-row remove">
									- 删除场景「{{ s.title }}」<span class="tp-diff-sub">#{{ s.scene_id }}</span>
								</div>
								<div v-for="s in diffData.scenes.modified" :key="'sm' + s.scene_id" class="tp-diff-row mod">
									~ 场景「{{ s.title }}」<span class="tp-diff-sub">{{ s.changes?.map(c => c.field).join('、') }}</span>
								</div>
							</template>

							<template v-if="diffData.contents.total">
								<div class="tp-diff-title">剧情节点</div>
								<div v-for="c in diffData.contents.added" :key="'ca' + c.content_id" class="tp-diff-row add">
									+ [{{ c.scene_title }}] {{ c.content_type }}：{{ c.text }}
								</div>
								<div v-for="c in diffData.contents.removed" :key="'cr' + c.content_id" class="tp-diff-row remove">
									- [{{ c.scene_title }}] {{ c.content_type }}：{{ c.text }}
								</div>
								<div v-for="c in diffData.contents.modified" :key="'cm' + c.content_id" class="tp-diff-row mod">
									~ [{{ c.scene_title }}] {{ c.content_type }}：{{ c.text }}
									<span class="tp-diff-sub">{{ c.changes?.map(ch => ch.field).join('、') }}</span>
								</div>
							</template>
						</div>
						<template #footer>
							<el-button @click="diffVisible = false">关闭</el-button>
						</template>
					</el-dialog>
				</template>

				<!-- 术语表 / 一致性检查 -->
				<template v-else-if="tab === 'terms'">
					<div class="tp-term-note">
						统一人名、地名与专有名词的标准写法；扫描会找出误用的别名。
					</div>

					<div class="tp-term-form">
						<input v-model="termForm.standard" class="tp-term-input" placeholder="标准写法，如：林瑶" />
						<input v-model="termForm.variants" class="tp-term-input" placeholder="别名/错写，用逗号分隔" />
						<input v-model="termForm.note" class="tp-term-input" placeholder="备注（可选）" />
						<div class="tp-term-form-actions">
							<button class="tp-term-add" :disabled="savingTerm" @click="submitTerm">
								{{ savingTerm ? '保存中…' : (editingTermId ? '保存修改' : '添加术语') }}
							</button>
							<button v-if="editingTermId" class="tp-term-cancel" :disabled="savingTerm" @click="cancelEditTerm">
								取消
							</button>
						</div>
					</div>

					<div class="tp-term-actions">
						<button class="tp-term-scan-btn" @click="openScan">一致性扫描</button>
						<button class="tp-term-refresh" :disabled="loadingTerms" @click="loadTerms">刷新</button>
					</div>

					<div v-if="loadingTerms" class="tp-state">加载中…</div>
					<div v-else-if="!terms.length" class="tp-state">还没有术语，先添加一条。</div>
					<div v-else class="tp-term-list">
						<div v-for="t in terms" :key="t.term_id" class="tp-term-item">
							<div class="tp-term-main">
								<span class="tp-term-standard">{{ t.standard }}</span>
								<span v-if="t.variants" class="tp-term-variants">别名：{{ t.variants }}</span>
								<span v-if="t.note" class="tp-term-remark">{{ t.note }}</span>
							</div>
							<div class="tp-term-acts">
								<button @click="startEditTerm(t)">编辑</button>
								<button class="danger" @click="removeTerm(t)">删除</button>
							</div>
						</div>
					</div>

					<el-dialog
						v-model="scanVisible"
						title="术语一致性扫描"
						width="560px"
						append-to-body
					>
						<div v-if="scanning" class="tp-state">扫描中…</div>
						<div v-else-if="!scanItems.length" class="tp-state">没有发现别名误用。</div>
						<div v-else class="tp-scan">
							<div class="tp-scan-summary">
								共发现 {{ scanTotal }} 处别名，涉及 {{ scanItems.length }} 个词条。
							</div>
							<div v-for="it in scanItems" :key="it.term_id + '-' + it.variant" class="tp-scan-item">
								<div class="tp-scan-title">
									「{{ it.variant }}」→ 建议改为「{{ it.standard }}」
									<span class="tp-scan-count">{{ it.count }} 处</span>
								</div>
								<div
									v-for="(h, hi) in it.hits"
									:key="hi"
									class="tp-scan-hit"
									@click="onScanHit(h)"
								>
									<span class="tp-scan-where">{{ h.scene_title || '场景' }}{{ h.kind ? ' · ' + h.kind : '' }}</span>
									<span class="tp-scan-text">{{ h.text }}</span>
								</div>
							</div>
						</div>
						<template #footer>
							<el-button @click="scanVisible = false">关闭</el-button>
							<el-button type="primary" :loading="scanning" @click="runScan">重新扫描</el-button>
						</template>
					</el-dialog>
				</template>

				<!-- 播放器外观 -->
				<template v-else-if="tab === 'appearance'">
				<div class="tp-theme-note">选择作品试玩和发布后的播放器皮肤，切换后立即生效。</div>
				<div class="tp-theme-list">
					<button
						v-for="t in UI_THEMES"
						:key="t.key"
						type="button"
						:class="['tp-theme', { 'is-active': themeKey === t.key }]"
						:disabled="savingTheme"
						@click="chooseTheme(t.key)"
					>
						<span class="tp-theme-swatches">
							<i v-for="(c, ci) in t.swatches" :key="ci" :style="{ background: c }"></i>
						</span>
						<span class="tp-theme-meta">
							<span class="tp-theme-name">{{ t.label }}</span>
							<span class="tp-theme-desc">{{ t.desc }}</span>
						</span>
						<span v-if="themeKey === t.key" class="tp-theme-check">✓</span>
					</button>
				</div>
			</template>

			<!-- 素材 -->
			<template v-else-if="tab === 'assets'">
				<AssetLibraryPanel :project-id="projectId" @locate="onLocate" />
			</template>

			<template v-else-if="tab === 'health'">
				<ProjectHealthPanel :project-id="projectId" @locate="onLocateHealth" />
			</template>

			<!-- AI -->
			<template v-else-if="tab === 'ai'">
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

			<!-- 演出 -->
			<template v-else>
				<div class="tp-ai-note">
					演出指令挂在每条对话上：点对话卡右上角的「演出」按钮，就能给这条对话加立绘、背景、音乐、音效或停顿。
				</div>
				<div class="tp-dir-stats">
					<div v-for="s in directiveStats" :key="s.key" class="tp-dir-row">
						<span class="tp-dir-name">{{ s.label }}</span>
						<span :class="['tp-dir-count', { 'is-zero': !s.count }]">{{ s.count }}</span>
					</div>
				</div>
				<div class="tp-soon">
					<div class="tp-soon-item">
						<span class="tp-soon-name">立绘左 / 中 / 右三槽位</span>
						<span class="tp-soon-tag is-ok">已支持</span>
					</div>
					<div class="tp-soon-item">
						<span class="tp-soon-name">背景切换（淡入淡出）</span>
						<span class="tp-soon-tag is-ok">已支持</span>
					</div>
					<div class="tp-soon-item">
						<span class="tp-soon-name">BGM 播放 / 停止</span>
						<span class="tp-soon-tag is-ok">已支持</span>
					</div>
					<div class="tp-soon-item">
						<span class="tp-soon-name">音效插入</span>
						<span class="tp-soon-tag is-ok">已支持</span>
					</div>
					<div class="tp-soon-item">
						<span class="tp-soon-name">停顿（阻塞推进）</span>
						<span class="tp-soon-tag is-ok">已支持</span>
					</div>
				</div>
			</template>
		</div>

		<el-dialog v-model="uploadVisible" title="添加立绘" width="340px" append-to-body>
			<div class="tp-up-row">
				<div class="tp-up-label">角色</div>
				<div class="tp-up-value">{{ uploadChar?.name }}</div>
			</div>
			<div class="tp-up-row">
				<div class="tp-up-label">图片</div>
				<el-upload
					action="#"
					:auto-upload="false"
					:show-file-list="false"
					accept="image/*"
					:on-change="onPickAvatar"
				>
					<button type="button" class="tp-up-pick">
						{{ uploadFile ? uploadFile.name : '选择图片' }}
					</button>
				</el-upload>
			</div>
			<div class="tp-up-row">
				<div class="tp-up-label">表情</div>
				<el-select v-model="uploadType" size="small" style="width: 100%">
					<el-option v-for="t in avatarTypes" :key="t" :label="t" :value="t" />
				</el-select>
			</div>
			<div class="tp-up-row">
				<div class="tp-up-label">服装</div>
				<el-input v-model="uploadCostume" size="small" placeholder="可选，例如：校服" />
			</div>
			<div class="tp-up-row">
				<div class="tp-up-label">设为默认</div>
				<el-switch v-model="uploadDefault" size="small" />
			</div>
			<template #footer>
				<el-button size="small" @click="uploadVisible = false">取消</el-button>
				<el-button
					size="small"
					type="primary"
					:loading="uploading"
					:disabled="!uploadFile"
					@click="submitAvatar"
				>上传</el-button>
			</template>
		</el-dialog>
	</div>
</template>

<script setup lang="ts">
	import { ref, computed, onMounted, watch } from 'vue'
	import { useRouter } from 'vue-router'
	import { ElMessage, ElMessageBox } from 'element-plus'
	import type { UploadFile } from 'element-plus'
	import {
		getCharacters,
		getCharacterAvatarsBatch,
		uploadCharacterAvatar,
		updateCharacterAvatar,
		updateCharacter,
		deleteCharacterAvatar
	} from '@/api/character'
	import type { Character, CharacterAvatar, AvatarType } from '@/api/character'
	import { listVariables } from '@/api/variable'
	import type { ProjectVariable } from '@/api/variable'
	import { listDirectives } from '@/api/directive'
	import { getProject, updateProject } from '@/api/project'
	import { getProjectOverview } from '@/api/gallery'
	import type { ProjectOverview } from '@/api/gallery'
	import { UI_THEMES } from '@/utils/uiThemes'
	import { BASE_URL } from '@/utils/request'
	import AssetLibraryPanel from '@/components/AssetLibraryPanel.vue'
	import ProjectHealthPanel from '@/components/ProjectHealthPanel.vue'
	import SaveInspectorPanel from '@/components/SaveInspectorPanel.vue'
	import {
		createProjectVersion,
		getVersionDiff,
		listProjectVersions,
		restoreProjectVersion,
	} from '@/api/version'
		import type { ProjectVersionMeta, VersionDiff } from '@/api/version'
		import {
			listProjectTerms,
			createProjectTerm,
			updateProjectTerm,
			deleteProjectTerm,
			scanProjectTerms,
		} from '@/api/glossary'
		import type { ProjectTerm, GlossaryScanItem, GlossaryScanHit } from '@/api/glossary'
		import { getPlayAnalytics } from '@/api/analytics'
		import type { PlayAnalytics } from '@/api/analytics'
		import {
			listAchievements,
			createAchievement,
			updateAchievement,
			deleteAchievement,
		} from '@/api/achievement'
		import type { Achievement, AchievementCondition } from '@/api/achievement'
		import { getScriptStats } from '@/api/report'
		import type { ScriptStats } from '@/api/report'
		import { listEndings } from '@/api/ending'
		import type { Ending } from '@/api/ending'

	const props = defineProps<{
		projectId: string | number
	}>()

	const router = useRouter()

	const tabs = [
		{ key: 'characters', label: '角色', badge: '' },
		{ key: 'variables', label: '变量', badge: '' },
		{ key: 'overview', label: '概览', badge: '' },
		{ key: 'analytics', label: '数据', badge: '' },
		{ key: 'saves', label: '存档', badge: '' },
		{ key: 'achievements', label: '成就', badge: '' },
		{ key: 'report', label: '报表', badge: '' },
		{ key: 'versions', label: '版本', badge: '' },
		{ key: 'terms', label: '术语', badge: '' },
		{ key: 'appearance', label: '外观', badge: '' },
		{ key: 'assets', label: '素材', badge: '' },
		{ key: 'health', label: '自检', badge: '' },
		{ key: 'ai', label: 'AI', badge: '' },
		{ key: 'effects', label: '演出', badge: '' }
	] as const

	const tab = ref<'characters' | 'variables' | 'overview' | 'analytics' | 'saves' | 'achievements' | 'report' | 'versions' | 'terms' | 'appearance' | 'assets' | 'health' | 'ai' | 'effects'>('characters')

	// 14 个工具按「内容 / 数据 / 质量 / 外观」分组，避免 300px 面板里横向滚动找 tab
	const tabGroups = [
		{ key: 'content', label: '内容', tabs: ['characters', 'variables', 'effects'] },
		{ key: 'data', label: '数据', tabs: ['overview', 'analytics', 'saves', 'report'] },
		{ key: 'quality', label: '质量', tabs: ['health', 'achievements', 'terms', 'versions'] },
		{ key: 'appearance', label: '外观', tabs: ['appearance', 'assets', 'ai'] }
	] as const

	const lastTabByGroup = ref<Record<string, string>>({
		content: 'characters',
		data: 'overview',
		quality: 'health',
		appearance: 'appearance'
	})

	const activeGroup = computed(() => {
		const group = tabGroups.find(g => (g.tabs as readonly string[]).includes(tab.value))
		return group ? group.key : 'content'
	})

	const visibleTabs = computed(() => {
		const group = tabGroups.find(g => g.key === activeGroup.value)
		if (!group) return []
		return group.tabs
			.map(key => tabs.find(t => t.key === key))
			.filter((t): t is (typeof tabs)[number] => !!t)
	})

	const selectGroup = (group: (typeof tabGroups)[number]) => {
		const last = lastTabByGroup.value[group.key]
		const next = (group.tabs as readonly string[]).includes(last) ? last : group.tabs[0]
		tab.value = next as typeof tab.value
	}

	const emit = defineEmits<{
		(e: 'locate', sceneId: number, contentId?: number | null): void
		(e: 'restored'): void
	}>()

	const onLocate = (sceneId: number, contentId?: number | null) => emit('locate', sceneId, contentId ?? null)
	const onLocateHealth = (sceneId: number, contentId: number | null) => emit('locate', sceneId, contentId)
	const onLocateSave = (sceneId: number, contentId: number | null) => emit('locate', sceneId, contentId)

	// ---- 工程概览 ----
	const overview = ref<ProjectOverview | null>(null)
	const loadingOverview = ref(false)
	const loadOverview = async () => {
		if (!props.projectId) return
		loadingOverview.value = true
		try {
			overview.value = await getProjectOverview(Number(props.projectId))
		} catch (e) {
			console.warn('读取工程概览失败:', e)
			overview.value = null
		} finally {
			loadingOverview.value = false
		}
	}

	// ---- 试玩数据统计 ----
	const analytics = ref<PlayAnalytics | null>(null)
	const analyticsDays = ref(30)
	const loadingAnalytics = ref(false)
	const loadAnalytics = async () => {
		if (!props.projectId) return
		loadingAnalytics.value = true
		try {
			analytics.value = await getPlayAnalytics(Number(props.projectId), analyticsDays.value)
		} catch (e) {
			console.warn('读取试玩数据失败:', e)
			analytics.value = null
		} finally {
			loadingAnalytics.value = false
		}
	}

	// ---- 成就 ----
	const achievements = ref<Achievement[]>([])
	const loadingAch = ref(false)
	const savingAch = ref(false)
	const editingAchId = ref<number | null>(null)
	const endingOptions = ref<Ending[]>([])
	const achForm = ref({
		title: '',
		description: '',
		type: 'ending' as 'ending' | 'variable' | 'finish',
		ending_id: 0,
		variable: '',
		op: '>=',
		value: 0,
	})

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
			ElMessage.error('保存成就失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
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
		try {
			await ElMessageBox.confirm(`删除成就「${a.title}」？玩家已解锁记录也会一并删除。`, '删除成就', {
				type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消',
			})
		} catch {
			return
		}
		try {
			await deleteAchievement(Number(props.projectId), a.achievement_id)
			if (editingAchId.value === a.achievement_id) resetAchForm()
			await loadAchievements()
			ElMessage.success('成就已删除')
		} catch (e: any) {
			ElMessage.error('删除成就失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
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

	// ---- 剧本统计报表 ----
	const report = ref<ScriptStats | null>(null)
	const loadingReport = ref(false)

	const loadReport = async () => {
		if (!props.projectId) return
		loadingReport.value = true
		try {
			report.value = await getScriptStats(Number(props.projectId))
		} catch (e) {
			console.warn('读取剧本统计失败:', e)
			report.value = null
		} finally {
			loadingReport.value = false
		}
	}

	const csvCell = (value: any) => `"${String(value ?? '').replace(/"/g, '""')}"`
	const csvLine = (cells: any[]) => cells.map(csvCell).join(',')

	const exportReportCsv = () => {
		const r = report.value
		if (!r) return
		const s = r.summary
		const lines = [
			csvLine(['项目', s.project_title]),
			csvLine(['生成时间', s.generated_at]),
			csvLine(['章节', s.chapter_count, '场景', s.scene_count, '节点', s.node_count]),
			csvLine(['台词', s.dialogue_count, '旁白', s.narration_count, '选择', s.choice_count]),
			csvLine(['分支', s.branch_count, '结局', s.ending_count, '角色', s.character_count]),
			csvLine(['CG', s.cg_count, '总字数', s.word_count, '每场景平均字数', s.avg_words_per_scene]),
			'',
			csvLine(['章节统计']),
			csvLine(['序号', '章节', '场景数', '字数', '目标字数']),
			...r.chapters.map(ch => csvLine([ch.order_num, ch.title, ch.scene_count, ch.word_count, ch.target_words])),
			'',
			csvLine(['场景统计']),
			csvLine(['序号', '场景', '节点', '台词', '旁白', '选择', '分支', '结局', '字数']),
			...r.scenes.map(sc => csvLine([
				sc.order_num, sc.title, sc.node_count, sc.dialogue_count,
				sc.narration_count, sc.choice_count, sc.branch_count,
				sc.ending_count, sc.word_count,
			])),
			'',
			csvLine(['角色统计']),
			csvLine(['角色', '主角', '台词数', '字数', '出场场景']),
			...r.characters.map(c => csvLine([
				c.name, c.is_main ? '是' : '否', c.line_count, c.word_count, c.scene_count,
			])),
		]
		const blob = new Blob(['\ufeff' + lines.join('\r\n')], {
			type: 'text/csv;charset=utf-8',
		})
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = `项目${props.projectId}-剧本统计.csv`
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
		URL.revokeObjectURL(url)
		ElMessage.success('CSV 已导出')
	}

	// ---- 剧本版本 ----
	const versions = ref<ProjectVersionMeta[]>([])
	const loadingVersions = ref(false)
	const savingVersion = ref(false)
	const restoringId = ref<number | null>(null)
	const diffVisible = ref(false)
	const diffLoading = ref(false)
	const diffLoadingId = ref<number | null>(null)
	const diffData = ref<VersionDiff | null>(null)

	const formatVersionTime = (iso: string) => {
		if (!iso) return ''
		const d = new Date(iso)
		if (Number.isNaN(d.getTime())) return iso
		return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
	}

	const loadVersions = async () => {
		if (!props.projectId) return
		loadingVersions.value = true
		try {
			versions.value = await listProjectVersions(Number(props.projectId))
		} catch (e) {
			console.warn('读取版本列表失败:', e)
			versions.value = []
		} finally {
			loadingVersions.value = false
		}
	}

	const saveVersionNow = async () => {
		if (!props.projectId || savingVersion.value) return
		savingVersion.value = true
		try {
			const res = await createProjectVersion(Number(props.projectId), '手动快照')
			ElMessage.success(res.created ? '快照已保存' : '内容与上一版一致，已复用上一版')
			await loadVersions()
		} catch (e: any) {
			ElMessage.error('保存快照失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
		} finally {
			savingVersion.value = false
		}
	}

	const showDiff = async (v: ProjectVersionMeta) => {
		if (diffLoadingId.value !== null) return
		diffLoadingId.value = v.version_id
		diffVisible.value = true
		diffLoading.value = true
		diffData.value = null
		try {
			const res = await getVersionDiff(Number(props.projectId), v.version_id)
			diffData.value = res.diff
		} catch (e: any) {
			ElMessage.error('读取差异失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
		} finally {
			diffLoading.value = false
			diffLoadingId.value = null
		}
	}

	const restoreVersion = async (v: ProjectVersionMeta) => {
		if (restoringId.value !== null) return
		try {
			await ElMessageBox.confirm(
				`恢复到版本 #${v.version_id}（${formatVersionTime(v.created_at)}）？\n当前剧本会先自动备份，恢复后当前页面会自动刷新。`,
				'恢复版本',
				{ type: 'warning', confirmButtonText: '恢复', cancelButtonText: '取消' }
			)
		} catch {
			return
		}
		restoringId.value = v.version_id
		try {
			const res = await restoreProjectVersion(Number(props.projectId), v.version_id)
			ElMessage.success(
				`已恢复：更新 ${res.contents_updated || 0} 条、补回 ${res.contents_created || 0} 条、删除 ${res.contents_deleted || 0} 条`
			)
			diffVisible.value = false
			await loadVersions()
			emit('restored')
		} catch (e: any) {
			ElMessage.error('恢复失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
		} finally {
			restoringId.value = null
		}
	}

	// ---- 术语表 / 一致性检查 ----
	const terms = ref<ProjectTerm[]>([])
	const loadingTerms = ref(false)
	const savingTerm = ref(false)
	const editingTermId = ref<number | null>(null)
	const termForm = ref({ standard: '', variants: '', note: '' })
	const scanVisible = ref(false)
	const scanning = ref(false)
	const scanItems = ref<GlossaryScanItem[]>([])
	const scanTotal = ref(0)

	const loadTerms = async () => {
		if (!props.projectId) return
		loadingTerms.value = true
		try {
			terms.value = await listProjectTerms(Number(props.projectId))
		} catch (e) {
			console.warn('读取术语表失败:', e)
			terms.value = []
		} finally {
			loadingTerms.value = false
		}
	}

	const resetTermForm = () => {
		editingTermId.value = null
		termForm.value = { standard: '', variants: '', note: '' }
	}

	const submitTerm = async () => {
		const standard = termForm.value.standard.trim()
		if (!standard) {
			ElMessage.warning('请填写标准写法')
			return
		}
		savingTerm.value = true
		try {
			if (editingTermId.value) {
				await updateProjectTerm(Number(props.projectId), editingTermId.value, termForm.value)
				ElMessage.success('术语已更新')
			} else {
				await createProjectTerm(Number(props.projectId), termForm.value)
				ElMessage.success('术语已添加')
			}
			resetTermForm()
			await loadTerms()
		} catch (e: any) {
			ElMessage.error('保存失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
		} finally {
			savingTerm.value = false
		}
	}

	const startEditTerm = (t: ProjectTerm) => {
		editingTermId.value = t.term_id
		termForm.value = { standard: t.standard, variants: t.variants || '', note: t.note || '' }
	}

	const cancelEditTerm = () => resetTermForm()

	const removeTerm = async (t: ProjectTerm) => {
		try {
			await ElMessageBox.confirm(`删除术语「${t.standard}」？`, '删除术语', {
				type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消',
			})
		} catch {
			return
		}
		try {
			await deleteProjectTerm(Number(props.projectId), t.term_id)
			if (editingTermId.value === t.term_id) resetTermForm()
			await loadTerms()
			ElMessage.success('术语已删除')
		} catch (e: any) {
			ElMessage.error('删除失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
		}
	}

	const runScan = async () => {
		if (!props.projectId || scanning.value) return
		scanning.value = true
		try {
			const res = await scanProjectTerms(Number(props.projectId))
			scanItems.value = res.items || []
			scanTotal.value = res.total || 0
		} catch (e: any) {
			ElMessage.error('扫描失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
			scanItems.value = []
			scanTotal.value = 0
		} finally {
			scanning.value = false
		}
	}

	const openScan = () => {
		scanVisible.value = true
		runScan()
	}

	const onScanHit = (h: GlossaryScanHit) => {
		if (!h.scene_id) return
		emit('locate', h.scene_id, h.content_id)
		scanVisible.value = false
	}

	// ---- 播放器皮肤 ----
	const themeKey = ref('classic')
	const savingTheme = ref(false)
	const loadTheme = async () => {
		if (!props.projectId) return
		try {
			const p = await getProject(Number(props.projectId))
			themeKey.value = p.ui_theme || 'classic'
		} catch (e) {
			console.warn('读取项目皮肤失败:', e)
		}
	}
	const chooseTheme = async (key: string) => {
		if (savingTheme.value || key === themeKey.value) return
		savingTheme.value = true
		try {
			await updateProject(Number(props.projectId), { ui_theme: key })
			themeKey.value = key
			ElMessage.success('播放器皮肤已切换，试玩即可看到')
		} catch (e: any) {
			ElMessage.error(e?.response?.data?.message || '切换皮肤失败')
		} finally {
			savingTheme.value = false
		}
	}

	const characters = ref<Character[]>([])
	const avatars = ref<CharacterAvatar[]>([])
	const variables = ref<ProjectVariable[]>([])
	const loadingChars = ref(false)
	const loadingVars = ref(false)
	const openChar = ref<number | null>(null)

	// 素材文件丢失时的降级标记：头像退回文字、立绘显示「缺图」
	const brokenChars = ref<number[]>([])
	const brokenAvatars = ref<number[]>([])
	const markCharBroken = (id: number) => {
		if (!brokenChars.value.includes(id)) brokenChars.value.push(id)
	}
	const markAvatarBroken = (id: number) => {
		if (!brokenAvatars.value.includes(id)) brokenAvatars.value.push(id)
	}

	// 演出指令统计（按类型汇总）
	const directiveStats = ref([
		{ key: 'avatar', label: '立绘', count: 0 },
		{ key: 'background', label: '背景', count: 0 },
		{ key: 'music', label: '音乐', count: 0 },
		{ key: 'sound', label: '音效', count: 0 },
		{ key: 'wait', label: '停顿', count: 0 }
	])

	// 火山 TTS 常用音色（与批量配音弹窗保持一致）
	const voiceOptions = [
		{ value: 'BV001_streaming', label: '通用女声 · 童声偏亮' },
		{ value: 'BV002_streaming', label: '通用男声 · 沉稳' },
		{ value: 'BV700_streaming', label: '通用女声 · 知性' },
		{ value: 'BV705_streaming', label: '通用女声 · 活泼' },
		{ value: 'BV701_streaming', label: '通用男声 · 磁性' },
	]

	const onCharacterVoiceChange = async (c: Character, e: Event) => {
		const value = (e.target as HTMLSelectElement).value
		try {
			await updateCharacter({
				...c,
				project_id: Number(props.projectId),
				voice_type: value,
			})
			c.voice_type = value
			ElMessage.success(value ? '角色音色已更新' : '已清除角色音色')
		} catch (err: any) {
			ElMessage.error('保存音色失败：' + (err?.response?.data?.message || err?.message || '未知错误'))
		}
	}

	const avatarCount = (id: number) => avatars.value.filter(a => a.character_id === id).length
	// 默认立绘排在最前，作者一眼能找到
	const avatarsOf = (id: number) => avatars.value
		.filter(a => a.character_id === id)
		.sort((a, b) => Number(b.is_default) - Number(a.is_default))

	// ---- 立绘管理 ----
	const avatarTypes: AvatarType[] = ['正常', '高兴', '生气', '悲伤', '惊讶', '其他']
	const uploadVisible = ref(false)
	const uploadChar = ref<Character | null>(null)
	const uploadFile = ref<File | null>(null)
	const uploadType = ref<AvatarType>('正常')
	const uploadCostume = ref('')
	const uploadDefault = ref(false)
	const uploading = ref(false)

	const openUpload = (c: Character) => {
		uploadChar.value = c
		uploadFile.value = null
		uploadType.value = '正常'
		uploadCostume.value = ''
		// 这个角色还没有任何立绘时，默认把新图设为默认立绘
		uploadDefault.value = avatarsOf(c.character_id).length === 0
		uploadVisible.value = true
	}

	const onPickAvatar = (file: UploadFile) => {
		if (file && file.raw) uploadFile.value = file.raw
	}

	const submitAvatar = async () => {
		if (!uploadFile.value || !uploadChar.value) return
		uploading.value = true
		try {
			await uploadCharacterAvatar(
				uploadFile.value,
				Number(props.projectId),
				uploadChar.value.character_id,
				uploadType.value,
				uploadCostume.value || undefined,
				uploadDefault.value
			)
			ElMessage.success('立绘已上传')
			uploadVisible.value = false
			await loadCharacters()
		} catch (e) {
			console.error('上传立绘失败:', e)
			ElMessage.error('立绘上传失败')
		} finally {
			uploading.value = false
		}
	}

	const setDefaultAvatar = async (a: CharacterAvatar) => {
		try {
			await updateCharacterAvatar({ avatar_id: a.avatar_id })
			avatars.value = avatars.value.map(x =>
				x.character_id === a.character_id
					? { ...x, is_default: x.avatar_id === a.avatar_id }
					: x
			)
			ElMessage.success('已设为默认立绘')
		} catch (e) {
			console.error('设置默认立绘失败:', e)
			ElMessage.error('设置失败')
		}
	}

	const removeAvatar = async (a: CharacterAvatar) => {
		try {
			await ElMessageBox.confirm('引用这张立绘的对话会失去图片，确定删除？', '删除立绘', {
				type: 'warning',
				confirmButtonText: '删除',
				cancelButtonText: '取消'
			})
		} catch {
			return
		}
		try {
			await deleteCharacterAvatar(a.avatar_id)
			avatars.value = avatars.value.filter(x => x.avatar_id !== a.avatar_id)
			ElMessage.success('已删除')
		} catch (e) {
			console.error('删除立绘失败:', e)
			ElMessage.error('删除失败')
		}
	}

	const toggleChar = (id: number) => {
		openChar.value = openChar.value === id ? null : id
	}

	const goAi = (section: string) => {
		router.push({ path: '/ai', query: { tab: section } })
	}

	const loadCharacters = async () => {
		if (!props.projectId) return
		loadingChars.value = true
		try {
			const list = await getCharacters(Number(props.projectId))
			characters.value = list || []
			const ids = characters.value.map(c => c.character_id)
			avatars.value = ids.length ? (await getCharacterAvatarsBatch(ids)) || [] : []
			// 重新拉取后重置缺图标记，文件补回来后能自动恢复
			brokenChars.value = []
			brokenAvatars.value = []
		} catch (e) {
			console.error('加载角色失败:', e)
			characters.value = []
			avatars.value = []
		} finally {
			loadingChars.value = false
		}
	}

	const loadVariables = async () => {
		if (!props.projectId) return
		loadingVars.value = true
		try {
			variables.value = (await listVariables(Number(props.projectId))) || []
		} catch (e) {
			console.error('加载变量失败:', e)
			variables.value = []
		} finally {
			loadingVars.value = false
		}
	}

	const loadDirectives = async () => {
		if (!props.projectId) return
		try {
			const rows = await listDirectives(Number(props.projectId))
			const cnt: Record<string, number> = { avatar: 0, background: 0, music: 0, sound: 0, wait: 0 }
			for (const r of rows) {
				if (cnt[r.directive_type] !== undefined) cnt[r.directive_type] += 1
			}
			directiveStats.value = directiveStats.value.map(s => ({ ...s, count: cnt[s.key] || 0 }))
		} catch (e) {
			console.error('加载演出指令统计失败:', e)
		}
	}

	onMounted(() => {
		loadCharacters()
		loadVariables()
		loadDirectives()
		loadTheme()
	})

	watch(() => props.projectId, () => {
		openChar.value = null
		overview.value = null
		analytics.value = null
		achievements.value = []
		resetAchForm()
		versions.value = []
		terms.value = []
		scanItems.value = []
		scanTotal.value = 0
		resetTermForm()
		loadCharacters()
		loadVariables()
		loadDirectives()
		loadTheme()
	})

	watch(tab, (t) => {
		const group = tabGroups.find(g => (g.tabs as readonly string[]).includes(t))
		if (group) lastTabByGroup.value[group.key] = t
		if (t === 'overview') loadOverview()
		if (t === 'analytics') loadAnalytics()
		if (t === 'achievements') loadAchievements()
		if (t === 'report') loadReport()
		if (t === 'versions') loadVersions()
		if (t === 'terms') loadTerms()
		if (t === 'appearance') loadTheme()
	})
</script>

<style scoped>
	.tp-root {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.tp-groups {
		flex-shrink: 0;
		display: flex;
		gap: 4px;
		padding: 8px 10px 0;
	}

	.tp-group {
		flex: 1;
		padding: 6px 0;
		border: none;
		border-radius: 8px;
		background: #f8f2f5;
		color: #8a6b76;
		font-size: 12px;
		cursor: pointer;
		transition: all 0.15s;
	}

	.tp-group:hover {
		color: #c81f4a;
	}

	.tp-group.is-active {
		background: #fdeef3;
		color: #c81f4a;
		font-weight: 600;
	}

	.tp-tabs {
		flex-shrink: 0;
		display: flex;
		gap: 2px;
		padding: 6px 10px 0;
		border-bottom: 1px solid #f5e4ea;
		flex-wrap: wrap;
	}

	.tp-tab {
		flex: 1 1 0;
		min-width: 52px;
		padding: 7px 4px 9px;
		border: none;
		background: transparent;
		color: #a6828f;
		font-size: 12px;
		cursor: pointer;
		border-bottom: 2px solid transparent;
		transition: color 0.15s, border-color 0.15s;
		white-space: nowrap;
		text-align: center;
	}

	.tp-tab:hover {
		color: #c81f4a;
	}

	.tp-tab.is-active {
		color: #c81f4a;
		font-weight: 600;
		border-bottom-color: #e8467c;
	}

	.tp-badge {
		margin-left: 3px;
		font-size: 9px;
		color: #c9a2ae;
		background: #f7edf1;
		padding: 0 4px;
		border-radius: 6px;
	}

	.tp-body {
		flex: 1;
		overflow-y: auto;
		padding: 10px;
	}

	.tp-state {
		padding: 22px 10px;
		text-align: center;
		font-size: 12px;
		color: #b99aa5;
		line-height: 1.6;
	}

	.tp-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	/* ---- 角色 ---- */
	.tp-char {
		border: 1px solid #f5e4ea;
		border-radius: 10px;
		background: #fff;
		overflow: hidden;
	}

	.tp-char-head {
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 8px 9px;
		cursor: pointer;
	}

	.tp-char-head:hover {
		background: #fffafc;
	}

	.tp-char-avatar {
		width: 32px;
		height: 32px;
		border-radius: 8px;
		overflow: hidden;
		background: #fdeef3;
		color: #c81f4a;
		font-size: 13px;
		font-weight: 600;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.tp-char-avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.tp-char-meta {
		flex: 1;
		min-width: 0;
	}

	.tp-char-name {
		font-size: 13px;
		color: #3d2b32;
		display: flex;
		align-items: center;
		gap: 5px;
	}

	.tp-tag {
		font-size: 9px;
		color: #c81f4a;
		background: #fdeef3;
		border: 1px solid #f6d6e2;
		padding: 0 5px;
		border-radius: 6px;
	}

	.tp-char-sub {
		font-size: 11px;
		color: #b99aa5;
		margin-top: 1px;
	}

	.tp-char-arrow {
		color: #cfa9b6;
		font-size: 15px;
		width: 16px;
		text-align: center;
	}

	.tp-char-voice {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 8px 2px;
	}

	.tp-char-voice-label {
		flex-shrink: 0;
		font-size: 11px;
		color: #8a6a76;
	}

	.tp-char-voice-select {
		flex: 1;
		min-width: 0;
		border: 1px solid #f0d6df;
		border-radius: 7px;
		padding: 4px 6px;
		font-size: 11px;
		color: #475569;
		background: #fff;
		outline: none;
	}

	.tp-char-avatars {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		padding: 8px 9px 10px;
		background: #fffafc;
		border-top: 1px dashed #f5e4ea;
	}

	.tp-avatar {
		position: relative;
		width: 48px;
		height: 58px;
		border-radius: 7px;
		overflow: hidden;
		background: #f7edf1;
	}

	.tp-avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.tp-avatar-missing {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		font-size: 10px;
		color: #c9a2ae;
		background: repeating-linear-gradient(45deg, #fdf3f7, #fdf3f7 6px, #f8e6ee 6px, #f8e6ee 12px);
	}

	.tp-avatar-type {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		font-size: 9px;
		color: #fff;
		background: rgba(61, 43, 50, 0.55);
		text-align: center;
		padding: 1px 0;
	}

	.tp-avatar-default {
		position: absolute;
		top: 2px;
		left: 2px;
		font-size: 8px;
		line-height: 1.5;
		color: #fff;
		background: #e8467c;
		padding: 0 4px;
		border-radius: 4px;
	}

	/* 悬停才露出操作按钮：★ 设默认、× 删除 */
	.tp-avatar-acts {
		position: absolute;
		top: 2px;
		right: 2px;
		display: none;
		flex-direction: column;
		gap: 2px;
	}

	.tp-avatar:hover .tp-avatar-acts {
		display: flex;
	}

	.tp-av-act {
		width: 16px;
		height: 16px;
		padding: 0;
		border: none;
		border-radius: 4px;
		background: rgba(61, 43, 50, 0.62);
		color: #fff;
		font-size: 10px;
		line-height: 1;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.tp-av-act:hover {
		background: #e8467c;
	}

	.tp-avatar-add {
		width: 48px;
		height: 58px;
		border: 1px dashed #f0b8ca;
		border-radius: 7px;
		background: #fff;
		color: #c81f4a;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		transition: all 0.15s;
	}

	.tp-avatar-add:hover {
		background: #fdeef3;
		border-color: #e8467c;
	}

	.tp-avatar-add-icon {
		font-size: 15px;
		line-height: 1;
	}

	.tp-avatar-add-text {
		font-size: 9px;
	}

	/* ---- 添加立绘弹窗 ---- */
	.tp-up-row {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 10px;
	}

	.tp-up-label {
		width: 56px;
		flex-shrink: 0;
		font-size: 12px;
		color: #8a6a76;
	}

	.tp-up-value {
		font-size: 12px;
		color: #3d2b32;
	}

	.tp-up-pick {
		padding: 5px 10px;
		border: 1px dashed #f0b8ca;
		border-radius: 7px;
		background: #fff;
		color: #c81f4a;
		font-size: 12px;
		cursor: pointer;
	}

	.tp-up-pick:hover {
		background: #fdeef3;
		border-color: #e8467c;
	}

	/* ---- 变量 ---- */
	.tp-var {
		padding: 8px 10px;
		border: 1px solid #f5e4ea;
		border-radius: 10px;
		background: #fff;
	}

	.tp-var-top {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
	}

	.tp-var-label {
		font-size: 13px;
		color: #3d2b32;
	}

	.tp-var-init {
		font-size: 11px;
		color: #c98aa0;
		flex-shrink: 0;
	}

	.tp-var-key {
		font-size: 11px;
		color: #b99aa5;
		margin-top: 2px;
		font-family: Consolas, Monaco, monospace;
	}

	/* ---- 工程概览 ---- */
	.tp-overview {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.tp-ov-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}

	.tp-ov-card {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 10px 12px;
		border: 1px solid #f5e4ea;
		border-radius: 10px;
		background: #fff;
	}

	.tp-ov-num {
		font-size: 20px;
		font-weight: 600;
		color: #c81f4a;
		line-height: 1.2;
	}

	.tp-ov-label {
		font-size: 11px;
		color: #b99aa5;
	}

	.tp-ov-brief {
		font-size: 11px;
		color: #8a6a76;
	}

	.tp-ov-goal {
		display: flex;
		flex-direction: column;
		gap: 5px;
		padding: 9px 11px;
		background: #fff;
		border: 1px solid #f5e4ea;
		border-radius: 9px;
	}

	.tp-ov-goal-head {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		font-size: 11px;
		color: #6b4a55;
	}

	.tp-ov-row-wrap {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.tp-ov-ch-goal {
		display: flex;
		flex-direction: column;
		gap: 3px;
		padding: 0 10px 2px;
		font-size: 10px;
		color: #b99aa5;
	}

	.tp-ov-section {
		font-size: 12px;
		font-weight: 600;
		color: #6b4a55;
		margin-top: 2px;
	}

	.tp-ov-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.tp-ov-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		border: 1px solid #f5e4ea;
		border-radius: 8px;
		background: #fff;
		font-size: 12px;
	}

	.tp-ov-chapter {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: #3d2b32;
	}

	.tp-ov-scenes {
		color: #b99aa5;
		font-size: 11px;
	}

	.tp-ov-words {
		color: #c81f4a;
		font-size: 12px;
		font-variant-numeric: tabular-nums;
	}

	.tp-ov-ungrouped {
		border-style: dashed;
	}

	.tp-ov-empty {
		padding: 12px;
	}

	.tp-ov-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 10px;
		font-size: 11px;
		color: #b99aa5;
	}

	.tp-ov-meta .is-warn {
		color: #d1435b;
	}

	/* ---- 试玩数据统计 ---- */
	.tp-an-note {
		font-size: 11px;
		color: #b99aa5;
		line-height: 1.6;
		margin-bottom: 10px;
	}

	.tp-an-actions {
		display: flex;
		gap: 6px;
		margin-bottom: 10px;
	}

	.tp-an-range {
		flex: 1;
		border: 1px solid #f0d6df;
		border-radius: 7px;
		padding: 5px 7px;
		font-size: 11px;
		color: #475569;
		background: #fff;
		outline: none;
	}

	.tp-an-refresh {
		border: 1px solid #f0cfdc;
		background: #fff;
		color: #a84463;
		border-radius: 7px;
		padding: 5px 9px;
		font-size: 11px;
		cursor: pointer;
	}

	.tp-an-summary {
		display: flex;
		gap: 6px;
		margin-bottom: 12px;
	}

	.tp-an-stat {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
		background: #fdf3f7;
		border: 1px solid #f6d6e2;
		border-radius: 9px;
		padding: 7px 8px;
	}

	.tp-an-stat.wide {
		flex: 1.3;
	}

	.tp-an-value {
		font-size: 14px;
		font-weight: 600;
		color: #c81f4a;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.tp-an-label {
		font-size: 10px;
		color: #b07a8c;
	}

	.tp-an-section {
		font-size: 11px;
		font-weight: 600;
		color: #8a6a76;
		margin: 10px 0 6px;
	}

	.tp-an-dropoff {
		font-size: 11px;
		line-height: 1.6;
		color: #9a3412;
		background: #fff7ed;
		border: 1px solid #fed7aa;
		border-radius: 8px;
		padding: 6px 8px;
		margin: 7px 0 2px;
	}

	.tp-an-link {
		border: none;
		background: none;
		color: #c81f4a;
		font-size: 11px;
		padding: 0;
		cursor: pointer;
		text-decoration: underline;
	}

	.tp-an-scene.is-clickable,
	.tp-an-choice-title.is-clickable,
	.tp-an-ending.is-clickable {
		cursor: pointer;
	}

	.tp-an-scene.is-clickable:hover,
	.tp-an-choice-title.is-clickable:hover,
	.tp-an-ending.is-clickable:hover {
		background: #fff2f6;
		border-radius: 6px;
	}

	.tp-an-option.is-cold {
		background: #fff8e6;
		border-radius: 5px;
		padding-left: 4px;
		padding-right: 4px;
	}

	.tp-an-cold-tag {
		font-size: 9px;
		color: #b45309;
		background: #fff1cc;
		padding: 0 4px;
		border-radius: 3px;
		margin-left: 4px;
	}

	.tp-an-empty {
		font-size: 11px;
		color: #b99aa5;
		padding: 4px 2px 8px;
	}

	.tp-an-scene {
		margin-bottom: 7px;
	}

	.tp-an-scene-top {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
	}

	.tp-an-scene-name {
		font-size: 11px;
		color: #475569;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tp-an-scene-meta {
		flex-shrink: 0;
		font-size: 10px;
		color: #b07a8c;
	}

	.tp-an-bar {
		height: 5px;
		border-radius: 3px;
		background: #f6e3ea;
		overflow: hidden;
		margin-top: 3px;
	}

	.tp-an-bar-fill {
		height: 100%;
		border-radius: 3px;
		background: linear-gradient(90deg, #e8467c, #ff9db5);
		transition: width 0.2s;
	}

	.tp-an-choice {
		border: 1px solid #f5e4ea;
		border-radius: 9px;
		padding: 7px 8px;
		margin-bottom: 7px;
		background: #fff;
	}

	.tp-an-choice-title {
		font-size: 11px;
		color: #3d2b32;
		margin-bottom: 5px;
		line-height: 1.5;
	}

	.tp-an-option {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
		padding: 2px 0;
		border-top: 1px dashed #faf0f4;
	}

	.tp-an-option-text {
		font-size: 11px;
		color: #475569;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tp-an-option-meta {
		flex-shrink: 0;
		font-size: 10px;
		color: #c81f4a;
	}

	.tp-an-ending {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
		padding: 4px 2px;
		border-bottom: 1px dashed #f7e3ea;
	}

	.tp-an-ending-name {
		font-size: 11px;
		color: #475569;
	}

	.tp-an-ending-meta {
		flex-shrink: 0;
		font-size: 10px;
		color: #b07a8c;
	}

	/* ---- 成就 ---- */
	.tp-ach-note {
		font-size: 11px;
		color: #b99aa5;
		line-height: 1.6;
		margin-bottom: 10px;
	}

	.tp-ach-form {
		display: flex;
		flex-direction: column;
		gap: 5px;
		margin-bottom: 12px;
	}

	.tp-ach-input,
	.tp-ach-select {
		width: 100%;
		box-sizing: border-box;
		border: 1px solid #f0d6df;
		border-radius: 7px;
		padding: 6px 8px;
		font-size: 11px;
		color: #3d2b32;
		background: #fff;
		outline: none;
	}

	.tp-ach-var-row {
		display: flex;
		gap: 5px;
	}

	.tp-ach-op {
		flex: 0 0 64px;
		border: 1px solid #f0d6df;
		border-radius: 7px;
		padding: 5px 6px;
		font-size: 11px;
		color: #475569;
		background: #fff;
		outline: none;
	}

	.tp-ach-num {
		flex: 1;
		min-width: 0;
		border: 1px solid #f0d6df;
		border-radius: 7px;
		padding: 5px 8px;
		font-size: 11px;
		color: #3d2b32;
		outline: none;
	}

	.tp-ach-actions {
		display: flex;
		gap: 6px;
	}

	.tp-ach-add,
	.tp-ach-cancel {
		border: 1px solid #f0c8d6;
		background: #fff2f6;
		color: #c81f4a;
		border-radius: 7px;
		padding: 4px 10px;
		font-size: 11px;
		cursor: pointer;
	}

	.tp-ach-add:disabled,
	.tp-ach-cancel:disabled {
		opacity: 0.55;
		cursor: default;
	}

	.tp-ach-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.tp-ach-item {
		border: 1px solid #f5e4ea;
		border-radius: 9px;
		padding: 8px 9px;
		background: #fff;
	}

	.tp-ach-main {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.tp-ach-title {
		font-size: 13px;
		font-weight: 600;
		color: #3d2b32;
	}

	.tp-ach-cond {
		font-size: 10px;
		color: #c81f4a;
	}

	.tp-ach-desc {
		font-size: 10px;
		color: #b99aa5;
		word-break: break-all;
	}

	.tp-ach-btns {
		display: flex;
		gap: 6px;
		margin-top: 5px;
	}

	.tp-ach-btns button {
		border: 1px solid #f0cfdc;
		background: #fff;
		color: #a84463;
		border-radius: 6px;
		padding: 3px 8px;
		font-size: 10px;
		cursor: pointer;
	}

	.tp-ach-btns button.danger {
		border-color: #f3c9d3;
		background: #fff5f7;
		color: #c0392b;
	}

	/* ---- 剧本统计报表 ---- */
	.tp-rep-note {
		font-size: 11px;
		color: #b99aa5;
		line-height: 1.6;
		margin-bottom: 10px;
	}

	.tp-rep-actions {
		display: flex;
		gap: 6px;
		margin-bottom: 10px;
	}

	.tp-rep-refresh,
	.tp-rep-export {
		border: 1px solid #f0cfdc;
		background: #fff;
		color: #a84463;
		border-radius: 7px;
		padding: 5px 9px;
		font-size: 11px;
		cursor: pointer;
	}

	.tp-rep-export {
		border-color: #e8467c;
		background: #e8467c;
		color: #fff;
	}

	.tp-rep-refresh:disabled,
	.tp-rep-export:disabled {
		opacity: 0.55;
		cursor: default;
	}

	.tp-rep-summary {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
		margin-bottom: 10px;
		font-size: 10px;
		color: #8a6a76;
	}

	.tp-rep-summary span {
		background: #fdf3f7;
		border: 1px solid #f6d6e2;
		border-radius: 6px;
		padding: 2px 7px;
	}

	.tp-rep-section {
		font-size: 11px;
		font-weight: 600;
		color: #8a6a76;
		margin: 10px 0 5px;
	}

	.tp-rep-chapter {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
		padding: 3px 2px;
		border-bottom: 1px dashed #f7e3ea;
	}

	.tp-rep-title {
		font-size: 11px;
		color: #475569;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tp-rep-meta {
		flex-shrink: 0;
		font-size: 10px;
		color: #b07a8c;
	}

	.tp-rep-scene-row,
	.tp-rep-char-row {
		display: grid;
		grid-template-columns: 1fr 36px 36px 44px;
		gap: 4px;
		padding: 3px 2px;
		border-bottom: 1px solid #faf0f4;
		font-size: 10px;
		color: #475569;
	}

	.tp-rep-char-row {
		grid-template-columns: 1fr 40px 48px;
	}

	.tp-rep-head {
		color: #b07a8c;
		background: #fdf3f7;
		border-radius: 5px;
	}

	.tp-rep-scene-row span:not(.tp-rep-scene-name),
	.tp-rep-char-row span:not(.tp-rep-char-name) {
		text-align: right;
	}

	.tp-rep-scene-name,
	.tp-rep-char-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tp-rep-main {
		margin-left: 4px;
		font-size: 9px;
		color: #c81f4a;
		background: #fdeef3;
		border-radius: 4px;
		padding: 0 4px;
	}

	/* ---- 剧本版本 ---- */
	.tp-ver-note {
		font-size: 11px;
		color: #b99aa5;
		line-height: 1.6;
		margin-bottom: 8px;
	}

	.tp-ver-actions {
		display: flex;
		gap: 6px;
		margin-bottom: 8px;
	}

	.tp-ver-save {
		border: 1px solid #e8467c;
		background: #e8467c;
		color: #fff;
		border-radius: 7px;
		padding: 5px 10px;
		font-size: 11px;
		cursor: pointer;
	}

	.tp-ver-save:disabled {
		opacity: 0.6;
		cursor: wait;
	}

	.tp-ver-refresh {
		border: 1px solid #f0cfdc;
		background: #fff;
		color: #a84463;
		border-radius: 7px;
		padding: 5px 10px;
		font-size: 11px;
		cursor: pointer;
	}

	.tp-ver-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-height: 0;
		overflow-y: auto;
	}

	.tp-ver-item {
		border: 1px solid #f5e4ea;
		border-radius: 9px;
		background: #fff;
		padding: 8px 10px;
	}

	.tp-ver-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.tp-ver-label {
		font-size: 12px;
		font-weight: 600;
		color: #3d2b32;
	}

	.tp-ver-time {
		font-size: 10px;
		color: #b99aa5;
	}

	.tp-ver-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 4px;
		font-size: 10px;
		color: #8a6a76;
	}

	.tp-ver-acts {
		display: flex;
		gap: 6px;
		margin-top: 7px;
	}

	.tp-ver-act {
		flex: 1;
		border: 1px solid #f0cfdc;
		background: #fff;
		color: #a84463;
		border-radius: 6px;
		padding: 4px 6px;
		font-size: 11px;
		cursor: pointer;
	}

	.tp-ver-act.danger {
		border-color: #f3c9d3;
		background: #fff5f7;
		color: #c0392b;
	}

	.tp-ver-act:disabled {
		opacity: 0.55;
		cursor: wait;
	}

	.tp-diff-summary {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		font-size: 12px;
		color: #3d2b32;
		margin-bottom: 6px;
	}

	.tp-diff-note {
		font-size: 11px;
		color: #b99aa5;
		margin-bottom: 10px;
	}

	.tp-diff-title {
		font-size: 12px;
		font-weight: 600;
		color: #6b4a55;
		margin: 10px 0 5px;
	}

	.tp-diff-row {
		padding: 6px 9px;
		border-radius: 7px;
		font-size: 12px;
		line-height: 1.6;
		margin-bottom: 4px;
		word-break: break-all;
	}

	.tp-diff-row.add {
		background: #f0fbf5;
		border: 1px solid #cdeeda;
		color: #1f7a52;
	}

	.tp-diff-row.remove {
		background: #fdeeee;
		border: 1px solid #f5c6c6;
		color: #a93226;
	}

	.tp-diff-row.mod {
		background: #fff8f0;
		border: 1px solid #f6dfc8;
		color: #a8562a;
	}

	.tp-diff-sub {
		margin-left: 6px;
		font-size: 10px;
		color: #b99aa5;
	}

	/* ---- 术语表 / 一致性检查 ---- */
	.tp-term-note {
		font-size: 11px;
		color: #b99aa5;
		line-height: 1.6;
		margin-bottom: 10px;
	}

	.tp-term-form {
		display: flex;
		flex-direction: column;
		gap: 5px;
		margin-bottom: 10px;
	}

	.tp-term-input {
		width: 100%;
		box-sizing: border-box;
		border: 1px solid #f0d6df;
		border-radius: 7px;
		padding: 6px 8px;
		font-size: 11px;
		color: #3d2b32;
		outline: none;
		background: #fff;
	}

	.tp-term-input:focus {
		border-color: #ff9db5;
	}

	.tp-term-form-actions {
		display: flex;
		gap: 6px;
	}

	.tp-term-add,
	.tp-term-cancel {
		border: 1px solid #f0c8d6;
		background: #fff2f6;
		color: #c81f4a;
		border-radius: 7px;
		padding: 4px 10px;
		font-size: 11px;
		cursor: pointer;
	}

	.tp-term-add:disabled,
	.tp-term-cancel:disabled {
		opacity: 0.55;
		cursor: default;
	}

	.tp-term-actions {
		display: flex;
		gap: 6px;
		margin-bottom: 10px;
	}

	.tp-term-scan-btn {
		flex: 1;
		border: 1px solid #e8467c;
		background: #e8467c;
		color: #fff;
		border-radius: 7px;
		padding: 5px 8px;
		font-size: 11px;
		cursor: pointer;
	}

	.tp-term-refresh {
		border: 1px solid #f0cfdc;
		background: #fff;
		color: #a84463;
		border-radius: 7px;
		padding: 5px 9px;
		font-size: 11px;
		cursor: pointer;
	}

	.tp-term-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.tp-term-item {
		border: 1px solid #f5e4ea;
		border-radius: 9px;
		padding: 8px 9px;
		background: #fff;
	}

	.tp-term-main {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.tp-term-standard {
		font-size: 13px;
		font-weight: 600;
		color: #3d2b32;
	}

	.tp-term-variants {
		font-size: 11px;
		color: #a8562a;
		word-break: break-all;
	}

	.tp-term-remark {
		font-size: 10px;
		color: #b99aa5;
		word-break: break-all;
	}

	.tp-term-acts {
		display: flex;
		gap: 6px;
		margin-top: 5px;
	}

	.tp-term-acts button {
		border: 1px solid #f0cfdc;
		background: #fff;
		color: #a84463;
		border-radius: 6px;
		padding: 3px 8px;
		font-size: 10px;
		cursor: pointer;
	}

	.tp-term-acts button.danger {
		border-color: #f3c9d3;
		background: #fff5f7;
		color: #c0392b;
	}

	.tp-scan-summary {
		font-size: 12px;
		color: #8a6a76;
		margin-bottom: 10px;
	}

	.tp-scan-item {
		border: 1px solid #f5e4ea;
		border-radius: 9px;
		padding: 8px 10px;
		margin-bottom: 8px;
	}

	.tp-scan-title {
		font-size: 12px;
		color: #3d2b32;
		margin-bottom: 5px;
	}

	.tp-scan-count {
		margin-left: 6px;
		font-size: 10px;
		color: #c81f4a;
		background: #fdeef3;
		border-radius: 6px;
		padding: 1px 6px;
	}

	.tp-scan-hit {
		display: flex;
		gap: 8px;
		padding: 4px 6px;
		border-radius: 6px;
		cursor: pointer;
	}

	.tp-scan-hit:hover {
		background: #fff5f8;
	}

	.tp-scan-where {
		flex-shrink: 0;
		font-size: 10px;
		color: #b07a8c;
		max-width: 120px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tp-scan-text {
		font-size: 11px;
		color: #475569;
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	/* ---- 播放器皮肤 ---- */
	.tp-theme-note {
		font-size: 11px;
		color: #b99aa5;
		line-height: 1.6;
		margin-bottom: 10px;
	}

	.tp-theme-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.tp-theme {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 9px 10px;
		border: 1px solid #f5e4ea;
		border-radius: 10px;
		background: #fff;
		cursor: pointer;
		text-align: left;
		transition: border-color 0.15s, box-shadow 0.15s;
	}

	.tp-theme:hover {
		border-color: #f0b8ca;
	}

	.tp-theme.is-active {
		border-color: #e8467c;
		box-shadow: 0 0 0 2px rgba(232, 70, 124, 0.12);
	}

	.tp-theme:disabled {
		opacity: 0.6;
		cursor: wait;
	}

	.tp-theme-swatches {
		display: flex;
		flex-shrink: 0;
		width: 52px;
		height: 34px;
		border-radius: 7px;
		overflow: hidden;
		border: 1px solid #f0dbe3;
	}

	.tp-theme-swatches i {
		flex: 1;
	}

	.tp-theme-meta {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.tp-theme-name {
		font-size: 13px;
		color: #3d2b32;
	}

	.tp-theme-desc {
		font-size: 11px;
		color: #b99aa5;
		line-height: 1.4;
	}

	.tp-theme-check {
		flex-shrink: 0;
		color: #e8467c;
		font-weight: 700;
	}

	/* ---- AI ---- */
	.tp-ai-note {
		font-size: 11px;
		color: #b99aa5;
		line-height: 1.6;
		margin: 2px 2px 10px;
	}

	.tp-ai-btn {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px;
		margin-bottom: 7px;
		border: 1px solid #f5e4ea;
		border-radius: 10px;
		background: #fff;
		cursor: pointer;
		text-align: left;
		transition: all 0.15s;
	}

	.tp-ai-btn:hover {
		border-color: #f3a8bf;
		background: #fffafc;
	}

	.tp-ai-icon {
		width: 30px;
		height: 30px;
		border-radius: 8px;
		background: #fdeef3;
		color: #c81f4a;
		font-size: 13px;
		font-weight: 600;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.tp-ai-title {
		font-size: 13px;
		color: #3d2b32;
	}

	.tp-ai-sub {
		font-size: 11px;
		color: #b99aa5;
		margin-top: 1px;
	}

	/* ---- 演出 ---- */
	.tp-soon {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.tp-soon-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 9px 10px;
		border: 1px dashed #eddbe3;
		border-radius: 10px;
		background: #fffdfe;
	}

	.tp-soon-name {
		font-size: 12px;
		color: #8a6a76;
	}

	.tp-soon-tag {
		font-size: 10px;
		color: #b99aa5;
		background: #f7edf1;
		padding: 1px 6px;
		border-radius: 6px;
	}

	.tp-soon-tag.is-ok {
		color: #1f9d76;
		background: #eafaf3;
		border: 1px solid #c6f0e0;
	}

	/* 演出指令统计 */
	.tp-dir-stats {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-bottom: 10px;
	}

	.tp-dir-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 10px;
		border: 1px solid #f5e4ea;
		border-radius: 9px;
		background: #fff;
	}

	.tp-dir-name {
		font-size: 12px;
		color: #3d2b32;
	}

	.tp-dir-count {
		font-size: 12px;
		font-weight: 600;
		color: #c81f4a;
		font-variant-numeric: tabular-nums;
	}

	.tp-dir-count.is-zero {
		color: #c9aeb9;
		font-weight: 400;
	}
</style>
