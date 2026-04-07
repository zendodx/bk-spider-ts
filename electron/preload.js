'use strict';

/**
 * Electron Preload 脚本
 * 在渲染进程中安全暴露有限的 Node.js 能力
 */

const { contextBridge, ipcRenderer } = require('electron');

// 暴露给渲染进程的 API
contextBridge.exposeInMainWorld('electronAPI', {
  // 打开目录选择对话框
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),

  // 获取应用版本
  getVersion: () => ipcRenderer.invoke('app:version'),

  // 在 Finder/资源管理器中显示文件
  showInFolder: (filePath) => ipcRenderer.invoke('shell:showInFolder', filePath),

  // 检测是否运行在 Electron 环境
  isElectron: true,

  // 当前操作系统平台（'darwin' | 'win32' | 'linux'）
  platform: process.platform,
});
