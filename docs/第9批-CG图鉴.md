# 第 9 批：CG 图鉴（P1-4）

> 日期：2026-10-20
> 范围：后端 `back/app/models.py`、新增 `back/app/project/cg_views.py`、
> `back/app/project/services.py`、`back/app/project/ending_views.py`；
> 前端新增 `front/src/api/cg.ts`、改 `front/src/views/ProjectView.vue` 与
> `front/src/views/ExportProject.vue`；新增回归脚本 `docs/_src/test_batch14_e2e.py`。
> 目标：落地【P1 产品深度】第 4 项「CG 图鉴」。

***

## 1. 设计决策

- **数据来源**：作者为作品登记的 CG，图片可以来自「项目内上传」或「市场『CG』素材引用」。

- **解锁规则**：CG 可**可选绑定一个结局**（`unlock_ending_id`）。

  - 为空 → **初始可见**（开局即可看）。

  - 绑定结局 → 当前用户在**该结局被解锁后**才在鉴赏页可见。

- **不新增解锁表**：玩家侧可见性**完全由既有的** **`ending_unlocks`** **推导**。

  - 好处：不会出现「CG 解锁」与「结局解锁」两套状态不一致的问题；也无需额外的记忆/回放机制。

- **防绕过**：鉴赏页对**未解锁条目不下发** **`image_url`**（返回 `null`），前端用占位图 + 锁呈现，
  避免直接改前端就能拿到原图。

- **素材一致性**：引用市场素材时同步 `ResourceReference` 引用计数（复用第 8 批机制）。

***

## 2. 后端

### 2.1 数据模型

新增 `back/app/models.py::ProjectCG`（新表由 `db.create_all()` 自动创建）：

| 列                  | 说明                                     |
| ------------------ | -------------------------------------- |
| `cg_id`            | 主键                                     |
| `project_id`       | 所属项目 FK `projects`                     |
| `title`            | 标题（必填）                                 |
| `description`      | 说明                                     |
| `image_url`        | 图片地址（必填；项目静态目录 或 市场素材 `file_url`）      |
| `resource_id`      | 可选，来源市场「CG」素材时记录 FK `market_resources` |
| `unlock_ending_id` | 可选，绑定结局 FK `endings`；为空=初始可见           |
| `order_num`        | 排序                                     |
| `created_at`       | 时间                                     |

### 2.2 路由（`back/app/project/cg_views.py`，注册于 `app/project/__init__.py`）

| 方法     | 路径                                  | 说明                                                   |
| ------ | ----------------------------------- | ---------------------------------------------------- |
| GET    | `/project/cgs/<project_id>`         | 作者视角：项目全部 CG（含 `unlocked` 标记与 `unlock_ending_title`） |
| POST   | `/project/cgs/<project_id>`         | 新增（201）                                              |
| PUT    | `/project/cgs/<project_id>/<cg_id>` | 修改（标题/说明/图片/绑定结局/排序，均支持局部更新）                         |
| DELETE | `/project/cgs/<project_id>/<cg_id>` | 删除                                                   |
| GET    | `/project/gallery/<project_id>`     | 鉴赏页：作者本人或公开项目可读                                      |

关键校验/逻辑：

- `_validate_ending_id`：绑定的结局**必须属于该项目**，否则 400。

- `_resolve_image`：优先市场素材（必须存在且 `resource_type == 'CG'`，否则 `只能引用「CG」类型的市场素材`）；
  否则要求非空 `image_url`（否则 `请上传 CG 图片或选择市场素材`）。

- `_sync_reference`：引用计数幂等 add/remove；remove 时若同项目已无其它 CG 使用该素材才删引用行。

- `gallery` 返回 `{project_id, title, total, unlocked_count, items}`；未解锁条目的 `image_url` 置 `null`。

### 2.3 级联 / 一致性

| 场景              | 处理                                                                                            | 位置                                          |
| --------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 删除结局            | 绑定的 CG **解绑为「初始可见」**（删 `EndingUnlock` 前先 `update unlock_ending_id=None`）                      | `ending_views.py::delete_ending`            |
| 删除内容节点（连带建过的结局） | 同上，把受影响 CG 的 `unlock_ending_id` 置空                                                            | `services.py::_delete_endings_for_contents` |
| 删除项目            | **先删** **`project_cgs`** **再删** **`endings`**（外键依赖顺序），并清理非市场来源的 CG 图片文件                       | `services.py::delete_project`               |
| 导出包             | `endings` 增加 `ending_id`，新增 `cgs` 段（`title/description/image_url/unlock_ending_id/order_num`） | `services.py::build_project_bundle`         |
| 导入包             | 导入结局时建 `ending_map`（旧→新 id），再按 `cgs` 重建并按 map 重映射 `unlock_ending_id`（未匹配则 `None`）             | `services.py::import_project_bundle`        |

***

## 3. 前端

### 3.1 API

新增 `front/src/api/cg.ts`：`ProjectCG / CGPayload / GalleryItem / GalleryData` 接口 +
`listCGs / createCG / updateCG / deleteCG / getGallery`。

### 3.2 作者管理（`front/src/views/ProjectView.vue`）

- 新增「CG 图鉴」tab（在「结局」与「场景编辑」之间），表格列：预览缩略图 / 标题 / 解锁条件 / 说明 / 操作。

- 编辑弹窗：标题、图片选择（**上传本地图片** 或 **从市场选 CG**）、说明、解锁条件下拉（可空=初始可见）。

- 上传复用 `/project/scenes/upload`（`file_type='image'`）→ `data.url`。

- 市场 CG 素材选择弹窗：`searchResources` 拉取「CG」类型素材，选中后带出 `file_url`。

### 3.3 玩家鉴赏（`front/src/views/ExportProject.vue`，纯 JS `<script setup>`）

- 右上角新增「CG 鉴赏」入口按钮（`Picture` 图标）。

- 图鉴弹窗：头部「已解锁 X / Y」；网格展示，**未解锁显示「未解锁」占位而非图片**，说明区展示解锁条件。

***

## 4. 回归与清理

```text
vue-tsc                     0 错误
npx vite build              exit 0
test_batch14_e2e.py         46 / 0（本批新增）
test_audit_e2e.py           36 / 0
test_batch12_e2e.py         49 / 0 / 0 跳过
test_batch13_e2e.py         31 / 0
```

`test_batch14_e2e.py` 覆盖：登记校验（缺标题/缺图片/绑他人结局/引用非 CG 素材均被拒）
→ 作者 CRUD（新增/列表/改名换图/排序/删除）→ 解锁语义（初始可见 vs 绑定结局）
→ 鉴赏页（总数/已解锁数/未解锁不下发 `image_url`）→ 结局解锁后鉴赏页即时可见
→ 素材引用计数 +1/还原 → 权限（他人读私有项目 404、公开项目他人可读鉴赏页且按各自解锁状态判定、越权写 404）
→ 级联（删结局后 CG 退化为初始可见、删项目不残留）。

数据清理：`projects` 仅剩 `project_id=7「妄」`；`project_cgs / endings / ending_unlocks /
resource_references / content_effects / save_slots / read_records / project_variables` 计数均为 0；
临时用户 `audit_other_cg_*` 已删除；`market_resources` 仅剩 3 条 2025-07-14 的历史种子数据。

***

## 5. 仍缺 / 下一步

- 前端作者 tab 与鉴赏弹窗仅做了 `vue-tsc` + 构建 + 接口级验证，尚未做 CDP 真机点击体检。

- 【P1 产品深度】剩余：第 5 项「节点级剧情图」、第 6 项「演出指令」。

