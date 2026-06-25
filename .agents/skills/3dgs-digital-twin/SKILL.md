---

name: 3dgs-digital-twin
description: Use this skill when developing a full-stack PlayCanvas Engine based 3DGS digital twin platform with Vue Mini Editor frontend, SOG maps, BIM / GLB proxy meshes, scene object management, backend APIs, asset management, scene persistence, realtime robot/camera/device data, WebSocket/MQTT integration, and future database deployment.
-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

# 3DGS Digital Twin Full-Stack Skill

## 1. Expert Role

Act as a senior full-stack digital twin platform engineer with strong experience in:

* PlayCanvas Engine
* WebGL / WebGPU concepts
* 3DGS / Gaussian Splatting
* `.sog`, `.ply`, `.glb`, `.gltf`, `.obj` asset loading
* Browser-based 3D scene editors
* Vue-based editor UI architecture
* Vite frontend architecture
* Scene object management
* Digital twin systems
* Node.js / NestJS backend architecture
* REST API design
* WebSocket realtime systems
* MQTT / IoT integration
* PostgreSQL / PostGIS spatial data architecture
* Redis realtime state and cache
* MinIO / S3 / local file storage
* Docker Compose local deployment
* Full-stack debugging and frontend/backend integration

The project should evolve from a local PlayCanvas 3DGS viewer into a private full-stack digital twin Mini Editor and, later, a realtime operation platform.

The immediate goal is not to build everything at once. The immediate goal is to keep the current working editor stable while progressively adding backend APIs, persistence, assets, realtime state, and database integration.

---

## 2. Current Project Context

The current project is a Vite + Vue + JavaScript + PlayCanvas Engine frontend.

The project already supports or is expected to support:

* Loading a local 3DGS `.sog` map.
* Loading local `.sog` files selected by the user.
* Loading converted `.sog` files.
* Loading BIM / GLB models as proxy or structure layers.
* Adding GLB model objects.
* Basic camera controls.
* Marker / fallback picking.
* BIM alignment.
* Generic Transform editing for scene objects.
* Mini Editor UI layout.
* Vue UI shell.
* Scene object management.
* Selection management.
* Left-side 层级.
* Right-side 属性.
* Object visibility.
* Object rename.
* Object delete.
* Context menu.
* Future backend APIs for scene, assets, objects, devices, cameras, robots, routes, and realtime state.

The default base map is:

```text
public/assets/base.sog
```

Preserve the ability to load `base.sog` unless the user explicitly asks to remove or replace it.

Backend development is now allowed when the user asks for backend, API, database, persistence, realtime, file upload, or full-stack integration work.

Do not silently add backend complexity inside a frontend-only loop. If the loop is frontend-only, keep it frontend-only. If the loop is backend/full-stack, define the API boundary and verify both frontend and backend.

---

## 3. Recommended Repository Architecture

The preferred direction is a monorepo:

```text
playcanvas-3dgs-digital-twin
├─ apps
│  ├─ web
│  │  ├─ src
│  │  ├─ public
│  │  ├─ package.json
│  │  └─ vite.config.js
│  └─ api
│     ├─ src
│     ├─ package.json
│     └─ ...
├─ packages
│  └─ shared
│     ├─ src
│     ├─ package.json
│     └─ ...
├─ docker
├─ scripts
├─ docs
├─ docker-compose.yml
├─ package.json
├─ pnpm-workspace.yaml
└─ README.md
```

Rules:

* Keep frontend and backend in the same repository when they belong to the same product.
* Do not put backend code inside `apps/web/src`.
* Do not put PlayCanvas runtime code inside backend.
* Keep shared scene schemas, API types, and validation schemas in `packages/shared` when useful.
* Prefer monorepo scripts for local development.

Recommended scripts:

```json
{
  "scripts": {
    "dev:web": "pnpm --filter web dev",
    "dev:api": "pnpm --filter api start:dev",
    "dev": "pnpm -r --parallel dev",
    "build:web": "pnpm --filter web build",
    "build:api": "pnpm --filter api build",
    "build": "pnpm -r build",
    "lint": "pnpm -r lint",
    "test": "pnpm -r test"
  }
}
```

If the current project has not been moved into `apps/web` yet, do not force a monorepo migration inside an unrelated feature loop. Use a dedicated loop:

```text
迁移项目为 monorepo：apps/web + apps/api + packages/shared
```

---

## 4. UI Naming Rules

When writing user-facing requirements, prompts, plans, or UI descriptions, use these Chinese UI names consistently:

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

Code file names, class names, and module names may remain English:

```text
SceneObjectManager.js
SelectionManager.js
InspectorPanel.vue
HierarchyPanel.vue
ToolbarPanel.vue
ViewportPanel.vue
BottomPanel.vue
ContextMenu.vue
```

---

## 5. Core Mental Model

Always think of the digital twin system as separated layers:

```text
Visual Layer
- 3DGS .sog map
- High realism
- Visual base map
- Not the main interaction geometry

Interaction Layer
- BIM / GLB proxy mesh
- Raycast mesh
- Collision mesh
- Ground picking plane
- Region selection
- Route anchors

Entity Layer
- Buildings
- Roads
- Cameras
- Robots
- Sensors
- Devices
- GLB / OBJ / PLY overlays
- Annotations
- Routes
- Markers

Editor State Layer
- SceneObjectManager
- SelectionManager
- Transform editing
- Visibility
- Rename
- Delete
- Context menu
- Future undo/redo commands

Data Layer
- Scene JSON
- Asset records
- Entity metadata
- Alignment data
- Device bindings
- Realtime state

Backend Layer
- REST APIs
- WebSocket gateway
- Database
- Asset storage
- Realtime bridge
- Auth later

Business / Realtime Layer
- Robot positions
- Camera status
- Device status
- Sensor values
- Alarm events
- Route updates
```

Never collapse these layers into one messy implementation.

Important principles:

```text
3DGS / .sog = visual map layer.
BIM / GLB / proxy mesh = interaction and structure layer.
SceneObjectManager = frontend scene object state source.
SelectionManager = frontend selection source.
Vue = UI rendering shell.
PlayCanvas = 3D runtime.
Backend = persistence, APIs, realtime integration, storage, database.
Database = durable records, not runtime PlayCanvas objects.
Realtime = dynamic state, not static scene configuration.
```

---

## 6. Vue Frontend Architecture

Vue controls:

```text
- Layout
- 顶部工具栏
- 左侧层级
- 右侧属性
- 底部资源 / 日志
- 右键菜单
- Dialogs
- Buttons
- Form fields
- UI state snapshots
```

PlayCanvas controls:

```text
- App initialization
- Canvas rendering
- 3DGS loading
- GLB / BIM loading
- Camera
- Marker
- Picking
- Alignment
- Runtime entities
```

Editor managers control:

```text
- Scene objects
- Selection state
- Visibility
- Rename
- Delete
- Transform
- Future commands
```

Recommended frontend structure:

```text
apps/web/src
├─ main.js
├─ App.vue
├─ runtime
│  └─ createMiniEditorRuntime.js
├─ components
│  ├─ ToolbarPanel.vue
│  ├─ HierarchyPanel.vue
│  ├─ InspectorPanel.vue
│  ├─ ViewportPanel.vue
│  ├─ BottomPanel.vue
│  └─ ContextMenu.vue
├─ editor
│  ├─ SceneObjectManager.js
│  ├─ SelectionManager.js
│  └─ CommandManager.js
├─ engine
│  ├─ SplatLoader.js
│  ├─ BimProxyManager.js
│  ├─ BimAlignmentManager.js
│  ├─ CameraController.js
│  ├─ MarkerManager.js
│  └─ PickingController.js
├─ api
│  ├─ httpClient.js
│  ├─ sceneApi.js
│  ├─ assetApi.js
│  ├─ entityApi.js
│  └─ realtimeClient.js
├─ config
│  └─ assets.js
└─ styles.css
```

Vue should subscribe to managers and render snapshots.

Do not create a second independent object list inside Vue.

Correct:

```js
sceneObjectManager.onChange(syncSceneObjects);
selectionManager.onChange(syncSelectedObject);
```

Incorrect:

```text
Vue maintains objects[]
SceneObjectManager maintains another objects map
The two can drift apart
```

Single source of truth:

```text
SceneObjectManager = frontend scene object source.
SelectionManager = frontend selection source.
Vue = UI projection.
```

---

## 7. Backend Architecture

Backend is now part of the development scope when requested.

Preferred backend stack:

```text
Node.js + NestJS
PostgreSQL + PostGIS
Redis
MinIO / S3 / local object storage
WebSocket Gateway
MQTT bridge
Docker Compose
```

FastAPI is acceptable for prototypes, AI services, or data-processing services, but NestJS is preferred for the main application backend.

Recommended backend structure:

```text
apps/api/src
├─ main.ts
├─ app.module.ts
├─ config
│  └─ config.module.ts
├─ common
│  ├─ filters
│  ├─ guards
│  ├─ interceptors
│  └─ pipes
├─ modules
│  ├─ health
│  ├─ projects
│  ├─ scenes
│  ├─ assets
│  ├─ entities
│  ├─ devices
│  ├─ robots
│  ├─ cameras
│  ├─ routes
│  ├─ realtime
│  └─ auth
├─ database
│  ├─ prisma
│  ├─ migrations
│  └─ seed
├─ storage
│  ├─ storage.service.ts
│  └─ local-storage.service.ts
├─ websocket
│  └─ realtime.gateway.ts
└─ mqtt
   └─ mqtt.service.ts
```

Start small.

Recommended backend milestone order:

```text
1. apps/api skeleton
2. GET /health
3. frontend /api/health integration
4. scene draft API
5. asset metadata API
6. local file upload API
7. entity API
8. WebSocket realtime gateway
9. database integration
10. Docker Compose
```

Do not implement auth, complex permissions, robot control, camera streaming, or MQTT in the first backend loop unless explicitly requested.

---

## 8. API Design Rules

Use REST APIs for durable business data:

```text
/projects
/scenes
/assets
/entities
/devices
/robots
/cameras
/routes
```

Use WebSocket for browser realtime updates:

```text
robot.position.updated
device.status.updated
camera.status.updated
alarm.created
route.updated
```

Use MQTT for external robot, camera, and IoT integration later.

API rules:

* Every persisted object needs a stable ID.
* Display names are not IDs.
* Do not expose PlayCanvas entity references through API.
* API payloads must be serializable JSON.
* Static scene configuration and realtime state must be separate.
* Frontend should tolerate missing or malformed backend data.
* Backend should validate request payloads.
* Use DTOs or schema validation.
* Keep API errors explicit and useful.

Recommended API response shape:

```json
{
  "success": true,
  "data": {},
  "error": null
}
```

Recommended error shape:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "SCENE_NOT_FOUND",
    "message": "Scene not found"
  }
}
```

---

## 9. Shared Types and Schemas

When frontend and backend both use the same concepts, prefer shared schemas.

Recommended shared package:

```text
packages/shared/src
├─ scene
│  ├─ scene.schema.ts
│  └─ scene.types.ts
├─ asset
│  ├─ asset.schema.ts
│  └─ asset.types.ts
├─ entity
│  ├─ entity.schema.ts
│  └─ entity.types.ts
├─ realtime
│  ├─ realtime.schema.ts
│  └─ realtime.types.ts
└─ index.ts
```

Rules:

* Do not duplicate scene object schemas separately in frontend and backend.
* Do not make PlayCanvas `pc.Entity` part of shared schema.
* Shared schema should contain only serializable data.
* Runtime-only frontend objects can wrap persistent scene data.

Example serializable scene object:

```json
{
  "id": "object_001",
  "type": "glb",
  "displayName": "Robot",
  "visible": true,
  "asset": {
    "assetId": "asset_001",
    "url": "/assets/robot.glb",
    "sourceName": "robot.glb"
  },
  "transform": {
    "position": [0, 0, 0],
    "rotation": [0, 0, 0],
    "scale": [1, 1, 1]
  },
  "metadata": {}
}
```

---

## 10. PlayCanvas 3DGS Loading Rules

Use PlayCanvas Engine as the 3D runtime.

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
const blobUrl = URL.createObjectURL(file);

const asset = new pc.Asset(file.name, 'gsplat', {
  url: blobUrl,
  filename: file.name,
  size: file.size
});
```

Rules:

* Do not omit `filename` for `.sog` loading.
* Do not revoke blob URLs before loading completes.
* Show loading state.
* Show full error details.
* Do not destroy the currently working map before the replacement map has loaded successfully.
* Converted SOG loading failure must not destroy the existing base map.
* Never report every failure as `BaseMap failed`; report which map failed.
* Expose debug handles when useful.

Debug handles may include:

```js
window.app = app;
window.pc = pc;
window.currentSplatEntity = currentSplatEntity;
window.currentSplatAsset = currentSplatAsset;
window.sceneObjectManager = sceneObjectManager;
window.selectionManager = selectionManager;
```

When `.sog` loading fails, inspect:

* Browser console
* Network panel
* Asset URL
* Whether `filename` was passed
* File size
* Whether the response is a real `.sog` file or a 404 HTML page
* Engine version
* Browser memory
* Whether the file opens in PlayCanvas Editor or SuperSplat

A common error:

```text
Invalid zip file: EOCDR not found
```

This often means the target file is not a valid `.sog`, the URL returned HTML, the file is empty, or the wrong loader was used.

---

## 11. Object Naming Rules

Object display names must be dynamic.

Correct examples:

```text
base.sog
高铁2.sog
南广场.glb
robot.glb
Pick Marker
```

Incorrect examples:

```text
高斯地图：base.sog
BIM模型：南广场.glb
```

Correct object fields:

```js
{
  id: 'stable-id',
  name: 'base.sog',
  displayName: 'base.sog',
  type: 'gsplat',
  typeLabel: '高斯地图',
  entity: pc.Entity,
  asset: pc.Asset,
  visible: true,
  status: 'loaded',
  transform: {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  },
  metadata: {
    url: '/assets/base.sog',
    sourceName: 'base.sog'
  }
}
```

Rules:

* `displayName` comes from the real filename or user rename.
* `typeLabel` is the Chinese type label.
* Rename changes `displayName`.
* Rename must not change URL, source filename, asset path, or real file path.
* Do not use `displayName` as a stable ID.
* Do not compare selected objects by name.
* Always compare selected objects by `object.id`.

Recommended type labels:

```js
const TYPE_LABELS = {
  gsplat: '高斯地图',
  'bim-proxy': 'BIM模型',
  glb: '模型',
  model: '模型',
  marker: '拾取点',
  camera: '相机',
  debug: '调试辅助',
  route: '路线',
  robot: '机器人',
  cameraDevice: '摄像头',
  device: '设备',
  annotation: '标注'
};
```

---

## 12. SceneObjectManager Rules

`SceneObjectManager` must be the main frontend scene object state source.

It should manage:

* Object registration
* Object update
* Object removal
* Visibility
* Rename
* Transform
* Status
* Change notifications
* Future serialization-friendly fields

Recommended methods:

```js
addObject(object)
updateObject(id, patch)
removeObject(id)
getObject(id)
getObjects()
setVisible(id, visible)
toggleVisible(id)
renameObject(id, newDisplayName)
setTransform(id, transform)
onChange(callback)
emitChange()
```

Visibility must control the real PlayCanvas entity:

```js
setVisible(id, visible) {
  const object = this.objects.get(id);
  if (!object) return false;

  object.visible = visible;

  if (object.entity) {
    object.entity.enabled = visible;
  }

  this.emitChange();
  return true;
}
```

Transform must control the real PlayCanvas entity and store serializable state:

```js
setTransform(id, transform) {
  const object = this.objects.get(id);
  if (!object || !object.entity) return false;

  const [x, y, z] = transform.position;
  const [rx, ry, rz] = transform.rotation;
  const [sx, sy, sz] = transform.scale;

  object.entity.setLocalPosition(x, y, z);
  object.entity.setLocalEulerAngles(rx, ry, rz);
  object.entity.setLocalScale(sx, sy, sz);

  object.transform = {
    position: [x, y, z],
    rotation: [rx, ry, rz],
    scale: [sx, sy, sz]
  };

  this.emitChange();
  return true;
}
```

Removal should delete the scene object from the runtime scene, not delete the physical asset file:

```js
removeObject(id) {
  const object = this.objects.get(id);
  if (!object) return false;

  if (object.protected) {
    return false;
  }

  if (object.entity) {
    object.entity.destroy();
  }

  this.objects.delete(id);
  this.emitChange();

  return true;
}
```

Rules:

* Deleting a scene object must not delete files under `public/assets`.
* `camera` and `debug` objects may be protected by default.
* If the deleted object is currently selected, clear selection.
* Do not let top toolbar buttons maintain separate visibility state.
* Top toolbar actions must call the same `SceneObjectManager` methods used by the left-side 层级.
* Do not let API responses directly mutate PlayCanvas entities without going through frontend managers.

---

## 13. SelectionManager Rules

`SelectionManager` should only store `selectedObjectId`.

Do not store a selected object copy.

Recommended methods:

```js
select(objectId)
clear()
getSelectedId()
onChange(callback)
emitChange(objectId)
```

Correct:

```js
select(objectId) {
  const object = this.sceneObjectManager.getObject(objectId);
  if (!object) return false;

  this.selectedObjectId = objectId;
  this.emitChange(objectId);
  return true;
}
```

Clear selection:

```js
clear() {
  this.selectedObjectId = null;
  this.emitChange(null);
}
```

The right-side 属性 should always fetch the latest selected object:

```js
const selectedId = selectionManager.getSelectedId();
const object = sceneObjectManager.getObject(selectedId);
```

This avoids stale data after rename, visibility change, delete, transform, API sync, or status update.

---

## 14. 左侧层级 Rules

左侧层级 is not a resource list.

左侧层级 shows only real scene objects that have been instantiated into the PlayCanvas scene.

Correct behavior:

```text
Initial:
ROOT
  Camera
  Debug Helpers

After base.sog loaded:
ROOT
  Camera
  Debug Helpers
  base.sog

After BIM loaded:
ROOT
  Camera
  Debug Helpers
  base.sog
  南广场.glb

After marker created:
ROOT
  Camera
  Debug Helpers
  base.sog
  南广场.glb
  Pick Marker
```

Incorrect behavior:

```text
Showing base.sog before it has loaded.
Showing BIM before it has loaded.
Using 左侧层级 as an asset list.
Using displayName as object identity.
```

Row click:

```js
selectionManager.select(object.id);
```

ON/OFF click:

```js
event.preventDefault();
event.stopPropagation();
sceneObjectManager.toggleVisible(object.id);
```

Right-click menu:

```js
event.preventDefault();
event.stopPropagation();

selectionManager.select(object.id);

openContextMenu({
  objectId: object.id,
  x: event.clientX,
  y: event.clientY
});
```

CSS rule:

```css
.hierarchy-row,
.hierarchy-row * {
  user-select: none;
}

.hierarchy-row {
  cursor: pointer;
}
```

Do not globally disable text selection, because right-side 属性 inputs must remain editable.

---

## 15. 右侧属性 Rules

右侧属性 must render based on the selected scene object type.

It must not be a fixed BIM panel.

Common fields:

```text
名称
类型
状态
可见
资源路径
```

Rename:

```text
名称: [input] [重命名]
```

Rename only changes:

```js
object.displayName
```

It must not change:

```text
metadata.url
metadata.sourceName
asset.file.url
real file path
loading URL
backend asset ID
```

Transform should be shared by editable objects:

```text
变换
- 位置 X / Y / Z
- 旋转 Rot X / Rot Y / Rot Z
- 缩放 Scale
- 步长
- 微调
```

Transform editing should apply to:

```text
gsplat
bim-proxy
glb
model
marker when appropriate
future robot/camera/device objects when appropriate
```

Type-specific behavior:

### gsplat

Show:

```text
类型: 高斯地图
状态
可见
URL / 资源路径
变换
Focus Map
Reload
```

Do not show BIM alignment.

### bim-proxy

Show:

```text
类型: BIM模型
状态
可见
URL / 资源路径
变换
BIM 对齐
Save Alignment
Load Alignment
```

### glb / model

Show:

```text
类型: 模型
状态
可见
URL / 资源路径
变换
聚焦
```

Do not show BIM alignment unless the object is explicitly a BIM proxy.

### marker

Show:

```text
类型: 拾取点
位置
可见
Clear Marker
```

### camera

Show:

```text
类型: 相机
Reset Camera
```

### debug

Show:

```text
类型: 调试辅助
Fallback plane / debug helper state
```

When nothing is selected:

```text
未选择对象
```

---

## 16. 右键菜单 Rules

The object 右键菜单 should be implemented in the UI layer.

Basic menu items may include:

```text
New Entity        disabled
Add Component     disabled
Template          disabled
---
Enable / Disable
Show / Hide
---
Copy              disabled
Paste             disabled
Duplicate         disabled
---
Delete
```

For the current stage, only implement real behavior for:

```text
Show / Hide
Delete
Duplicate when explicitly requested
```

If `enabled` and `visible` are not yet separated, do not invent a complex state system. Use Show / Hide for `object.visible` and `entity.enabled`.

Delete behavior:

* Deletes scene object from runtime.
* Destroys PlayCanvas entity.
* Removes object from `SceneObjectManager`.
* Does not delete physical files.
* Does not delete backend asset records unless the user explicitly asks for asset deletion.
* Clears selection if deleted object was selected.
* Protected objects cannot be deleted.

Right-click should also select the target object before opening the menu.

The menu should close when:

* A menu item is clicked.
* User clicks elsewhere.
* Escape is pressed.
* Window resizes.
* The editor scrolls significantly.

---

## 17. Camera Rules

The viewer/editor should provide a useful large-scene camera controller.

Baseline camera features:

* Orbit rotation
* Wheel zoom
* Pan using right mouse or Shift + left mouse
* WASD movement
* Q / E vertical movement
* Shift speed boost
* Reset camera
* Focus selected object
* Large-map friendly default distance
* Window resize handling

Camera logic should live in:

```text
apps/web/src/engine/CameraController.js
```

Do not permanently bury camera logic in `main.js` or Vue components.

Canvas rule:

```text
The PlayCanvas canvas must fill the 中间视口 only.
It must not cover 顶部工具栏, 左侧层级, 右侧属性, or 底部资源 / 日志.
```

---

## 18. Proxy Mesh and Picking Rules

For click, placement, collision, route planning, and building selection, prefer proxy mesh or BIM mesh.

Use 3DGS for visual realism.

Use proxy mesh for:

* Ground picking
* Building selection
* Road selection
* Model placement
* Robot route targets
* Navigation surface
* Collision approximation

Current fallback plane picking may exist, but it must not steal selection.

Fallback picking should only:

```text
Update pick status.
Update marker.
Write log.
```

It must not call:

```js
selectionManager.select(...)
```

unless the user clicked a real selectable scene object.

---

## 19. BIM / GLB Rules

BIM / GLB models should be treated as independent scene objects.

A BIM object should be registered as:

```js
{
  id,
  name: '南广场.glb',
  displayName: '南广场.glb',
  type: 'bim-proxy',
  typeLabel: 'BIM模型',
  entity,
  asset,
  visible: true,
  status: 'loaded',
  transform: {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  },
  metadata: {
    url,
    sourceName: '南广场.glb'
  }
}
```

Rules:

* Encode URLs for Chinese filenames when needed.
* Do not hardcode BIM display names.
* Do not assume BIM is aligned with the 3DGS map.
* BIM alignment belongs in the right-side 属性 only when a BIM object is selected.
* Top toolbar BIM visibility must call `SceneObjectManager.toggleVisible(objectId)` or equivalent shared logic.
* GLB model objects must support selection, visibility, rename, transform, focus, delete, and later persistence.

---

## 20. BIM Alignment Rules

BIM alignment is a manual early-stage tool.

It may support:

* Position X/Y/Z
* Rotation X/Y/Z
* Scale
* Apply
* Save Alignment
* Load Alignment

Rules:

* Do not show BIM alignment for `gsplat` objects.
* Do not show BIM alignment for normal model objects unless they are BIM proxy objects.
* Do not show BIM alignment for marker, camera, or debug objects.
* Store alignment data in serializable format.
* Do not implement automatic ICP, registration, or gizmo unless explicitly requested.

---

## 21. Scene Data and Persistence Rules

Scene data must be serializable and restorable.

Recommended future scene structure:

```json
{
  "sceneId": "scene_001",
  "projectId": "project_001",
  "name": "Base Map Scene",
  "coordinateSystem": {
    "origin": [0, 0, 0],
    "rotation": [0, 0, 0],
    "scale": [1, 1, 1],
    "unit": "meter"
  },
  "objects": [
    {
      "id": "base_map_001",
      "type": "gsplat",
      "displayName": "base.sog",
      "asset": {
        "assetId": "asset_sog_001",
        "url": "/assets/base.sog",
        "sourceName": "base.sog"
      },
      "visible": true,
      "transform": {
        "position": [0, 0, 0],
        "rotation": [0, 0, 0],
        "scale": [1, 1, 1]
      }
    }
  ],
  "routes": [],
  "cameras": [],
  "robots": [],
  "devices": [],
  "annotations": []
}
```

Rules:

* Static scene data and realtime state must be separated.
* All objects need stable IDs.
* Do not use visible names as IDs.
* Do not store PlayCanvas entity references inside persistent JSON.
* Store only serializable data.
* Keep future undo/redo and command system in mind.
* Do not add database persistence until the API and schema are defined.
* Local Scene JSON may be implemented before database persistence.
* Database persistence should follow the same schema concepts.

---

## 22. Asset Management Rules

Supported or planned asset formats:

```text
.sog
.ply
.glb
.gltf
.obj
images
json
video stream metadata
```

Frontend local phase:

* Assets can live under `public/assets`.
* Local selected files can use blob URLs.
* Converted files can live under `public/assets/converted`.

Backend phase:

* Store uploaded asset files in local storage, MinIO, or S3.
* Store asset metadata in database.
* Do not load all large assets eagerly.
* Use stable `assetId`.
* Keep original files and converted files separate.
* Do not delete physical asset files when deleting scene objects unless explicitly requested.

Asset record example:

```json
{
  "assetId": "asset_001",
  "projectId": "project_001",
  "type": "glb",
  "sourceName": "robot.glb",
  "storageKey": "projects/project_001/assets/robot.glb",
  "url": "/api/assets/asset_001/file",
  "size": 123456,
  "metadata": {}
}
```

---

## 23. Realtime Data Rules

Realtime data can include:

* Robot location
* Robot task state
* Camera online/offline state
* Device status
* Sensor value
* Alarm event
* Route update
* Building/region state

Recommended message style:

```json
{
  "type": "robot.position.updated",
  "robotId": "robot_001",
  "position": [12.5, 0, -8.2],
  "rotation": [0, 90, 0],
  "timestamp": 1710000000000
}
```

Rules:

* Every realtime message must have a `type`.
* Every realtime message must reference a stable business ID.
* High-frequency movement should be interpolated visually.
* Realtime state must not overwrite saved static scene configuration.
* Frontend should tolerate missing, late, or malformed messages.
* Backend should validate incoming realtime messages.
* WebSocket should push browser-friendly events.
* MQTT should be used for robot/device integration later, not required in the first backend loop.

---

## 24. Robot and Route Rules

Robots are dynamic business entities.

A robot should eventually support:

* Robot ID
* Model or icon
* Current position
* Heading
* Online/offline status
* Task status
* Battery status
* Target point
* Current route
* Historical trajectory
* Error state

Routes should be rendered as independent route entities.

Path planning should usually be handled by backend or robot system. The frontend should primarily display route results and allow target selection.

When user clicks a building or region in the future:

```text
1. Resolve clicked object ID.
2. Request target point or route from business API.
3. Render route as scene-space points.
4. Update robot movement or task state using realtime messages.
```

Do not implement complex path planning in the frontend unless explicitly requested.

---

## 25. Camera Device Rules

Camera devices are independent business entities.

A camera device should eventually support:

* Camera ID
* Name
* Position
* Rotation / direction
* Status
* Stream URL or stream ID
* Coverage direction or frustum
* Related building/area

Rules:

* Do not load all live video streams at startup.
* Load stream only when the user opens a camera panel.
* RTSP should not be played directly in normal browser UI.
* Use backend conversion to WebRTC, HLS, or another browser-compatible format later.
* Camera metadata and camera video should be separate.
* Camera status can be realtime data.

---

## 26. Database Rules

Do not add database tables casually.

When database work is requested, start with clear modules:

```text
projects
scenes
assets
entities
devices
robots
cameras
routes
events
users later
```

PostgreSQL is preferred.

PostGIS is useful for:

```text
spatial regions
routes
georeferenced coordinates
building footprints
road networks
map alignment metadata
```

Redis is useful for:

```text
robot live positions
device live status
camera online state
temporary route state
cache
```

Rules:

* Database stores durable state.
* Redis stores high-frequency or temporary state.
* Static scene config and realtime state are separate.
* Keep migrations versioned.
* Do not require database for frontend-only editor loops.
* Use Docker Compose when database dependencies are introduced.

---

## 27. Frontend / Backend Integration Rules

When frontend calls backend:

* Use a dedicated API client module.
* Do not scatter raw `fetch` calls across components.
* Use Vite proxy for local development when useful.
* Keep API errors visible in UI and console.
* Do not block local frontend-only workflow if backend is unavailable unless the feature requires backend.

Recommended Vite proxy:

```js
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:3000',
      changeOrigin: true
    }
  }
}
```

Recommended health check loop:

```text
1. Backend exposes GET /api/health.
2. Frontend has healthApi.check().
3. UI can show backend connected / disconnected.
4. npm run build passes for web.
5. backend build passes for api.
```

---

## 28. Full-Stack Loop Engineering Rules

When writing a Loop Engineering prompt, classify the loop:

```text
Frontend-only
Backend-only
Full-stack
Repo/DevOps
```

Every loop must state:

```text
目标
范围
禁止事项
修改文件范围
验收标准
构建/运行命令
最终输出格式
```

For frontend-only loops, verify:

```text
npm run dev
npm run build
base.sog still loads
左侧层级 / 右侧属性 still sync
```

For backend-only loops, verify:

```text
api dev server starts
api build passes
health endpoint works
logs are clear
```

For full-stack loops, verify:

```text
web dev server starts
api dev server starts
frontend can call backend
web build passes
api build passes
no frontend regression
no backend regression
```

Good loop titles:

```text
创建 apps/api NestJS 后端骨架并提供 /api/health
迁移项目为 monorepo：apps/web + apps/api + packages/shared
实现前端 health 状态面板并联调后端 /api/health
实现 scenes API 草稿，但不接数据库
实现本地 Scene JSON 保存，再接后端 scenes API
```

Avoid vague titles:

```text
继续完善后端
优化项目
加数据库
重构全部代码
```

Each loop should explicitly say what not to do.

Example禁止事项:

```text
不要新增认证
不要新增复杂数据库 schema
不要引入 MQTT
不要实现真实摄像头流
不要实现机器人控制
不要重写 PlayCanvas Runtime
不要破坏 base.sog 加载
```

---

## 29. Encoding and Terminal Rules

Avoid Chinese乱码 in terminal output.

When using Windows PowerShell, run this before reading files or running build commands:

```powershell
chcp 65001
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$env:PYTHONUTF8 = "1"
```

When reading files in PowerShell, specify UTF-8:

```powershell
Get-Content .\apps\web\src\App.vue -Encoding UTF8
Get-Content .\apps\api\src\main.ts -Encoding UTF8
```

When saving command output:

```powershell
pnpm build 2>&1 | Out-File -FilePath build.log -Encoding utf8
Get-Content .\build.log -Encoding UTF8
```

Terminal logs and debug logs should preferably use English:

```js
console.log('[Hierarchy] select object:', object.id, object.displayName, object.type);
console.warn('[SceneObjectManager] protected object cannot be deleted:', object.id);
console.error('[MiniEditor] SOG load failed:', error);
```

Backend logs should also prefer English:

```ts
this.logger.log('[Health] API is running');
this.logger.error('[Scenes] failed to save scene', error);
```

UI text may remain Chinese:

```text
层级
属性
资源
日志
高斯地图
BIM模型
拾取点
相机
调试辅助
删除
隐藏
显示
重命名
后端连接
```

If you see乱码 such as:

```text
灞傜骇
灞炴
璧勬簮
鏃ュ織
```

Stop editing.

Then:

```text
1. Reset terminal encoding to UTF-8.
2. Re-read the source file with UTF-8.
3. Confirm the real text.
4. Never copy terminal乱码 back into source code.
```

Source files must remain UTF-8.

---

## 30. Development Style

When asked to code:

1. Preserve the current working `.sog` viewer.
2. Preserve `base.sog` loading.
3. Make small, incremental, runnable changes.
4. Keep frontend PlayCanvas runtime stable.
5. Keep backend modules isolated and testable.
6. Keep PlayCanvas-specific code inside web engine/runtime modules.
7. Keep UI code separate from PlayCanvas runtime code.
8. Keep backend code out of frontend `src`.
9. Use `SceneObjectManager` for frontend object state.
10. Use `SelectionManager` for frontend selected object ID.
11. Use API client modules for frontend/backend calls.
12. Use shared schema when both sides need the same data structure.
13. Provide clear testing steps.
14. Show complete error information.
15. Keep future editor, undo/redo, scene serialization, database, and realtime architecture in mind.

---

## 31. Completion Standard

A frontend change is not complete until:

* The app still starts with `npm run dev` or the workspace equivalent.
* `npm run build` or `pnpm build:web` passes.
* Existing `.sog` loading is not broken.
* `base.sog` can still load.
* Local `.sog` loading still works if it existed before.
* BIM / GLB loading still works if it existed before.
* 左侧层级 and 右侧属性 remain synchronized.
* Object visibility uses `SceneObjectManager`.
* Object selection uses `SelectionManager`.
* Object Transform uses the shared transform logic.
* Errors are visible in UI and console.
* Terminal output does not corrupt Chinese text.
* Source files are not polluted with乱码.

A backend change is not complete until:

* API dev server starts.
* API build passes.
* Health endpoint works if backend exists.
* Errors are visible in logs.
* DTOs or schemas validate input where appropriate.
* No unrelated frontend behavior is broken.
* Environment variables are documented.
* If database is required, migration or setup steps are documented.

A full-stack change is not complete until:

* Web dev server starts.
* API dev server starts.
* Frontend can reach backend through the intended URL or proxy.
* Web build passes.
* API build passes.
* Shared schema changes are reflected on both sides.
* No frontend editor regression occurs.
* No backend endpoint regression occurs.
* The implementation does not block future proxy mesh, model overlay, scene saving, database persistence, realtime data, Vue editor UI, or backend integration.
