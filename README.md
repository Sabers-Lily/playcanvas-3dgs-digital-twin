# PlayCanvas 3DGS Digital Twin Monorepo

当前项目已整理为一个最小前后端 monorepo：

```text
apps/web        # Vite + Vue + PlayCanvas Mini Editor
apps/api        # Local API skeleton
packages/shared # Shared constants
scripts         # Local conversion scripts
input           # Source .ply input
```

当前正式入口说明：

```text
apps/web        # 正式前端入口
apps/api        # 正式后端入口
packages/shared # 正式共享包入口
```

根目录旧前端入口：

```text
src
public
index.html
vite.config.js
```

已不再作为正式入口，也不应继续在后续开发中恢复使用。

当前前端仍保留：

- `base.sog` 加载
- 本地 `.sog` 加载
- Converted SOG 加载
- BIM / GLB 加载
- 左侧层级 / 右侧属性
- 对象选中 / 显隐 / 重命名 / 删除
- 通用 Transform / 聚焦

当前后端只提供最小 skeleton：

- `GET /health`
- `GET /api/health`
- `GET /api/version`

当前不包含：

- 数据库
- PostgreSQL
- Redis
- MinIO
- 登录
- 鉴权
- Scene JSON 保存
- 文件上传
- WebSocket
- MQTT
- 机器人业务
- 摄像头业务
- 路线业务

## Install

```bash
npm install
cmd /c pnpm install
```

## Run

同时启动前后端：

```bash
cmd /c pnpm dev
```

单独启动：

```bash
cmd /c pnpm dev:web
cmd /c pnpm dev:api
```

访问地址：

```text
Web: http://localhost:5173
API: http://localhost:3000/api/health
```

## Build

```bash
cmd /c pnpm build:web
cmd /c pnpm build:api
cmd /c pnpm build
```

## Default Assets

```text
apps/web/public/assets/base.sog
apps/web/public/assets/南广场.glb
apps/web/public/assets/converted/map.sog
apps/web/public/assets/.gitkeep
```

前端运行时仍通过这些 URL 访问：

```text
/assets/base.sog
/assets/南广场.glb
/assets/converted/map.sog
```

说明：

* `.gitkeep` 用于保留空资源目录结构
* `base.sog`、`南广场.glb`、converted `.sog` 可以保留在本地
* 大体积 3D 资产应被 `.gitignore` 忽略，不应继续提交到 Git

## Convert PLY To SOG

```bash
npm run convert:ply -- ./input/map.ply ./apps/web/public/assets/converted/map.sog
```

也支持省略输出路径：

```bash
npm run convert:ply -- ./input/map.ply
```

默认输出到：

```text
apps/web/public/assets/converted/map.sog
```

## API Health Check

前端启动后会尝试请求：

```text
/api/health
```

底部日志会显示：

```text
API: connected
```

或：

```text
API: offline
```

即使 API 未启动，前端 3DGS Viewer 仍然可以正常加载 `base.sog`。
