import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '贝壳找房爬虫',
  description: '贝壳找房数据采集桌面应用',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
