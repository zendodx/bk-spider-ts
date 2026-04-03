'use client';

import { useState } from 'react';

type Version = 'v1' | 'v2';

// ─── 提取到模块级别，避免每次父组件渲染产生新函数引用导致 unmount/remount ───
function NumberInput({
  label,
  value,
  onChange,
  min = 0,
  max = 99999,
  step = 1,
  unit = '',
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}) {
  const [localVal, setLocalVal] = useState<string>(String(value));

  // 外部 value 被重置时（如切换版本）同步本地字符串
  // 只在解析值与外部值真正不同时才更新，不打断用户输入
  const parsedLocal = parseFloat(localVal);
  if (!isNaN(parsedLocal) && parsedLocal !== value && localVal !== '') {
    setLocalVal(String(value));
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-600 mb-1">
        {label} {unit && <span className="text-xs text-gray-400">({unit})</span>}
      </label>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={localVal}
        onChange={e => {
          setLocalVal(e.target.value);
          const n = parseFloat(e.target.value);
          if (!isNaN(n)) onChange(n);
        }}
        onBlur={() => {
          const n = parseFloat(localVal);
          if (isNaN(n)) {
            setLocalVal(String(value));
          } else {
            setLocalVal(String(n));
            onChange(n);
          }
        }}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

interface V1Input {
  monthlyRent: number;
  capitalInterestRate: number;
  depreciationRate: number;
  riskRate: number;
}

interface V2Input {
  unitMonthlyRent: number;
  area: number;
  capitalInterestRate: number;
  depreciationRate: number;
  riskRate: number;
}

interface PredictResult {
  predictedPrice: number;
  annualRent: number;
  totalRate: number;
  priceToRentRatio: number;
  monthlyRent?: number;
}

export default function PredictPanel() {
  const [version, setVersion] = useState<Version>('v1');
  const [v1Input, setV1Input] = useState<V1Input>({
    monthlyRent: 5000,
    capitalInterestRate: 1.6,
    depreciationRate: 1.0,
    riskRate: 0.5,
  });
  const [v2Input, setV2Input] = useState<V2Input>({
    unitMonthlyRent: 50,
    area: 100,
    capitalInterestRate: 1.6,
    depreciationRate: 1.0,
    riskRate: 0.5,
  });
  const [result, setResult] = useState<PredictResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCalculate = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const body = version === 'v1'
        ? {
            version: 'v1',
            monthlyRent: v1Input.monthlyRent,
            capitalInterestRate: v1Input.capitalInterestRate / 100,
            depreciationRate: v1Input.depreciationRate / 100,
            riskRate: v1Input.riskRate / 100,
          }
        : {
            version: 'v2',
            unitMonthlyRent: v2Input.unitMonthlyRent,
            area: v2Input.area,
            capitalInterestRate: v2Input.capitalInterestRate / 100,
            depreciationRate: v2Input.depreciationRate / 100,
            riskRate: v2Input.riskRate / 100,
          };

      const res = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error || '计算失败');
        return;
      }

      setResult(data.result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const fmt = (n: number, decimals = 0) =>
    n.toLocaleString('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto space-y-5">
        {/* 版本选择 */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <h2 className="text-base font-bold text-gray-800 mb-3">🏠 房价预测工具</h2>
          <p className="text-xs text-gray-500 mb-4">
            根据租金反向推算合理房价，判断房产投资价值。
            <br />资金利息保守取 1.6%，折旧率 ≥1%，风险赔率北上广深取 0.5%（越偏远越高）
          </p>
          <div className="flex gap-3">
            {(['v1', 'v2'] as Version[]).map(v => (
              <button
                key={v}
                onClick={() => { setVersion(v); setResult(null); }}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  version === v
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {v === 'v1' ? '按月租金（V1）' : '按单位面积租金（V2）'}
              </button>
            ))}
          </div>
        </div>

        {/* 输入参数 */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">参数输入</h3>
          <div className="grid grid-cols-2 gap-4">
            {version === 'v1' ? (
              <>
                <NumberInput
                  label="月租金" unit="元"
                  value={v1Input.monthlyRent}
                  onChange={v => setV1Input(p => ({ ...p, monthlyRent: v }))}
                  step={100}
                />
                <NumberInput
                  label="资金利息率" unit="%"
                  value={v1Input.capitalInterestRate}
                  onChange={v => setV1Input(p => ({ ...p, capitalInterestRate: v }))}
                  min={0} max={100} step={0.1}
                />
                <NumberInput
                  label="折旧率" unit="%"
                  value={v1Input.depreciationRate}
                  onChange={v => setV1Input(p => ({ ...p, depreciationRate: v }))}
                  min={0} max={100} step={0.1}
                />
                <NumberInput
                  label="风险赔率" unit="%"
                  value={v1Input.riskRate}
                  onChange={v => setV1Input(p => ({ ...p, riskRate: v }))}
                  min={0} max={100} step={0.1}
                />
              </>
            ) : (
              <>
                <NumberInput
                  label="单位面积月房租" unit="元/㎡"
                  value={v2Input.unitMonthlyRent}
                  onChange={v => setV2Input(p => ({ ...p, unitMonthlyRent: v }))}
                  step={1}
                />
                <NumberInput
                  label="总面积" unit="㎡"
                  value={v2Input.area}
                  onChange={v => setV2Input(p => ({ ...p, area: v }))}
                  step={1}
                />
                <NumberInput
                  label="资金利息率" unit="%"
                  value={v2Input.capitalInterestRate}
                  onChange={v => setV2Input(p => ({ ...p, capitalInterestRate: v }))}
                  min={0} max={100} step={0.1}
                />
                <NumberInput
                  label="折旧率" unit="%"
                  value={v2Input.depreciationRate}
                  onChange={v => setV2Input(p => ({ ...p, depreciationRate: v }))}
                  min={0} max={100} step={0.1}
                />
                <NumberInput
                  label="风险赔率" unit="%"
                  value={v2Input.riskRate}
                  onChange={v => setV2Input(p => ({ ...p, riskRate: v }))}
                  min={0} max={100} step={0.1}
                />
              </>
            )}
          </div>

          <button
            onClick={handleCalculate}
            disabled={loading}
            className="mt-4 w-full py-2.5 bg-blue-500 text-white text-sm font-semibold rounded-md hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            {loading ? '计算中...' : '🧮 计算房价预测'}
          </button>

          {error && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* 预测结果 */}
        {result && (
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">预测结果</h3>

            {/* 核心数字 */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-blue-50 rounded-lg p-4 text-center">
                <div className="text-xs text-blue-500 font-medium mb-1">理论房价</div>
                <div className="text-2xl font-bold text-blue-700">
                  ¥{fmt(result.predictedPrice)}
                </div>
                <div className="text-xs text-blue-400 mt-1">元</div>
              </div>
              <div className="bg-green-50 rounded-lg p-4 text-center">
                <div className="text-xs text-green-500 font-medium mb-1">租价比</div>
                <div className="text-2xl font-bold text-green-700">
                  {fmt(result.priceToRentRatio)}
                </div>
                <div className="text-xs text-green-400 mt-1">倍年租金</div>
              </div>
            </div>

            {/* 详细数据 */}
            <div className="space-y-2">
              <div className="flex justify-between items-center py-1.5 border-b border-gray-100 text-sm">
                <span className="text-gray-500">年租金</span>
                <span className="font-medium text-gray-800">¥{fmt(result.annualRent)}</span>
              </div>
              {result.monthlyRent !== undefined && (
                <div className="flex justify-between items-center py-1.5 border-b border-gray-100 text-sm">
                  <span className="text-gray-500">月租金</span>
                  <span className="font-medium text-gray-800">¥{fmt(result.monthlyRent)}</span>
                </div>
              )}
              <div className="flex justify-between items-center py-1.5 border-b border-gray-100 text-sm">
                <span className="text-gray-500">综合费率</span>
                <span className="font-medium text-gray-800">{(result.totalRate * 100).toFixed(2)}%</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-gray-100 text-sm">
                <span className="text-gray-500">购房价是月租金的</span>
                <span className="font-medium text-gray-800">{fmt(result.priceToRentRatio * 12)} 倍</span>
              </div>
            </div>

            {/* 分析参考 */}
            <div className="mt-4 bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-1">
              <div className="font-medium text-gray-600 mb-1.5">📊 参考基准</div>
              <div className="flex justify-between">
                <span>北上广深优质房产</span>
                <span className="text-gray-700 font-medium">300–400 倍</span>
              </div>
              <div className="flex justify-between">
                <span>一二线城市普通房产</span>
                <span className="text-gray-700 font-medium">400–600 倍</span>
              </div>
              <div className="flex justify-between">
                <span>三四线城市房产</span>
                <span className="text-gray-700 font-medium">600–1000 倍</span>
              </div>
              <div className="mt-2 text-gray-400 italic">租价比越小，房产投资价值越高</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
