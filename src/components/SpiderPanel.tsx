'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useCityContext } from '@/lib/CityContext';

interface SpiderParams {
  host: string;
  sug: string;
  houseId: string;
  maxPage: number;
  pageWait: number;
  captchaTimeoutMinutes: number;
  speedMode: string;
  minDelay: number;
  maxDelay: number;
  pageInterval: number;
  maxRetries: number;
  maxEmptyPages: number;
  exportCsv: boolean;
  dataDir: string;
  blockResources: boolean;
}

interface ProgressInfo {
  page: number;
  maxPage: number;
  totalSaved: number;
}

interface LogEntry {
  message: string;
  type: 'info' | 'success' | 'error' | 'warning' | 'captcha' | 'captcha_ok';
  timestamp: string;
}

export default function SpiderPanel() {
  const { selectedCityFilter, selectedHost } = useCityContext();
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [params, setParams] = useState<SpiderParams>({
    host: 'https://jn.ke.com',
    sug: '',
    houseId: '',
    maxPage: 50,
    pageWait: 1.0,
    captchaTimeoutMinutes: 10,
    speedMode: 'normal',
    minDelay: 1.5,
    maxDelay: 3.5,
    pageInterval: 2.0,
    maxRetries: 3,
    maxEmptyPages: 1,
    exportCsv: true,
    dataDir: '',
    blockResources: false,
  });
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [progress, setProgress] = useState<ProgressInfo>({ page: 0, maxPage: 0, totalSaved: 0 });
  const [showCustomSpeed, setShowCustomSpeed] = useState(false);
  // 小区搜索 combobox
  const [communityKeyword, setCommunityKeyword] = useState('');
  const [communityOptions, setCommunityOptions] = useState<string[]>([]);
  const [communityDropdownOpen, setCommunityDropdownOpen] = useState(false);
  const [communityLoading, setCommunityLoading] = useState(false);
  const communityRef = useRef<HTMLDivElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // 防抖查询小区（从数据库）
  useEffect(() => {
    const timer = setTimeout(async () => {
      setCommunityLoading(true);
      try {
        const _cq = selectedCityFilter ? `&city=${encodeURIComponent(selectedCityFilter)}` : '';
        const url = communityKeyword
          ? `/api/community/search?keyword=${encodeURIComponent(communityKeyword)}&limit=30${_cq}`
          : `/api/community/search?limit=30${_cq}`;
        const res = await fetch(url);
        const json = await res.json();
        if (json.success) setCommunityOptions(json.data ?? []);
      } catch {
        setCommunityOptions([]);
      } finally {
        setCommunityLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [communityKeyword, selectedCityFilter]);

  // 点击组件外部时关闭下拉
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (communityRef.current && !communityRef.current.contains(e.target as Node)) {
        setCommunityDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 城市切换时自动同步 HOST
  useEffect(() => {
    if (selectedHost) {
      setParams(prev => ({ ...prev, host: selectedHost }));
    }
  }, [selectedHost]);

  // 加载映射和设置
  useEffect(() => {
    fetch('/api/mapping').then(r => r.json()).then(res => {
      if (res.success) setMapping(res.data || {});
    });

    fetch('/api/settings').then(r => r.json()).then(res => {
      if (res.success && res.data) {
        const s = res.data;
        setParams(prev => ({
          ...prev,
          host: s.host || prev.host,
          sug: s.sug || prev.sug,
          maxPage: s.maxPage || prev.maxPage,
          pageWait: s.pageWait || prev.pageWait,
                captchaTimeoutMinutes: s.captchaTimeoutMinutes || prev.captchaTimeoutMinutes,
          speedMode: s.speedMode || prev.speedMode,
          minDelay: s.minDelay || prev.minDelay,
          maxDelay: s.maxDelay || prev.maxDelay,
          pageInterval: s.pageInterval || prev.pageInterval,
          maxRetries: s.maxRetries || prev.maxRetries,
          maxEmptyPages: s.maxEmptyPages ?? prev.maxEmptyPages,
          exportCsv: s.exportCsv ?? prev.exportCsv,
          dataDir: s.dataDir || prev.dataDir,
        }));
      }
    });
  }, []);

  // 日志自动滚动
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = useCallback((message: string) => {
    const type = message.startsWith('[CAPTCHA_OK]')
      ? 'captcha_ok'
      : message.startsWith('[CAPTCHA]')
        ? 'captcha'
        : message.includes('✓') || message.includes('完成')
          ? 'success'
          : message.includes('❌') || message.includes('错误') || message.includes('异常') || message.includes('失败')
            ? 'error'
            : message.includes('⚠') || message.includes('警告')
              ? 'warning'
              : 'info';

    setLogs(prev => [...prev, {
      message,
      type,
      timestamp: new Date().toLocaleTimeString(),
    }]);
  }, []);

  const handleSugChange = (sug: string) => {
    setParams(prev => ({
      ...prev,
      sug,
      houseId: mapping[sug] || prev.houseId,
    }));
  };

  const handleSpeedModeChange = (mode: string) => {
    setParams(prev => ({ ...prev, speedMode: mode }));
    setShowCustomSpeed(mode === 'custom');
  };

  const startSpider = async () => {
    if (!params.host) {
      alert('请输入 HOST（目标地址）');
      return;
    }
    if (!params.sug) {
      alert('请输入 SUG（小区名称）');
      return;
    }

    setIsRunning(true);
    setLogs([]);
    setProgress({ page: 0, maxPage: params.maxPage, totalSaved: 0 });

    addLog(`开始时间: ${new Date().toLocaleString()}`);

    // 使用 fetch + ReadableStream 代替 EventSource（支持 POST）
    try {
      const response = await fetch('/api/spider/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6));
              handleSpiderEvent(event);
            } catch {
              // 忽略解析错误
            }
          }
        }
      }
    } catch (e) {
      addLog(`❌ 连接异常: ${e}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleSpiderEvent = (event: { type: string; data: unknown }) => {
    switch (event.type) {
      case 'log':
        addLog(event.data as string);
        break;
      case 'progress': {
        const p = event.data as ProgressInfo;
        setProgress(p);
        break;
      }
      case 'finished': {
        const f = event.data as { success: boolean; message: string };
        addLog(f.success ? `✓ ${f.message}` : `❌ ${f.message}`);
        setIsRunning(false);
        break;
      }
      case 'error':
        addLog(`❌ ${event.data}`);
        break;
    }
  };

  const stopSpider = async () => {
    try {
      await fetch('/api/spider/run', { method: 'DELETE' });
      addLog('⚠ 停止指令已发送，等待爬虫结束...');
    } catch (e) {
      addLog(`❌ 发送停止指令失败: ${e}`);
    }
  };

  const progressPercent = progress.maxPage > 0
    ? Math.round((progress.page / progress.maxPage) * 100)
    : 0;

  const speedModeOptions = [
    { value: 'slow', label: '保守 (2~5s)', desc: '最安全，不易被封' },
    { value: 'normal', label: '正常 (1.5~3.5s)', desc: '默认推荐，随机间隔模拟人工' },
    { value: 'fast', label: '快速 (0.5~1.5s)', desc: '速度较快，有一定风险' },
    { value: 'custom', label: '自定义', desc: '手动配置延迟参数' },
  ];

  return (
    <div className="flex h-full gap-0">
      {/* 左侧：配置面板 */}
      <div className="w-[480px] flex-shrink-0 bg-white border-r border-gray-200 overflow-y-auto">
        <div className="p-5 space-y-4">
          {/* 基本设置 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <span className="w-4 h-4 bg-blue-500 rounded-sm flex items-center justify-center text-white text-xs">1</span>
              基本设置
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  HOST（目标域名）
                </label>
                <input
                  type="text"
                  value={params.host}
                  onChange={e => setParams(p => ({ ...p, host: e.target.value }))}
                  placeholder="https://jn.ke.com"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div ref={communityRef} className="relative">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  快速选择小区（输入搜索）
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={communityKeyword}
                    onChange={e => {
                      setCommunityKeyword(e.target.value);
                      setCommunityDropdownOpen(true);
                    }}
                    onFocus={() => setCommunityDropdownOpen(true)}
                    placeholder="输入关键词搜索已采集小区..."
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                  />
                  {communityLoading && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2">
                      <svg className="animate-spin h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                    </span>
                  )}
                </div>
                {communityDropdownOpen && communityOptions.length > 0 && (
                  <ul className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-52 overflow-y-auto">
                    {communityOptions.map(name => (
                      <li
                        key={name}
                        onMouseDown={() => {
                          handleSugChange(name);
                          setCommunityKeyword(name);
                          setCommunityDropdownOpen(false);
                        }}
                        className="px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer"
                      >
                        {name}
                      </li>
                    ))}
                  </ul>
                )}
                {communityDropdownOpen && !communityLoading && communityOptions.length === 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg px-3 py-2 text-sm text-gray-400">
                    {communityKeyword ? '暂无匹配小区' : '数据库暂无小区数据'}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  SUG（小区名称）
                </label>
                <input
                  type="text"
                  value={params.sug}
                  onChange={e => handleSugChange(e.target.value)}
                  placeholder="输入小区名称"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  小区 ID（可选，精确搜索）
                </label>
                <input
                  type="text"
                  value={params.houseId}
                  onChange={e => setParams(p => ({ ...p, houseId: e.target.value }))}
                  placeholder="留空将按名称搜索"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </section>

          {/* 爬虫设置 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <span className="w-4 h-4 bg-blue-500 rounded-sm flex items-center justify-center text-white text-xs">2</span>
              爬虫设置
            </h3>
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">最大页数</label>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={params.maxPage}
                    onChange={e => setParams(p => ({ ...p, maxPage: parseInt(e.target.value) || 1 }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">连续空页终止</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={params.maxEmptyPages}
                    onChange={e => setParams(p => ({ ...p, maxEmptyPages: parseInt(e.target.value) || 1 }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    title="连续多少页无数据后自动停止"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">页面等待(秒)</label>
                  <input
                    type="number"
                    min={0.1}
                    max={60}
                    step={0.1}
                    value={params.pageWait}
                    onChange={e => setParams(p => ({ ...p, pageWait: parseFloat(e.target.value) || 1 }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">验证码超时(分钟)</label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    step={1}
                    value={params.captchaTimeoutMinutes}
                    onChange={e => setParams(p => ({ ...p, captchaTimeoutMinutes: parseInt(e.target.value) || 10 }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    title="出现验证码后等待人工处理的最长时间"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">速度模式</label>
                <div className="space-y-1.5">
                  {speedModeOptions.map(opt => (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="speedMode"
                        value={opt.value}
                        checked={params.speedMode === opt.value}
                        onChange={() => handleSpeedModeChange(opt.value)}
                        className="text-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-700">{opt.label}</span>
                      <span className="text-xs text-gray-400">{opt.desc}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* 自定义速度配置 */}
              {showCustomSpeed && (
                <div className="bg-gray-50 rounded-md p-3 space-y-2">
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-600 mb-1">最小延迟(秒)</label>
                      <input
                        type="number" min={0.1} max={10} step={0.1}
                        value={params.minDelay}
                        onChange={e => setParams(p => ({ ...p, minDelay: parseFloat(e.target.value) }))}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-600 mb-1">最大延迟(秒)</label>
                      <input
                        type="number" min={0.1} max={30} step={0.1}
                        value={params.maxDelay}
                        onChange={e => setParams(p => ({ ...p, maxDelay: parseFloat(e.target.value) }))}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-600 mb-1">页面间隔(秒)</label>
                      <input
                        type="number" min={0.1} max={60} step={0.1}
                        value={params.pageInterval}
                        onChange={e => setParams(p => ({ ...p, pageInterval: parseFloat(e.target.value) }))}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-600 mb-1">最大重试次数</label>
                      <input
                        type="number" min={0} max={10}
                        value={params.maxRetries}
                        onChange={e => setParams(p => ({ ...p, maxRetries: parseInt(e.target.value) }))}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* 导出设置 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <span className="w-4 h-4 bg-blue-500 rounded-sm flex items-center justify-center text-white text-xs">3</span>
              导出设置
            </h3>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={params.exportCsv}
                  onChange={e => setParams(p => ({ ...p, exportCsv: e.target.checked }))}
                  className="text-blue-500"
                />
                <span className="text-sm text-gray-700">导出为 CSV</span>
              </label>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">数据保存目录</label>
                <input
                  type="text"
                  value={params.dataDir}
                  onChange={e => setParams(p => ({ ...p, dataDir: e.target.value }))}
                  placeholder="默认：~/bk_spider_data/采集数据"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </section>

          {/* 高级设置 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <span className="w-4 h-4 bg-blue-500 rounded-sm flex items-center justify-center text-white text-xs">4</span>
              高级设置
            </h3>
            <div className="space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={params.blockResources}
                  onChange={e => setParams(p => ({ ...p, blockResources: e.target.checked }))}
                  className="text-blue-500 mt-0.5"
                />
                <div>
                  <span className="text-sm text-gray-700">屏蔽图片/字体资源（加速模式）</span>
                  <p className="text-xs text-gray-400 mt-0.5">
                    开启后不加载网页图片和字体，可加快爬取速度；若需显示验证码完成登录，请保持<strong>关闭</strong>
                  </p>
                </div>
              </label>
            </div>
          </section>

          {/* 进度条 */}
          {(isRunning || progress.page > 0) && (
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>进度: {progress.page}/{progress.maxPage} 页</span>
                <span>已保存: {progress.totalSaved} 条</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* 控制按钮 */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={startSpider}
              disabled={isRunning}
              className="flex-1 py-2.5 px-4 bg-green-500 text-white text-sm font-semibold rounded-md hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isRunning ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  爬取中...
                </span>
              ) : '▶ 开始爬取'}
            </button>
            <button
              onClick={stopSpider}
              disabled={!isRunning}
              className="flex-1 py-2.5 px-4 bg-red-500 text-white text-sm font-semibold rounded-md hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              ⏹ 停止
            </button>
          </div>
        </div>
      </div>

      {/* 右侧：日志输出 */}
      <div className="flex-1 flex flex-col bg-gray-900 min-w-0">
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
          <span className="text-sm font-medium text-gray-300">运行日志</span>
          <button
            onClick={() => setLogs([])}
            className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1 rounded hover:bg-gray-700 transition-colors"
          >
            清空
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed">
          {logs.length === 0 ? (
            <p className="text-gray-500 text-center mt-8">等待启动爬虫...</p>
          ) : (
            logs.map((log, i) => (
              log.type === 'captcha' ? (
                <div key={i} className="my-2 rounded-lg border-2 border-orange-400 bg-orange-950/60 px-4 py-3 animate-pulse">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">🚨</span>
                    <div>
                      <p className="text-orange-300 font-bold text-sm tracking-wide">人机验证触发！</p>
                      <p className="text-orange-200 text-xs mt-0.5">请切换到浏览器窗口，手动完成验证后爬虫将自动继续</p>
                    </div>
                    <span className="ml-auto text-gray-500 text-xs flex-shrink-0">[{log.timestamp}]</span>
                  </div>
                </div>
              ) : log.type === 'captcha_ok' ? (
                <div key={i} className="my-2 rounded-lg border border-green-600 bg-green-950/40 px-4 py-2 flex items-center gap-2">
                  <span className="text-lg">✅</span>
                  <span className="text-green-400 font-medium text-xs">人机验证已通过，继续爬取</span>
                  <span className="ml-auto text-gray-500 text-xs flex-shrink-0">[{log.timestamp}]</span>
                </div>
              ) : (
              <div key={i} className="flex gap-2 mb-0.5">
                <span className="text-gray-500 flex-shrink-0">[{log.timestamp}]</span>
                <span className={
                  log.type === 'success' ? 'text-green-400' :
                  log.type === 'error' ? 'text-red-400' :
                  log.type === 'warning' ? 'text-yellow-400' :
                  'text-gray-300'
                }>
                  {log.message}
                </span>
              </div>
              )
            ))
          )}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
}
