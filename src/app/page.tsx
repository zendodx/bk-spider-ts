'use client';

import { useState } from 'react';
import SpiderPanel from '@/components/SpiderPanel';
import PredictPanel from '@/components/PredictPanel';
import LoanPanel from '@/components/LoanPanel';
import StatsPanel from '@/components/StatsPanel';
import ListingsPanel from '@/components/ListingsPanel';
import FavoritesPanel from '@/components/FavoritesPanel';
import SettingsPanel from '@/components/SettingsPanel';
import CleanerPanel from '@/components/CleanerPanel';
import { useTheme, THEME_OPTIONS } from '@/lib/theme';

type Tab = 'spider' | 'predict' | 'loan' | 'stats' | 'listings' | 'favorites' | 'cleaner' | 'settings';

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>('spider');
  const { theme, setTheme } = useTheme();

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
    <div className="flex flex-col h-screen" style={{ background: 'var(--bg-app)' }}>
      {/* 标题栏 */}
      <header
        className="border-b px-4 py-3 flex items-center gap-3 shadow-sm select-none"
        style={{ background: 'var(--header-bg)', borderColor: 'var(--border)' }}
      >
        <span className="text-2xl">🏡</span>
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>贝壳找房爬虫</h1>

        {/* 右侧：版本信息 + 主题切换 */}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs" style={{ color: 'var(--text-hint)' }}>
            TypeScript + Playwright + Next.js
          </span>

          {/* 主题切换按钮组 */}
          <div
            className="flex items-center rounded-lg p-0.5 gap-0.5"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
          >
            {THEME_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setTheme(opt.value)}
                title={opt.desc}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-200 ${
                  theme === opt.value ? 'shadow-sm' : 'opacity-60 hover:opacity-90'
                }`}
                style={
                  theme === opt.value
                    ? { background: 'var(--bg-primary)', color: 'var(--text-primary)', boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }
                    : { color: 'var(--text-muted)' }
                }
              >
                <span>{opt.icon}</span>
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* 导航标签 */}
      <nav
        className="border-b px-4"
        style={{ background: 'var(--nav-bg)', borderColor: 'var(--border)' }}
      >
        <div className="flex gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="px-4 py-3 text-sm font-medium border-b-2 transition-colors"
              style={
                activeTab === tab.id
                  ? { borderBottomColor: '#3b82f6', color: '#3b82f6' }
                  : { borderBottomColor: 'transparent', color: 'var(--text-muted)' }
              }
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
