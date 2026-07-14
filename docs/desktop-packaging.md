# 桌面版打包说明

## 目录与配置

桌面版首次启动后，会在 Electron `userData` 目录下生成：

- `desktop-shell.json`
- `runtime-data/projects`
- `runtime-data/assets`
- `runtime-data/hls-cache`
- `runtime-data/logs`

其中：

- `desktop-shell.json` 用于声明桌面版运行数据目录和 `ffmpegPath`
- 如果 `ffmpegPath` 为空，桌面版会回退到系统 `PATH` 中的 `ffmpeg`
- 如果 `resources/bin/ffmpeg.exe` 存在，首次会自动写入该路径

桌面窗口顶部菜单新增了 `桌面配置`，可直接：

- 查看当前目录与 FFmpeg 配置
- 打开配置文件
- 打开项目目录
- 打开日志目录
- 打开 HLS 缓存目录
- 重新选择 FFmpeg 可执行文件

## 打包前验证

根目录脚本：

- `pnpm desktop:build:web`
- `pnpm desktop:verify`
- `pnpm desktop:pack`
- `pnpm desktop:dist`

其中 `desktop:verify` 会检查：

- `apps/desktop/src/main.js`
- `apps/desktop/electron-builder.yml`
- `apps/web/dist/index.html`
- `apps/api/src/server.js`
- `electron`
- `electron-builder`

## FFmpeg 放置方式

推荐优先级：

1. 将 `ffmpeg.exe` 放到 `apps/desktop/resources/bin/ffmpeg.exe`
2. 或在桌面版菜单 `桌面配置 -> 选择 FFmpeg 可执行文件` 手动指定
3. 或依赖系统环境变量 `PATH` 中的 `ffmpeg`

## 备注

- 桌面版仍然复用现有 `apps/web` 和 `apps/api` 逻辑
- 本文档只描述桌面封装、目录和验证链路
