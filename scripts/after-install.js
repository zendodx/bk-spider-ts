/**
 * electron-builder afterPack hook
 *
 * Chromium 浏览器不在打包时下载，而是在用户首次启动应用时由 main.js 的
 * ensureChromium() 自动检测并下载到 app.getPath('userData')/playwright-browsers。
 * 这样：
 *   1. 安装包体积保持小巧
 *   2. 升级应用后浏览器无需重复下载
 *   3. 在用户机器上下载，确保平台/架构完全匹配
 */
exports.default = async function() {
  console.log('[afterPack] Chromium 将在用户首次启动时自动下载，无需在此处处理。');
};
