import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { app, BrowserWindow, Menu, dialog, shell } from 'electron';
import { updateDesktopConfig } from './configStore.js';
import { getDesktopPaths } from './paths.js';
import { startApiProcess, stopApiProcess } from './apiProcess.js';

let mainWindow = null;
let apiRuntime = null;
let desktopPaths = null;
let mainLogPath = '';

const preloadPath = fileURLToPath(new URL('./preload.js', import.meta.url));

function writeMainLog(message, details = null) {
  const text = typeof details === 'string'
    ? details
    : (details ? JSON.stringify(details, null, 2) : '');
  const line = `[${new Date().toISOString()}] ${message}${text ? ` ${text}` : ''}\n`;

  if (mainLogPath) {
    fs.mkdirSync(path.dirname(mainLogPath), { recursive: true });
    fs.appendFileSync(mainLogPath, line, 'utf8');
  }

  console.log(`[DesktopApp] ${message}`, details ?? '');
}

function createWindow(nextPreloadPath) {
  const window = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 1280,
    minHeight: 720,
    backgroundColor: '#101826',
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0c1118',
      symbolColor: '#dbe7ff',
      height: 40
    },
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: nextPreloadPath
    }
  });

  window.setMenuBarVisibility(false);

  window.on('closed', () => {
    writeMainLog('window closed');
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl) => {
    writeMainLog('did-fail-load', {
      errorCode,
      errorDescription,
      validatedUrl
    });
  });

  window.webContents.on('render-process-gone', (_event, details) => {
    writeMainLog('render-process-gone', details);
  });

  window.webContents.on('unresponsive', () => {
    writeMainLog('window unresponsive');
  });

  window.webContents.on('did-finish-load', () => {
    writeMainLog('did-finish-load', {
      url: window.webContents.getURL()
    });
  });

  return window;
}

function buildPathSummary() {
  return [
    `配置文件: ${desktopPaths.configPath}`,
    `运行数据目录: ${desktopPaths.appDataDir}`,
    `项目目录: ${desktopPaths.projectsDir}`,
    `资源目录: ${desktopPaths.assetsDir}`,
    `HLS 缓存目录: ${desktopPaths.hlsCacheDir}`,
    `日志目录: ${desktopPaths.logsDir}`,
    `FFmpeg: ${desktopPaths.ffmpegPath || '未配置，当前将回退到系统 PATH 中的 ffmpeg'}`
  ].join('\n');
}

async function openPath(targetPath) {
  if (!targetPath) {
    return;
  }

  const errorMessage = await shell.openPath(targetPath);
  if (errorMessage) {
    writeMainLog('openPath failed', { targetPath, errorMessage });
  }
}

async function handleChooseFfmpeg() {
  const result = await dialog.showOpenDialog({
    title: '选择 FFmpeg 可执行文件',
    properties: ['openFile'],
    filters: [
      { name: 'Executable', extensions: ['exe'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled || !result.filePaths?.[0]) {
    return;
  }

  updateDesktopConfig(desktopPaths.configPath, {
    ffmpegPath: result.filePaths[0]
  });
  writeMainLog('ffmpeg path updated', {
    ffmpegPath: result.filePaths[0]
  });

  await dialog.showMessageBox({
    type: 'info',
    title: 'FFmpeg 已更新',
    message: 'FFmpeg 路径已写入桌面配置文件，重启桌面版后生效。'
  });
}

function installApplicationMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        { role: 'quit', label: '退出' }
      ]
    },
    {
      label: '桌面配置',
      submenu: [
        {
          label: '查看目录与 FFmpeg 配置',
          click: async () => {
            await dialog.showMessageBox({
              type: 'info',
              title: '桌面版配置',
              message: buildPathSummary()
            });
          }
        },
        {
          label: '打开配置文件',
          click: async () => openPath(desktopPaths.configPath)
        },
        {
          label: '打开项目目录',
          click: async () => openPath(desktopPaths.projectsDir)
        },
        {
          label: '打开资源目录',
          click: async () => openPath(desktopPaths.assetsDir)
        },
        {
          label: '打开日志目录',
          click: async () => openPath(desktopPaths.logsDir)
        },
        {
          label: '打开 HLS 缓存目录',
          click: async () => openPath(desktopPaths.hlsCacheDir)
        },
        {
          label: '选择 FFmpeg 可执行文件',
          click: handleChooseFfmpeg
        }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function bootstrapDesktopApp() {
  desktopPaths = getDesktopPaths(app);
  mainLogPath = path.join(desktopPaths.logsDir, 'desktop-main.log');
  writeMainLog('bootstrap start', {
    appDataDir: desktopPaths.appDataDir,
    webIndexPath: desktopPaths.webIndexPath,
    apiServerEntry: desktopPaths.apiServerEntry,
    ffmpegPath: desktopPaths.ffmpegPath
  });

  installApplicationMenu();

  if (!fs.existsSync(desktopPaths.webIndexPath)) {
    throw new Error(`Web build not found: ${desktopPaths.webIndexPath}`);
  }

  if (!fs.existsSync(desktopPaths.apiServerEntry)) {
    throw new Error(`API entry not found: ${desktopPaths.apiServerEntry}`);
  }

  if (!apiRuntime || apiRuntime.childProcess?.exitCode !== null) {
    apiRuntime = await startApiProcess({
      serverEntry: desktopPaths.apiServerEntry,
      appDataDir: desktopPaths.appDataDir,
      logsDir: desktopPaths.logsDir,
      ffmpegPath: desktopPaths.ffmpegPath
    });
    writeMainLog('api process started', apiRuntime);
  }

  mainWindow = createWindow(preloadPath);

  const webUrl = new URL(pathToFileURL(desktopPaths.webIndexPath).href);
  webUrl.searchParams.set('apiBase', apiRuntime.apiBaseUrl);
  writeMainLog('loading window url', { url: webUrl.href });
  await mainWindow.loadURL(webUrl.href);
}

process.on('uncaughtException', (error) => {
  writeMainLog('uncaughtException', {
    message: error?.message || String(error),
    stack: error?.stack || ''
  });
});

process.on('unhandledRejection', (reason) => {
  writeMainLog('unhandledRejection', reason);
});

app.whenReady().then(async () => {
  try {
    await bootstrapDesktopApp();
  } catch (error) {
    writeMainLog('startup failed', {
      message: error?.message || String(error),
      stack: error?.stack || ''
    });
    await dialog.showMessageBox({
      type: 'error',
      title: '桌面版启动失败',
      message: error?.message || 'Unknown startup error'
    });
    app.quit();
  }
});

app.on('window-all-closed', () => {
  writeMainLog('window-all-closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  writeMainLog('before-quit');
  await stopApiProcess(apiRuntime);
});

app.on('activate', async () => {
  writeMainLog('activate');
  if (!mainWindow) {
    await bootstrapDesktopApp();
  }
});
