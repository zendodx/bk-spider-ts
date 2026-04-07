/**
 * Electron API 类型声明
 * 通过 preload.js 暴露给渲染进程的 API
 */

interface ElectronAPI {
  openDirectory: () => Promise<string | null>;
  getVersion: () => Promise<string>;
  showInFolder: (filePath: string) => Promise<void>;
  isElectron: boolean;
  /** 当前操作系统平台，同 Node.js process.platform ('darwin' | 'win32' | 'linux') */
  platform: string;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
