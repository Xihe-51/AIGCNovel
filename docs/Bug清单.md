# 代码 Bug 与缺陷清单（静态分析，未修改）

> 本文档基于对 `D:\AIGCNovel\` 前后端代码的静态分析，
> **尚未运行系统、尚未做任何修改**（按用户要求"先别改"）。
>
> 分级说明：
> - 🔴 **P0 明确 Bug**：会导致功能错误或数据错误，可直接复现
> - 🟠 **P1 接口不一致 / 功能断链**：前后端对不上，功能走不通
> - 🟡 **P2 死代码 / 未完成**：不影响主流程，但属于技术债
> - 🔵 **P3 体验 / 健壮性问题**：边界情况处理不足

---

## 🔴 P0 明确 Bug

### P0-1 场景表单「音乐移除」按钮绑错函数

**文件**：`front/src/components/ScenesManage.vue` L160

```html
<div v-if="formData.music_url" class="audio-info">
  <span>{{ getFileName(formData.music_url) }}</span>
  <button type="button" class="remove-image" @click="handleRemoveBackground">  <!-- ← 应为 handleRemoveMusic -->
    X
  </button>
</div>
```

- `handleRemoveMusic()` 已在 L407 定义，但**从未被绑定**
- 点击音乐区的 X 会调用 `handleRemoveBackground()`，其中执行：
  `document.getElementById('background_url').value = ''` —— 当背景图未上传时该元素为 `null`，会抛 `TypeError`
- **后果**：① 音乐删不掉；② 未选背景图时点击会报错

### P0-2 后端 `/project/characters/<int:project_id>` 路由重复注册

**文件**：`back/app/project/views.py`

- L268 `def get_characters(project_id)` 路由 `/characters/<int:project_id>`
- L359 `def get_project_characters(project_id)` **同一个路由**

Flask 对「同 URL + 同 method」以**先注册者生效**，后定义的 `get_project_characters` 永远不可达（启动时通常还会抛 `AssertionError: View function mapping is overwriting an existing endpoint function` 或静默忽略，视 Flask 版本）。

- **后果**：`get_project_characters` 是死代码；且两个函数返回结构不同（前者带 `avatar_url` 聚合，后者不带），行为随机
- 前端 `dialogue.ts` 的 `getCharactersByProjectId` 走的是这个 URL

### P0-3 场景拖拽排序会覆盖 background_url / music_url

**文件**：`ScenesManage.vue` L572-L574

```js
const updatePromises = updatedScenes.map(scene =>
  updateScene(scene.scene_id, scene)   // scene 是本地列表对象
)
```

后端 `PUT /project/scenes/<scene_id>`（`views.py` L735）要求 body 含 `title` + `order_num`，并**全量覆盖** `background_url`、`music_url`（`update_existing_scene` 直接赋值）。

- 若本地 `scene` 对象里的 `background_url` 与真实值不一致（例如刚上传后未刷新），**拖拽排序会把背景图/音乐清空**
- 前端 API `scenes.ts` 的 `updateScene(sceneId, scene)` 类型要求整个 `Scene`，也强化了这个风险

### P0-4 `HomeView` 项目编辑用 `PATCH` 语义但传 `is_public` 却后端不接收

**文件**：`front/src/views/HomeView.vue` L694-L703 → `back/app/project/views.py` L148

前端 `updateProject(id, { title, genre, template_type, is_public })`，
后端 `modify_project()` **只接收 `title` 和 `genre`**：

```python
success, result = update_project(
    project_id, user_id,
    title=data.get('title'),
    genre=data.get('genre')
)
```

- **后果**：编辑项目时修改「是否公开」**静默失效**（前端还提示"更新成功"）
- 公开项目实际只能通过 ScenesManage 的「公开项目」按钮（`PUT /project/project/public/{id}`），且**只能设为公开、不能取消公开**

### P0-5 `HomeView` 编辑项目后返回的是残缺对象，会导致列表项数据丢失

**文件**：`HomeView.vue` L697-L716

```js
const updatedProject = await projectApi.updateProject(...)
projects.value = projects.value.map(p =>
  p.project_id === currentProjectId.value ? updatedProject : p   // ← 直接替换
)
```

后端 `modify_project` 只返回 `{ project_id, title }`，**没有 `cover_url / genre / word_count / is_public / created_at / updated_at`**。

- **后果**：编辑保存后卡片封面、字数、更新时间、公开状态**瞬间变成 undefined**（页面会闪一下错误显示，虽然紧接着 `fetchProjects()` 会拉回，但 `fetchProjects` 是异步且未 await，存在竞态）

---

## 🟠 P1 接口不一致 / 功能断链

> 状态更新：**P1-3、P1-4 已在 3.3 音乐/配音拆分中修复**（见 FIX-10 与
> `docs/第3批-音乐与配音改造说明.md`）。修复方式不是补前端拦截，而是把
> 「音乐生成」和「语音配音」拆成两个语义正确的独立入口。

### P1-1 `template_type` 全链路断裂

- 前端 `HomeView.vue` / `project.ts` / `ProjectView.vue` / `individual.ts` **都声明了 `template_type`**
- 后端 `models.py` 的 `Project` **没有该字段**
- `create_project()` 签名 `(user_id, title, genre, cover_url=None)` 不接收
- `modify_project()` 不接收
- **后果**：前端表单里 `template_type` 永远为空字符串，提交被后端丢弃；`template_type` 相关 UI（模板选择）**根本不存在**

### P1-2 AI 模型列表接口返回结构不匹配

| 位置 | 返回 |
| --- | --- |
| `GET /user/models`（`user/services.py` L141） | `{ models: [...], total: n }` |
| `IndividualView.vue` L374-L377 | `res.data.data.models` ✅ 恰好对得上 |
| 但 `AiView.vue` L166 调 `getModels()` | `api/ai.ts` L107 声明返回 `AIModel[]`，实际拿到的是 `{data:{models,total}}`，**`textModels.value` 仍是硬编码的 `[{value:'deepseek'...}]`** |

`AiView.loadHistory()` 里拿到的 `models` 变量**完全没被使用**，模型下拉框是写死的三行：

```js
textModels.value  = [{ value: 'deepseek', label: 'DeepSeek' }]
imageModels.value = [{ value: 'hunyuan',  label: '通义万象' }]
voiceModels.value = [{ value: 'acestep',  label: 'ACE-Step' }]
```

- **后果**：用户在个人中心辛苦创建的「我的AI模型」**在 AI 控制台里选不到**，模型管理与生成控制台**互相隔离**

### P1-3 音乐生成功能：前端有接口、有后端、但 UI 主动拦截

- `AiView.vue` L220 `handleVoiceGenerate()` **只弹一个"功能筹备中"对话框，从未调用 `generateMusic`**
- 但 L126 依然 `import { ..., generateMusic }`（未使用）
- 后端 `/ai/generate/music`（`ai/views.py` L144）**接口是通的**，会调火山引擎 TTS
- 而且后端生成的是**语音（TTS）**，不是文档里说的「音乐」
- **后果**：功能不可用（这是产品决策，但接口/文档/UI 三者矛盾）

### P1-4 `generateMusic` 参数与后端不匹配

- 后端 `generate_music()` 读 `data.get('duration')`，但下游 `generate_music_wav()` 的 `duration` **只用于写 `AIGeneration.length`**，实际音频长度由文本决定
- `VoiceGenerator.vue` 未做 `duration` 的收集

### P1-5 图片生成接口返回数据不完整

- `ai/views.py` `generate_image()` 成功时只返回 `{status:'success', message:'生成完成'}`
- **不返回图片 URL / generation_id**
- 前端 `AiView.handleImageGenerate()` 只能再调一次 `loadHistory()` 全量刷新，**无法定位刚生成的那张图**

### P1-6 文本生成前端传 `forbidden_words: ''`，后端按 `，` 分割

- `SceneEdit.vue` L744 传 `forbidden_words: ''`
- 后端 `generate_text()` L25-L26：`if isinstance(forbidden_words, str): split('，')`
- `''.split('，')` → `['']`，得到一个**空字符串元素**，之后：
  ```python
  for word in forbidden_words:
      generated_text = generated_text.replace(word, "[已过滤]")   # '' 是空串
  ```
  `str.replace('', x)` 会在**每个字符间插入 `[已过滤]`**，直接**炸掉整段文本**！
- **后果**：🔴 实际上这是 P0 —— 只要从 SceneEdit 触发 AI 生成且传空字符串，返回文本会被彻底破坏
  （注：`AiView` 走的是数组路径，不受影响；此问题专属于 SceneEdit 调用）

### P1-7 忘记密码：纯 UI 摆设

**文件**：`front/src/views/LoginView.vue` L84-L123

- 「发送验证码」按钮绑定的是 `@click="forgotStep++"`
- **没有发送请求、没有校验、没有后端接口**
- 点两下直接到「密码重置成功！」
- 后端 `user/views.py` **无任何 forgot/reset/code 相关路由**

### P1-8 `getDialogueCount` 返回结构处理不一致

- 后端 `/project/dialogue_count/<id>` 返回 `{"length": n}`
- `ProjectView.vue` L957：`totalDialogues.value = res.length || res`
- `project.ts` L151 声明返回 `{length: number}`，但 `request.get(...).then(r => r.data)` 实际给的是 `{length: n}`
- 恰好能用，但 `|| res` 的兜底逻辑说明作者自己也不确定，属于脆弱代码

---

## 🟡 P2 死代码 / 未完成

### P2-1 对话 FSM 状态机完全没接入 UI

**文件**：`SceneEdit.vue` L382-L407、L895-L981

- `fsmStates` / `fsmStateLabels` / `dialogueFsmStates` / `getFsmState` / `setFsmState` 全部定义
- CSS 里 `.fsm-badge`、`.fsm-menu`、`.fsm-dot`、`.fsm-desc`、`.fsm-check`、`.fsm-arrow` 全套样式齐备
- **模板中零引用** → 用户看不到任何状态徽章
- 同样的问题也出现在 `ProjectView.vue` L1322（`.node-fsm-badge`）和 L1346（`.fsm-badge`），**样式写了、模板没用**

### P2-2 `ProjectView.vue` 里大段"空壳函数"

L984-L991：

```js
showAddSceneDialog: () => {}, editScene: () => {}, openSceneEditor: () => {},
deleteScene: async () => {}, sortScenesByOrder: () => {}, saveScene: () => {},
addDialogueContent: () => {}, addDescriptionContent: () => {}, addChoiceContent: () => {},
removeContent: () => {}, moveContentUp: () => {}, moveContentDown: () => {},
updateCharacterForContent: () => {}, getCharacterAvatars: () => [],
addOption: () => {}, removeOption: () => {}, getAvailableTargets: () => [], getTargetLabel: () => '',
startDrag: () => {}, editDescription: () => {}, saveDescription: () => {}, cancelEditDescription: () => {},
nextContent: () => {}, selectOption: () => {}, exitPreview: () => {}
```

**全部是空函数**，说明这一段是从旧版 `ProjectView` 迁移到 `ScenesManage/SceneEdit` 时留下的残骸。
其中 `addChoiceContent` / `addOption` / `selectOption` / `getAvailableTargets` 明显是**分支选择功能**的遗迹 —— 印证分支叙事确实未完成。

### P2-3 `HomeView` 字数趋势折线图无 DOM

- `initCharts()` 中大段初始化 `wordCountChart`（L377-L467）
- 模板里**只有 `genreChartRef` 和 `statusChartRef` 两个容器**，没有 `wordCountChartRef`
- `if (wordCountChartRef.value)` 永远为 false → **整段 90 行代码永不执行**

### P2-4 `handleRemoveMusic` 定义未使用（见 P0-1）

### P2-5 `App.vue` 中主题状态硬编码

- `AiView.vue` L132：`const isDark = computed(() => !document.documentElement.classList.contains('light'))`
- 这个 `computed` **没有被任何地方使用**
- 主题切换依赖 DOM class，Vue 无法响应式追踪，切换主题时依赖 `isDark` 的样式不会更新

### P2-6 `ScriptContent.options` 前端有类型无 UI

`ProjectView.vue` L516 定义了 `options?: { text: string; target: number | string }[]`，但**无任何编辑器**。

### P2-7 `AIGeneration` 前端类型有 `style` 字段

`ai.ts` L11 `style: string`，后端 `AIGeneration` 模型**没有该字段**，接口也不返回。

---

## 🔵 P3 体验 / 健壮性问题

### P3-1 图片生成无超时保护（前端）

- 后端通义万相轮询最长 120 秒（`max_wait=120`）
- 前端 `AiView` 只有 `loading` 转圈，**无超时提示**，用户可能以为卡死

### P3-2 `ExportProject` 无场景时直接抛错中断

```js
if (scenes.value.length === 0) {
  throw new Error('该项目下没有场景数据')
}
```
进入 catch 后 `loading=false`，页面只剩错误提示，**没有"返回"按钮**（只有 error 文本）。

### P3-3 `ExportProject` 自动播放定时器未清理

`autoAdvanceDialogue()` 用 `setTimeout` 递归，**组件卸载时未 `clearTimeout`**。
离开页面后若定时器仍在，会触发 `nextDialogue()` 操作已销毁的组件（内存泄漏 + 潜在报错）。

### P3-4 `saveProgress` 只存 localStorage，无后端同步

`ExportProject.vue` L572，「存档」仅存本地浏览器。换设备/清缓存即丢失。文档未要求，但用户预期可能是云端存档。

### P3-5 AI 密钥硬编码在源码中（安全问题）

`back/app/ai/services.py` L17-L30：

```python
DEEPSEEK_API_KEY = "sk-****（已脱敏）"
TONGYI_API_KEY   = "sk-****（已脱敏）"
VOLCENGINE_ACCESS_KEY = "AKLT****（已脱敏）"
VOLCENGINE_SECRET_KEY = "****（已脱敏）"
```

- **全部明文硬编码**，且已进入版本库（如已推送到远端则视为泄露）
- 数据库密码同样明文：`config.py` L12 `mysql+pymysql://root:****@...`

### P3-6 密码找回链路缺失导致用户无法自助恢复（见 P1-7）

### P3-7 `delete_character_with_relations` 中 `db.session.begin()`

`project/services.py` L527：先 `db.session.begin()`，但 Flask-SQLAlchemy 的 session 通常在首次查询时已自动开启事务，**显式 begin 可能抛 `InvalidRequestError`**。该函数被删除角色接口调用，存在隐患。

### P3-8 `add_character_avatar` 的 `is_default` 全局重置

`project/services.py` L606：

```python
db.session.query(CharacterAvatar).filter_by(is_default=True).update({"is_default": False})
```

**没有 `character_id` 条件**，会把**该项目所有角色的所有默认立绘全部清掉**，只保留最新上传的这一张为默认。
相比 `update_character_avatar()`（L679-L681 正确地带了 `character_id` 过滤），这里是明确 Bug —— 属于 🔴 P0 级别，列入此处供交叉参考。

### P3-9 `ScenesManage` 空状态按钮未禁用 loading

L89 `<button class="add-first-btn" @click="handleAddScene">` 缺少 `:disabled="loading"`（其他按钮都有）。

### P3-10 前端未做路由守卫

`ProjectView` / `IndividualView` 等页面无 `beforeEach` 鉴权，仅 `HomeView.onMounted` 和 `LoginView.onMounted` 各自检查 token。直接访问 `/project/1` 不会跳登录。

---

## ✅ 实测发现并已修复（第 1+2+3 批改造期间）

> 以下十一项在**运行时**暴露（非静态分析），均已修复。
> FIX-1、FIX-2 出自第 1 批；FIX-3、FIX-4 出自第 2 批联合回归；
> FIX-5~FIX-9 出自第 3 批本地 SD 落地；FIX-10、FIX-11 出自 3.3 音乐/配音拆分。

### FIX-1 默认模型名硬编码，导致本地 Ollama 被静默绕过

- **位置**：`back/app/ai/views.py` `generate_text()` 参数解析
- **原代码**：`model = data.get('model', 'deepseek-r1:1.5b')`
- **表现**：前端不传 `model` 时，该默认值（第 2 代遗留）被送往 Ollama；本地仅有 `qwen2.5:7b`，Ollama 返回 `404 model not found`，触发 `TEXT_FALLBACK_TO_CLOUD` 降级到 DeepSeek。表面上"能出结果"，实际**本地模型完全没被使用**，且消耗云端额度。
- **修复**：默认模型从配置推导 —— `TEXT_BACKEND=ollama` → `OLLAMA_MODEL`；`deepseek` → `DEEPSEEK_MODEL`（新增配置项，默认 `deepseek-chat`）。
- **验证**：修复后实测 `backend: "ollama"`、`model: "qwen2.5:7b"`。

### FIX-2 缓存层建成但未接入业务路径（缓存形同虚设）

- **位置**：`back/app/ai/services.py` `generate_and_save_text()`
- **表现**：`extensions.py` 提供的 `cache_get/cache_set` 完整可用，但业务函数从未调用。连续两次相同 prompt 会各自推理并各写一条数据库记录。
- **修复**：生成前按 `md5(user_id|model|length|prompt)` 查缓存；命中直接返回并标记 `cached: true`；未命中则推理后写回。TTL 由 `CACHE_TTL` 控制（已由 60s 调整为 3600s）。
- **验证**：第二次同 prompt 请求，worker 耗时从 ~3-5s 降至 **0.0056s**，`generation_id` 复用。

### FIX-3 缓存命中时跳过记忆写入，导致多轮上下文「原地踏步」（🔴 最隐蔽）

- **位置**：`back/app/ai/story.py` `continue_story()`
- **表现**：`stateful=true` 连续调用两轮后，`GET /ai/memory/<session_id>` 返回 `message_count: 0`，会话记忆从未增长；但**任务返回体里的 `memory` 字段却显示 4 条消息**，两者自相矛盾。
- **根因**：`continue_story()` 在命中缓存时**提前 `return`**，跳过了 `remember_turn()`。而返回体中的 `memory` 字段来自**被缓存的结果快照**——该快照写入时包含的是**上一轮**的消息计数，因此显示正常，掩盖了"本轮没有落库"的事实。
- **为什么只有第二次运行才暴露**：首次运行（缓存未命中）路径完整，记忆正常写入；只有**第二次运行命中缓存**时才走提前 return 分支。单元级单独调用永远看不到，必须**两轮连续 + 第二轮命中缓存**才复现。这正是"联合回归测试"相对单模块测试的价值所在。
- **修复**（两处，缺一不可）：
  1. 命中缓存时，若 `stateful=true`，仍执行 `_record_turn_safe(session_id, user_input, ai_output)`，保证记忆推进与缓存无关；
  2. 写入缓存前**剥离 `memory` 字段**（`{k: v for k, v in result.items() if k != 'memory'}`），避免旧快照污染后续读取。
- **验证**：新增回归用例 `缓存命中时记忆仍推进（回归）`，实测消息数 **4 → 6**，稳定通过。

### FIX-4 `submitAndWait` 同步模式返回错误层级

- **位置**：`front/src/api/ai.ts` `submitAndWait()`
- **表现**：同步（Celery 未启用、走同步回退）分支下，调用方读 `info?.backend` 恒为 `undefined`，无法判断本次是走本地 Ollama 还是云端降级。
- **根因**：该分支直接返回了整个响应信封（`{ code, message, data }`），而调用方按「已解包的业务数据」使用，字段层级错位一层。
- **修复**：
  ```typescript
  const anyRes = res as any;
  return (anyRes?.data ?? anyRes) as T;
  ```
  兼容两种返回形态（信封 / 已解包），避免后端调整后再次错位。
- **验证**：`vite build` 通过；前端可正确读到 `backend` / `model` 字段。

### FIX-5 前端传 `model`、服务层读 `model_id`，参数名对不上（🟠 静默走错后端）

- **位置**：`back/app/ai/views.py` `generate_image()` → `services.generate_anime_image()`
- **表现**：请求体带 `{"model": "local"}`，但视图读的是 `data.get('model_id')`，取到 `None`；
  随后落到 `data.get('model', 'hunyuan')` 的旧默认值，服务层拿到 `'hunyuan'` 就去请求云端。
  **本地 SD 永远选不中**，且不报错、不提示，只是默默用云端出图。
- **根因**：两处参数名不一致，且旧代码用 `'hunyuan'` 作为硬编码默认值（与 FIX-1 同一种坏味道）。
- **修复**（两层，缺一不可）：
  1. 视图层 `model_id = data.get('model') or data.get('model_id') or None`，去掉硬编码默认值；
  2. 服务层新增 `_resolve_image_backend()` 做**别名归一化**：
     `local/sd/local_sd/stable-diffusion → local`；`tongyi/hunyuan/wanx/wanx-v1 → tongyi`；
     无法识别时跟随 `IMAGE_BACKEND` 配置。
- **验证**：9 组别名用例全部通过（含 `SD`、`local_sd`、`hunyuan`、未知值）。

### FIX-6 云端模型名污染本地 Ollama（🟠 与 FIX-1 同类，本地模型再次白配）

- **位置**：`front/src/views/AiView.vue` 文本模型下拉 + `back/app/ai/services.py`
- **表现**：前端文本模型下拉只写死了 `{ value: 'deepseek' }`，并把 `model: 'deepseek'`
  原样发给后端；后端在 `TEXT_BACKEND=ollama` 时会把 `'deepseek'` 当成 Ollama 模型名去请求，
  Ollama 返回 404，触发 `TEXT_FALLBACK_TO_CLOUD` 降级到云端。表面上「能出结果」，
  实际**本地 Ollama 从未被使用**。
- **修复**：新增 `_clean_text_model(backend, model)` —— 本地后端时丢弃明显的云端模型名
  （`deepseek` / `deepseek-chat` / `deepseek-r1` / `gpt` / `openai` / `hunyuan` 等），
  交给配置里的 `OLLAMA_MODEL`；云端后端不清洗。
- **验证**：5 组用例通过（`deepseek → None`、`qwen2.5:7b` 保留、cloud 后端不干预）。

### FIX-7 `from_single_file` 默认联网拉配置，离线加载失败（🟡 环境依赖）

- **位置**：`back/app/ai/backends/image_local.py` `_load_pipe()`
- **表现**：只给单个 `.safetensors` 权重时，diffusers 会去远端拉
  `stable-diffusion-v1-5` 的 `model_index.json`，报
  `Error no file named model_index.json found in directory ...`，加载直接失败。
- **修复**：新增 `_resolve_config_dir()`，把 `model_index.json` + `scheduler/text_encoder/tokenizer/unet/vae`
  的配置下到 `back/.models/sd15-config/`，加载时用 `config=` 显式指过去，**完全离线**。
  配置缺失时 `available()` 会给出提示并退回网络模式。
- **验证**：`config_exists=True`，加载耗时 2.7s，无任何网络请求。

### FIX-8 Celery broker 挂掉时 `delay()` 重试 64 秒才失败（🟡 请求长时间挂起）

- **位置**：`back/app/ai/views.py` `_submit_task()`
- **表现**：Redis 未启动时，`task.delay()` 内部要重试约 **64 秒**才抛
  `Retry limit exceeded while trying to reconnect to the Celery result store`，
  期间 HTTP 请求一直挂着。对本地 SD 这种几十秒级的任务更是雪上加霜
  （实测 curl 60s 超时后才看到日志里出现回退）。
- **修复**：新增 `_broker_reachable()`，投递前先用 **1 秒 TCP 探测** broker，
  连不上就直接走同步执行，不再白等 64 秒。
- **验证**：broker 不可达时，请求 1.5 秒内返回（对比修复前 64 秒）。

### FIX-9 debug 的 watchdog 监视到 site-packages，后端莫名崩溃（🔴 极难排查）

- **位置**：`back/manage.py` `app.run(debug=True, ...)`
- **表现**：后端运行中突然消失，请求返回 `HTTP 000`，**日志里没有任何 Python 异常**。
  重启后能用一会儿，又反复消失。一度被误判为「内存不足被系统杀掉」。
- **根因**：`debug=True` 默认开启 reloader，而 Windows 上的 watchdog 会把 **整个 `site-packages`**
  纳入监视（本项目 venv 实际混用了 `D:\conda` 的包）。加载 torch/diffusers 期间这些包内有文件变动，
  就触发 `* Detected change in 'D:\conda\Lib\site-packages\torch\_inductor\config.py', reloading`，
  重载时 socket 被销毁重建失败，抛出：

  ```
  OSError: [WinError 10038] 在一个非套接字上尝试了一个操作。
  ```

  重载失败后服务线程直接死掉，主进程还在，所以表现为「静默崩溃」。

- **修复**：`app.run(..., use_reloader=False)`，并保留 `FLASK_USE_RELOADER=1` 环境变量开关，
  需要热重载时显式开启。
  ```python
  use_reloader = os.environ.get('FLASK_USE_RELOADER', '0') == '1'
  app.run(debug=True, host='127.0.0.1', port=8088, use_reloader=use_reloader)
  ```
- **附带说明**：这个问题与「日志写在 `back/logs/` 里导致每写一行就触发一次重启」是**同一机制**的两种表现。
  日志务必写到项目目录之外（如 `%TEMP%`）。
- **验证**：关闭 reloader 后，后端连续运行稳定，不再出现无异常日志的消失。

---

### FIX-10 火山 TTS 请求体结构错误，配音功能从未真正跑通（🟠 语义 + 结构双重错误）

- **位置**：`back/app/ai/services.py`（原 `generate_music_wav()` + `_poll_volcengine_task()`）
- **表现**：前端点「生成语音」→ 后端返回失败；直接打接口实测得到

  ```json
  HTTP 400
  {"code": 40000000, "message": "add unmapped key app to params store"}
  ```

  日志里还能看到请求体中的 appid 被序列化成了 `2.124834565e+09`。

- **根因（三处叠加）**：

  1. **接口选错**：火山「语音合成」有两个语义完全不同的接口
     - `/api/v1/tts` —— 一次性合成，请求体是嵌套的 `app` / `user` / `audio` / `request` 四段结构，返回 base64 音频
     - `/api/v1/tts_async/submit` —— 长文本**异步**合成，参数是扁平的 `appid` / `token` / `cluster` / `text`，要先 submit 再轮询 query

     原实现把**嵌套结构**的 body 塞给了**异步扁平**接口，服务端直接把 `app` 当成未知参数拒收。
  2. **appid 类型错误**：`appid` 从配置读出来后被当成数字处理，`json.dumps` 序列化成科学计数法
     `2.124834565e+09`，服务端解析失败。必须**强制 `str()`**。
  3. **鉴权头格式**：火山这里用 `Authorization: Bearer;<token>`（**分号**），不是常见的空格。
     写成空格会鉴权失败。

- **修复**：
  ```python
  VOLCENGINE_TTS_SYNC_URL = "https://openspeech.bytedance.com/api/v1/tts"

  headers = {'Authorization': f'Bearer;{token}',   # 分号，不是空格
             'Content-Type': 'application/json'}
  payload = {
      "app": {"appid": str(appid), "token": token, "cluster": "volcano_tts"},
      "user": {"uid": str(user_id)},
      "audio": {"voice_type": voice_type, "encoding": "mp3", ...},
      "request": {"reqid": str(uuid.uuid4()), "text": text,
                  "text_type": "plain", "operation": "query", ...},
  }
  ```
  并删除整段异步轮询代码 `_poll_volcengine_task()`。

- **同时修掉的语义错配**：原 `generate_music_wav()` 名字叫「音乐」，实际跑的是 TTS。
  现拆成两条独立链路（见 `docs/第3批-音乐与配音改造说明.md`）：
  `generate_music()` → 本地 MusicGen 出 BGM；`generate_voice()` → 火山 TTS 出配音。
  旧函数名保留为兼容转调，内部转 `generate_voice()`。

- **验证**：`docs/_src/test_music_voice_paths.py` 15 项通过，其中包含
  「无凭据时明确报错」「appid 序列化后不出现 `e+`」「music 视图不调用 generate_voice」等断言。
  凭据需用户在火山控制台「语音技术 → 语音合成 → 应用管理」自取，填入
  `VOLCENGINE_APPID` / `VOLCENGINE_TTS_TOKEN` 后即可真实合成。

- **教训**：**同名不同义的两个云接口**是最容易踩的坑。看到 `400 add unmapped key` 这类
  「参数没被识别」的报错，先怀疑**接口选错**，再怀疑参数值。

---

### FIX-11 音频落库路径混入反斜杠，前端拼 URL 不可靠（🟡 Windows 特有）

- **位置**：`back/app/ai/services.py` `_save_audio_record()`
- **表现**：`ai_generations.generated_text` 存成了

  ```
  /static/music/4\music_1792329674.wav
  ```

  前半段正斜杠、后半段反斜杠。前端 `BASE_URL + item.generated_text` 拼出来的 URL
  在部分浏览器/代理下拿不到文件，历史记录里的 `<audio>` 直接空白。

- **根因**：`os.path.join('app/static/music/4', 'x.wav')` 在 Windows 上返回
  `app/static/music/4\x.wav`，再 `.replace("app","",1)` 得到
  `/static/music/4\x.wav`。Linux 上跑不会暴露，**只在 Windows 上出现**。

- **修复**：新增 `_static_rel_url()` 统一转换
  ```python
  def _static_rel_url(full_path: str) -> str:
      rel = full_path.replace('\\', '/')
      if rel.startswith('app/'):
          rel = rel[len('app'):]
      return rel
  ```
  `generate_music()` / `generate_voice()` 的 `file` 字段与落库值都走这个函数。

- **历史数据**：库里有 3 条旧记录带反斜杠（id 16 / 26 / 84），已用
  ```sql
  UPDATE ai_generations SET generated_text = REPLACE(generated_text, '\\', '/')
  WHERE generated_text LIKE '%\\%';
  ```
  修正完毕。

- **验证**：`docs/_src/test_music_voice_paths.py` 的「⑤ 落库 URL 分隔符」用例
  对三种输入形态（全正斜杠 / 全反斜杠 / 混合）都断言输出为 `/static/...`。

- **教训**：**任何要拼进 URL 的路径都不该直接用 `os.path.join` 的结果**。
  落库、返回给前端的路径一律先 normalize 成 POSIX 风格。

---

## 附：核实方式说明

以上结论均来自代码阅读（未运行）。若要确认运行时表现，建议按下列顺序实测：

1. **启动后端**：`cd back && python manage.py`（需本地 MySQL `aigc` 库，root/****）
2. **启动前端**：`cd front && npm run dev`
3. **重点验证清单**：
   - [ ] 场景列表拖拽排序后，背景图/音乐是否还在（P0-3）
   - [ ] 场景表单点音乐 X，控制台是否报错（P0-1）
   - [ ] 后端启动是否报路由重复（P0-2）
   - [ ] SceneEdit 点「AI生成」→ 返回文本是否被 `[已过滤]` 污染（P1-6）
   - [ ] 编辑项目改"公开"是否生效（P0-4）
   - [ ] 上传两个角色各一张默认立绘，第一张是否被取消默认（P3-8）
   - [ ] 新建场景上传立绘后，是否只有最后一张保留 default

---

# 第 4 批更新（2026-10-19，运行时实测）

> 已按上表逐项实测。详细证据与修复说明见
> **`docs/第4批-运行时审计与安全加固.md`**；可重复执行的脚本为
> **`docs/_src/test_audit_e2e.py`**（36 项，自建自删数据）。

## 🆕 运行时新发现（静态分析没看到的）

| 编号 | 问题 | 严重度 | 状态 |
|---|---|---|---|
| A-1 | **后端完全不校验 JWT**：只认 `X-User-Id` 头，伪造即可读写他人数据 | 🔴 严重 | ✅ 已修（`app/security.py` 全局守卫） |
| A-2 | **项目资源无归属校验**：换 URL 里的 scene/content/character id 即可横向越权；RAG 三接口同样 | 🔴 严重 | ✅ 已修（project 蓝图 before_request + AI 侧校验） |
| A-3 | `/ai/health` 首次调用在请求线程 import torch/diffusers，冷启动阻塞 30s+ | 🟠 高 | ✅ 已修（后台预热 + 快照） |
| A-4 | 找回密码是纯 UI：点两下直接"成功"，后端无接口 | 🟠 高 | ✅ 已修（后端两接口 + 前端接线） |
| A-5 | 公开项目只能看列表，点进 `/view/:id` 拉不到数据 | 🟠 中 | ✅ 已修（GET + is_public 放行） |
| A-6 | **有分支的项目删不掉**：`branch_paths` 外键 1451 | 🔴 高 | ✅ 已修（先删分支再删对话） |

## 前文条目当前状态

| 编号 | 状态 | 说明 |
|---|---|---|
| P0-1 音乐移除按钮绑错 | ✅ 已修 | 已绑定 `handleRemoveMusic` |
| P0-2 `/characters` 路由重复 | ✅ 已修 | 仅保留一个实现，返回结构统一 |
| P0-3 拖拽排序清空图片/音乐 | ✅ 已修 | 后端局部更新；前端只提交 `order_num` |
| P0-4 编辑项目 `is_public` 失效 | ✅ 已修 | 后端接收并返回完整对象 |
| P0-5 编辑后返回残缺对象 | ✅ 已修 | `project_to_dict()` 统一序列化 |
| P1-1 `template_type` 断链 | ✅ 已修 | 模型/接口/前端全链路，表单补模板下拉 |
| P1-2 AI 模型列表结构不匹配 | ✅ 已修 | 后端结构统一；AI 控制台合并「我的模型」 |
| P1-3 / P1-4 音乐/配音语义错配 | ✅ 已修 | 拆成 `/ai/generate/music` 与 `/voice` |
| P1-5 图片生成返回不完整 | ✅ 已修 | 返回 `file`（已 normalize 为 `/static/...`）与后端 meta |
| P1-6 空违禁词污染文本 | ✅ 已修 | `_sanitize_forbidden_words()` 丢弃空串 |
| P1-7 忘记密码纯摆设 | ✅ 已修 | 见 A-4 |
| P1-8 对话计数兜底脆弱 | ✅ 已修 | 前端改为 `res?.length ?? 0` |
| P2-1 FSM 徽章无 UI | ✅ 已修 | 对话项接入状态下拉 + localStorage 持久化 |
| P2-2 ProjectView 空壳函数 | ✅ 已修 | 删除 23 个未使用空函数 |
| P2-3 字数趋势图无 DOM | ✅ 已修 | 补 `wordCountChartRef` 容器 |
| P2-4 `handleRemoveMusic` 未使用 | ✅ 已修 | 同 P0-1 |
| P2-5 `isDark` 未使用 | ✅ 已修 | 删除 |
| P2-6 `ScriptContent.options` 无 UI | ✅ 已修 | 选择项改为 `_choices` → `branch_paths` 编辑器 |
| P2-7 `AIGeneration.style` 多余字段 | ✅ 已修 | 从类型定义移除 |
| P3-1 图片生成无超时提示 | ⚠️ 部分 | 后端有超时与明确错误；前端无独立倒计时 |
| P3-2 导出页错误无返回按钮 | ✅ 已修 | 错误页补「返回项目列表」 |
| P3-3 自动播放定时器未清理 | ✅ 已修 | 保存 timer id，`onUnmounted` 清理 |
| P3-4 存档仅 localStorage | ❌ 未做 | 设计层面待定（需新增存档表/接口） |
| P3-5 密钥硬编码 | ✅ 已修 | 已迁至 `.env`；`SECRET_KEY` 仍需部署时替换默认值 |
| P3-6 密码找回链路缺失 | ✅ 已修 | 同 P1-7 |
| P3-7 `db.session.begin()` 隐患 | ✅ 已修 | 删除显式 begin |
| P3-8 `is_default` 全局重置 | ✅ 已修 | 带 `character_id` 过滤（实测两张默认只保留一张） |
| P3-9 空状态按钮未禁用 | ✅ 已修 | 补 `:disabled="loading"` |
| P3-10 前端无路由守卫 | ✅ 已修 | `router.beforeEach` + 401 拦截 |

## 回归结果

```text
test_audit_e2e.py          36 通过 / 0 失败
test_batch12_e2e.py        45 通过 / 0 失败 / 2 跳过（Redis 未连接）
test_music_voice_paths.py  16 通过 / 0 失败
test_local_sd_paths.py      6 通过 / 0 失败
npx vite build             通过
```

> 注意：`test_batch12_e2e.py` 已适配归属校验——项目 7 属于 `user_id=1`，
> 脚本改用本地密钥为所有者签发测试令牌，不再依赖他人密码。

---

# 第 5 批更新（2026-10-20，分支节点与样式）

> 详细验证过程见 **`docs/第5批-分支节点与样式修复.md`**。
> 本轮用无头 Chrome 做了**真实点击**验证，不只打接口。

## 分支节点

| 编号 | 问题 | 状态 |
|---|---|---|
| B-1 | `ensureChoices()` 在 `projectId` 赋值前执行，已有分支选项**一个都不显示** | ✅ 已修（先设 projectId 再预加载） |
| B-2 | 保存对话后对象被整体替换，`_choices` 丢失，选项从界面消失 | ✅ 已修（保存时保留 `_choices`） |
| B-3 | 跳转目标只限当前场景，无法跨场景连分支 | ✅ 已修（读 `story_graph` 全项目节点） |
| B-4 | 删除带分支的对话 / 非空场景报 1451，接口 500 | ✅ 已修（分支边 → 对话 → 场景） |
| B-5 | 剧情树切回概览不刷新，看到旧拓扑 | ✅ 已修（watch `activeTab` 自动重拉） |
| B-6 | **播放器完全不读 branch_paths**，配了分支仍线性播放 | ✅ 已修（选项按钮 + 跳转 + 阻止自动前进） |

UI 实测：已有选项回显 2 个、跨场景目标 3 个、点「保存分支」成功写入 2 条。

## 样式 / CSS

| 编号 | 问题 | 状态 |
|---|---|---|
| C-1 | `SceneEdit` 根容器 `width:100vw`，在 tab 内横向溢出 98px | ✅ 已修（改 `100%`） |
| C-2 | 分支目标下拉固定 160px，文案被截断（实际可用 116px） | ✅ 已修（240px + ellipsis） |
| C-3 | 场景背景/音乐/立绘 URL 落库为 `\static\...`，图片/音频加载失败 | ✅ 已修（上传归一化 + 迁移 9 个字段） |
| C-4 | 市场「上传素材」弹窗高 1100px，底部按钮被顶出视口 | ✅ 已修（90vh + body 滚动，footer 可见） |

## 回归

```text
test_audit_e2e.py          36 通过 / 0 失败
npx vite build             通过
CDP 页面体检（1440/1280）   无横向溢出、无坏图、无控制台错误
删除链路                   对话/场景/项目均 200
```

## 仍缺

- 剧情树只读，节点不能拖拽/连线；
- `branch_conditions` 无编辑 UI；
- 剧情图按场景聚合，不是 content-level。

---

# 第 6 批更新（2026-10-20，功能取舍 + 阅读器）

> 取舍与逐项测试见 **`docs/第6批-功能取舍与阅读器体验.md`**。

## 已完成

| 项 | 结果 |
|---|---|
| 阅读器设置（文字速度/自动间隔/BGM 音量/语音音量/全屏） | ✅ 设置面板 + localStorage；逐字显示、点击补全、音量实测通过 |
| 多存档位 + 自动存档 + 云端存档 | ✅ `save_slots` 表 + 4 个接口 + 播放器面板；自动存档/读取/删除/越权全部实测通过 |
| 跳过已读 + 完整回想 | ✅ `read_records` 表 + 3 个接口；跳过已读实测 currentId 9→10，回想跨场景显示 |
| 移动端触控 | ✅ 竖屏提示、上滑回想、下滑隐藏、点按继续；触控目标 40px+，CDP 真实 touch 实测通过 |
| 变量/好感度系统 | ✅ `project_variables` + `content_effects`；项目变量 tab、节点数值变化、状态面板、存档带回变量全部实测通过 |
| 条件分支 | ✅ 条件格式校验、编辑器条件行、播放器按变量过滤；10<50 只显示无条件选项，60>=50 两个都显示 |
| 结局判定与收集 | ✅ `endings` + `ending_unlocks`；结局 tab、播放器结局页、解锁状态、级联删除全部实测通过 |
| 播放器白屏（`ref<any>`） | ✅ 纯 JS 的 `ExportProject.vue` 里 `ref<any>` 运行时抛 `any is not defined`，已改 `ref(null)` |
| 工程快速项 | ✅ SECRET_KEY 默认值告警、图片懒加载、副标题对比度修正；构建与 CDP 检查通过 |
| 播放器根容器类名笔误 | ✅ 模板 `export-project-project-container` → `export-project-container`，根样式恢复生效 |

## 明确不做/暂缓

- CG 图鉴、立绘演出指令、节点级拖拽图、模板中心/素材库/导入导出：暂缓（理由见第 6 批文档）
- 评论/点赞/关注/排行榜/审核/真实支付：不做（平台运营，非当前工具定位）
- `vue-tsc` 类型检查：暂缓

## 待继续

- 工程快速项（SECRET_KEY 告警、图片懒加载、对比度）

---

# 第 7 批更新（2026-10-20，工程化收尾与全量回归）

> 详见 **`docs/第7批-工程化收尾与全量回归.md`**。本批把「遗留工程项」收口：
> 异步链路打通、类型检查清零 + CI、首屏性能达标。

## P0-1 Redis / Celery 异步链路

| 项 | 结果 |
|---|---|
| Redis（6380） | ✅ `cache.connected=true`（Docker 历史阻塞由外部 Redis 绕过） |
| Celery worker | ✅ 已启动（`-P solo --concurrency=1`），`async.enabled=true` |
| 文本接口 | ✅ 返回 `202 + task_id`，轮询 `/ai/task/<id>` → `ready:true` |
| `test_batch12_e2e.py` | ✅ 45/0/**2 跳过** → **49/0/0 跳过** |
| `test_audit_e2e.py` P1-6 | ✅ 改为异步感知断言，回到 36/0（断言真实链路结果） |

> 坑点：**只起 Redis 不起 worker，任务永远 PENDING**，两个进程都要活着。

## P0-2 类型检查 + CI

| 项 | 结果 |
|---|---|
| `vue-tsc`（tsconfig.app.json） | ✅ **75 → 0** 错误 |
| `npm run build` | ✅ exit 0 |
| 顺带修的运行时 Bug | ✅ `updateCharacterAvatar` 裸数字 → `{avatar_id}`（后端读的正是 `avatar_id`） |
| GitHub Actions | ✅ 新增 `.github/workflows/ci.yml`：前端 `npm ci`+`build`；后端最小依赖 + `compileall` 语法门禁 + 离线契约脚本 |

> `back/requirements.txt` 含 `torch/diffusers/faiss` 等重型依赖及本机 `file:///C:/...` 条目，
> CI 装不动，故后端 job 只装导入契约脚本所需的轻量包。

## P0-3 首屏性能

| 项 | 结果 |
|---|---|
| 首屏 JS | ✅ ≈ **1.17MB**（index 75.77KB + element-plus 1090.14KB）< 1.5MB 目标 |
| `echarts` | ✅ 独立 chunk（1038.43KB），仅 HomeView/AiView 加载，**不在首屏** |
| 路由懒加载 / manualChunks | ✅ 已加 |
| 图片 WebP 化 | ✅ logo 1.93MB→28.5KB；登录背景 4.03MB→154.1KB；favicon 1.93MB→19.3KB |

## 回归与清理

```text
vue-tsc                     0 错误
npm run build               exit 0
test_audit_e2e.py           36 / 0（含真实异步链路）
test_batch12_e2e.py         49 / 0 / 0 跳过
test_music_voice_paths.py   16 / 0
test_local_sd_paths.py       6 / 0
```

- 数据清理：`projects` 仅剩 `project_id=7「妄」`（原状态），其余测试表全 0，`users` 仅 4 个既有账号。
- **修掉审计脚本的清理缺口**：`test_audit_e2e.py` 注册的 `audit_other_*` 临时用户此前从不清理，
  现结束时直连数据库（凭据读 `back/.env`）删除。

## 仍缺

- TTS 未真实合成（`VOLCENGINE_APPID` / `VOLCENGINE_TTS_TOKEN` 未配置，`tts.ok=false`；填凭据即通）。

---

# 第 8 批更新（2026-10-20，模板中心 + 素材引用计数 + 导入导出）

> 详见 **`docs/第8批-模板中心与素材引用与导入导出.md`**。
> 落地了第 6 批「明确不做/暂缓」里的**模板中心 / 素材库引用 / 项目导入导出**三项。

## 模板中心

| 项 | 结果 |
|---|---|
| `GET /project/templates` | ✅ 返回 3 个模板（线性叙事 / 分支叙事 / 开放世界），含 `description/features/starter_scenes/recommended_variables` |
| 建项目脚手架 | ✅ 按模板自动铺起始**场景**（分支叙事=2、开放世界=2、线性=1） |
| 脚手架不建对话 | ✅ **只建 `Scene`，绝不建 `ScriptContent`**，保住 `test_audit_e2e.py` 的 `dialogue_count==2` 口径 |
| 前端模板选择 | ✅ 下拉改为**模板卡片**（名称/描述/特性标签 + 选中态） |

## 素材库引用计数

| 项 | 结果 |
|---|---|
| 新表 `resource_references` | ✅ 唯一键 `(resource_id,user_id,project_id)`，同素材同用户同项目只算一次 |
| 列表/搜索/详情带 `reference_count` | ✅ 一条聚合查询批量统计 |
| `POST /user/resources/<id>/reference` | ✅ 幂等（重复引用返回 `already_referenced=true`，计数不叠加） |
| `DELETE /user/resources/<id>/reference` | ✅ 幂等取消 |
| 越权引用他人项目 | ✅ 404（校验项目归属） |
| 删除素材时级联清理 | ✅ 先删引用记录再删素材 |
| 前端 | ✅ 卡片与详情展示「被引用」数；详情新增「引用到项目」对话框（拉项目列表 → 选择 → 引用） |

## 项目导入导出

| 项 | 结果 |
|---|---|
| `GET /project/project/<id>/export?format=json` | ✅ 完整项目包（project/characters/avatars/scenes/script_contents/variables/effects/branches/endings） |
| `GET /project/project/<id>/export?format=txt` | ✅ 纯文本剧本（`《标题》` / `类型` / `# 场景` / `角色：台词` / `（描述）` / `【选择】`） |
| 下载头 | ✅ `Content-Disposition: attachment` + UTF-8 `filename*` |
| `POST /project/project/import` | ✅ 201；按原 ID 映射重建角色/立绘/场景/对话/数值变化/分支/结局，重建后重算字数 |
| 非所有者导出 | ✅ 404 |
| 缺标题的导入 | ✅ 400 |
| 前端 | ✅ 项目卡片「导出」下拉（JSON / TXT）+ 头部「导入项目」按钮（选文件 → 建项目） |

> 关键设计：导出包**顶层不含 `project_id`**，避免被 project 蓝图 `before_request` 的
> `_project_id_from_request()` 误判为既有项目而触发归属校验。

## 回归与清理

```text
vue-tsc                     0 错误
npm run build               exit 0
test_audit_e2e.py           36 / 0
test_batch12_e2e.py         49 / 0 / 0 跳过
test_batch13_e2e.py         31 / 0（本批新增）
```

- 数据清理：`projects` 仅剩 `project_id=7「妄」`；`resource_references` 计数 0。

---

# 第 9 批更新（2026-10-20，CG 图鉴 P1-4）

> 详见 **`docs/第9批-CG图鉴.md`**。
> 落地【P1 产品深度】第 4 项「CG 图鉴」。

## 设计决策

| 项 | 结果 |
|---|---|
| CG 来源 | ✅ 项目内上传图片 **或** 市场「CG」素材引用 |
| 解锁规则 | ✅ 可选绑定一个结局；为空=初始可见，绑定结局=该结局解锁后可见 |
| 是否新增解锁表 | ❌ **不新增**。玩家侧可见性**完全由既有 `ending_unlocks` 推导**，避免两套解锁状态不一致 |
| 防绕过 | ✅ 鉴赏页对**未解锁条目不下发 `image_url`**（返回 `null`），前端用占位图 + 锁呈现 |
| 素材一致性 | ✅ 引用市场素材时同步 `ResourceReference` 引用计数（复用第 8 批机制） |

## 后端

| 项 | 结果 |
|---|---|
| 新表 `project_cgs` | ✅ `title/description/image_url/resource_id/unlock_ending_id/order_num` |
| `GET /project/cgs/<pid>` | ✅ 作者视角，含 `unlocked` 与 `unlock_ending_title` |
| `POST/PUT/DELETE /project/cgs/<pid>[/<cg_id>]` | ✅ 新增 201；改/删支持局部更新 |
| `GET /project/gallery/<pid>` | ✅ 作者本人或公开项目可读，返回 `total/unlocked_count/items` |
| 绑定结局校验 | ✅ 结局必须属于该项目，否则 400 |
| 非 CG 素材引用 | ✅ 400（`只能引用「CG」类型的市场素材`） |
| 删结局 → CG 解绑 | ✅ 退化为「初始可见」；删内容节点连带结局同理 |
| 删项目 | ✅ **先删 `project_cgs` 再删 `endings`**（外键顺序），并清非市场来源图片 |
| 导出/导入 | ✅ 导出带 `cgs` 段与 `endings.ending_id`；导入按 `ending_map` 重映射绑定 |

## 前端

| 项 | 结果 |
|---|---|
| 作者管理 | ✅ `ProjectView.vue` 新增「CG 图鉴」tab + 编辑弹窗（上传本地图 / 从市场选 CG / 解锁条件下拉） |
| 玩家鉴赏 | ✅ `ExportProject.vue` 右上角「CG 鉴赏」入口与图鉴弹窗（未解锁显示占位而非图片） |
| API | ✅ 新增 `front/src/api/cg.ts` |

## 回归与清理

```text
vue-tsc                     0 错误
npx vite build              exit 0
test_batch14_e2e.py         46 / 0（本批新增）
test_audit_e2e.py           36 / 0
test_batch12_e2e.py         49 / 0 / 0 跳过
test_batch13_e2e.py         31 / 0
```

- 数据清理：`projects` 仅剩 `project_id=7「妄」`；`project_cgs / endings / ending_unlocks /
  resource_references / content_effects / save_slots / read_records / project_variables` 均为 0；
  临时用户 `audit_other_cg_*` 已删。

## 仍缺

- 前端作者 tab / 鉴赏弹窗未做 CDP 真机点击体检（仅 `vue-tsc` + 构建 + 接口级）。
- 【P1 产品深度】剩余：第 5 项「节点级剧情图」、第 6 项「演出指令」。

---

# 第 10 批更新（2026-10-20，节点级剧情图 P1-5）

> 详见 **`docs/第10批-节点级剧情图.md`**。
> 落地【P1 产品深度】第 5 项：把「剧情树」从**按场景聚合且只读**升级为
> **content-level 节点 + 拖拽连线 + 条件编辑**。

## 设计决策

| 项 | 结果 |
|---|---|
| 后端改动 | ✅ **零改动**。复用既有 `branch_paths` CRUD/batch 与 `GET /project/story_graph/<pid>`（content-level 节点 + 边 + FSM 校验） |
| 节点粒度 | ✅ 每个 `script_contents` 一个节点（不再按场景聚合），按「场景分列 + 场景内 order_num 排序」自动布局 |
| 拖拽连线 | ✅ 从节点右侧圆点拖到目标节点 = 新建 `branch_paths` 边（`source≠target`、去重在前端拦截） |
| 条件编辑 | ✅ 点连线 → 面板编辑 `choice_text` + `{variable, op, value}`（变量下拉来自项目变量） |
| 保存方式 | ✅ 「保存拓扑」= `POST /project/branches/<pid>/batch (replace=true)` 整树覆盖写回 |
| 节点位置 | ✅ **不新增表**：位置存 `localStorage['aigcn.storyGraph.<pid>']`，仅作者侧视觉元数据 |
| 顺序边 | ✅ 前端镜像后端 `auto_sequence`（无显式出边的节点按自然顺序连虚线），仅展示不可编辑 |
| 语义提示 | ✅ 非「选择」节点的出边会明示「只参与结构校验，播放器不会按它跳转」（播放器只认 `选择` 节点的分支） |

## 前端

| 项 | 结果 |
|---|---|
| 新组件 `StoryGraphEditor.vue` | ✅ content-level 画布：缩放/平移/自动布局/刷新、节点拖拽、连线拖拽、属性面板、条件编辑、覆盖保存 |
| 入口 | ✅ `ProjectView.vue` 剧情树工具栏新增「🧩 节点级编辑」，打开独立弹窗（`destroy-on-close` 保证每次重新拉取） |
| 面板 | ✅ 选中节点显示类型/场景/内容/出边列表；选中连线显示起终点、选项文案、显示条件、删除 |
| 类型检查 | ✅ `vue-tsc` 0 错误，`npm run build` exit 0 |

## 回归与清理

```text
vue-tsc                     0 错误
npm run build               exit 0
test_batch15_e2e.py         42 / 0（本批新增，接口级）
test_audit_e2e.py           36 / 0
test_batch12_e2e.py         49 / 0 / 0 跳过
test_batch13_e2e.py         31 / 0
test_batch14_e2e.py         46 / 0
```

- 数据清理：`projects` 仅剩 `project_id=7「妄」`；`branch_paths / project_variables / endings /
  content_effects / save_slots / read_records / resource_references / project_cgs` 均为 0；
  临时用户 `audit_other_graph_*` 已删。
- 另：`test_batch14_e2e.py` 的「他人项目剧情图」断言改为**自建项目 + 临时他人账号**验证
  （项目 7 现为 `is_public=true`，公开项目他人只读 200 属预期，不再断言 404）。

## 环境备注（端口占位，排查结论）

| 端口 | 占用进程 | 说明 |
|---|---|---|
| 8088 | `D:\conda\envs\aigc\python.exe -m flask run` | 后端在跑；**同时存在 `back\.venv\…\manage.py` 的重复进程**（历史遗留，未抢占 8088，属「双进程单监听」） |
| 5175 | `front\node_modules\…\vite --port 5175` | 本项目前端（本项目专用端口） |
| 5173 | `D:\history-master\front` | **另一个项目**的 vite，勿混用 |
| 8080 | `java -jar target\back-0.0.1-SNAPSHOT.jar` | 另一个 Spring 项目 |
| 8000 / 6380 | wslrelay / docker | Docker Redis（6380）与 Docker 代理 |

> 建议：只保留**一个**后端进程（优先 `back\.venv` 的 `manage.py`），避免两个 Flask
> 争抢 8088 造成 DB 连接落到非预期进程。

## 仍缺

- 节点级编辑器的拖拽连线/条件编辑未做 CDP 真机点击体检（仅接口级 + 构建级）。
- 【P1 产品深度】剩余：第 6 项「演出指令」（立绘位置/表情/淡入淡出、背景转场、音效）。

