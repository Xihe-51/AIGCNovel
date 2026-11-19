<div align="center">
  <img src="front/public/logo.jpg" width="128" alt="AIGCNovel logo" />

  <h1>AIGCNovel</h1>

  <p><strong>AI 驱动的视觉小说创作与发行平台</strong><br />
  从一段小说文本，到可玩、可发布、可统计的互动叙事作品</p>

  <p>
    <a href="https://github.com/Xihe-51/AIGCNovel/actions/workflows/ci.yml"><img src="https://github.com/Xihe-51/AIGCNovel/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <img src="https://img.shields.io/badge/Vue-3.3-42b883?logo=vue.js&logoColor=white" alt="Vue 3" />
    <img src="https://img.shields.io/badge/Flask-3-000000?logo=flask&logoColor=white" alt="Flask" />
    <img src="https://img.shields.io/badge/MySQL-8-4479A1?logo=mysql&logoColor=white" alt="MySQL 8" />
    <img src="https://img.shields.io/badge/TypeScript-5.2-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  </p>
</div>

***

## 这是什么

AIGCNovel 是一个面向\*\*中文视觉小说（Galgame）\*\*的一体化创作平台。它把「写剧本 → 配素材 → 调演出 → 试玩校验 → 发布上架」串成一条流水线，核心是把叙事内容当成结构化数据（IR）来管理，而不是堆一堆图片和文本文件。

平台由两部分组成：

- **创作端**：场景编辑器、剧情图、变量与条件系统、立绘舞台、素材库、AI 生成、版本与发布。

- **运行时**：一个可独立打包的播放器，支持存档、分支、成就、图鉴、多语言、多周目继承，也能导出成纯静态网页离线运行。

当你把一份小说或剧本丢进「导入小说」，后端会先解析成 AST，跑一轮静态诊断（未定义标签、自环分支、资源路径可疑、未绑定角色……），确认无误后再一次性写库，并把源文本、诊断结果和 source map 一起存档，方便回溯。

## 主要能力

### 创作端

| 模块    | 能力                                                              |
| ----- | --------------------------------------------------------------- |
| 项目管理  | 新建/复制/删除项目、封面、标签、搜索、统计看板、整体导出                                   |
| 场景编辑  | 对白/旁白/选项节点、演出指令、效果、条件、场景锁、快捷键、撤销重做                              |
| 立绘舞台  | 拖拽摆位、图层顺序、尺寸缩放、表情与服装差分、轻动态立绘、抠图上传                               |
| 剧情结构  | 剧情图编辑器（节点/连线/手势）、章节管理、分支路径、变量系统、术语表                             |
| 角色系统  | 角色卡、立绘组（差分）、批量配音、音色导演                                           |
| 导入小说  | 小说/剧本 → AST → 诊断报告 → 一次性落库（章节/场景/节点/角色/分支）                      |
| AI 助手 | 文本续写与生成、图像生成（通义 / 本地 SD）、配乐（火山 / MusicGen）、TTS 配音、RAG 人设检索、会话记忆 |
| 质量工具  | 剧情巡检、全分支自动试玩与回归、覆盖率、条件调试器、试玩埋点与数据报告                             |
| 发布运营  | 版本快照与回滚、发布向导、公开更新日志、静态网页导出、玩家存档                                 |

### 播放器运行时

- 打字机文本、历史回顾、自动/快进、语音与 BGM/音效混音（淡入 + 语音闪避）

- 变量与条件求值、分支跳转、标签跳转、章节快捷跳转、路线图鉴

- 存档槽位、继续游戏、已读记录、成就、CG 图鉴、结局收集

- 多语言界面（简体中文 / 繁体中文 / English / 日本語）

- 多周目继承（变量 `persist` + 玩家 `project_meta`）

- 键盘、手柄、触屏操作，内置调试面板

- 静态导出包：`npm run build:player` 产出 `dist-player/`，相对路径 + 本地适配层，解压到任意目录即可离线打开

## 技术栈

| 层      | 选型                                                                           |
| ------ | ---------------------------------------------------------------------------- |
| 前端     | Vue 3 + TypeScript + Vite 4 + Vue Router 4 + Element Plus + ECharts + Vitest |
| 后端     | Flask 3 + Flask-SQLAlchemy + Flask-JWT-Extended + Flask-Cors                 |
| 存储     | MySQL 8（`utf8mb4`）、Redis（缓存与 Celery broker，可选）                               |
| 异步     | Celery（`ASYNC_ENABLED=false` 时自动同步回退）                                        |
| 生成式 AI | Ollama（本地文本）/ DeepSeek（云端文本）、通义万相 / 本地 Stable Diffusion、火山引擎 TTS / MusicGen  |
| 上下文    | LangChain 会话记忆 + FAISS 向量库（角色人设检索）                                           |

## 目录结构

```
AIGCNovel/
├── back/                          # Flask 后端（约 1.6 万行 Python）
│   ├── app/
│   │   ├── ai/                    # 文本/图像/配乐/配音生成、RAG、会话记忆
│   │   ├── project/               # 项目、场景、剧本、变量、分支、发布…
│   │   │   └── story_compiler/    # 小说/剧本编译器：parser → report → compiler
│   │   ├── user/                  # 登录注册、个人中心、素材市场
│   │   ├── models.py              # 30 余张表的 ORM 模型
│   │   ├── security.py            # 统一 JWT 鉴权（白名单以外的接口必须带令牌）
│   │   └── extensions.py          # Redis 缓存层，不可用时自动降级
│   ├── tests/                     # 后端单测
│   ├── manage.py                  # 启动入口（127.0.0.1:8088）
│   └── config.py                  # 统一配置层，全部读 .env
├── front/                         # Vue 3 + Vite 前端
│   ├── src/views/                 # 登录 / 首页 / 创作 / 项目 / 播放器 / 市场
│   ├── src/components/            # 场景编辑器、播放器、各类面板对话框
│   ├── src/composables/           # 纯逻辑层（大量单测覆盖）
│   ├── src/utils/playerI18n/      # 四语言文案
│   ├── player.html                # 静态发布包的独立入口
│   └── vite.player.config.ts      # 播放器专用构建配置
├── docs/_src/                     # 端到端脚本、巡检脚本与设计资料
└── .github/workflows/ci.yml       # CI 门禁
```

## 快速开始

### 环境要求

| 依赖      | 版本                   | 说明              |
| ------- | -------------------- | --------------- |
| Python  | 3.11+（开发环境实测 3.13.9） | 后端              |
| Node.js | 18+（开发环境实测 20.x）     | 前端              |
| MySQL   | 8.x                  | 必须              |
| Redis   | 7.x                  | 可选，缺失时缓存与异步自动降级 |
| Ollama  | 可选                   | 本地文本生成与向量嵌入     |

### 1. 启动后端

```powershell
cd back
python -m venv .venv
.\.venv\Scripts\activate

# 最小可用依赖（不含本地大模型推理栈）
pip install flask flask-sqlalchemy flask-cors flask-jwt-extended flask-migrate `
  pymysql python-dotenv redis celery requests pillow psutil langchain `
  langchain-community langchain-ollama faiss-cpu pytest

copy .env.example .env
# 打开 .env，至少填写 DB_USER / DB_PASSWORD / SECRET_KEY
```

建好数据库：

```sql
CREATE DATABASE aigc DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

启动：

```powershell
.\.venv\Scripts\python.exe manage.py
# 服务地址 http://127.0.0.1:8088
```

服务启动时会自动执行 `db.create_all()` 补齐**缺失的表**；但它**不会修改已有表结构**，所以升级后新增的列需要手工 `ALTER TABLE`。

> 默认关闭热重载（`watchdog` 会监视整个 `site-packages`，加载 torch 时误触发重载会直接 crash）。改完 Python 代码请手动重启，或临时设置 `FLASK_USE_RELOADER=1`。

### 2. 启动前端

```powershell
cd front
npm install
npm run dev
# http://localhost:5174（5173 常被其它服务占用，因此 strictPort 固定在 5174）
```

首次进入 `/login` 注册一个账号即可开始创建项目。

> 后端地址硬编码在 `front/src/utils/request.ts` 的 `BASE_URL`（默认 `http://127.0.0.1:8088`）。后端换地址或端口时记得同步修改。

### 3. 可选：Redis 与异步任务

`back/.env` 里保持 `CACHE_ENABLED=false`、`ASYNC_ENABLED=false` 时系统完全可用（用于本机开发）：

- 缓存不可用会打日志 `[cache] Redis 不可达，已降级为无缓存`，并在响应里跳过缓存命中；

- broker 不可用时 AI 任务走同步回退，接口仍能返回结果。

想开启的话：

```powershell
docker run -d --name aigc-redis -p 6380:6379 --restart unless-stopped redis:7-alpine
```

然后把 `.env` 中 `CACHE_ENABLED` / `ASYNC_ENABLED` 置为 `true`，并运行 `back/start_worker.bat` 启动 Celery worker。

### 4. 可选：本地生成式 AI

- **文本**：安装 [Ollama](https://ollama.com/)，`ollama pull qwen2.5:7b`，`TEXT_BACKEND=ollama`。

- **人设检索**：`ollama pull nomic-embed-text`，`RAG_ENABLED=true`。

- **本地出图**：把 SD1.5 权重放到 `back/.models/`（`Counterfeit-V2.5_fp16.safetensors` + `lcm-lora-sdv1-5.safetensors`），`IMAGE_BACKEND=local`。默认 CPU 推理并带可用内存守卫（低于阈值直接拒绝加载）。

- **本地配乐**：`MUSIC_BACKEND=musicgen`，权重放 `back/.models/musicgen-small`。

- 云端后端（DeepSeek / 通义 / 火山）在 `.env` 填对应密钥即可，留空则不启用。

权重与 `*.safetensors` 不入库（见 `.gitignore`），需要自行下载。

## 剧本语法

「导入小说」支持两种输入：**纯小说文本** 和 **带演出指令的剧本**。纯文本不含 `@` 指令时，按标题/场景/对白/旁白解析，行为与早期版本一致。

```text
# 第一章 雨夜
## 场景：旧公寓

@bg /static/bg/rain-night.jpg
@bgm /static/bgm/suspense.mp3

【旁白】雨点砸在生锈的窗框上。
林瑶：「你终于来了。」
@show 林瑶 28

@label 分歧
@choice
- 相信她 -> 信任线
- 转身离开 -> 离开线

#信任线
林瑶：「……谢谢。」
@jump 收尾
```

| 语法                               | 含义                     |
| -------------------------------- | ---------------------- |
| `# 标题`                           | 章节                     |
| `## 标题`（`###`/`####` 同理）         | 场景                     |
| `第N章` / `第N场` / `场景：xxx`         | 中文章节与场景标题              |
| `姓名：「台词」` / `姓名：“台词”` / `姓名：台词`  | 角色对白                   |
| `【旁白】内容` / `旁白：内容`               | 旁白                     |
| `@bg <路径>`                       | 背景图（建议以 `/` 开头的资源路径）   |
| `@bgm <路径>` / `@sound <路径>`      | 背景音乐 / 音效              |
| `@show 角色名 [立绘id]` / `@hide 角色名` | 立绘显示 / 隐藏              |
| `@wait <毫秒>`                     | 停顿                     |
| `@label 标签名` / `#标签名`            | 定义跳转标签                 |
| `@jump 标签名`                      | 跳转                     |
| `@choice` + `- 选项 -> 标签`         | 分支选项（支持 `->` `→` `=>`） |

解析后会产出三级 AST（章节 → 场景 → 节点）和诊断列表：

| 诊断码                           | 级别      | 含义                                              |
| ----------------------------- | ------- | ----------------------------------------------- |
| `unresolved_label`            | error   | `@jump` / 选项指向了不存在的标签                           |
| `self_loop_branch`            | warning | 分支目标与起点是同一节点，已被忽略                               |
| `directive_asset_suspect`     | warning | `@bg`/`@bgm`/`@sound` 的值不像资源路径（不含 `/`），播放时会加载失败 |
| `unbound_character`           | warning | 对白说话人不在项目角色表中                                   |
| `directive_unbound_character` | warning | `@show`/`@hide` 引用的角色不存在，指令被跳过                  |
| `too_many_directives`         | warning | 单节点立绘图层数超上限                                     |
| `avatar_not_found`            | warning | 指定的立绘 id 不存在，已回退默认立绘                            |

预览接口不会写库，确认诊断无误后再点「写入」，编译结果会连同源文本与诊断一起存进 `project_sources`。

## 测试与质量门禁

```powershell
# 后端单测（在 back/ 目录下执行）
cd back
.\.venv\Scripts\python.exe -m pytest tests -q

# 前端
cd front
npm run type-check     # vue-tsc 类型检查
npm run test:run       # Vitest 全量单测
npm run verify         # type-check + test:run
npm run build          # 生产构建
npm run build:player   # 播放器静态发布包（dist-player/）
```

`docs/_src/` 下的 E2E 脚本（`test_batch12_e2e.py` \~ `test_batch16_e2e.py`、`test_audit_e2e.py` 等）会真实写入 MySQL 并调用 AI 服务，依赖本地全量环境，因此**不在 CI 中运行**，请在开发机上手动执行；其中 `test_music_voice_paths.py` 是离线契约脚本，CI 会跑。

## 持续集成

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) 做的是最小回归门禁：

- **frontend**：`npm ci` → `npm run build`（类型检查 + 生产构建）

- **backend**：`python -m compileall` 全量语法门禁 → `test_music_voice_paths.py` 离线路径契约

需要 MySQL / Redis / Ollama / 大模型权重的端到端用例不进入 CI。

## 补充说明

- `back/requirements.txt` 是开发机的完整环境快照，其中少数条目是 `@ file:///C:/...` 形式的 conda 本地构建路径，**换机器直接** **`pip install -r`** **会失败**，请按上面的最小依赖清单安装，或先删掉这些行。

- `huggingface-hub` 必须 `<1.0`，否则 `transformers` 直接 `ImportError`，本地 SD 整体不可用。

- 上传与生成的素材（`back/app/static/*`）、模型权重、`.env` 均被忽略，克隆后是干净的空环境。

