/**
 * Electron API 类型声明
 * 通过 preload.js 暴露给渲染进程的 API
 */

interface ElectronAPI {
  openDirectory: () => Promise<string | null>;
  getVersion: () => Promise<string>;
  showInFolder: (filePath: string) => Promise<void>;
  isElectron: boolean;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
