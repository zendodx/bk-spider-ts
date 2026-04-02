'use strict';

/**
 * Electron 主进程
 * 负责：
 * 1. 启动 Next.js 本地服务
 * 2. 创建浏览器主窗口
 * 3. 管理应用生命周期
 */

const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');
const http = require('http');
const fs = require('fs');

// =====================
// 配置
// =====================
const NEXT_PORT = 3799;
const NEXT_URL = `http://localhost:${NEXT_PORT}`;
const IS_DEV = process.env.NODE_ENV !== 'production';
const RESOURCES_PATH = app.isPackaged
  ? process.resourcesPath
  : path.join(__dirname, '..');

let mainWindow = null;
let nextProcess = null;

// =====================
// 工具函数
// =====================

/** 等待 Next.js 服务就绪 */
function waitForServer(url, maxRetries = 30, interval = 1000) {
  return new Promise((resolve, reject) => {
    let retries = 0;

    const check = () => {
      http.get(url, (res) => {
        if (res.statusCode === 200 || res.statusCode === 404) {
          resolve();
        } else {
          retry();
        }
      }).on('error', () => {
        retry();
      });
    };

    const retry = () => {
      retries++;
      if (retries >= maxRetries) {
        reject(new Error(`服务启动超时: ${url}`));
        return;
      }
      setTimeout(check, interval);
    };

    check();
  });
}

/** 启动 Next.js 服务 */
function startNextServer() {
  return new Promise((resolve, reject) => {
    console.log('[Electron] 正在启动 Next.js 服务...');

    // 获取 Next.js 可执行文件路径
    const nextBin = path.join(RESOURCES_PATH, 'node_modules', '.bin', 'next');
    const nextBinFallback = path.join(__dirname, '..', 'node_modules', '.bin', 'next');
    const actualNextBin = fs.existsSync(nextBin) ? nextBin : nextBinFallback;

    // 工作目录
    const cwd = app.isPackaged
      ? path.join(RESOURCES_PATH, 'app')
      : path.join(__dirname, '..');

    const env = {
      ...process.env,
      PORT: String(NEXT_PORT),
      NODE_ENV: app.isPackaged ? 'production' : 'development',
    };

    if (app.isPackaged) {
      // 生产模式：运行 next start
      nextProcess = spawn(actualNextBin, ['start', '-p', String(NEXT_PORT)], {
        cwd,
        env,
        stdio: 'pipe',
      });
    } else {
      // 开发模式：运行 next dev
      nextProcess = spawn(actualNextBin, ['dev', '-p', String(NEXT_PORT)], {
        cwd,
        env,
        stdio: 'pipe',
      });
    }

    nextProcess.stdout.on('data', (data) => {
      const msg = data.toString();
      console.log('[Next.js]', msg.trim());
      if (msg.includes('ready') || msg.includes('started') || msg.includes(String(NEXT_PORT))) {
        resolve();
      }
    });

    nextProcess.stderr.on('data', (data) => {
      const msg = data.toString();
      // Next.js 的 stderr 也包含正常日志
      if (!msg.includes('ExperimentalWarning') && !msg.includes('DeprecationWarning')) {
        console.error('[Next.js Error]', msg.trim());
      }
    });

    nextProcess.on('error', (err) => {
      console.error('[Next.js] 进程错误:', err);
      reject(err);
    });

    nextProcess.on('close', (code) => {
      console.log(`[Next.js] 进程退出，代码: ${code}`);
    });

    // 超时等待服务就绪
    waitForServer(NEXT_URL + '/api/settings')
      .then(resolve)
      .catch(reject);
  });
}

// =====================
// 主窗口
// =====================

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 600,
    title: '贝壳找房爬虫',
    // 隐藏默认标题栏（使用自定义）
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    // 图标
    icon: path.join(__dirname, '..', 'public', 'icon.png'),
    backgroundColor: '#f5f6fa',
    show: false, // 等待就绪后再显示
  });

  // 加载 Next.js
  mainWindow.loadURL(NEXT_URL);

  // 就绪后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (IS_DEV) {
      mainWindow.webContents.openDevTools();
    }
  });

  // 阻止默认关闭行为
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 在系统浏览器中打开外部链接
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// =====================
// IPC 处理
// =====================

/** 打开文件选择对话框 */
ipcMain.handle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: '选择数据保存目录',
  });
  return result.filePaths[0] || null;
});

/** 获取应用版本 */
ipcMain.handle('app:version', () => app.getVersion());

/** 打开文件所在目录 */
ipcMain.handle('shell:showInFolder', (_, filePath) => {
  shell.showItemInFolder(filePath);
});

// =====================
// 应用生命周期
// =====================

app.whenReady().then(async () => {
  try {
    // 在开发模式下，Next.js 已经独立运行
    if (!IS_DEV) {
      await startNextServer();
    } else {
      // 开发模式：等待外部 Next.js 服务
      console.log('[Electron] 开发模式，等待 Next.js 服务...');
      await waitForServer(NEXT_URL, 60, 1000).catch(() => {
        console.log('[Electron] Next.js 未就绪，将直接打开（可能需要等待）');
      });
    }
  } catch (e) {
    console.error('[Electron] 服务启动失败:', e);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // 停止 Next.js 进程
  if (nextProcess) {
    nextProcess.kill();
    nextProcess = null;
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (nextProcess) {
    nextProcess.kill();
  }
});

// 处理未捕获异常
process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]', err);
});
