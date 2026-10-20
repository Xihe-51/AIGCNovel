# AIGCNovel 项目长期记忆

视觉小说 AIGC 创作系统，前后端分离。目标：按「计划书技术栈」逐步落地（Ollama 本地 / LangChain / RAG / FSM / Redis / Celery / 本地 SD 双轨）。

## 运行与约定（务必遵守）
- **后端入口 `back/manage.py`**（不是 run.py）：`./.venv/Scripts/python.exe manage.py`，端口 **8088**
- `user_id` 从 HTTP 头 **`X-User-Id`** 读取（不是 body）；登录 `/user/login`
  - **第 4 批起必须同时带 `Authorization: Bearer <token>`**，且 token 的 identity 必须等于 `X-User-Id`，
    否则 401/403；白名单见 `back/app/security.py`
- 项目路由前缀 **`/project/projects`**；分支路由 `/project/branches/*`、`/project/story_graph/*`
- 前端：Vue3 + TS + ElementPlus + Vite；**`SceneEdit.vue` 在 `front/src/components/`（不是 views/）**
- 测试账号：`celerytest` / `Test123456`（user_id=4）；MySQL `aigc` 库 root/****（见 back/.env）
- Redis 用 **Docker 容器 `aigc-redis`，映射 6380:6379**（6379 被 sp-redis 占用）
  - db0=缓存 db1=broker db2=result；`CACHE_ENABLED/ASYNC_ENABLED=true`，`CACHE_TTL=3600`
- **Celery on Windows 必须 `-P solo --concurrency=1`**
- 前端验证用 **`npx vite build`**，**不要用 `npm run build`**（`vue-tsc@1.8.27` 的 TS6504 误报，从未通过）

## 硬件约束（硬边界）
- GPU RTX 5060 Laptop 8GB（Blackwell **sm_120**）；内存 **15.8GB 偏紧**（用户明确担心内存爆炸）
- **固定 CPU，不用显卡**（用户实测 Blackwell 跑不动，明确要求）
- 本地 SD 出图期间吃约 **3.8GB**，日常可用只有 4~5GB → `SD_MIN_FREE_RAM_GB=4.5` 守卫阈值
- 降级设计是核心原则：Redis 没装→缓存静默跳过；Celery 未起→同步回退；Ollama 挂→降级云 API；
  RAG/Memory 依赖缺失→返回空结果不抛异常；本地 SD 不可用→明确报错不崩溃

## 降级设计（核心原则）
- Redis 没装 → 缓存静默跳过
- Celery 未起/broker 不可达 → 1 秒 TCP 预检后直接同步回退（**不要等 delay() 的 64 秒重试**）
- Ollama 挂 → 降级云 API
- RAG/Memory 依赖缺失 → 返回空结果不抛异常
- 本地 SD 不可用（权重缺失/内存不足/peft 缺失）→ 返回明确原因，不崩溃、不静默转云端

## 已完成批次
- 第 0+1 批：多后端路由（Ollama/DeepSeek）+ Redis 缓存 + Celery 异步 + `/ai/health`、`/ai/task/<id>`
- 第 2 批：LangChain 上下文记忆 + RAG 人设库（FAISS+Ollama 嵌入）+ FSM 剧情校验 + branch CRUD + 前端接线
- 第 3 批：本地 SD 双轨（CPU）—— Counterfeit-V2.5 fp16 + LCM-LoRA，6 步出图
- **3.3 音乐/配音拆分**：本地 MusicGen-small（CPU）+ 火山 TTS，拆成 `/ai/generate/music` 与 `/ai/generate/voice`
- **第 4 批：运行时审计与安全加固**（`docs/第4批-运行时审计与安全加固.md`）
  - 全局 JWT 校验（`app/security.py`）+ 项目归属校验（project 蓝图 before_request）
  - `/ai/health` 后台预热，冷启动不再阻塞 30s+
  - 找回密码后端两接口 + 前端真实接线
  - 公开项目允许他人 GET 只读预览
  - 路由守卫 / 401 拦截 / 模型下拉合并 / 字数图 / FSM 徽章 / 定时器清理 / 死代码
- 第 1+2 批联合回归：`docs/_src/test_batch12_e2e.py` 45 通过 / 0 失败 / 2 跳过
- 第 3 批验证：`test_local_sd_paths.py` 6 通过、`test_local_sd_e2e.py` 4 通过、`test_music_voice_paths.py` 16 通过
- 第 4 批验证：`docs/_src/test_audit_e2e.py` 36 通过 / 0 失败；`npx vite build` 通过
- **第 5 批：分支节点 + 样式修复**（`docs/第5批-分支节点与样式修复.md`）
  - 分支选项回显/跨场景目标/保存后不丢/删除级联/剧情树自动刷新
  - **播放器接入 `branch_paths`**：选择节点渲染选项按钮、点击跳转目标、阻止自动前进
  - `SceneEdit` 100vw 溢出、目标下拉截断、反斜杠资源路径（9 个字段迁移）、上传弹窗超高
- **第 6 批：功能取舍 + 阅读器体验**（`docs/第6批-功能取舍与阅读器体验.md`）
  - 阅读器设置：逐字速度 / 自动间隔 / BGM 与语音音量 / 全屏，localStorage `aigc:player:settings`
  - 多存档位：`save_slots`（slot=0 自动，1-3 手动）+ `/project/saves/<pid>/<slot>`；播放器面板
  - 跳过已读 + 完整回想：`read_records` 表 + `/project/reads/<pid>`；跨场景回想
  - 移动端触控：上滑回想、下滑隐藏、点按继续、竖屏提示；触控目标 40px+
  - 变量系统：`project_variables` + `content_effects`；项目变量 tab、节点数值变化、播放器状态面板
  - 条件分支：`branch_paths.conditions={variable,op,value}`；编辑器条件行、播放器按变量过滤
  - 结局：`endings` + `ending_unlocks`；项目「结局」tab、播放器结局页、解锁状态
  - 工程快速项：SECRET_KEY 默认值告警、图片懒加载、副标题对比度修正
  - 播放器根容器类名笔误修复（`export-project-project-container` → `export-project-container`）

## 技术坑（高复用价值）
- LangChain 1.4.6：`ConversationSummaryBufferMemory` 在 **`langchain_classic.memory`**
- `messages_from_dict()` **必须传列表** `[dict]`，传单个 dict 抛 TypeError 且被静默吞掉
- **huggingface-hub 必须 <1.0**：装成 1.4.1（被 paddlex 拉来的）会让 transformers 直接 ImportError，
  进而 diffusers 构造不出 pipeline。锁定 `0.36.2`（同时满足 diffusers<2.0 / transformers<1.0 / tokenizers<1.0）
- **LoRA 加载必须要 `peft`**：缺了会抛 `PEFT backend is required`，LCM-LoRA 静默失效 → 退化成 6 步无加速 → 画质崩坏
- `from_single_file()` 单文件权重会**联网拉 SD1.5 默认配置**，必须用 `config=` 指向本地配置目录才能离线
- RAG：FAISS `IndexFlatIP` + L2 归一化（内积=余弦）；嵌入 `nomic-embed-text` 768 维；索引 `back/.rag_index/<pid>/`
- FSM：需 **auto_sequence 顺序边**，否则纯线性剧情全被误报为孤立节点
- **Flask debug 的 watchdog 监视范围极广**（连 `site-packages` 都监视，本项目 venv 混用 `D:\conda`）：
  ① 日志别写在 `back/` 下，每写一行就触发一次重启；日志放 `%TEMP%` 并用 `python -u`
  ② `manage.py` 已设 `use_reloader=False`（`FLASK_USE_RELOADER=1` 可开）。
  **后端起不来/静默消失，先搜日志里的 `Detected change ... reloading`，别先怪内存**
- **参数名不一致是最隐蔽的 bug**：前端 `model` vs 后端 `model_id`（FIX-5）、前端写死 `deepseek` 传给 Ollama（FIX-6）
- **别用 PowerShell 改中文文档**：`Get-Content -Raw | Set-Content -Encoding UTF8` 在本机默认按 GBK 解码，
  会把 UTF-8 中文变成乱码且不可逆（实测把 `Bug清单.md` 写坏，只能按原文重写）。
  改文件一律用 `edit` / `write` 工具
- **"能跑"不等于"安全"**：第 4 批前，后端只读 `X-User-Id` 头、**从不验签 JWT**，改个头就能读写任何人数据。
  现在 `app/security.py` 全局校验，白名单端点见 `PUBLIC_ENDPOINTS`；新增公开接口必须记得加白名单
- **项目资源必须校验归属**：`project` 蓝图用 `before_request` 从路径/请求体推导 project 并比对 owner；
  公开项目只放行 GET，写操作仍 404
- **`/ai/health` 不能在请求线程 import torch/diffusers**：冷启动 30s+，前端一进 AI 页就像卡死。
  已用 `app/ai/health_warmup.py` 后台线程预热 + 快照，未就绪返回 `warming: true`
- **测试脚本不要"借"别人的项目**：`test_batch12_e2e.py` 原来用 4 号账号访问 1 号的项目 7，
  归属校验上线后必然 404；已改为用本地 `SECRET_KEY` 为所有者签发测试令牌（`token_for()`）
- **删除顺序必须是「分支边 → 对话 → 场景/项目」**：`branch_paths` 引用 `script_contents`，
  `script_contents` 又引用 `scenes`；顺序反了就是 1451。对话/场景/项目三处删除都已修
- **分支选项不显示，先查 `projectId` 是否已赋值**：`ensureChoices()` 依赖 `projectId`，
  原来在赋值前调用，`_choices` 被写成空数组；已改为先设 projectId 再 `await` 预加载
- **组件嵌在 tab 里不要用 `100vw`**：父容器 1342px 时 `100vw=1440px`，必溢出 98px；
  `SceneEdit` 已改 `width:100%`
- **落库的静态资源路径必须 POSIX**：场景背景/音乐/立绘也曾是 `\static\...`，
  导致 CSS `url()`/`<img>` 加载失败；上传处已统一 `replace('\\','/')`，
  历史数据用 `docs/_src/fix_paths.py` 修（幂等）
- **弹窗内容过长会把 footer 顶出视口**：市场「上传素材」曾高 1100px，确定按钮在 1000px 窗口外。
  `el-dialog` 默认 teleport 到 body，**scoped `:deep` 选不中**，要用非 scoped 全局样式：
  `max-height:90vh + body overflow-y:auto`
- **存档语义**：`save_slots.slot=0` 自动存档、`1-3` 手动；`state_json` 存
  `{sceneIndex,dialogueIndex,historyDialogues,variables,lastEffectKey,savedAt}`，
  变量运行时值就放在 `variables`（name -> value）
- **变量系统**：`project_variables.name` 是英文 key、`label` 是展示名；
  `content_effects` 用 (content_id, variable_id) 唯一，delta 可正可负；
  删除对话/场景/项目必须按「分支边 → 数值变化 → 已读/存档 → 对话 → 场景 → 变量 → 项目」清理
- **条件分支**：`branch_paths.conditions` 固定格式 `{variable,op,value}`，op 只能是
  `> >= < <= == !=`；创建/更新/批量三条路径都在 `branch_service` 校验；
  变量改名要同步条件里的 variable，删变量要清空引用它的条件
- **纯 JS 的 `<script setup>` 不能写 TS 语法**：`ExportProject.vue` 没有 `lang="ts"`，
  写了 `ref<any>(null)` 会在运行时抛 `any is not defined`，整个播放器白屏且控制台只有一条
  unhandled rejection。排查白屏用 `docs/_src/debug_page.py`（注入 window.onerror 抓错误）
- **`create_app` 里会 `db.create_all()`**（只建缺失表），新增表不用手写迁移；
  但改已有表结构仍需手工 SQL/迁移
- **类名笔误会让整段样式静默失效**：播放器模板 `export-project-project-container` 与
  CSS `.export-project-container` 不一致，根容器 100vw/100vh/overflow 从未生效。
  排查"样式没生效"先核对模板 class 与样式选择器
- **没有视觉能力也能查 UI**：`docs/_src/inspect_ui.py`（坏图/溢出/越界/低对比度/控制台错误）、
  `inspect_flow.py`（真实点击分支编辑器）、`inspect_modals.py`（弹窗高度/footer 可见性）、
  `shot.py`（CDP 截图）；Chrome 需 `--remote-allow-origins=*`，
  token 用 `Page.addScriptToEvaluateOnNewDocument` 注入
- **要拼进 URL 的路径不要直接用 `os.path.join` 结果**：Windows 会混入 `\`，
  落库/返回前必须 normalize 成 POSIX（`_static_rel_url()`，FIX-11）
- **火山 TTS 用 `/api/v1/tts`（一次性）不是 `tts_async/submit`**；`Authorization: Bearer;{token}`（**分号**）；
  `appid` 必须 `str()` 否则被序列化成 `2.12e+09`（FIX-10，该功能此前从未跑通）
- **`snapshot_download` 会拉无用权重**：MusicGen 除 `pytorch_model.bin` 外还有
  `state_dict.bin` / `compression_state_dict.bin`，后两个 transformers 用不了
- **本机有 `HTTP_PROXY=http://127.0.0.1:63801`，连 127.0.0.1 也被代理** →
  跑 E2E/curl 本地服务必须 `NO_PROXY=127.0.0.1,localhost` 或 `curl --noproxy '*'`，
  否则报 `502 upstream connect failed`，**别误判成后端挂了**
- **内存阈值必须按实测 RSS 定**：MusicGen 实测峰值 1.72GB，原定 3.0GB 会误拒能跑的请求，已改 2.5GB

## 关键文档
- `docs/计划书技术栈落地方案.md`（四批方案）
- `docs/第0-1批改造说明.md`、`docs/第2批改造说明.md`、`docs/第3批改造说明.md`
- `docs/第3批-音乐与配音改造说明.md`（3.3 音乐 MusicGen / 配音火山 TTS 拆分）
- `docs/Bug清单.md`（P0~P3 静态清单 + FIX-1~FIX-11 实测修复 + 第 4 批状态更新）
- `docs/第4批-运行时审计与安全加固.md`（鉴权/归属/健康检查/找回密码/前端遗留）
- `docs/第5批-分支节点与样式修复.md`（分支 UI 真实点击 + CSS 溢出/截断/反斜杠路径）
- `docs/第6批-功能取舍与阅读器体验.md`（做/不做清单 + 设置/存档逐项实测）
- `docs/_src/test_audit_e2e.py`（36 项运行时可重复审计，自建自删数据）
- `docs/_src/inspect_ui.py` / `inspect_flow.py` / `inspect_modals.py` / `inspect_settings.py` / `inspect_saves.py` / `inspect_player.py` / `shot.py`（无头 Chrome 页面/分支/弹窗/设置/存档/播放器体检）
- `docs/_src/fix_paths.py`（把库内反斜杠静态路径统一成 POSIX，幂等）
- `docs/系统新增功能整理.md`、`docs/补充文档交叉核对.md`

## 音乐/配音快速参考
- 权重：`back/.models/musicgen-small/`（3.3GB，`pytorch_model.bin` 2.36GB 是唯一能用的）
- 音乐：`/ai/generate/music` `{prompt, duration, model:"local"}` → `music_<ts>.wav` 32kHz **单声道**
- 配音：`/ai/generate/voice` `{text, voice_type}` → `voice_<ts>.mp3`，**需自备 `VOLCENGINE_APPID`/`TTS_TOKEN`**
- 实测：5 秒音频 ≈ 16s 出（**3.2 倍实时**），加载 4.1s，RSS 峰值 1.72GB，`MUSIC_MIN_FREE_RAM_GB=2.5`
- 模型许可 **CC-BY-NC 4.0 仅限非商用**
- 前端：`AiView.vue` 4 个 tab；`VoiceGenerator.vue`=音乐（粉），`VoiceSynthesizer.vue`=配音（蓝）

## 本地 SD 快速参考
- 权重：`back/.models/{Counterfeit-V2.5_fp16.safetensors, lcm-lora-sdv1-5.safetensors, sd15-config/}`
- 启用：前端「AI 创作」选「本地 SD（CPU，较慢）」，或 `.env` 设 `IMAGE_BACKEND=local`
- 实测：512×512 / 6 步 / bf16 → 加载 2.7s + 推理 16.9s，RSS 峰值 4.3GB
- 速度上限就是硬件，优化只能降步数（4 步）或降分辨率（384×384）
- **最大障碍是内存**：机器日常可用仅 2~4GB，阈值 4.5GB。出图前先跑
  `cd back && ./.venv/Scripts/python.exe ../docs/_src/check_memory.py` 看谁在占内存
