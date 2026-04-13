'use client';

import { useState, useEffect } from 'react';
import SpiderPanel from '@/components/SpiderPanel';
import PredictPanel from '@/components/PredictPanel';
import LoanPanel from '@/components/LoanPanel';
import StatsPanel from '@/components/StatsPanel';
import ListingsPanel from '@/components/ListingsPanel';
import FavoritesPanel from '@/components/FavoritesPanel';
import SettingsPanel from '@/components/SettingsPanel';
import CleanerPanel from '@/components/CleanerPanel';

type Tab = 'spider' | 'predict' | 'loan' | 'stats' | 'listings' | 'favorites' | 'cleaner' | 'settings';

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>('spider');
  // macOS 下标题栏需要为交通灯按钮留出左侧空间，Windows/Linux 不需要
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    // 通过 preload 暴露的 platform 判断是否是 macOS
    setIsMac(typeof window !== 'undefined' && window.electronAPI?.platform === 'darwin');
  }, []);

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'spider',    label: '爬虫采集', icon: '🕷️' },
    { id: 'predict',   label: '房价预测', icon: '🏠' },
    { id: 'loan',      label: '贷款计算', icon: '🏦' },
    { id: 'stats',     label: '价格统计', icon: '📊' },
    { id: 'listings',  label: '房源列表', icon: '🏘️' },
    { id: 'favorites', label: '房源收藏', icon: '⭐' },
    { id: 'cleaner',   label: '数据清洗', icon: '🧹' },
    { id: 'settings',  label: '系统设置', icon: '⚙️' },
  ];

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* 标题栏（drag-region 使 Electron 窗口可拖动；macOS 需 pl-20 为交通灯按钮留空间，Windows/Linux 保持 px-6） */}
      <header className={`drag-region bg-white border-b border-gray-200 py-3 flex items-center gap-3 shadow-sm select-none ${isMac ? 'pl-20 pr-6' : 'px-6'}`}>
        <span className="no-drag text-2xl">🏡</span>
        <h1 className="no-drag text-lg font-bold text-gray-800">贝壳找房爬虫</h1>
        <span className="no-drag text-xs text-gray-400 ml-auto">TypeScript + Playwright + Electron</span>
      </header>

      {/* 导航标签 */}
      <nav className="bg-white border-b border-gray-200 px-6">
        <div className="flex gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <span className="mr-1.5">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* 内容区域：所有 Panel 始终挂载，通过 CSS 控制显隐，避免切换 Tab 时状态被重置 */}
      <main className="flex-1 overflow-hidden">
        <div className="h-full" style={{ display: activeTab === 'spider'    ? 'block' : 'none' }}><SpiderPanel /></div>
        <div className="h-full" style={{ display: activeTab === 'predict'   ? 'block' : 'none' }}><PredictPanel /></div>
        <div className="h-full" style={{ display: activeTab === 'loan'      ? 'block' : 'none' }}><LoanPanel /></div>
        <div className="h-full" style={{ display: activeTab === 'stats'     ? 'block' : 'none' }}><StatsPanel /></div>
        <div className="h-full" style={{ display: activeTab === 'listings'  ? 'block' : 'none' }}><ListingsPanel /></div>
        <div className="h-full" style={{ display: activeTab === 'favorites' ? 'block' : 'none' }}><FavoritesPanel /></div>
        <div className="h-full" style={{ display: activeTab === 'cleaner'   ? 'block' : 'none' }}><CleanerPanel /></div>
        <div className="h-full" style={{ display: activeTab === 'settings'  ? 'block' : 'none' }}><SettingsPanel /></div>
      </main>
    </div>
  );
}
