# AGENTS.md

## 1. Project Identity

This project is a local/private full-stack 3DGS digital twin platform.

It is no longer just a standalone PlayCanvas viewer. The product direction is a browser-based digital twin Mini Editor and runtime platform built around:

* 3DGS `.sog` maps as the visual base layer
* BIM / GLB proxy geometry for interaction and structure
* Scene objects managed through frontend editor state
* Backend APIs for future persistence, assets, entities, and realtime integration

The current repository is a monorepo and should be treated as one product with distinct frontend, backend, and shared-contract boundaries.

---

## 2. Current Development Stage

The project has entered a full-stack monorepo stage.

Current status:

* `apps/web` is the active frontend app
* `apps/api` is the active backend skeleton
* `packages/shared` is the shared constants / schema / contract package

Backend development is now allowed.

However:

* backend work must still be incremental
* frontend viewer/editor stability still matters
* database, auth, upload, websocket, mqtt, and deployment infrastructure must only be introduced when a task explicitly asks for them

Do not assume the next step must be a large architecture rewrite.

---

## 3. Monorepo Structure

Recommended repository structure:

```text
playcanvas-3dgs-digital-twin
├─ apps
│  ├─ web
│  │  ├─ public
│  │  │  └─ assets
│  │  ├─ src
│  │  │  ├─ components
│  │  │  ├─ runtime
│  │  │  ├─ engine
│  │  │  ├─ editor
│  │  │  ├─ api
│  │  │  ├─ config
│  │  │  ├─ App.vue
│  │  │  └─ main.js
│  │  ├─ package.json
│  │  └─ vite.config.js
│  └─ api
│     ├─ src
│     │  ├─ modules
│     │  │  ├─ health
│     │  │  ├─ scenes
│     │  │  ├─ assets
│     │  │  ├─ entities
│     │  │  ├─ devices
│     │  │  ├─ robots
│     │  │  ├─ cameras
│     │  │  ├─ routes
│     │  │  └─ realtime
│     │  ├─ main.js
│     │  └─ app.module.js
│     └─ package.json
├─ packages
│  └─ shared
│     ├─ src
│     │  ├─ scene.js
│     │  ├─ assets.js
│     │  ├─ entities.js
│     │  ├─ api.js
│     │  └─ constants.js
│     └─ package.json
├─ docs
├─ scripts
├─ package.json
├─ pnpm-workspace.yaml
└─ README.md
```

Rules:

* `apps/web` is the only formal frontend app entry
* `apps/api` is the only formal backend app entry
* `packages/shared` is the place for shared contracts and constants
* Do not keep working from old root-level frontend copies such as `src`, `public`, `index.html`, or `vite.config.js`
* Do not put backend code inside `apps/web/src`
* Do not put PlayCanvas runtime code inside `apps/api`

If the repository has not been fully migrated yet, migrate gradually and do not break current `apps/web` functionality while restructuring.

---

## 4. Frontend App Rules: apps/web

`apps/web` is the Vue + Vite + PlayCanvas frontend.

Responsibilities:

* Vue controls UI
* PlayCanvas controls the 3D runtime
* `SceneObjectManager` controls scene object state
* `SelectionManager` controls selection state

Required frontend guarantees:

* `base.sog` loading must not break
* local `.sog` loading must pass `filename`
* GLB / BIM loading must not break
* the canvas must fill only the 中间视口
* 左侧层级 and 右侧属性 must remain synchronized
* transform editing must update both the PlayCanvas entity and `SceneObjectManager`

Do not move backend logic into Vue components.

Do not create a second source of truth for scene objects inside Vue state.

---

## 5. Backend App Rules: apps/api

`apps/api` is the backend application.

Preferred backend direction:

* Node.js + NestJS preferred
* Express / Fastify acceptable only for very small skeletons or prototypes

Early backend work may include:

* `GET /health`
* `GET /api/health`
* `GET /api/version`
* basic scenes API skeleton
* basic assets API skeleton
* basic entities API skeleton

Do not introduce these by default unless the task explicitly asks for them:

* PostgreSQL
* Prisma / TypeORM
* Redis
* MinIO
* MQTT
* WebSocket
* auth
* file upload
* camera streaming
* Docker deployment

Suggested module layout:

```text
apps/api/src/modules
├─ health
├─ scenes
├─ assets
├─ entities
├─ devices
├─ robots
├─ cameras
├─ routes
└─ realtime
```

Backend rules:

* APIs must return structured JSON
* use stable IDs
* do not use `displayName` as an ID
* do not mix static scene configuration with realtime state
* do not return random internal implementation fields as external contract

---

## 6. Shared Package Rules: packages/shared

`packages/shared` is for shared constants, schemas, and future API contracts.

Use it for:

* scene object types
* asset types
* API version constants
* request / response schemas
* future TypeScript types
* future validation schemas

JavaScript is still acceptable at the current stage.

Do not force a TypeScript migration just to create shared code.

Example:

```js
export const API_VERSION = '0.1.0';

export const SCENE_OBJECT_TYPES = {
  GSPLAT: 'gsplat',
  BIM_PROXY: 'bim-proxy',
  GLB: 'glb',
  MODEL: 'model',
  MARKER: 'marker',
  CAMERA: 'camera',
  DEBUG: 'debug'
};
```

Rules:

* if both frontend and backend need a constant or schema, place it in `packages/shared`
* do not duplicate scene object type strings across multiple apps
* shared contracts must remain serializable and runtime-agnostic

---

## 7. UI Naming Rules

Use these Chinese UI names consistently in user-facing requirements and implementation notes:

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

Code identifiers may remain English.

---

## 8. Core Architecture Principle

Always separate these layers:

```text
Visual Layer
- 3DGS `.sog` map
- High realism
- Visual base map

Interaction Layer
- BIM / GLB proxy mesh
- Raycast mesh
- Collision mesh
- Ground picking plane

Entity Layer
- Buildings
- Roads
- Cameras
- Robots
- Devices
- Markers
- Annotations

Editor State Layer
- SceneObjectManager
- SelectionManager
- Visibility
- Rename
- Delete
- Transform

Backend Layer
- REST APIs
- persistence
- asset records
- realtime integration later
```

Important principles:

* 3DGS is the visual layer
* BIM / GLB / proxy geometry is the interaction layer
* Vue is the UI shell
* PlayCanvas is the 3D runtime
* backend handles persistence and API boundaries
* database, when added later, stores durable records, not PlayCanvas runtime objects

---

## 9. Scene Object / Entity Rules

`SceneObjectManager` is the frontend scene object state source.

`SelectionManager` is the frontend selection source.

Rules:

* every scene object must have a stable `id`
* do not use `displayName` as identity
* rename only changes display fields, not source file paths
* visibility changes must affect the real PlayCanvas entity
* transform changes must affect both serializable state and the real entity
* deleting a scene object must not delete physical asset files unless explicitly requested

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

---

## 10. PlayCanvas / 3DGS Rules

Preserve existing PlayCanvas and `.sog` rules.

For `.sog` loading, always pass `filename`.

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

* do not break `base.sog` loading
* do not omit `filename`
* do not revoke blob URLs before loading completes
* report loading, success, and failure clearly
* converted SOG failure must not destroy the current working map
* GLB / BIM loading must continue to work

3DGS is not the main collision or precise picking layer. Use proxy geometry for serious interaction.

---

## 11. Vue UI Rules

Vue is the UI shell.

Vue should control:

* layout
* 顶部工具栏
* 左侧层级
* 右侧属性
* 底部资源 / 日志
* 右键菜单

PlayCanvas should control:

* app initialization
* canvas rendering
* 3DGS loading
* GLB / BIM loading
* camera
* marker
* picking
* runtime entities

Rules:

* do not bury PlayCanvas runtime logic inside Vue templates
* do not create duplicate scene object state in Vue
* canvas must fill only the 中间视口
* inspector and hierarchy must remain synchronized through managers

---

## 12. Backend API Rules

Backend APIs should be introduced incrementally.

Early endpoints may include:

* `GET /health`
* `GET /api/health`
* `GET /api/version`
* scene API skeleton
* asset API skeleton
* entity API skeleton

Rules:

* use structured JSON responses
* keep responses explicit and versionable
* use stable IDs everywhere
* separate static scene data from realtime data
* health check failures must not block the frontend viewer

---

## 13. API Contract Rules

Frontend and backend must agree on stable API shapes.

Recommended success response:

```json
{
  "ok": true,
  "data": {},
  "error": null
}
```

Recommended error response:

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

Rules:

* do not let frontend depend on random backend internal fields
* keep API contract serializable
* API offline state should only affect logs / status
* frontend must still load local `base.sog` without backend

---

## 14. Persistence Strategy

Persistence strategy at the current stage:

* local scene object state lives in frontend managers now
* scene JSON export/import is optional and may be deferred
* backend API skeleton may exist before real persistence
* database persistence comes later when explicitly requested

Do not assume:

* the next required step is Scene JSON
* adding backend automatically means adding a database

---

## 15. Realtime Strategy

Realtime is a later-stage concern.

Possible future realtime domains:

* robot position
* device status
* camera status
* route updates
* alarms

Rules:

* realtime state must be separate from static scene configuration
* do not introduce WebSocket or MQTT unless a task explicitly asks for them
* frontend must tolerate backend offline or missing realtime infrastructure

---

## 16. Asset Strategy

Frontend local asset phase:

* `apps/web/public/assets` stores local `.sog`, `.glb`, and related assets
* local-selected files may use blob URLs
* converted assets may live under `apps/web/public/assets/converted`

Backend asset phase later:

* uploaded files may move to local storage, MinIO, or S3
* asset metadata may move to backend records

Rules:

* keep original files and converted files separate
* do not eagerly load all large assets
* do not delete physical asset files when deleting scene objects unless explicitly requested

---

## 17. Error Handling Rules

Every async operation should provide:

* loading state
* success state
* error state
* useful console logs

Preferred log style:

```js
console.log('[API] health check ok');
console.warn('[API] health check failed:', error);
console.error('[MiniEditor] SOG load failed:', error);
```

Rules:

* do not hide real errors behind generic `failed`
* health check failure should not break the viewer
* backend errors should remain visible in logs

---

## 18. Testing / Verification Rules

Frontend-related changes should verify at least:

* `pnpm dev:web`
* `pnpm build:web`
* `base.sog` still loads
* GLB / BIM loading still works
* 左侧层级 and 右侧属性 still work
* transform editing still works

Backend-related changes should verify at least:

* `pnpm dev:api`
* `GET /health`
* `GET /api/health`
* `GET /api/version`

Frontend/backend integration changes should verify at least:

* `pnpm dev:web`
* `pnpm dev:api`
* frontend can request `/api/health`
* API offline does not break the viewer

If using root workspace commands, report clearly which app passed or failed:

* `pnpm build`
* `pnpm dev`

---

## 19. Encoding and Terminal Rules

When using Windows PowerShell, use UTF-8 setup:

```powershell
chcp 65001
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$env:PYTHONUTF8 = "1"
```

Rules:

* terminal logs should prefer English
* UI text may remain Chinese
* never copy terminal mojibake into source files
* source files must remain UTF-8

If you see garbled Chinese output, stop and re-read files with UTF-8 before editing.

---

## 20. Loop Engineering Rules

Supported loop types:

* Frontend-only loop
* Backend-only loop
* Shared-contract loop
* Full-stack integration loop
* Monorepo infrastructure loop

Each loop should clearly state:

* scope
* files likely affected
* what not to do
* validation commands
* expected output

Good loop titles:

```text
建立 monorepo 工程结构与最小 API Skeleton
新增 apps/api health check，并在前端显示 API 状态
实现 scenes API skeleton，但不接数据库
将 scene object type constants 移入 packages/shared
修复 apps/web Vite proxy 到 apps/api
```

Avoid vague titles:

```text
优化全栈项目
完善后端
整理架构
继续开发
```

---

## 21. Development Style

Development style for this stage:

* make small, safe, runnable changes
* preserve existing viewer/editor behavior
* do not break `base.sog` loading
* do not rewrite PlayCanvas runtime for backend work
* backend development is now allowed
* backend changes must still be incremental and explicitly scoped

Do not introduce these unless the task explicitly asks for them:

* database
* auth
* file upload
* websocket
* mqtt
* deployment infrastructure

This repository is now a monorepo full-stack project, but it should still evolve in careful, testable steps.
