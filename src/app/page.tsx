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
import BackupPanel from '@/components/BackupPanel';
import ExpiredListingsPanel from '@/components/ExpiredListingsPanel';
import CommunityPanel, { type SunlightTarget, type CommunityActionTarget } from '@/components/CommunityPanel';
import SunlightPanel from '@/components/SunlightPanel';
import { useTheme, THEME_OPTIONS } from '@/lib/theme';
import { useCityContext } from '@/lib/CityContext';

type Tab = 'spider' | 'predict' | 'loan' | 'stats' | 'listings' | 'expired' | 'community' | 'sunlight' | 'favorites' | 'cleaner' | 'settings' | 'backup';

interface MenuItem {
  id: Tab;
  label: string;
  icon: string;
}

interface MenuGroup {
  id: string;
  label: string;
  icon: string;
  items: MenuItem[];
}

/** 侧边菜单分组（二级菜单） */
const MENU_GROUPS: MenuGroup[] = [
  { id: 'collect', label: '数据采集', icon: '🕷️', items: [
    { id: 'spider',    label: '爬虫采集', icon: '🕷️' },
    { id: 'cleaner',   label: '数据清洗', icon: '🧹' },
  ]},
  { id: 'houses', label: '房源数据', icon: '🏘️', items: [
    { id: 'listings',  label: '房源列表', icon: '🏘️' },
    { id: 'expired',   label: '失效房源', icon: '🏚️' },
    { id: 'favorites', label: '房源收藏', icon: '⭐' },
  ]},
  { id: 'analysis', label: '统计分析', icon: '📊', items: [
    { id: 'community', label: '小区信息', icon: '🗺️' },
    { id: 'stats',     label: '价格统计', icon: '📊' },
    { id: 'sunlight',  label: '采光分析', icon: '☀️' },
  ]},
  { id: 'tools', label: '实用工具', icon: '🧰', items: [
    { id: 'predict',   label: '房价预测', icon: '🏠' },
    { id: 'loan',      label: '贷款计算', icon: '🏦' },
  ]},
  { id: 'system', label: '系统管理', icon: '⚙️', items: [
    { id: 'settings',  label: '系统设置', icon: '⚙️' },
    { id: 'backup',    label: '数据备份', icon: '💾' },
  ]},
];

function groupOfTab(tab: Tab): string {
  return MENU_GROUPS.find(g => g.items.some(i => i.id === tab))?.id ?? '';
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>('spider');
  const [pendingSunlightTarget, setPendingSunlightTarget] = useState<SunlightTarget | null>(null);
  // 小区信息页跳转到其他面板时携带的目标
  const [pendingListingsTarget, setPendingListingsTarget] = useState<CommunityActionTarget | null>(null);
  const [pendingStatsCommunity, setPendingStatsCommunity] = useState<string | null>(null);
  const [pendingFavoritesCommunity, setPendingFavoritesCommunity] = useState<string | null>(null);
  const [pendingSpiderCommunity, setPendingSpiderCommunity] = useState<string | null>(null);
  const [pendingExpiredCommunity, setPendingExpiredCommunity] = useState<string | null>(null);

  // 侧边菜单：整体折叠 + 分组展开
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(['collect']));

  /** 切换页签：同时确保所在分组处于展开状态 */
  const activateTab = (tab: Tab) => {
    setActiveTab(tab);
    const gid = groupOfTab(tab);
    if (gid) setOpenGroups(prev => new Set(prev).add(gid));
  };

  const toggleGroup = (gid: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid); else next.add(gid);
      return next;
    });
  };

  const handleOpenSunlightAnalysis = (targetInfo: SunlightTarget) => {
    setPendingSunlightTarget(targetInfo);
    activateTab('sunlight');
  };

  const handleOpenListings = (target: CommunityActionTarget) => {
    setPendingListingsTarget(target);
    activateTab('listings');
  };
  const handleOpenStats = (target: CommunityActionTarget) => {
    setPendingStatsCommunity(target.community);
    activateTab('stats');
  };
  const handleOpenFavorites = (target: CommunityActionTarget) => {
    setPendingFavoritesCommunity(target.community);
    activateTab('favorites');
  };
  const handleOpenSpider = (target: CommunityActionTarget) => {
    setPendingSpiderCommunity(target.community);
    activateTab('spider');
  };
  const handleOpenExpired = (target: CommunityActionTarget) => {
    setPendingExpiredCommunity(target.community);
    activateTab('expired');
  };
  const { theme, setTheme } = useTheme();
  const { cityNames, selectedCity, setSelectedCity, selectedHost } = useCityContext();


  return (
    <div className="flex flex-col h-screen" style={{ background: 'var(--bg-app)' }}>
      {/* 标题栏 */}
      <header
        className="border-b px-4 py-3 flex items-center gap-3 shadow-sm select-none"
        style={{ background: 'var(--header-bg)', borderColor: 'var(--border)' }}
      >
        <span className="text-2xl">🏡</span>
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>贝壳找房爬虫</h1>

        {/* Logo 右侧：城市选择下拉框 */}
        <div className="flex items-center gap-1.5">
          <select
            value={selectedCity}
            onChange={e => setSelectedCity(e.target.value)}
            className="text-sm font-medium px-2.5 py-1.5 rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
            style={{
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              borderColor: selectedCity ? '#3b82f6' : 'var(--border)',
              minWidth: 100,
            }}
            title={selectedCity ? `当前城市：${selectedCity}\nHOST：${selectedHost}` : '显示全部城市的数据'}
          >
            <option value="">🌏 全部城市</option>
            {cityNames.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          {selectedCity && (
            <button
              onClick={() => setSelectedCity('')}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              title="清除城市筛选"
            >✕</button>
          )}
        </div>

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

      {/* 主体：左侧菜单 + 右侧内容 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 侧边菜单（整体可折叠，分组可展开/收起） */}
        <aside
          className="flex flex-col border-r transition-all duration-200 flex-shrink-0"
          style={{
            background: 'var(--nav-bg)',
            borderColor: 'var(--border)',
            width: sidebarCollapsed ? 56 : 208,
          }}
        >
          <nav className="flex-1 overflow-y-auto py-2">
            {MENU_GROUPS.map(group => {
              const groupActive = group.items.some(i => i.id === activeTab);
              const open = openGroups.has(group.id);

              // 折叠态：只显示叶子项图标，组间用分隔线区分
              if (sidebarCollapsed) {
                return (
                  <div key={group.id} className="py-1 border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                    {group.items.map(item => (
                      <button
                        key={item.id}
                        onClick={() => activateTab(item.id)}
                        title={item.label}
                        className="w-full flex items-center justify-center py-2.5 text-lg transition-colors"
                        style={{
                          color: activeTab === item.id ? '#3b82f6' : 'var(--text-muted)',
                          background: activeTab === item.id ? 'var(--bg-secondary)' : 'transparent',
                        }}
                      >
                        {item.icon}
                      </button>
                    ))}
                  </div>
                );
              }

              return (
                <div key={group.id} className="px-2 py-0.5">
                  {/* 一级菜单（分组标题，点击展开/收起） */}
                  <button
                    onClick={() => toggleGroup(group.id)}
                    className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm font-semibold transition-opacity hover:opacity-75"
                    style={{ color: groupActive ? '#3b82f6' : 'var(--text-primary)' }}
                  >
                    <span>{group.icon}</span>
                    <span className="flex-1 text-left whitespace-nowrap">{group.label}</span>
                    <span
                      className="text-[10px] transition-transform duration-200"
                      style={{ transform: open ? 'rotate(90deg)' : 'none', color: 'var(--text-hint)' }}
                    >▶</span>
                  </button>
                  {/* 二级菜单 */}
                  {open && (
                    <div className="mb-1 space-y-0.5">
                      {group.items.map(item => (
                        <button
                          key={item.id}
                          onClick={() => activateTab(item.id)}
                          className="w-full flex items-center gap-2 pl-8 pr-2 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors"
                          style={
                            activeTab === item.id
                              ? { background: 'var(--bg-secondary)', color: '#3b82f6', fontWeight: 600, boxShadow: 'inset 2px 0 0 #3b82f6' }
                              : { color: 'var(--text-muted)' }
                          }
                        >
                          <span>{item.icon}</span>
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* 折叠/展开按钮 */}
          <button
            onClick={() => setSidebarCollapsed(v => !v)}
            className="border-t px-2 py-2.5 text-xs flex items-center justify-center gap-1 transition-opacity hover:opacity-75 select-none"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
            title={sidebarCollapsed ? '展开菜单' : '折叠菜单'}
          >
            {sidebarCollapsed ? '»' : '« 折叠菜单'}
          </button>
        </aside>

      {/* 内容区域：所有 Panel 始终挂载，通过 CSS 控制显隐，避免切换 Tab 时状态被重置 */}
      <main className="flex-1 overflow-hidden">
        <div className="h-full" style={{ display: activeTab === 'spider'    ? 'block' : 'none' }}><SpiderPanel pendingCommunity={pendingSpiderCommunity} onConsumePendingCommunity={() => setPendingSpiderCommunity(null)} /></div>
        <div className="h-full" style={{ display: activeTab === 'predict'   ? 'block' : 'none' }}><PredictPanel /></div>
        <div className="h-full" style={{ display: activeTab === 'loan'      ? 'block' : 'none' }}><LoanPanel /></div>
        <div className="h-full" style={{ display: activeTab === 'stats'     ? 'block' : 'none' }}><StatsPanel pendingCommunity={pendingStatsCommunity} onConsumePendingCommunity={() => setPendingStatsCommunity(null)} /></div>
        <div className="h-full" style={{ display: activeTab === 'listings'  ? 'block' : 'none' }}><ListingsPanel pendingTarget={pendingListingsTarget} onConsumePendingTarget={() => setPendingListingsTarget(null)} /></div>
        <div className="h-full" style={{ display: activeTab === 'expired'   ? 'block' : 'none' }}><ExpiredListingsPanel pendingCommunity={pendingExpiredCommunity} onConsumePendingCommunity={() => setPendingExpiredCommunity(null)} /></div>
        <div className="h-full" style={{ display: activeTab === 'community' ? 'block' : 'none' }}><CommunityPanel onOpenSunlightAnalysis={handleOpenSunlightAnalysis} onOpenListings={handleOpenListings} onOpenStats={handleOpenStats} onOpenFavorites={handleOpenFavorites} onOpenSpider={handleOpenSpider} onOpenExpired={handleOpenExpired} /></div>
        <div className="h-full" style={{ display: activeTab === 'sunlight' ? 'block' : 'none' }}><SunlightPanel pendingTarget={pendingSunlightTarget} onConsumePendingTarget={() => setPendingSunlightTarget(null)} /></div>
        <div className="h-full" style={{ display: activeTab === 'favorites' ? 'block' : 'none' }}><FavoritesPanel pendingCommunity={pendingFavoritesCommunity} onConsumePendingCommunity={() => setPendingFavoritesCommunity(null)} /></div>
        <div className="h-full" style={{ display: activeTab === 'cleaner'   ? 'block' : 'none' }}><CleanerPanel /></div>
        <div className="h-full" style={{ display: activeTab === 'settings'  ? 'block' : 'none' }}><SettingsPanel /></div>
        <div className="h-full" style={{ display: activeTab === 'backup'    ? 'block' : 'none' }}><BackupPanel /></div>
      </main>
      </div>
    </div>
  );
}
