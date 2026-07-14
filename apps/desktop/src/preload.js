import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('desktopShell', {
  isElectron: true,
  platform: process.platform
});
