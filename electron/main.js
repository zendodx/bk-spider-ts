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

// Playwright 浏览器存储在用户数据目录，与应用安装包解耦
// 升级应用后无需重新下载浏览器
const PLAYWRIGHT_BROWSERS_PATH = path.join(app.getPath('userData'), 'playwright-browsers');
process.env.PLAYWRIGHT_BROWSERS_PATH = PLAYWRIGHT_BROWSERS_PATH;

// =====================
// 配置
// =====================
const NEXT_PORT = 3799;
const NEXT_URL = `http://localhost:${NEXT_PORT}`;
// app.isPackaged 是 Electron 官方推荐的打包环境检测方式
// 不依赖 process.env.NODE_ENV（该变量在 Electron 主进程中默认未设置）
const IS_DEV = !app.isPackaged;
const RESOURCES_PATH = app.isPackaged
  ? process.resourcesPath
  : path.join(__dirname, '..');

let mainWindow = null;
let nextProcess = null;

// =====================
// 单实例锁（防止多开）
// =====================
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

/**
 * 跨平台终止进程（含子进程树）
 * - Windows：taskkill /F /T /PID 强制杀进程树，避免残留子进程占用端口
 * - macOS/Linux：发送 SIGTERM，子进程由 Node.js 自动清理
 */
function killProcess(proc) {
  if (!proc) return;
  try {
    if (process.platform === 'win32') {
      // /F 强制, /T 包含子进程树
      execSync(`taskkill /F /T /PID ${proc.pid}`, { stdio: 'ignore' });
    } else {
      proc.kill('SIGTERM');
    }
  } catch (e) {
    // 进程可能已经退出，忽略错误
    console.warn('[Electron] 进程终止时出现异常（可能已退出）:', e.message);
  }
}

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

    let cmd, args, cwd;

    if (app.isPackaged) {
      // 生产模式：server.js 在 asarUnpack 解包目录（asar 内文件不能被 spawn 执行）
      // 打包后结构：Resources/app.asar.unpacked/.next/standalone/server.js
      const standaloneServer = path.join(
        process.resourcesPath, 'app.asar.unpacked', '.next', 'standalone', 'server.js'
      );
      cwd = path.dirname(standaloneServer);
      cmd = process.execPath; // 使用 Electron 内置的 Node.js
      args = [standaloneServer];
    } else {
      // 开发模式：用 next dev（由外部进程启动，此分支实际不会走到）
      const nextBin = path.join(__dirname, '..', 'node_modules', '.bin', 'next');
      cwd = path.join(__dirname, '..');
      cmd = nextBin;
      args = ['dev', '-p', String(NEXT_PORT)];
    }

    const env = {
      ...process.env,
      PORT: String(NEXT_PORT),
      HOSTNAME: '127.0.0.1',
      NODE_ENV: 'production',
      // 静态资源目录指向打包后的 public
      NEXT_PUBLIC_BASE_PATH: '',
      // 告知 Playwright 使用 userData 下的浏览器目录
      PLAYWRIGHT_BROWSERS_PATH,
    };

    nextProcess = spawn(cmd, args, {
      cwd,
      env,
      stdio: 'pipe',
    });

    nextProcess.stdout.on('data', (data) => {
      const msg = data.toString();
      console.log('[Next.js]', msg.trim());
    });

    nextProcess.stderr.on('data', (data) => {
      const msg = data.toString();
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

    // 等待服务就绪（最多 60 秒）
    waitForServer(NEXT_URL + '/api/settings', 60, 1000)
      .then(resolve)
      .catch(reject);
  });
}

// =====================
// 主窗口
// =====================

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 1000,
    minWidth: 1050,
    minHeight: 800,
    title: '贝壳找房爬虫',
    // 隐藏默认标题栏（使用自定义）
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    // 图标：Windows 使用 .ico，macOS/Linux 使用 .png
    icon: path.join(__dirname, '..', 'public', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
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
// Playwright Chromium 自动安装
// =====================

/**
 * 检测 Playwright Chromium 是否已安装，若未安装则自动下载。
 * 浏览器目录由 PLAYWRIGHT_BROWSERS_PATH 环境变量指定（userData 下），
 * 安装包升级后无需重新下载。
 */
function ensureChromium() {
  return new Promise((resolve) => {
    // 检查浏览器目录是否存在 chromium-* 子目录
    const browsersPath = PLAYWRIGHT_BROWSERS_PATH;
    let alreadyInstalled = false;

    if (fs.existsSync(browsersPath)) {
      const entries = fs.readdirSync(browsersPath);
      alreadyInstalled = entries.some(e => e.startsWith('chromium'));
    }

    if (alreadyInstalled) {
      console.log('[Electron] Chromium 已就绪');
      resolve();
      return;
    }

    console.log('[Electron] 首次运行，正在下载 Chromium 浏览器（约 150MB）...');

    // 找到 playwright CLI：优先使用打包内的，否则用系统 npx
    const isWin = process.platform === 'win32';
    let playwrightCli = null;

    // 打包后路径：Resources/app.asar.unpacked/.next/standalone/node_modules/playwright/cli.js
    const standaloneCliPath = path.join(
      process.resourcesPath, 'app.asar.unpacked', '.next', 'standalone',
      'node_modules', 'playwright', 'cli.js'
    );
    // 开发模式路径
    const devCliPath = path.join(__dirname, '..', 'node_modules', 'playwright', 'cli.js');

    let cmd, args;
    if (fs.existsSync(standaloneCliPath)) {
      cmd = process.execPath;
      args = [standaloneCliPath, 'install', 'chromium'];
    } else if (fs.existsSync(devCliPath)) {
      cmd = process.execPath;
      args = [devCliPath, 'install', 'chromium'];
    } else {
      // 兜底：用系统 npx
      cmd = isWin ? 'npx.cmd' : 'npx';
      args = ['playwright', 'install', 'chromium'];
    }

    const child = spawn(cmd, args, {
      // 打包后没有 tty，不能用 inherit，改为 pipe 避免崩溃
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: isWin,
      env: {
        ...process.env,
        PLAYWRIGHT_BROWSERS_PATH: browsersPath,
      },
    });

    child.stdout && child.stdout.on('data', (d) => console.log('[Playwright]', d.toString().trim()));
    child.stderr && child.stderr.on('data', (d) => console.warn('[Playwright]', d.toString().trim()));

    child.on('close', (code) => {
      if (code === 0) {
        console.log('[Electron] Chromium 下载完成');
      } else {
        console.warn(`[Electron] Chromium 下载失败（退出码: ${code}），爬虫功能可能不可用`);
      }
      resolve();
    });

    child.on('error', (err) => {
      console.warn('[Electron] Chromium 下载出错:', err.message);
      resolve();
    });
  });
}

// =====================
// 应用生命周期
// =====================

app.whenReady().then(async () => {
  try {
    // 在开发模式下，Next.js 已经独立运行
    if (!IS_DEV) {
      // 确保 Chromium 就绪（首次安装时自动下载）
      await ensureChromium();
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

  // 第二个实例启动时，把焦点给已有窗口
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on('activate', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    } else if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // 停止 Next.js 进程（Windows 用 taskkill 杀整个进程树）
  if (nextProcess) {
    killProcess(nextProcess);
    nextProcess = null;
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (nextProcess) {
    killProcess(nextProcess);
    nextProcess = null;
  }
});

// 处理未捕获异常
process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]', err);
});
