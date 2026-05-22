/** @type {import('next').NextConfig} */
const nextConfig = {
  // 允许在 API 路由中使用 Node.js 内置模块（排除含动态 require 的纯 Node.js 包）
  experimental: {
    serverComponentsExternalPackages: [
      'playwright',
      'playwright-extra',
      'puppeteer-extra',
      'puppeteer-extra-plugin-stealth',
      'puppeteer-extra-plugin-utils',
      'clone-deep',
      'better-sqlite3',
    ],
  },
};

module.exports = nextConfig;
