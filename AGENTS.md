# AGENTS.md

## 0. Purpose

This file gives coding agents durable project guidance for this repository.

Use it as the first source of truth before editing code. Keep changes small, safe, and verifiable. Prefer targeted patches over broad rewrites.

This project is a local/private full-stack 3DGS digital twin Mini Editor and runtime platform.

The repository is a monorepo with these formal app/package boundaries:

```text
apps/web          # Vue + Vite + PlayCanvas frontend
apps/api          # Node.js backend skeleton
packages/shared   # Shared constants, schemas, and API contracts
```

---

## 1. Agent Operating Rules

Before changing code:

1. Identify the exact task scope.
2. Read the relevant files before editing.
3. Prefer the smallest safe change.
4. Do not modify unrelated files.
5. Do not rewrite initialization, state management, or rendering systems unless the task explicitly asks for it.
6. Preserve existing working behavior while adding new behavior.
7. If a requested change is risky, add a feature flag or isolated adapter instead of replacing the current path.

During implementation:

1. Keep runtime state in the existing managers.
2. Do not create a second source of truth in Vue state.
3. Keep helper entities isolated and easy to delete.
4. Log important state changes with clear prefixes.
5. Avoid hidden side effects in app startup.

After implementation:

1. Run the requested validation commands when available.
2. Report each command result.
3. If a command fails, report the failed command, file, key error, and whether it is related to the current change.
4. Do not claim a check passed if it was not run.

---

## 2. Repository Map

Expected structure:

```text
playcanvas-3dgs-digital-twin
├─ apps
│  ├─ web
│  │  ├─ public/assets
│  │  ├─ src/components
│  │  ├─ src/runtime
│  │  ├─ src/engine
│  │  ├─ src/editor
│  │  ├─ src/api
│  │  ├─ src/config
│  │  ├─ src/App.vue
│  │  └─ src/main.js
│  └─ api
│     └─ src
├─ packages
│  └─ shared
│     └─ src
├─ docs
├─ scripts
├─ package.json
└─ pnpm-workspace.yaml
```

Rules:

- `apps/web` is the frontend app entry.
- `apps/api` is the backend app entry.
- `packages/shared` is for shared constants, schemas, and API contracts.
- Do not put backend code inside `apps/web/src`.
- Do not put PlayCanvas runtime code inside `apps/api`.
- Do not revive old root-level frontend copies such as root `src`, `public`, `index.html`, or `vite.config.js`.

---

## 3. Hard Safety Invariants

These must not be broken:

1. `base.sog` loading.
2. Local `.sog` loading with `filename`.
3. GLB / BIM loading.
4. The 中间视口 canvas layout.
5. 左侧层级 and 右侧属性 synchronization.
6. `SceneObjectManager` as the scene object source of truth.
7. `SelectionManager` as the selection source of truth.
8. Transform edits update both PlayCanvas entities and serialized scene object state.
9. Existing picking / Pick Marker behavior.
10. Existing 3DGS video projection behavior unless the task explicitly asks to change it.

Do not cause these regressions:

1. ROOT unexpectedly empty because initialization was changed.
2. 资源列表 unexpectedly empty because asset configuration was changed.
3. 右侧属性 showing `No selection` during an active edit flow that should preserve selection.
4. `cameraDevice` video projection broken by unrelated UI or backend work.
5. Helper entities registered as real business scene objects.

---

## 4. Frontend Rules: apps/web

`apps/web` is a Vue + Vite + PlayCanvas app.

Responsibilities:

- Vue controls layout and UI.
- PlayCanvas controls rendering and 3D runtime.
- `SceneObjectManager` controls scene object state.
- `SelectionManager` controls selected object state.

Rules:

- Do not bury PlayCanvas runtime logic inside Vue templates.
- Do not create duplicate scene object state in Vue.
- Do not rewrite `createMiniEditorRuntime.js` initialization for unrelated feature work.
- The internal main editor camera may exist, but do not register it as a normal scene object unless explicitly requested.
- Helper entities should not appear in 左侧层级 unless explicitly requested.
- Helper entity names must use clear prefixes such as:
  - `__quad_projection_`
  - `__debug_`
  - `__helper_`
- When deleting helpers, only delete entities with the exact helper prefix.

---

## 5. PlayCanvas / 3DGS Rules

For `.sog` assets, always pass `filename`.

Correct:

```js
const asset = new pc.Asset('base.sog', 'gsplat', {
  url: '/assets/base.sog',
  filename: 'base.sog'
});
```

For local selected `.sog` files:

```js
const asset = new pc.Asset(file.name, 'gsplat', {
  url: blobUrl,
  filename: file.name,
  size: file.size
});
```

Rules:

- Do not omit `filename`.
- Do not revoke blob URLs before loading completes.
- Report loading, success, and failure clearly.
- Converted SOG failure must not destroy the current working map.
- 3DGS is the visual layer, not the precise picking/collision layer.
- Use BIM / GLB / proxy geometry for serious interaction when available.

---

## 6. 3DGS Video Projection Rules

The project uses shader-based 3DGS video projection.

Preserve this path unless explicitly requested otherwise:

- `HTMLVideoElement`
- `pc.Texture`
- `texture.setSource(video)`
- `texture.upload()` when `video.readyState` is valid
- PlayCanvas `gsplatModifyPS` shader chunk
- Restore the original shader chunk in `destroy()`

Do not replace shader projection with video mesh / plane / quad surface unless the task explicitly asks for that approach.

Known projection modes:

```text
cameraFrustum
  Uses cameraDevice transform as projector pose.

quad
  Uses four selected world points and world-position / plane-distance logic.

quadOverlay
  Projects four selected world points to screen space and covers matching fragments.
  Ignores depth / plane tolerance for full visible-area coverage.
```

Rules:

- Do not remove `cameraFrustum` when adding `quad` or `quadOverlay`.
- Do not rewrite video creation for a projection-mode change.
- Do not rewrite shader chunk installation for a projection-mode change.
- `opacity`, `softEdge`, `flipY`, and cover/replace mode must remain compatible across projection modes where applicable.
- During quad editing, viewport clicks add quad points first and must not clear the selected `cameraDevice`.

---

## 7. Scene Object / Entity Rules

Every scene object must have a stable `id`.

Do not use `displayName` as identity.

Serializable scene object example:

```json
{
  "id": "object_001",
  "type": "gsplat",
  "displayName": "base.sog",
  "visible": true,
  "transform": {
    "position": [0, 0, 0],
    "rotation": [0, 0, 0],
    "scale": [1, 1, 1]
  },
  "metadata": {
    "url": "/assets/base.sog",
    "sourceName": "base.sog"
  }
}
```

Rules:

- Rename only changes display fields, not source file paths.
- Visibility changes must affect the real PlayCanvas entity.
- Transform changes must affect serializable state and the real entity.
- Deleting a scene object must not delete physical asset files unless explicitly requested.
- Temporary helpers should not be registered into `SceneObjectManager`.

---

## 8. UI Rules

Use these Chinese UI names consistently in user-facing text:

```text
Hierarchy = 层级
Inspector = 属性
Assets = 资源
Logs = 日志
Viewport = 视口
Toolbar = 工具栏
Context Menu = 右键菜单
Scene Object = 场景对象
SceneObjectManager = 场景对象管理器
SelectionManager = 选择管理器
```

Preferred phrasing:

```text
左侧层级
右侧属性
底部资源 / 日志
中间视口
顶部工具栏
对象右键菜单
```

Avoid mixed wording such as:

```text
Hierarchy 面板
Inspector 面板
Assets 面板
Logs 面板
```

UI cleanup rules:

- Do not expose debug buttons in production UI unless explicitly requested.
- Do not auto-create test scene objects unless explicitly requested.
- Do not show test assets such as temporary GLB/SOG entries unless explicitly requested.
- Do not show internal source bytes, debug status labels, or API test buttons in clean UI mode.
- Keep underlying runtime APIs even when hiding debug buttons.

---

## 9. Picking Rules

During normal editing:

- Use proxy geometry when available.
- Use existing fallback picking / Pick Marker only when needed.
- Do not rewrite picking unless the task explicitly asks for it.

During quad point editing:

1. Viewport click should add a quad point first.
2. Do not trigger normal object selection.
3. Do not clear current selection.
4. Do not make 右侧属性 become `No selection`.
5. Store points in the selected object metadata, not in a global array.

---

## 10. Backend Rules: apps/api

Backend work is allowed only when explicitly scoped.

Preferred direction:

- Node.js + NestJS preferred.
- Express / Fastify acceptable for very small skeletons or prototypes.

Early backend work may include:

- `GET /health`
- `GET /api/health`
- `GET /api/version`
- basic scenes API skeleton
- basic assets API skeleton
- basic entities API skeleton

Do not introduce these unless explicitly requested:

- PostgreSQL
- Prisma / TypeORM
- Redis
- MinIO
- MQTT
- WebSocket
- auth
- file upload
- camera streaming
- Docker deployment

API rules:

- Return structured JSON.
- Use stable IDs.
- Do not use `displayName` as an ID.
- Keep static scene configuration separate from realtime state.
- Frontend must still load local `base.sog` when backend is offline.

Recommended response shape:

```json
{
  "ok": true,
  "data": {},
  "error": null
}
```

Error shape:

```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "SCENE_NOT_FOUND",
    "message": "Scene not found"
  }
}
```

---

## 11. Shared Package Rules: packages/shared

Use `packages/shared` for:

- scene object types
- asset types
- API version constants
- request / response schemas
- future TypeScript types
- future validation schemas

Rules:

- If frontend and backend both need a constant or schema, place it in `packages/shared`.
- Do not duplicate scene object type strings across apps.
- Shared contracts must remain serializable and runtime-agnostic.
- JavaScript is acceptable at the current stage.
- Do not force TypeScript migration unless explicitly requested.

---

## 12. Error Handling and Logging

Every async operation should provide:

- loading state
- success state
- error state
- useful console logs

Preferred log style:

```js
console.log('[API] health check ok');
console.warn('[API] health check failed:', error);
console.error('[MiniEditor] SOG load failed:', error);
```

Rules:

- Do not hide real errors behind generic `failed`.
- Backend health check failures must not break the viewer.
- Converted asset failure must not destroy the current working map.
- Logs should be useful but not spammy.

---

## 13. Code Style Rules

These rules apply to new and modified code. Match existing local style first. If a file has an established pattern, follow that file.

### 13.1 Naming

Use clear, stable names that describe intent.

JavaScript / Vue:

- Use `camelCase` for variables, functions, methods, and local constants.
- Use `PascalCase` for classes, constructors, Vue components, and manager/controller classes.
- Use `UPPER_SNAKE_CASE` only for true global constants.
- Use boolean prefixes for booleans:
  - `isEnabled`
  - `hasSelection`
  - `canApply`
  - `shouldRender`
- Use event handler names that start with `handle`:
  - `handleSelectObject`
  - `handleApplyProjection`
  - `handleViewportClick`
- Use runtime API names that are action-oriented:
  - `enableCameraVideoProjection`
  - `disableCameraVideoProjection`
  - `updateCameraVideoProjection`
  - `startQuadVideoProjectionEditing`

Avoid vague names:

```js
// Bad
data
info
item
obj
temp
foo
bar
doStuff()
handleClick()
```

Prefer specific names:

```js
// Good
sceneObject
selectedObjectId
quadPoints
projectorEntity
videoProjectionConfig
handleProjectionModeChange()
```

### 13.2 File Naming

Use existing project conventions.

Preferred patterns:

```text
Manager classes:      SceneObjectManager.js
Controller classes:   PickingController.js
Adapters:             GsplatMp4ProjectorAdapter.js
Runtime factories:    createMiniEditorRuntime.js
Vue components:       InspectorPanel.vue
Config files:         uiFlags.js / projectionConfig.js
```

Do not create duplicate near-identical files such as:

```text
GsplatProjectorNew.js
GsplatProjectorFinal.js
GsplatProjectorFixed.js
Runtime2.js
InspectorPanelOld.vue
```

If replacing an implementation, update the existing file carefully or create a clearly named adapter with a specific purpose.

### 13.3 Function Design

Functions should do one thing and have clear inputs and outputs.

Rules:

- Prefer small functions over long multi-purpose functions.
- Avoid hidden global state changes.
- Do not mutate unrelated objects inside helper functions.
- Return `true` / `false` for command-style runtime operations when useful.
- Return structured objects for complex results.

Good:

```js
function getVideoProjectionConfig(sceneObject) {
  return sceneObject?.metadata?.videoProjection ?? null;
}

function canApplyQuadProjection(config) {
  return Array.isArray(config?.quadPoints) && config.quadPoints.length === 4;
}
```

Avoid:

```js
function updateEverything() {
  // changes selection, scene objects, UI state, shader, assets, logs
}
```

### 13.4 Comments

Comments should explain why, not repeat what the code already says.

Good comments:

```js
// SOG material may be created asynchronously, so retry installation in update().
if (!this._tryInstallShaderChunk()) {
  return;
}
```

```js
// During quad editing, viewport clicks must not clear selection.
event.preventDefault();
```

Bad comments:

```js
// increment i
i++;

// set enabled to true
enabled = true;
```

Required comments:

- Add a short comment before non-obvious PlayCanvas / shader work.
- Add a short comment when preserving a safety invariant.
- Add a short comment for feature flags and temporary compatibility paths.
- Add a TODO only when it includes an owner or next loop direction.

TODO format:

```js
// TODO(video-projection): replace screen-space overlay with calibrated projection in a later loop.
```

Do not leave vague TODOs:

```js
// TODO fix later
// TODO improve
```

### 13.5 Error Handling

Rules:

- Do not swallow errors silently.
- Use `console.warn` for recoverable issues.
- Use `console.error` for real failures.
- Include a clear prefix.
- Include enough context to debug.

Good:

```js
console.warn('[VideoProjection] enable failed: selected object is not cameraDevice', {
  objectId,
  type: sceneObject?.type
});
```

Bad:

```js
console.log('failed');
```

Do not throw inside UI event handlers for recoverable user actions. Log and return `false`.

### 13.6 Runtime API Rules

Runtime methods exposed to Vue or `window` should be stable and explicit.

Rules:

- Do not rename public runtime APIs unless explicitly requested.
- Add new APIs instead of changing old API meaning.
- Keep runtime APIs framework-agnostic. They should not depend on Vue component internals.
- Runtime APIs should validate object IDs and object types.
- Runtime APIs should write important state back to `SceneObjectManager` metadata.

Preferred pattern:

```js
function updateCameraVideoProjection(objectId, patch = {}) {
  const sceneObject = sceneObjectManager.getObject(objectId);

  if (!isCameraDevice(sceneObject)) {
    log('[VideoProjection] update failed: selected object is not cameraDevice');
    return false;
  }

  const nextConfig = {
    ...getDefaultVideoProjectionConfig(),
    ...sceneObject.metadata?.videoProjection,
    ...patch
  };

  sceneObjectManager.patchMetadata(objectId, {
    videoProjection: nextConfig
  });

  activeProjector?.applyConfig(nextConfig);
  return true;
}
```

### 13.7 State Mutation Rules

Scene object state must be changed through managers.

Do not directly mutate deep state from Vue templates or random helpers unless the existing manager API explicitly allows it.

Avoid:

```js
selectedObject.metadata.videoProjection.enabled = true;
```

Prefer:

```js
sceneObjectManager.patchMetadata(objectId, {
  videoProjection: nextVideoProjection
});
```

If no manager method exists, add a small manager method instead of spreading direct mutations across the codebase.

### 13.8 Vue Component Rules

Vue components should be thin UI layers.

Rules:

- Keep business logic in runtime/controllers/managers.
- Keep Vue methods focused on reading UI input and calling runtime APIs.
- Do not create PlayCanvas entities inside Vue components.
- Do not store scene object copies in component-local state.
- Use computed values for derived UI state such as button disabled status.

Good:

```js
const canApplyQuadProjection = computed(() => {
  return selectedVideoProjection.value?.quadPoints?.length === 4;
});
```

Avoid:

```js
// Vue component directly creates PlayCanvas mesh, mutates scene object,
// changes shader chunk, and updates selection.
```

### 13.9 Shader Code Rules

Shader code must be isolated, reversible, and well-commented.

Rules:

- Keep shader chunks in one adapter/projector file unless there is a strong reason to split.
- Always save the original shader chunk before replacing it.
- Always restore the original shader chunk in `destroy()`.
- Guard against material not being ready.
- Do not install the same shader chunk repeatedly every frame.
- Do not mix unrelated projection modes without a clear `uProjectionMode` branch.
- Keep uniform names stable and explicit:
  - `uProjectionMode`
  - `uMainInvViewProj`
  - `uProjectorViewProj`
  - `uQuadP0`
  - `uQuadScreenP0`
  - `uOpacity`
  - `uSoftEdge`
  - `uFlipY`

Avoid magic mode numbers in JS. Define constants:

```js
const PROJECTION_MODE = {
  CAMERA_FRUSTUM: 0,
  QUAD: 1,
  QUAD_OVERLAY: 2
};
```

### 13.10 Async and Lifecycle Rules

Rules:

- Clean up event listeners, video elements, textures, materials, and helper entities in `destroy()`.
- Do not assume SOG material exists during startup.
- Do not assume video autoplay succeeds.
- Do not assume backend is online.
- Do not start duplicate intervals, animation loops, or event listeners.

When adding listeners:

```js
window.addEventListener('keydown', this._handleKeyDown);
```

Always remove them:

```js
window.removeEventListener('keydown', this._handleKeyDown);
```

### 13.11 Code Prohibitions

Do not add:

```js
setTimeout(() => {
  // fix initialization race
}, 1000);
```

unless there is no better lifecycle hook and the reason is documented.

Do not use:

```js
Math.random()
```

for persistent IDs. Use a stable ID helper.

Do not use:

```js
innerHTML
```

for user-controlled content.

Do not add large dependencies for small utilities.

Do not use global variables for feature state unless explicitly intended as a debug flag.

Do not commit commented-out old implementations.

Do not introduce formatting-only rewrites in files unrelated to the task.

Do not rename many files or symbols in the same loop as a feature change.

### 13.12 Formatting

Follow existing formatting in the touched file.

Default preferences when no local style is clear:

- 2 spaces for indentation.
- Semicolons are acceptable; match the file.
- Single quotes for JS strings if the file already uses them.
- Keep lines readable; avoid deeply nested ternaries.
- Prefer early returns over deeply nested `if` blocks.

Example:

```js
if (!sceneObject) {
  log('[SceneObject] not found:', objectId);
  return false;
}

if (!sceneObject.entity) {
  log('[SceneObject] missing entity:', objectId);
  return false;
}
```

### 13.13 Dependency Rules

Before adding a dependency:

1. Check whether the project already has a utility for it.
2. Prefer platform APIs or small local helpers.
3. Explain why the dependency is needed.
4. Do not add heavy libraries for one function.

Do not add dependencies for:

- simple debounce/throttle
- UUID if a local ID helper already exists
- date formatting for logs
- simple vector math already handled by PlayCanvas

### 13.14 Security and Privacy Rules

This is a local/private project, but still follow basic safety rules:

- Do not hardcode secrets.
- Do not commit tokens, passwords, cookies, or private endpoints.
- Do not log sensitive user data.
- Do not expose arbitrary file-system paths to frontend UI unless explicitly needed.
- Backend APIs must validate input even in skeleton form.

### 13.15 Testability Rules

Write code that can be validated manually and, later, automatically.

Rules:

- Keep pure helpers pure when possible.
- Separate data normalization from UI events.
- Separate shader config preparation from shader installation.
- Keep ID generation and metadata patching predictable.
- Make feature flags explicit.

Useful pure helpers:

```js
normalizeVideoProjectionConfig(config)
canApplyQuadProjection(config)
toVec3Array(value)
createStableSceneObjectId(prefix)
```

---

## 14. Validation Commands

Use the smallest validation set that matches the change.

Frontend changes:

```bash
pnpm build:web
```

Backend changes:

```bash
pnpm build:api
```

Full-stack or shared-contract changes:

```bash
pnpm build:web
pnpm build:api
pnpm build
```

When running locally, useful dev checks may include:

```bash
pnpm dev:web
pnpm dev:api
```

Report every command that was run.

If a command is not available, inspect `package.json` and report the actual available scripts instead of inventing commands.

---

## 15. Windows / Encoding Rules

When using Windows PowerShell, use UTF-8 setup:

```powershell
chcp 65001
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$env:PYTHONUTF8 = "1"
```

Rules:

- Source files must remain UTF-8.
- UI text may be Chinese.
- Terminal logs should prefer English.
- Never copy terminal mojibake into source files.
- If Chinese output is garbled, stop and re-read files with UTF-8 before editing.

---

## 16. Loop Engineering Rules

Each loop should clearly state:

1. Scope.
2. Files likely affected.
3. What not to do.
4. Runtime/API changes.
5. UI changes.
6. Validation commands.
7. Expected final output.

Good loop titles:

```text
恢复 GsplatVideoProjector 并实现 3DGS 四点区域视频投影 MVP
清理编辑器调试 UI 和默认测试对象
新增 apps/api health check，并在前端显示 API 状态
将 scene object type constants 移入 packages/shared
```

Avoid vague titles:

```text
优化全栈项目
完善后端
整理架构
继续开发
```

---

## 17. Output Format for Coding Tasks

When finishing a coding task, report:

```text
一、实现内容
说明实现了什么，以及保留了什么既有能力。

二、修改文件
列出新增和修改文件。

三、核心逻辑
说明关键数据流、状态同步、运行时逻辑和安全边界。

四、验证结果
说明运行了哪些命令，每条是否通过。
如果失败，说明失败命令、失败文件、关键错误、是否与本轮修改相关。

五、遗留问题
说明明确未做的内容和后续 loop 建议。
```

---

## 18. When to Update This File

Update this file when:

- The agent repeats the same mistake.
- A code review gives recurring feedback.
- A new architectural invariant is introduced.
- A new validation command becomes standard.
- A directory needs more specific local instructions.

Keep this file practical. Add rules that prevent real mistakes. Remove vague or outdated rules.