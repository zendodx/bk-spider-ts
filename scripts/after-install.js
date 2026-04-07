/**
 * electron-builder afterPack hook
 * 打包完成后自动下载 Playwright Chromium 浏览器
 *
 * 兼容 macOS / Windows / Linux：
 * - Windows 下 npx 可执行文件名为 npx.cmd，需特殊处理
 * - 使用 spawn 替代 execSync 以获得更好的跨平台兼容性
 */
const { spawn } = require('child_process');
const path = require('path');

exports.default = async function(context) {
  return new Promise((resolve) => {
    console.log('[afterPack] 正在下载 Playwright Chromium 浏览器...');

    // Windows 下 npm/npx 可执行文件带 .cmd 后缀
    const isWin = process.platform === 'win32';
    const npx = isWin ? 'npx.cmd' : 'npx';

    const child = spawn(npx, ['playwright', 'install', 'chromium'], {
      stdio: 'inherit',
      shell: isWin,  // Windows 下需要在 shell 中执行
      cwd: context.appOutDir,
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log('[afterPack] Playwright Chromium 下载完成');
      } else {
        console.warn(`[afterPack] 浏览器下载失败（退出码: ${code}）`);
        console.warn('[afterPack] 用户可稍后手动运行: npx playwright install chromium');
      }
      // 无论成功或失败都不阻断打包流程
      resolve();
    });

    child.on('error', (err) => {
      console.warn('[afterPack] 浏览器下载出错（用户可稍后手动运行 npx playwright install chromium）:', err.message);
      resolve();
    });
  });
};
