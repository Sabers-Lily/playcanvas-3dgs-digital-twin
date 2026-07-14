# 投影功能代码总览

## 1. 文档目的

这份文档专门总结当前项目里的“投影功能”相关代码。

阅读顺序按两层来排：

1. 上半部分先看交互 / UI 层
2. 下半部分再看函数 / 运行时层

这样更容易先回答两个问题：

- 用户在界面上到底能做什么
- 这些操作最后是怎么走到 3DGS shader 里的

---

## 2. 一句话总览

当前投影功能的核心思路是：

```text
UI 按钮 / 面板输入
  -> App 事件转发
  -> runtime 更新 cameraDevice.metadata.videoProjection
  -> compatibility adapter 同步到 projection/source registry
  -> scheduler 选出当前活跃投影
  -> GsplatProjectionRenderer 把视频纹理和投影参数送进 gsplat shader
  -> 3DGS 片元颜色在 shader 中被替换或混合
```

其中最重要的真实数据来源仍然是：

```text
SceneObjectManager
  -> cameraDevice.metadata.videoProjection
```

也就是说：

- UI 读的是这份数据
- 保存 / 导出读的是这份数据
- 运行时 registry 也是从这份数据派生出来的

---

## 3. 投影相关文件清单

### 3.1 交互 / UI 层

- `apps/web/src/App.vue`
- `apps/web/src/components/ToolbarPanel.vue`
- `apps/web/src/components/InspectorPanel.vue`

### 3.2 场景对象与持久化层

- `apps/web/src/editor/SceneObjectManager.js`
- `apps/web/src/features/project/collectCurrentProject.js`

### 3.3 runtime 主入口

- `apps/web/src/runtime/createMiniEditorRuntime.js`

### 3.4 projection 子系统

- `apps/web/src/runtime/projection/ProjectionConfigCompatibilityAdapter.js`
- `apps/web/src/runtime/projection/ProjectionConfigRegistry.js`
- `apps/web/src/runtime/projection/ProjectionEditingController.js`
- `apps/web/src/runtime/projection/ProjectionScheduler.js`
- `apps/web/src/runtime/projection/GsplatProjectionRenderer.js`
- `apps/web/src/runtime/projection/ProjectionDiagnostics.js`

## 4. 交互 / UI 层

---

## 5. 交互层总流程

从界面角度看，投影功能主要分 4 类操作：

1. 创建摄像头对象
2. 绑定摄像头流 / 视频源
3. 开始四点编辑并采点
4. 应用 / 开关投影

可以先把它理解成下面这条链：

```text
ToolbarPanel / InspectorPanel
  -> emit('action' / 'command')
  -> App.vue 转发给 runtime
  -> createMiniEditorRuntime.js 内部函数真正执行
```

---

## 6. ToolbarPanel.vue

文件：

```text
apps/web/src/components/ToolbarPanel.vue
```

这里提供了投影功能最直观的顶部入口。

### 6.1 相关菜单项

投影相关命令主要有：

```js
{ command: 'create-object', payload: 'cameraDevice' }
{ command: 'toolbar-action', payload: 'start-quad-video-projection-editing' }
{ command: 'toolbar-action', payload: 'apply-quad-video-projection' }
{ command: 'toggle-projection-enabled' }
```

### 6.2 它的职责

这里本身不做投影逻辑，只负责发命令。

可以把它理解成：

```js
// 中文注释：ToolbarPanel 只是 UI 触发器
// 它不直接操作 SceneObjectManager，也不直接操作 PlayCanvas shader
emit('command', { command, payload });
```

### 6.3 阅读重点

如果你是第一次顺代码，ToolbarPanel 只要确认两件事：

- 哪些命令会被发出去
- 命令名字是什么

真正的逻辑要去 App.vue 和 runtime 里看。

---

## 7. InspectorPanel.vue

文件：

```text
apps/web/src/components/InspectorPanel.vue
```

这是投影功能最重要的 UI 面板。

### 7.1 为什么它重要

因为这里决定了“右侧属性”里投影功能可编辑的全部字段。

也就是说，当前投影配置的 UI 形态，基本就写在这里。

### 7.2 核心表单：videoProjectionForm

投影表单字段包括：

```js
const videoProjectionForm = reactive({
  enabled: false,
  sourceType: CAMERA_SOURCE_TYPES.CAMERA_STREAM,
  cameraId: 'camera1',
  streamUrl: '',
  mode: 'quadOverlay',
  videoUrl: '',
  opacity: 1,
  softEdge: 0.05,
  flipY: false,
  replaceMode: false,
  quadPlaneTolerance: 0.25
});
```

### 7.3 这些字段分别代表什么

```text
enabled
  是否启用投影

sourceType
  视频来源类型，目前主要是 cameraStream

cameraId
  绑定哪个摄像头流

streamUrl / videoUrl
  最终播放视频的地址

mode
  投影模式
  cameraFrustum / quad / quadOverlay

opacity
  非 replace 模式下的混合强度

softEdge
  边缘软化强度

flipY
  是否翻转 Y

replaceMode
  是直接覆盖还是混合

quadPlaneTolerance
  world quad 模式下的平面容差
```

### 7.4 右侧属性是怎么把数据发出去的

关键函数：

```js
function emitVideoProjectionPatch(patch = {}) {
  emit('action', 'update-video-projection', {
    enabled: videoProjectionForm.enabled,
    sourceType: videoProjectionForm.sourceType,
    cameraId: videoProjectionForm.cameraId,
    streamUrl: videoProjectionForm.streamUrl || null,
    mode: videoProjectionForm.mode,
    videoUrl: videoProjectionForm.videoUrl,
    opacity: videoProjectionForm.opacity,
    softEdge: videoProjectionForm.softEdge,
    flipY: videoProjectionForm.flipY,
    replaceMode: videoProjectionForm.replaceMode,
    quadPlaneTolerance: videoProjectionForm.quadPlaneTolerance,
    ...patch
  });
}
```

它的职责可以写成：

```js
// 中文注释：右侧属性面板不会直接改 runtime
// 它只会把当前表单值打包成 patch，再交给外部 runtime 处理
```

### 7.5 四点相关按钮

这里有三类最关键的按钮：

```text
开始选四点
清空四点
应用四点投影
```

还会配合：

```text
启动摄像
绑定摄像
启用投影 / 关闭投影
```

### 7.6 预览区在看什么

Inspector 里除了配置，还有一个投影预览区。

它主要读：

```text
currentProjectionRuntime
projectionPreviewUrl
currentCameraStreamStatus
```

也就是说右侧属性除了“改配置”，还承担了“展示投影运行状态”的职责。

---

## 8. App.vue

文件：

```text
apps/web/src/App.vue
```

### 8.1 它在投影功能里的角色

`App.vue` 本身不是投影逻辑实现者，它更像 UI 和 runtime 之间的总线。

它做的事主要是：

- 接住各个组件发出的 action
- 转给 runtime
- 从 runtime snapshot 里拿状态渲染 UI

### 8.2 和投影相关的典型转发

例如：

```text
toggle-projection-enabled
update-video-projection
start-quad-video-projection-editing
apply-quad-video-projection
```

### 8.3 它还负责哪些投影 UI 状态

App 会根据 runtime snapshot 判断：

- 当前是否在 `quadVideoProjection` 编辑模式
- 当前选中的 cameraDevice 是否处于 `quadEditing`
- 当前四点数量是否等于 4

所以可以把它理解成：

```js
// 中文注释：App.vue 负责把 runtime snapshot 翻译成页面状态
// 但不会自己成为投影状态的第二份真相
```

---

## 9. 交互层的完整调用链

这里给一个最常见的“开始四点投影”流程。

```text
用户点击右侧属性“开始选四点”
  -> InspectorPanel emit('action', 'start-quad-video-projection-editing')
  -> App.vue 收到 action
  -> App.vue 转给 runtime.handleInspectorAction(...)
  -> createMiniEditorRuntime.js 调用 startQuadVideoProjectionEditing(cameraId)
  -> ProjectionEditingController.start(...)
  -> 视口点击开始收集四个世界点
  -> 用户点击“应用四点投影”
  -> runtime.applyQuadVideoProjection(cameraId)
  -> 更新 metadata / registry / renderer
  -> GsplatProjectionRenderer 在 shader 中生效
```

---

## 10. 函数 / 运行时层

---

## 11. runtime 主入口：createMiniEditorRuntime.js

文件：

```text
apps/web/src/runtime/createMiniEditorRuntime.js
```

这是投影功能的总装配点。

### 11.1 它在投影系统里的位置

可以理解成：

```text
createMiniEditorRuntime.js
  = 把 SceneObjectManager、SelectionManager、投影 registry、
    编辑控制器、渲染器、调度器、拾取逻辑 全部接起来的地方
```

### 11.2 投影相关对象初始化

这里初始化了：

```js
const projectionConfigRegistry = new ProjectionConfigRegistry();
const projectionCompatibilityAdapter = new ProjectionConfigCompatibilityAdapter(...);
const projectionEditingController = new ProjectionEditingController(...);
const projectionScheduler = new ProjectionScheduler(...);
const gsplatProjectionRenderer = new GsplatProjectionRenderer(...);
const projectionDiagnostics = new ProjectionDiagnostics(...);
```

这几者职责不同：

```text
ProjectionConfigRegistry
  保存当前运行时投影配置

ProjectionConfigCompatibilityAdapter
  负责 metadata <-> registry 的桥接

ProjectionEditingController
  负责四点编辑状态机

ProjectionScheduler
  决定哪些投影当前应激活

GsplatProjectionRenderer
  真正把投影送进 3DGS shader

ProjectionDiagnostics
  给 UI / 调试层提供投影运行诊断
```

---

## 12. 业务侧投影结构：createDefaultVideoProjectionMetadata

关键函数：

```js
function createDefaultVideoProjectionMetadata(id, partial = {}) { ... }
```

### 12.1 为什么它重要

这基本就是“投影配置数据模型”的标准化入口。

也就是说，不管来源是什么：

- 新建 cameraDevice
- Inspector 改配置
- 绑定摄像头流
- 四点采点
- 应用四点投影

最后都会尽量归一成这份结构。

### 12.2 它解决什么问题

主要解决三类问题：

1. 给缺失字段补默认值
2. 把 mode 规范成可控枚举
3. 保证 metadata 结构稳定，方便 UI / 保存 / 运行时共用

### 12.3 可以这样理解

```js
// 中文注释：这是投影配置的“标准形态”
// 右侧属性、场景对象存储、运行时同步，都会围绕这份结构转
```

---

## 13. metadata 到 registry：syncProjectionArchitectureFromSceneObjects

关键函数：

```js
function syncProjectionArchitectureFromSceneObjects() { ... }
```

### 13.1 它在做什么

它会扫描所有 `cameraDevice` 场景对象，然后把每个对象上的：

```text
sceneObject.metadata.videoProjection
```

同步进 projection 子系统。

### 13.2 为什么必须有这一步

因为项目当前仍坚持这条约束：

```text
SceneObjectManager 是业务场景对象的真实来源
```

所以 runtime 里的 projection registry 不能自己漂移，必须不断从场景对象重建 / 对齐。

---

## 14. 视频源绑定：bindCameraStreamToProjection / ensureProjectionVideoSource

关键函数：

```js
async function bindCameraStreamToProjection(cameraObjectId, cameraSourceId) { ... }
async function ensureProjectionVideoSource(cameraObjectId, projection = null) { ... }
```

### 14.1 它们负责什么

```text
bindCameraStreamToProjection
  显式绑定摄像头流到投影对象

ensureProjectionVideoSource
  在真正启用投影前，确保投影已有可用视频源
```

### 14.2 为什么有两个函数

因为这套系统既支持“先绑定再投影”，也支持“应用投影时发现没源，就自动补绑定”。

也就是：

```js
// 中文注释：bind 是显式绑定
// ensure 是兜底保障，避免用户直接启用投影时没有视频源
```

---

## 15. 核心 patch 入口：updateCameraVideoProjection

关键函数：

```js
function updateCameraVideoProjection(cameraId = 'camera_0', patch = {}) { ... }
```

### 15.1 这是最重要的 runtime 入口之一

右侧属性、部分工具栏动作，最终都会走到这里。

它会做三件事：

1. 更新 metadata
2. 刷新当前激活投影实例
3. 重建四点辅助实体

### 15.2 它的逻辑可抽象成

```js
// 中文注释：
// 先把 patch 写回 cameraDevice.metadata.videoProjection
// 再刷新运行时投影实例
// 最后刷新四点辅助点位显示
```

---

## 16. 四点编辑入口：startQuadVideoProjectionEditing

关键函数：

```js
function startQuadVideoProjectionEditing(cameraId) { ... }
```

### 16.1 它会做什么

开始四点编辑时，会做这些关键操作：

```text
1. 检查当前选中对象是不是 cameraDevice
2. 防止多个 cameraDevice 同时进入四点编辑
3. 如果当前在 transform 编辑，先提交 transform
4. 保持 cameraDevice 选中
5. ProjectionEditingController.start(...)
6. 把 mode 切到 quadOverlay
7. 重建四点辅助显示
```

### 16.2 为什么“保持选中”很重要

因为 AGENTS 里有明确约束：

```text
四点编辑期间，视口点击应优先加点，且不能让右侧属性掉成 No selection
```

所以这里的 selection 保持逻辑非常关键。

---

## 17. 四点采点：addQuadVideoProjectionPoint

关键函数：

```js
function addQuadVideoProjectionPoint(cameraId, worldPosition) { ... }
```

### 17.1 它在做什么

每次视口点击命中后，它会：

```text
1. 读取当前 cameraDevice 的 videoProjection
2. 检查当前是否处于 quadEditing
3. 按顺序创建一个 quad point
4. 把点追加到 quadPoints
5. 如果点数达到 4，则结束编辑态
6. 回写 metadata
7. 刷新辅助点显示
```

### 17.2 这一步的本质

```js
// 中文注释：四点编辑不是把点存到全局数组里
// 而是直接存回选中的 cameraDevice.metadata.videoProjection.quadPoints
```

这点很重要，因为它符合项目的状态约束。

---

## 18. 四点应用：applyQuadVideoProjection

关键函数：

```js
async function applyQuadVideoProjection(cameraId) { ... }
```

### 18.1 它会做什么

应用四点投影时，主要流程是：

```text
1. 检查是否是 cameraDevice
2. 检查 quadPoints 是否正好 4 个
3. ensureProjectionVideoSource，确保有视频源
4. ProjectionEditingController.apply(...)
5. updateCameraVideoProjection(...)
6. enabled = true
7. mode = quadOverlay
8. 把 opacity / softEdge / replaceMode 等参数一并带上
```

### 18.2 为什么默认走 quadOverlay

当前项目里，四点可见区域覆盖的主路径是：

```text
quadOverlay
```

它不是严格用世界平面容差裁切，而是：

```text
先把四个世界点投到屏幕空间
再在 shader 里做屏幕四边形覆盖和 UV 映射
```

所以用户肉眼看到的覆盖区域会更直接。

---

## 19. 视口点击为什么会优先采四点

关键位置：

```text
createMiniEditorRuntime.js
  -> onGsplatPick
  -> onFallbackPick
```

### 19.1 正常拾取时

平时点击视口，会走普通拾取 / 选中 / marker / 放置对象等流程。

### 19.2 四点编辑时

如果当前存在 `editingQuadCameraId`，那么点击优先变成：

```js
addQuadVideoProjectionPoint(editingQuadCameraId, hit.worldPoint);
selectionManager.select(editingQuadCameraId);
return;
```

### 19.3 这段逻辑非常关键

因为它直接保证了：

```text
四点编辑优先级 > 普通对象选择优先级
```

也正因为如此：

- 点一下不会跳去选中别的对象
- 右侧属性不会丢失摄像头上下文
- 视口点击能连续完成四点采集

---

## 20. 四点辅助实体：rebuildQuadProjectionHelpers

关键函数：

```js
function rebuildQuadProjectionHelpers(cameraId) { ... }
```

### 20.1 它负责什么

它负责把四点编辑时的辅助点位实体重建出来，让用户看到当前已经选了哪些点。

### 20.2 需要注意的约束

这些 helper 实体不是业务对象：

```text
它们不应该注册进 SceneObjectManager
它们不应该出现在左侧层级
它们名字要带 __quad_projection_ 前缀
```

这正是 AGENTS 里的硬约束之一。

---

## 21. ProjectionConfigCompatibilityAdapter

文件：

```text
apps/web/src/runtime/projection/ProjectionConfigCompatibilityAdapter.js
```

### 21.1 它是做什么的

它是“旧业务结构”和“新运行时结构”之间的桥。

桥接两边分别是：

```text
左边：
  sceneObject.metadata.videoProjection

右边：
  sourceRegistry + projectionRegistry
```

### 21.2 hydrateSceneObject

核心职责：

```text
把 cameraDevice.metadata.videoProjection
拆成：
  1. sourceConfig
  2. projectionConfig
```

### 21.3 updateProjectionForObject

核心职责：

```text
先从 metadata 还原当前配置
再应用 patch
再更新 sourceRegistry / projectionRegistry
最后把归一化后的结果写回 SceneObjectManager
```

### 21.4 它为什么重要

因为没有这层，系统会变成两份真相：

- 一份在 SceneObjectManager
- 一份在 projection registry

而这个项目明确不希望这样。

---

## 22. ProjectionEditingController

文件：

```text
apps/web/src/runtime/projection/ProjectionEditingController.js
```

### 22.1 它的角色

这是一个很纯粹的“四点编辑状态机”。

它不关心 UI 长什么样，也不直接关心 shader 怎么写。

它只关心：

```text
当前是否在编辑
当前已经有几个点
什么时候开始
什么时候停止
什么时候 apply
```

### 22.2 关键方法

```text
start(projectionId)
stop()
addWorldPoint(worldPoint)
clear(projectionId)
apply(projectionId)
```

### 22.3 最关键的设计点

```js
// 中文注释：
// start 会先清空点并关闭投影
// addWorldPoint 逐个收集点
// 第 4 个点到达后结束编辑态
// apply 才真正把 enabled 切回 true
```

这意味着：

```text
采点完成 != 投影已经应用
```

这两个步骤是分开的。

---

## 23. ProjectionConfigRegistry

文件：

```text
apps/web/src/runtime/projection/ProjectionConfigRegistry.js
```

### 23.1 它的职责

这是运行时的投影配置仓库。

它保存的是“已经规范化后的 projection config”，而不是业务对象本身。

### 23.2 它和 SceneObjectManager 的区别

```text
SceneObjectManager
  负责业务对象持久状态

ProjectionConfigRegistry
  负责运行时投影配置状态
```

但它不能成为第一真相，仍然要从 metadata 派生。

---

## 24. ProjectionScheduler

文件：

```text
apps/web/src/runtime/projection/ProjectionScheduler.js
```

### 24.1 它的职责

投影不一定全部同时渲染，所以这里负责决定：

```text
哪些 projection 当前进入 activeSet
```

### 24.2 为什么需要调度器

因为 runtime 里有：

```text
MAX_ACTIVE_RENDER_PROJECTIONS = 4
```

也就是说，系统设计上允许多个投影对象存在，但真正进入 shader 的活动投影数是有限的。

---

## 25. GsplatProjectionRenderer

文件：

```text
apps/web/src/runtime/projection/GsplatProjectionRenderer.js
```

这是投影功能里最核心的渲染层。

### 25.1 它负责什么

一句话概括：

```text
把视频、投影器矩阵、四点信息、屏幕映射参数等，全部传入 gsplat shader
```

### 25.2 它内部的执行路径

当前实现只保留覆盖投影的 slot 路径：

```text
slot0 / slot1 / slot2 / slot3
  -> 每个 slot 一套 texture + uniform
  -> 统一装进共享 gsplat shader
```

### 25.3 syncActiveSet

这个函数决定当前哪些投影进入 slot：

```text
如果 activeProjectionIds 为空
  -> 清空 slot，并恢复原 shader chunk

如果 activeProjectionIds 非空
  -> 按顺序装入 slot，并走统一 overlay shader 路径
```

### 25.4 updateMatrices

这里会准备：

```text
主相机投影矩阵
主相机 view 矩阵
主相机 inverse view-projection
屏幕尺寸 uniform
```

这一步是为了让 shader 在片元阶段重建世界坐标。

### 25.5 updateSlots

这里会为每个 slot 准备：

```text
projectorViewProj
quad 世界坐标
quad 屏幕坐标
quad UV 单应矩阵
video texture 绑定
texture.upload()
```

也就是说，真正把四点、视频、投影器姿态拼起来的地方就在这里。

### 25.6 updateUniforms

这里把每个 slot 的参数全部送进材质：

```text
uProjectedVideoX
uProjectorViewProjX
uProjectionEnabledX
uProjectionOpacityX
uProjectionSoftEdgeX
uProjectionFlipYX
uProjectionModeX
uProjectionReplaceModeX
uProjectionQuadPlaneToleranceX
uProjectionQuadXP0~P3
uProjectionQuadXScreenP0~P3
uProjectionQuadXUvHomographyRow0~2
```

### 25.7 computeQuadHomography

这是 `quadOverlay` 模式最值得单独看的函数。

它做的事是：

```text
已知屏幕上的四边形四个点
求一个从 screen quad -> video UV 的单应矩阵
```

shader 里再利用这个矩阵，把当前片元屏幕坐标映射到视频 UV。

### 25.8 它为什么是当前主路径

因为 `quadOverlay` 的目标不是精确世界平面投影，而是：

```text
让用户在屏幕上看到一个更稳定、更完整的覆盖区域
```

所以它对“可见覆盖效果”更友好。

---

## 26. 当前只保留覆盖投影

当前仓库已经去掉旧的单投影执行路径，也不再保留 `cameraFrustum` 和 `quad` 两种运行模式。

现在统一只有这一条路径：

```text
cameraDevice.metadata.videoProjection
  -> mode 固定为 quadOverlay
  -> ProjectionScheduler activeSet
  -> GsplatProjectionRenderer slot shader
```

这样做的直接结果是：

```text
单投影和多投影不再走两套代码
所有投影都复用同一套纹理绑定、uniform 上传和 shader 分支
```

---

## 27. 投影模式说明

当前只保留一种投影模式：

### 27.1 quadOverlay

```text
把四个世界点先投影到屏幕空间
再在屏幕空间内做四边形覆盖
最后通过单应矩阵映射到视频 UV
```

---

## 28. 保存 / 导出层

### 28.1 SceneObjectManager.js

文件：

```text
apps/web/src/editor/SceneObjectManager.js
```

它会把 `metadata.videoProjection` 连同场景对象一起保存成可序列化状态。

### 28.2 collectCurrentProject.js

文件：

```text
apps/web/src/features/project/collectCurrentProject.js
```

这里会在项目导出时收集：

- camera stream 相关配置
- fourPointProjections 相关信息

也就是说，投影配置不仅是运行时能力，也已经进入项目保存结构。

---

## 29. 最重要的状态真相

如果你只记一条，请记这一条：

```text
投影功能最上层的真实数据是：
cameraDevice.metadata.videoProjection
```

下面这些都是围绕它派生的：

```text
InspectorPanel 的表单显示
ProjectionConfigCompatibilityAdapter 的桥接
ProjectionConfigRegistry 的运行时配置
ProjectionEditingController 的编辑状态
ProjectionScheduler 的激活集合
GsplatProjectionRenderer 的 shader uniform
项目导出的投影配置
```

---

## 30. 最推荐的阅读顺序

如果你现在要真正顺代码看，我建议按这个顺序：

### 第一步：看交互入口

```text
ToolbarPanel.vue
InspectorPanel.vue
App.vue
```

目标：

```text
先确认用户能触发哪些投影命令
```

### 第二步：看 runtime 主入口

```text
createMiniEditorRuntime.js
```

重点函数：

```text
createDefaultVideoProjectionMetadata
syncProjectionArchitectureFromSceneObjects
updateCameraVideoProjection
startQuadVideoProjectionEditing
addQuadVideoProjectionPoint
applyQuadVideoProjection
onGsplatPick
onFallbackPick
```

目标：

```text
看懂按钮是怎么变成 metadata 更新和拾取行为切换的
```

### 第三步：看四点编辑状态机

```text
ProjectionEditingController.js
```

目标：

```text
看懂“四点编辑”和“应用投影”为什么是两个阶段
```

### 第四步：看 metadata 和 registry 的桥

```text
ProjectionConfigCompatibilityAdapter.js
ProjectionConfigRegistry.js
```

目标：

```text
看懂为什么不能让 projection registry 自己成为第一真相
```

### 第五步：看 shader 渲染层

```text
GsplatProjectionRenderer.js
```

目标：

```text
看懂视频为什么能真正贴到 3DGS 上
```

---

## 31. 按源码阅读顺序的 line-by-line 导读

这一节不是逐行解释每一行代码，而是按“你打开文件后，往下读到哪里时，脑子里应该先理解什么”的顺序来导读。

建议阅读方式：

```text
左边打开这份文档
右边打开对应源码文件
按这里给出的顺序往下翻
每读完一小段，先确认“这一段的职责”再继续
```

---

### 31.1 第一站：InspectorPanel.vue

文件：

```text
apps/web/src/components/InspectorPanel.vue
```

建议按下面顺序看：

#### A. 先看 `videoProjectionForm`

先找到：

```js
const videoProjectionForm = reactive({ ... })
```

这里先不要急着看按钮，先确认这个表单到底描述了什么。

你要先在脑子里建立这件事：

```text
右侧属性面板里的投影配置字段
几乎就是 cameraDevice.metadata.videoProjection 的 UI 镜像
```

这一段重点看：

- `enabled`
- `cameraId`
- `streamUrl`
- `mode`
- `opacity`
- `softEdge`
- `flipY`
- `replaceMode`
- `quadPlaneTolerance`

#### B. 再看 `videoProjection` / `currentProjectionRuntime`

继续往下看这些 computed：

```js
const videoProjection = computed(...)
const currentProjectionRuntime = computed(...)
const currentCameraStreamStatus = computed(...)
```

这里要先区分两类状态：

```text
videoProjection
  业务配置状态，来自 selection.metadata.videoProjection

currentProjectionRuntime
  运行时状态，来自 runtime snapshot
```

也就是说：

```text
一个回答“配置是什么”
一个回答“现在运行得怎么样”
```

#### C. 再看 `resetVideoProjectionForm`

这里是右侧属性“把选中对象当前配置灌回表单”的地方。

要看懂的重点是：

```text
右侧属性不是自己记一份真相
而是每次根据当前 selection.metadata.videoProjection 来刷新表单
```

#### D. 再看 `emitVideoProjectionPatch`

这是 InspectorPanel 里最重要的函数之一。

读这一段时，你要明确：

```text
InspectorPanel 不直接改投影逻辑
它只负责把当前表单值打包成一个 patch 向外 emit
```

#### E. 最后再看 template 里的投影按钮

等前面这些都明白之后，再看：

- `开始选四点`
- `清空四点`
- `应用四点投影`
- `启动摄像`
- `绑定摄像`
- `启用投影 / 关闭投影`

这时候你看按钮就不会只看到 UI，而会自然想到：

```text
这个按钮最后会把哪一种 action 发给 App.vue
```

---

### 31.2 第二站：App.vue

文件：

```text
apps/web/src/App.vue
```

这一层不要读太细，重点只看“转发”。

#### A. 先看 snapshot 如何影响页面

优先看：

```js
projectionEditingObject
snapshot.activeEditMode === 'quadVideoProjection'
quadPointCount
```

这里的重点是：

```text
App.vue 会根据 runtime snapshot 推导页面状态
例如当前是否正在四点编辑、四点数量够不够
```

#### B. 再看 action 转发分支

重点看这些 case：

- `toggle-projection-enabled`
- `update-video-projection`
- `start-quad-video-projection-editing`
- `apply-quad-video-projection`

读这段时只需要记住一句：

```text
App.vue 不是投影逻辑实现者
它只是把 UI 动作转发给 runtime
```

---

### 31.3 第三站：createMiniEditorRuntime.js

文件：

```text
apps/web/src/runtime/createMiniEditorRuntime.js
```

这是整套投影功能最值得慢慢看的文件。

建议按下面顺序分块读，不要从头到尾硬扫。

#### A. 先找 `createDefaultVideoProjectionMetadata`

这是第一锚点。

如果这段没看明白，后面所有 patch、同步、编辑状态都会混在一起。

读这一段时要先回答：

```text
项目里一个标准投影配置对象到底长什么样
```

建议把这几个字段单独记下来：

- `enabled`
- `sourceType`
- `cameraId`
- `streamUrl`
- `mode`
- `videoUrl`
- `opacity`
- `softEdge`
- `flipY`
- `replaceMode`
- `quadEditing`
- `quadPoints`
- `quadPlaneTolerance`

#### B. 再找 projection 子系统初始化

看这些初始化代码：

```js
const projectionConfigRegistry = new ProjectionConfigRegistry();
const projectionCompatibilityAdapter = new ProjectionConfigCompatibilityAdapter(...);
const projectionEditingController = new ProjectionEditingController(...);
const projectionScheduler = new ProjectionScheduler(...);
const gsplatProjectionRenderer = new GsplatProjectionRenderer(...);
```

这里不要陷进实现细节，先建立“角色地图”：

```text
registry 负责存运行时配置
adapter 负责桥接 metadata 和 registry
editing controller 负责四点编辑状态
scheduler 负责选择激活投影
renderer 负责真正把投影送进 shader
```

#### C. 再看 `syncProjectionArchitectureFromSceneObjects`

这是第二锚点。

这一段看懂后，你会知道为什么项目仍然坚持：

```text
SceneObjectManager 才是场景对象和投影配置的第一真相
```

你要带着这个问题看：

```text
为什么 projection registry 不能自己活成独立真相
```

#### D. 再看 `bindCameraStreamToProjection` 和 `ensureProjectionVideoSource`

这两段是“视频源是否可用”的关键。

读这里时重点理解：

```text
投影生效不只需要 quadPoints
还需要一个真正能播放的视频源
```

也要注意区分：

```text
bind
  显式绑定流

ensure
  真正启用投影前的兜底检查
```

#### E. 再看 `syncCameraProjectionMetadata`

这段很短，但它是整个系统最关键的“写回入口”之一。

读这里时，要先搞懂这句话：

```text
所有投影配置修改，最终都要回写到 cameraDevice.metadata.videoProjection
```

#### F. 再看 `updateCameraVideoProjection`

这是第三锚点。

你要把它理解成：

```text
投影配置 patch 的主入口
```

这一段读的时候重点看三件事：

1. patch 是怎么写回 metadata 的
2. active projector 是怎么刷新的
3. 四点 helper 是怎么重建的

#### G. 再看四点辅助相关函数

继续往下看：

- `clearQuadProjectionHelpers`
- `rebuildQuadProjectionHelpers`
- `getEditingQuadProjectionCameraId`

读这一段时要明确：

```text
helper 只是辅助可视化实体
不是业务场景对象
```

所以这里的阅读重点不是“怎么画”，而是：

```text
为什么这些实体不进 SceneObjectManager
为什么名字带 __quad_projection_ 前缀
```

#### H. 再看 `addQuadVideoProjectionPoint`

这是第四锚点。

读这一段时，先问自己：

```text
点击视口之后，这个点到底存到哪里去了
```

正确答案是：

```text
直接写回 cameraDevice.metadata.videoProjection.quadPoints
```

不是：

- Vue 本地数组
- 全局临时数组
- 单独 helper manager

#### I. 再看 `startQuadVideoProjectionEditing`

这段最重要的是“进入编辑态时做了哪些保护动作”。

重点盯住：

- 是否限制一次只能编辑一个 cameraDevice
- 是否保留当前 selection
- 是否关闭当前投影
- 是否刷新 helper

#### J. 再看 `applyQuadVideoProjection`

这是第五锚点。

读的时候重点区分两件事：

```text
四点采集完成
!=
投影已经应用
```

`applyQuadVideoProjection` 负责的是真正把：

- 四点
- 视频源
- enabled 状态
- mode
- opacity / softEdge 等参数

组合起来，推到运行时投影系统里。

#### K. 最后看 `onGsplatPick` / `onFallbackPick`

这是理解“为什么视口点击会优先选四点”的关键。

读这里时，你只盯一个判断就够了：

```js
const editingQuadCameraId = getEditingQuadProjectionCameraId();
if (editingQuadCameraId) {
  addQuadVideoProjectionPoint(...);
  selectionManager.select(editingQuadCameraId);
  return;
}
```

这段代码意味着：

```text
只要当前处于四点编辑
点击优先走加点逻辑
普通选择逻辑会被短路
```

这也是整个交互稳定的关键。

---

### 31.4 第四站：ProjectionEditingController.js

文件：

```text
apps/web/src/runtime/projection/ProjectionEditingController.js
```

这个文件推荐完整顺着往下读，因为它本身不长。

#### A. 先看 `start`

这里要理解：

```text
进入编辑态 = 清空旧点 + enabled 关掉 + quadEditing 打开
```

#### B. 再看 `addWorldPoint`

这里要理解：

```text
每次只加一个点
点够 4 个后自动结束 quadEditing
但不会在这里自动启用投影
```

#### C. 再看 `clear`

这里是“彻底清空四点并关闭投影”。

#### D. 最后看 `apply`

这里不要误会它做了很多渲染逻辑。

它其实做得很克制：

```text
只是把 enabled 打开，把 quadEditing 关闭
```

真正后续的渲染刷新还是在 runtime 主流程里完成。

---

### 31.5 第五站：ProjectionConfigCompatibilityAdapter.js

文件：

```text
apps/web/src/runtime/projection/ProjectionConfigCompatibilityAdapter.js
```

这个文件建议按两个函数读：

#### A. 先看 `hydrateSceneObject`

这里回答的问题是：

```text
如何把一个 cameraDevice 的 metadata.videoProjection
拆成 sourceConfig 和 projectionConfig
```

读这一段时，你可以一边对照：

- `createDefaultVideoProjectionMetadata`
- `sourceRegistry.upsert`
- `projectionRegistry.upsert`

#### B. 再看 `updateProjectionForObject`

这里回答的问题是：

```text
UI patch 进来后
如何既更新 registry
又回写场景对象 metadata
```

读这里时要重点体会“先从旧 metadata 重建，再叠 patch”的顺序。

因为这正是防止多份真相漂移的关键。

---

### 31.6 第六站：ProjectionScheduler.js

文件：

```text
apps/web/src/runtime/projection/ProjectionScheduler.js
```

这个文件不用看太久，重点只要搞懂：

```text
不是所有投影都会同时进入渲染
它会根据当前候选集合算出 activeSet
```

然后把这个 activeSet 交给 renderer。

---

### 31.7 第七站：GsplatProjectionRenderer.js

文件：

```text
apps/web/src/runtime/projection/GsplatProjectionRenderer.js
```

这是最后看、也最值得精读的文件。

强烈建议按下面顺序读：

#### A. 先看顶部常量和辅助函数

重点先看：

- `PROJECTION_MODES`
- `sanitizeQuadPoints`
- `computeQuadHomography`

这里先建立“模式”和“屏幕单应矩阵”的基础认知。

#### B. 再看 `syncActiveSet`

这是理解当前运行路径的关键。

这里先回答：

```text
activeProjectionIds 为空时如何清理
activeProjectionIds 非空时如何装入 slot
```

#### C. 再看 `updateSlot`

这是 slot 模式的核心入口之一。

这里主要是在做：

```text
给某个 slot 绑定
projectionId / sourceId / runtime / videoElement / projectorEntity
并准备 quadPoints 和 texture
```

#### D. 再看 `ensureSlotTexture`

这里很关键，因为投影不是只算坐标，还要真正把视频送进 GPU。

这一段重点看：

- `texture.setSource(videoElement)`
- 首次 bind
- 后续 upload

#### E. 再看 `update`

这是 renderer 每帧更新的主入口。

这一段最重要的是把它拆成三步理解：

```text
updateMatrices()
updateSlots()
updateUniforms()
```

#### F. 再看 `updateMatrices`

这里重点理解：

```text
shader 为什么能从片元反推出世界坐标
```

因为主相机的 inverse view-projection 会被传进去。

#### G. 再看 `updateSlots`

这是最值得慢看的段落之一。

重点看它怎么做这几件事：

1. 计算 projectorViewProj
2. 把 quad 世界点写进 uniform 缓冲
3. 把 quad 世界点投到屏幕空间
4. 调用 `computeQuadHomography`
5. 如果视频已经 ready，就执行 `texture.upload()`

这一段如果看懂了，`quadOverlay` 的大半就懂了。

#### H. 再看 `updateUniforms`

这里就是把前面准备好的所有数据真正塞进材质参数。

读的时候你会看到大量：

```text
uProjectedVideoX
uProjectionModeX
uProjectionQuadXP0
uProjectionQuadXScreenP0
uProjectionQuadXUvHomographyRow0
```

这时你应该能把这些 uniform 和前面的数据准备过程一一对上。

#### I. 最后再看 `buildGlslPsChunk` / `buildWgslPsChunk`

这是最后一步，也是 shader 端的真正执行逻辑。

建议最后再读，不要一上来就钻进去。

读这两段时，你重点看三件事：

1. 世界坐标是怎么重建的
2. `quadOverlay` 分支如何完成屏幕覆盖采样
3. 视频颜色最终如何 replace 或 mix 到 gsplat 颜色上

---

### 31.8 第八站：回到 shader chunk 本体

当你已经看完 `updateSlot`、`updateSlots` 和 `updateUniforms` 之后，
再回头读：

```text
buildGlslPsChunk
buildWgslPsChunk
```

这时你已经知道：

```text
每个 uniform 在 JS 侧是怎么准备出来的
每个 slot 的视频纹理是怎么绑定的
```

再去看 shader 字符串拼接，理解会直接很多。

---

### 31.9 如果你时间有限，只读这 10 个锚点

如果你不想一次读太多，至少先把下面这 10 个锚点吃透：

1. `InspectorPanel.vue` 里的 `videoProjectionForm`
2. `InspectorPanel.vue` 里的 `emitVideoProjectionPatch`
3. `createMiniEditorRuntime.js` 里的 `createDefaultVideoProjectionMetadata`
4. `createMiniEditorRuntime.js` 里的 `syncProjectionArchitectureFromSceneObjects`
5. `createMiniEditorRuntime.js` 里的 `updateCameraVideoProjection`
6. `createMiniEditorRuntime.js` 里的 `startQuadVideoProjectionEditing`
7. `createMiniEditorRuntime.js` 里的 `addQuadVideoProjectionPoint`
8. `createMiniEditorRuntime.js` 里的 `applyQuadVideoProjection`
9. `ProjectionConfigCompatibilityAdapter.js` 里的 `updateProjectionForObject`
10. `GsplatProjectionRenderer.js` 里的 `updateSlots` 和 `updateUniforms`

这 10 个点如果都顺下来了，整套投影功能已经能看懂八成以上。

---

## 32. 一个完整例子：应用四点投影到底发生了什么

```text
1. 用户选中一个 cameraDevice
2. 用户点击“开始选四点”
3. runtime 进入 quadEditing
4. 用户在视口点击四次
5. 四个世界点被写入 cameraDevice.metadata.videoProjection.quadPoints
6. 用户点击“应用四点投影”
7. runtime 检查四点是否齐全
8. runtime 确保已有摄像头流 / 视频源
9. compatibility adapter 把 metadata 同步到 registry
10. scheduler 决定该投影是否进入 active set
11. renderer 绑定视频纹理、计算投影参数、更新 shader uniform
12. gsplat shader 在片元阶段根据 mode 选择 quadOverlay 分支
13. shader 用屏幕坐标 -> UV 单应映射采样视频
14. 最终视频颜色替换或混合进 3DGS 颜色
```

---

## 33. 最后一句总结

这套投影代码的核心不是“某个 shader 函数”，而是下面这条完整的数据链：

```text
UI 表单 / 按钮
  -> cameraDevice.metadata.videoProjection
  -> projection registry
  -> active projection set
  -> video texture + matrices + quad data
  -> gsplat shader
```

如果这条链你能顺下来，整个投影功能就基本吃透了。
