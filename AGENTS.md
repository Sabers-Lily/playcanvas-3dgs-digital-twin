# AGENTS.md

## Project Identity

This project is a local/private 3DGS digital twin platform based on PlayCanvas Engine.

The current working foundation is a local PlayCanvas/Vite viewer that can load and display a `.sog` 3DGS map from:

```text
public/assets/base.sog
```

The long-term product goal is not just a viewer. The goal is to build a browser-based 3D digital twin editor and runtime platform where:

* 3DGS maps are used as the realistic visual base layer.
* Proxy meshes are used for click detection, collision, placement, routing, and navigation.
* Extra models such as GLB, GLTF, OBJ, and PLY can be placed on top of the 3DGS map.
* Buildings, roads, robots, cameras, devices, sensors, annotations, and routes can become interactive business entities.
* Realtime camera, robot, and sensor data can update the map state.
* Scene configuration, assets, object transforms, routes, and device bindings can eventually be saved to a backend/database.

## Core Architecture Principle

Always separate these layers:

```text
3DGS Layer
- Visual base map only.
- Usually loaded from .sog.
- Do not treat it as a normal editable mesh.

Proxy Mesh Layer
- Hidden or debug-visible simplified geometry.
- Used for raycast, click, collision, path placement, navigation, and object snapping.

Editable Object Layer
- GLB / GLTF / OBJ / PLY models.
- Buildings, devices, robots, cameras, signs, annotations, hotspots, and regions.
- These objects are independent entities and must be saved as scene data.

Business / Realtime Layer
- Robot positions.
- Camera streams.
- Sensor state.
- Alarm state.
- Route state.
- External system data.

Persistence Layer
- Scene JSON now.
- Backend API and database later.
```

Do not directly modify the `.sog` file to represent business changes. Business changes must be represented by independent scene objects, metadata, and realtime state.

## Current Technology Stack

Current frontend:

* Vite
* JavaScript now, TypeScript later
* PlayCanvas Engine
* Local static assets under `public/assets`
* Browser-based viewer/editor

Future frontend direction:

* TypeScript
* React or Vue only when the UI complexity requires it
* PlayCanvas Engine as the 3D runtime
* PCUI or custom UI for editor panels
* WebSocket client for realtime updates
* MQTT-over-WebSocket only when direct browser subscription is needed
* Web Workers for heavy file parsing or preprocessing

Future backend direction:

* Node.js + NestJS preferred
* Python FastAPI acceptable for data/AI/prototype services
* PostgreSQL + PostGIS for persistent project, scene, asset, route, and spatial data
* Redis for realtime state and cache
* MinIO / S3 / local storage for large asset files
* WebSocket Gateway for browser realtime push
* MQTT Broker for robot, camera, and IoT integration
* FFmpeg / media server for RTSP camera conversion when needed
* Docker Compose for private/local deployment

## Repository Rules

Keep the project runnable after every meaningful change.

Do not break the existing `.sog` loading capability.

Do not hardcode Windows absolute paths such as:

```text
D:\xxx\xxx.sog
```

Use project-relative or server-relative URLs such as:

```text
/assets/base.sog
```

When loading local user-selected files, use `URL.createObjectURL(file)` and pass file metadata to PlayCanvas assets.

When loading `.sog`, always provide `filename`:

```js
const asset = new pc.Asset('base.sog', 'gsplat', {
  url: '/assets/base.sog',
  filename: 'base.sog'
});
```

For blob files:

```js
const asset = new pc.Asset(file.name, 'gsplat', {
  url: blobUrl,
  filename: file.name,
  size: file.size
});
```

Do not revoke a blob URL before PlayCanvas finishes loading it.

When replacing a loaded local file, clean up the previous entity, asset, and blob URL safely.

## Frontend Code Organization

Do not put all project logic into `src/main.js`.

As the project grows, split code into modules:

```text
src
├─ engine
│  ├─ createApp.js
│  ├─ CameraController.js
│  ├─ SplatLoader.js
│  ├─ ModelLoader.js
│  ├─ ProxyRaycaster.js
│  ├─ SceneSerializer.js
│  └─ DebugHelpers.js
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
│  ├─ assetApi.js
│  ├─ sceneApi.js
│  ├─ deviceApi.js
│  └─ routeApi.js
└─ types
   ├─ scene.js
   ├─ asset.js
   ├─ device.js
   └─ realtime.js
```

Current JavaScript is acceptable. When the project becomes more complex, migrate to TypeScript gradually rather than rewriting everything at once.

## Scene Design Rules

A scene should be conceptually organized as:

```text
Scene
├─ BaseMap3DGS
├─ ProxyCollisionMesh
├─ StaticModels
├─ DynamicObjects
├─ Buildings
├─ Roads
├─ Cameras
├─ Robots
├─ Devices
├─ Annotations
├─ Routes
├─ SensorLayer
├─ InteractionLayer
└─ CameraAndControls
```

Each scene object should eventually have:

```json
{
  "entityId": "entity_001",
  "assetId": "asset_001",
  "type": "glb | obj | ply | camera | robot | building | route | annotation",
  "name": "Object Name",
  "position": [0, 0, 0],
  "rotation": [0, 0, 0],
  "scale": [1, 1, 1],
  "metadata": {}
}
```

Rules:

* Every asset must eventually have a stable `assetId`.
* Every scene object must eventually have a stable `entityId`.
* Display names are not stable IDs.
* Scene state must be serializable.
* Static scene configuration and realtime device state must be separated.
* UI should not directly mutate scattered PlayCanvas entities without going through managers.
* Future editing actions should be designed so Undo/Redo can be added.

## 3DGS Rules

3DGS is a visual map, similar to a high-realism spatial texture.

Do not assume 3DGS can provide:

* Accurate mesh raycast
* Reliable collision
* Walkable navigation
* Building-level click detection
* Object snapping
* Route planning

Use proxy meshes or business entities for those functions.

Large `.sog` files can be hundreds of MB. Always provide:

* Loading state
* Progress when possible
* Success state
* Full error state
* Console error with useful debug data

Do not only show `failed`.

## Proxy Mesh Rules

Proxy mesh is required for serious interaction.

Use proxy mesh for:

* Click detection
* Ground picking
* Object placement
* Collision
* Building/road/region selection
* Path anchor points
* Navigation surface
* Robot route visualization

Proxy mesh can be simple and invisible.

Typical proxy geometry:

* Planes for ground
* Boxes for buildings
* Simple meshes for roads
* Regions for clickable areas
* Lines or nodes for route networks

3DGS and proxy mesh must share the same coordinate system.

## Coordinate Rules

Coordinate consistency is critical.

All systems must eventually map into one scene coordinate system:

* 3DGS map coordinates
* Proxy mesh coordinates
* GLB / OBJ / PLY model coordinates
* Robot real-world coordinates
* Camera coordinates
* Route coordinates
* Sensor coordinates
* PlayCanvas coordinates

Store calibration data explicitly:

```json
{
  "origin": [0, 0, 0],
  "rotation": [0, 0, 0],
  "scale": [1, 1, 1],
  "unit": "meter"
}
```

Do not scatter coordinate conversion logic. Keep conversion functions centralized.

## Asset Rules

Supported or planned asset formats:

* `.sog` for 3DGS visual base maps
* `.ply` for 3DGS or point cloud data depending on context
* `.glb` / `.gltf` for normal 3D models
* `.obj` as import format, preferably converted to GLB later
* Images for labels, icons, textures, and UI
* JSON for scene, route, and annotation data
* Camera streams through backend media services later

Rules:

* Do not rely only on file names.
* Use asset records and IDs.
* Keep original files and converted files separate.
* Prefer GLB for runtime models.
* Do not load all large assets eagerly.
* Reuse loaded assets when possible.
* Show asset load errors in UI and console.

## Interaction Rules

Interaction should be based on the entity system.

Typical user interactions:

* Click building
* Click road
* Click robot
* Click camera
* Click device
* Show information popup
* Show robot route to selected target
* Show camera video
* Place a model on the map
* Add annotation
* Toggle layer visibility
* Edit transform

Rules:

* Do not bind complex business logic directly inside mouse event handlers.
* Mouse events should dispatch higher-level selection or command events.
* Click detection should prioritize business objects and proxy mesh.
* 3DGS should not be the primary hit-test target.
* Camera video and device data should be loaded on demand.

## Robot and Route Rules

Robots are dynamic entities.

Robot data should include:

* Robot ID
* Current position
* Rotation / heading
* Online state
* Task state
* Battery state
* Current route
* Target point
* Error state

Route data should be a list of scene-space points.

Frontend should display routes and robot movement, but complex path planning should be handled by backend or an external robot system.

Robot movement in the frontend should use interpolation to avoid visual jumping.

## Camera Rules

Cameras are scene entities with business metadata.

Camera data should include:

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
* Camera status can be realtime data.
* Camera position and direction should be editable and persisted.

## Realtime Rules

Realtime data should not overwrite static scene configuration.

Use realtime channels for:

* Robot position updates
* Device status updates
* Camera status updates
* Alarm events
* Route updates
* Task updates
* Sensor readings

Expected realtime message style:

```json
{
  "type": "robot.position.updated",
  "id": "robot_001",
  "position": [12.5, 0, -8.2],
  "rotation": [0, 90, 0],
  "timestamp": 1710000000000
}
```

Rules:

* Realtime messages must have a clear `type`.
* Realtime messages must reference stable IDs.
* High-frequency updates should be throttled or interpolated.
* Important events can be persisted later.
* Frontend should tolerate missing, delayed, or out-of-order messages.

## Error Handling Rules

Every async operation must have:

* Loading state
* Success state
* Error state
* Useful console logs

For `.sog` loading errors, check:

* Is the URL correct?
* Can the browser access the file?
* Was `filename` provided?
* Is the file too large?
* Is the engine version compatible?
* Is the browser running out of memory?
* Does the console show WebGL/WebGPU errors?

Do not hide errors behind generic messages.

## Testing / Verification Rules

After changes, verify at least:

* `npm run dev` starts
* Browser opens the Vite URL
* Existing `public/assets/base.sog` still loads
* Reset camera works
* Window resize works
* Asset loading errors are visible
* Console does not contain unexplained errors

For future features, verify:

* Scene can serialize and reload
* Proxy click returns expected point
* Model overlay appears in correct coordinates
* Entity selection works
* Realtime updates do not break static scene state

## Development Style

Make small, safe, runnable changes.

Prefer clear architecture over quick hacks.

Do not introduce backend, React, TypeScript migration, or database changes unless the current task explicitly asks for it.

When asked to implement a feature:

1. Preserve current working viewer.
2. Add the smallest useful abstraction.
3. Keep the code easy to extend.
4. Explain what changed.
5. Explain how to test it.
