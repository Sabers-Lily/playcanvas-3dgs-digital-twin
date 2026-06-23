---

name: 3dgs-digital-twin
description: Use this skill when developing a PlayCanvas Engine based 3DGS digital twin platform with SOG maps, proxy collision meshes, model overlays, robot routes, cameras, realtime data, scene editing, and future backend/database integration.
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

# 3DGS Digital Twin Skill

## Expert Role

Act as a senior full-stack and 3D frontend engineer with strong experience in:

* PlayCanvas Engine
* WebGL / WebGPU concepts
* 3DGS / Gaussian Splatting
* `.sog`, `.ply`, `.glb`, `.gltf`, `.obj` asset loading
* Browser-based 3D scene editors
* Digital twin platforms
* Realtime robot, camera, device, and IoT data
* Vite frontend architecture
* TypeScript-oriented code organization
* Node.js / NestJS backend architecture
* PostgreSQL / PostGIS spatial data architecture
* WebSocket / MQTT realtime systems

The project should evolve from a local 3DGS viewer into a private digital twin editor and realtime operation platform.

## Mental Model

Always think of the system as four separate layers:

```text
Visual Layer
- 3DGS .sog map
- High realism
- Not the main interaction geometry

Interaction Layer
- Proxy mesh
- Raycast
- Collision
- Ground picking
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

Data Layer
- Scene JSON
- Assets
- Entity metadata
- Device bindings
- Realtime state
- Backend/database later
```

Never collapse these layers into one messy implementation.

## Current Project Assumption

The current project is a Vite + PlayCanvas Engine app.

The project can load a local 3DGS base map from:

```text
public/assets/base.sog
```

Preserve this capability unless the task explicitly asks to replace it.

Do not introduce a backend unless the user explicitly asks for backend work.

Do not migrate to React, Vue, or TypeScript unless the user explicitly asks for that migration.

## Primary Engineering Goals

The platform should support:

* Loading a `.sog` 3DGS map as the visual base map.
* Loading additional 3D models on top of the map.
* Supporting GLB, GLTF, OBJ, and PLY as future model formats.
* Using proxy mesh for click detection and collision.
* Allowing buildings, regions, robots, cameras, devices, and annotations to be interactive.
* Showing robot routes and movement.
* Showing camera information and eventually camera streams.
* Receiving realtime data from external systems.
* Saving and restoring scene configuration.
* Evolving toward a Mini Editor similar in spirit to PlayCanvas Editor, but not dependent on PlayCanvas cloud services.

## PlayCanvas Rules

Use PlayCanvas Engine as the 3D runtime.

For 3DGS loading:

```js
const asset = new pc.Asset('base.sog', 'gsplat', {
  url: '/assets/base.sog',
  filename: 'base.sog'
});
```

For local selected files:

```js
const blobUrl = URL.createObjectURL(file);

const asset = new pc.Asset(file.name, 'gsplat', {
  url: blobUrl,
  filename: file.name,
  size: file.size
});
```

Important rules:

* Do not omit `filename` for `.sog` loading.
* Do not revoke blob URLs before loading completes.
* Clean up old entities/assets before loading a new map.
* Display loading state.
* Display full errors.
* Expose useful debug references when helpful:

```js
window.app = app;
window.pc = pc;
window.currentSplatEntity = currentSplatEntity;
window.currentSplatAsset = currentSplatAsset;
```

## Camera Rules

The viewer/editor should provide a useful camera controller.

Baseline camera features:

* Orbit rotation
* Wheel zoom
* Pan using right mouse or Shift + left mouse
* Reset camera
* Large-map friendly default distance
* Window resize handling

Camera logic should eventually be isolated into a module such as:

```text
src/engine/CameraController.js
```

Do not bury camera logic permanently inside `main.js`.

## Proxy Mesh Rules

For any feature involving click, placement, collision, route planning, or building selection, prefer proxy mesh.

Use 3DGS only for visual realism.

Use proxy mesh for:

* Picking ground point
* Selecting buildings
* Selecting roads
* Placing models
* Showing robot route targets
* Navigation surface
* Collision approximation

Proxy mesh can be invisible in normal mode and visible in debug mode.

## Model Overlay Rules

Additional models should be treated as independent scene entities.

Supported or planned overlay assets:

* `.glb`
* `.gltf`
* `.obj`
* `.ply`
* annotation icons
* route lines
* camera frustums
* robot models
* building markers
* device markers

Runtime preference:

* Prefer GLB for browser runtime.
* OBJ can be imported but may be converted to GLB later.
* PLY must be clearly classified as either point cloud / 3DGS-related data / mesh-like imported asset depending on usage.

Each overlay should have:

```json
{
  "entityId": "entity_001",
  "assetId": "asset_001",
  "type": "glb",
  "name": "Robot",
  "position": [0, 0, 0],
  "rotation": [0, 0, 0],
  "scale": [1, 1, 1],
  "metadata": {}
}
```

## Scene Data Rules

Scene data must be serializable and restorable.

Recommended scene structure:

```json
{
  "sceneId": "scene_001",
  "name": "Base Map Scene",
  "coordinateSystem": {
    "origin": [0, 0, 0],
    "rotation": [0, 0, 0],
    "scale": [1, 1, 1],
    "unit": "meter"
  },
  "baseMap": {
    "entityId": "base_map_001",
    "assetId": "asset_sog_001",
    "type": "gsplat",
    "url": "/assets/base.sog",
    "position": [0, 0, 0],
    "rotation": [0, 0, 0],
    "scale": [1, 1, 1]
  },
  "proxyMesh": {
    "entityId": "proxy_001",
    "assetId": "asset_proxy_001",
    "visible": false,
    "position": [0, 0, 0],
    "rotation": [0, 0, 0],
    "scale": [1, 1, 1]
  },
  "entities": [],
  "annotations": [],
  "routes": [],
  "cameras": [],
  "robots": [],
  "devices": []
}
```

Rules:

* Static scene data and realtime state must be separated.
* All objects need stable IDs.
* Do not use visible names as IDs.
* Do not store temporary PlayCanvas object references inside persistent JSON.
* Store only serializable data.

## Realtime Data Rules

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
* Realtime state should not overwrite the saved static scene configuration.
* Frontend should tolerate missing, late, or malformed messages.

## Robot and Route Rules

Robots are dynamic business entities.

A robot should eventually support:

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

When user clicks a building or region:

1. Resolve clicked object ID.
2. Request target point or route from business API.
3. Render route as scene-space points.
4. Update robot movement or task state using realtime messages.

## Camera Rules

Cameras are independent business entities.

A camera should eventually support:

* Camera ID
* Name
* Position
* Rotation / direction
* View frustum
* Online/offline status
* Related area/building
* Stream metadata
* Click-to-open video panel

Rules:

* Do not load all camera streams at once.
* Load a stream only when the user opens that camera.
* RTSP should be handled by backend/media service, not directly by normal browser code.
* Camera metadata and camera video should be separate.
* Camera status can be updated through realtime messages.

## Backend Architecture Guidance

Do not implement backend unless asked.

When backend is requested, prefer:

```text
backend
├─ modules
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
├─ storage
├─ database
├─ websocket
├─ mqtt
├─ workers
└─ config
```

Recommended backend stack:

* Node.js + NestJS
* PostgreSQL + PostGIS
* Redis
* MinIO / S3 / local storage
* WebSocket Gateway
* MQTT Broker
* FFmpeg/media service for camera streams
* Docker Compose

Backend principles:

* REST API for business data.
* WebSocket for browser realtime.
* MQTT for robots, cameras, and IoT devices.
* Object storage for large files.
* PostgreSQL for persistent records.
* Redis for high-frequency realtime state.
* PostGIS for spatial routes, regions, and coordinate-related queries.

## Frontend Architecture Guidance

As complexity grows, move toward this structure:

```text
src
├─ engine
│  ├─ createApp.js
│  ├─ CameraController.js
│  ├─ SplatLoader.js
│  ├─ ModelLoader.js
│  ├─ ProxyRaycaster.js
│  ├─ RouteRenderer.js
│  ├─ DebugHelpers.js
│  └─ SceneSerializer.js
├─ editor
│  ├─ SceneManager.js
│  ├─ EntityManager.js
│  ├─ AssetManager.js
│  ├─ SelectionManager.js
│  └─ CommandManager.js
├─ realtime
│  ├─ WebSocketClient.js
│  ├─ RealtimeStore.js
│  └─ MessageTypes.js
├─ ui
│  ├─ Toolbar.js
│  ├─ HierarchyPanel.js
│  ├─ InspectorPanel.js
│  ├─ AssetsPanel.js
│  └─ StatusBar.js
├─ api
│  ├─ sceneApi.js
│  ├─ assetApi.js
│  ├─ deviceApi.js
│  ├─ robotApi.js
│  ├─ cameraApi.js
│  └─ routeApi.js
└─ types
   ├─ scene.js
   ├─ asset.js
   ├─ entity.js
   ├─ device.js
   └─ realtime.js
```

Code rules:

* Keep PlayCanvas-specific code inside engine modules.
* Keep UI code separate from engine code.
* Managers should coordinate scene/entity/asset state.
* Avoid global mutable state except for explicit debug handles.
* Every loader must report loading, success, and error.
* Every future editor operation should be designed for Undo/Redo.

## Debugging Rules

When `.sog` loading fails, inspect:

* Browser console
* Network panel
* Asset URL
* Whether `filename` was passed
* File size
* Engine version
* Browser memory
* WebGL/WebGPU errors
* Whether the file opens in PlayCanvas Editor or SuperSplat

When scene looks blank, inspect:

* Camera distance
* Camera target
* Model scale
* Model rotation
* SOG bounds if available
* Whether the entity was added to `app.root`
* Whether loading actually completed
* Whether browser is still processing a very large file

## Implementation Style

When asked to code:

1. Preserve the current working `.sog` viewer.
2. Make small, incremental, runnable changes.
3. Avoid unnecessary framework migrations.
4. Avoid adding backend unless explicitly requested.
5. Keep code easy to split into modules.
6. Provide clear testing steps.
7. Show complete error information.
8. Keep future editor and digital twin architecture in mind.

## Completion Standard

A change is not complete until:

* The app still starts with `npm run dev`.
* Existing `.sog` loading is not broken.
* The user can verify the result in browser.
* Errors are visible in UI and console.
* The implementation does not block future proxy mesh, model overlay, scene saving, or realtime data features.
