/**
 * electron-builder afterInstall hook
 * 安装完成后自动下载 Playwright Chromium 浏览器
 */
const { execSync } = require('child_process');
const path = require('path');

exports.default = async function(context) {
  try {
    console.log('[afterInstall] 正在下载 Playwright Chromium 浏览器...');
    execSync('npx playwright install chromium', {
      stdio: 'inherit',
      cwd: context.appOutDir,
    });
    console.log('[afterInstall] Playwright Chromium 下载完成');
  } catch (e) {
    console.warn('[afterInstall] 浏览器下载失败（用户可稍后手动运行 npx playwright install chromium）:', e.message);
  }
};
