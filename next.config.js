/** @type {import('next').NextConfig} */
const nextConfig = {
  // 输出到 standalone 目录，供 Electron 使用
  output: 'standalone',
  // 禁用图片优化（Electron 环境不需要）
  images: {
    unoptimized: true,
  },
  // 允许在 API 路由中使用 Node.js 内置模块
  experimental: {
    serverComponentsExternalPackages: ['playwright', 'mysql2'],
  },
};

module.exports = nextConfig;
