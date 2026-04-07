'use client';

import { useState, useEffect } from 'react';

interface Settings {
  host: string;
  sug: string;
  maxPage: number;
  pageWait: number;
  speedMode: string;
  minDelay: number;
  maxDelay: number;
  pageInterval: number;
  maxRetries: number;
  exportExcel: boolean;
  exportCsv: boolean;
  dataDir: string;
  dbPath: string;
}

interface MappingEntry {
  name: string;
  id: string;
}

export default function SettingsPanel() {
  const [settings, setSettings] = useState<Settings>({
    host: 'https://jn.ke.com',
    sug: '',
    maxPage: 50,
    pageWait: 1.0,
    speedMode: 'normal',
    minDelay: 1.5,
    maxDelay: 3.5,
    pageInterval: 2.0,
    maxRetries: 3,
    exportExcel: true,
    exportCsv: true,
    dataDir: '',
    dbPath: '',
  });
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [mappingEntries, setMappingEntries] = useState<MappingEntry[]>([]);
  const [newEntry, setNewEntry] = useState({ name: '', id: '' });
  const [saved, setSaved] = useState(false);
  const [dbStatus, setDbStatus] = useState<{ testing: boolean; result: string | null }>({
    testing: false,
    result: null,
  });

  useEffect(() => {
    // 加载设置
    fetch('/api/settings').then(r => r.json()).then(res => {
      if (res.success) setSettings(res.data);
    });
    // 加载映射
    fetch('/api/mapping').then(r => r.json()).then(res => {
      if (res.success) {
        setMapping(res.data || {});
        const entries = Object.entries(res.data || {}).map(([name, id]) => ({ name, id: id as string }));
        setMappingEntries(entries.sort((a, b) => a.name.localeCompare(b.name)));
      }
    });
  }, []);

  const saveSettings = async () => {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: settings }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const testDbConnection = async () => {
    setDbStatus({ testing: true, result: null });
    try {
      const res = await fetch('/api/db/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dbPath: settings.dbPath || undefined,
        }),
      });
      const data = await res.json();
      setDbStatus({ testing: false, result: data.message });
    } catch (e) {
      setDbStatus({ testing: false, result: `连接失败: ${e}` });
    }
  };

  const saveMapping = async (entries: MappingEntry[]) => {
    const obj: Record<string, string> = {};
    entries.forEach(e => { if (e.name) obj[e.name] = e.id; });
    await fetch('/api/mapping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: obj }),
    });
    setMapping(obj);
  };

  const addMappingEntry = () => {
    if (!newEntry.name) return;
    const updated = [...mappingEntries, newEntry];
    setMappingEntries(updated);
    setNewEntry({ name: '', id: '' });
    saveMapping(updated);
  };

  const removeMappingEntry = (idx: number) => {
    const updated = mappingEntries.filter((_, i) => i !== idx);
    setMappingEntries(updated);
    saveMapping(updated);
  };

  const InputField = ({
    label,
    value,
    onChange,
    type = 'text',
    placeholder = '',
    className = '',
  }: {
    label: string;
    value: string | number;
    onChange: (v: string) => void;
    type?: string;
    placeholder?: string;
    className?: string;
  }) => (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto space-y-5">

        {/* 数据库配置 */}
        <section className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <h3 className="text-sm font-bold text-gray-800 mb-4">🗄️ 数据库配置（SQLite）</h3>
          <InputField
            label="数据库文件路径"
            value={settings.dbPath}
            onChange={v => setSettings(p => ({ ...p, dbPath: v }))}
            placeholder="默认: ~/bk_spider_data/bk_spider.db"
            className="mb-3"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={testDbConnection}
              disabled={dbStatus.testing}
              className="px-4 py-2 text-sm bg-gray-700 text-white rounded-md hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {dbStatus.testing ? '测试中...' : '🔗 测试连接'}
            </button>
            {dbStatus.result && (
              <span className={`text-sm ${
                dbStatus.result.includes('成功') ? 'text-green-600' : 'text-red-600'
              }`}>
                {dbStatus.result}
              </span>
            )}
          </div>
        </section>

        {/* 默认参数设置 */}
        <section className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <h3 className="text-sm font-bold text-gray-800 mb-4">⚙️ 默认参数</h3>
          <div className="grid grid-cols-2 gap-3">
            <InputField
              label="默认 HOST" value={settings.host}
              onChange={v => setSettings(p => ({ ...p, host: v }))}
              placeholder="https://jn.ke.com"
              className="col-span-2"
            />
            <InputField
              label="默认 SUG（小区名）" value={settings.sug}
              onChange={v => setSettings(p => ({ ...p, sug: v }))}
            />
            <InputField
              label="数据保存目录" value={settings.dataDir}
              onChange={v => setSettings(p => ({ ...p, dataDir: v }))}
              placeholder="默认: ~/bk_spider_data/采集数据"
            />
          </div>
        </section>

        {/* 小区映射管理 */}
        <section className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <h3 className="text-sm font-bold text-gray-800 mb-4">🗺️ 小区 ID 映射管理</h3>
          <p className="text-xs text-gray-400 mb-3">维护小区名称与贝壳小区 ID 的对应关系，可精确爬取指定小区数据。</p>

          {/* 新增 */}
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={newEntry.name}
              onChange={e => setNewEntry(p => ({ ...p, name: e.target.value }))}
              placeholder="小区名称"
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              value={newEntry.id}
              onChange={e => setNewEntry(p => ({ ...p, id: e.target.value }))}
              placeholder="小区 ID"
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={addMappingEntry}
              className="px-4 py-2 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
            >
              + 添加
            </button>
          </div>

          {/* 列表 */}
          <div className="border border-gray-200 rounded-md overflow-hidden">
            <div className="grid grid-cols-[1fr_1fr_auto] bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500">
              <span>小区名称</span>
              <span>小区 ID</span>
              <span>操作</span>
            </div>
            <div className="max-h-48 overflow-y-auto divide-y divide-gray-100">
              {mappingEntries.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-gray-400">暂无数据</div>
              ) : (
                mappingEntries.map((entry, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto] px-3 py-2 text-sm hover:bg-gray-50">
                    <span className="text-gray-700 truncate">{entry.name}</span>
                    <span className="text-gray-500 font-mono text-xs truncate">{entry.id}</span>
                    <button
                      onClick={() => removeMappingEntry(i)}
                      className="text-red-400 hover:text-red-600 text-xs"
                    >
                      删除
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* 保存按钮 */}
        <div className="flex justify-end">
          <button
            onClick={saveSettings}
            className={`px-6 py-2.5 text-sm font-semibold rounded-md transition-colors ${
              saved
                ? 'bg-green-500 text-white'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          >
            {saved ? '✓ 已保存' : '💾 保存设置'}
          </button>
        </div>
      </div>
    </div>
  );
}
