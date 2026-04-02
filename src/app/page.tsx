'use client';

import { useState } from 'react';
import SpiderPanel from '@/components/SpiderPanel';
import PredictPanel from '@/components/PredictPanel';
import StatsPanel from '@/components/StatsPanel';
import SettingsPanel from '@/components/SettingsPanel';

type Tab = 'spider' | 'predict' | 'stats' | 'settings';

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>('spider');

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'spider', label: '爬虫采集', icon: '🕷️' },
    { id: 'predict', label: '房价预测', icon: '🏠' },
    { id: 'stats', label: '价格统计', icon: '📊' },
    { id: 'settings', label: '系统设置', icon: '⚙️' },
  ];

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* 标题栏 */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 shadow-sm">
        <span className="text-2xl">🏡</span>
        <h1 className="text-lg font-bold text-gray-800">贝壳找房爬虫</h1>
        <span className="text-xs text-gray-400 ml-auto">TypeScript + Playwright + Electron</span>
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

      {/* 内容区域 */}
      <main className="flex-1 overflow-hidden">
        {activeTab === 'spider' && <SpiderPanel />}
        {activeTab === 'predict' && <PredictPanel />}
        {activeTab === 'stats' && <StatsPanel />}
        {activeTab === 'settings' && <SettingsPanel />}
      </main>
    </div>
  );
}
