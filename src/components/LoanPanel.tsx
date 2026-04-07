'use client';

import { useState, useMemo } from 'react';

type LoanType = 'commercial' | 'provident' | 'combined';
type RepayType = 'equal_payment' | 'equal_principal';

interface MonthRecord {
  month: number;
  payment: number;
  principal: number;
  interest: number;
  remaining: number;
}

interface LoanResult {
  monthlyPayment: number;
  totalPayment: number;
  totalInterest: number;
  schedule: MonthRecord[];
}

function calcEqualPayment(principal: number, annualRate: number, months: number): LoanResult {
  if (annualRate === 0) {
    const mp = principal / months;
    const schedule: MonthRecord[] = Array.from({ length: months }, (_, i) => ({
      month: i + 1, payment: mp, principal: mp, interest: 0,
      remaining: Math.max(principal - mp * (i + 1), 0),
    }));
    return { monthlyPayment: mp, totalPayment: principal, totalInterest: 0, schedule };
  }
  const r = annualRate / 100 / 12;
  const mp = (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
  const schedule: MonthRecord[] = [];
  let remaining = principal;
  for (let i = 1; i <= months; i++) {
    const interest = remaining * r;
    const principalPart = mp - interest;
    remaining -= principalPart;
    schedule.push({
      month: i, payment: mp, principal: principalPart,
      interest, remaining: Math.max(remaining, 0),
    });
  }
  return { monthlyPayment: mp, totalPayment: mp * months, totalInterest: mp * months - principal, schedule };
}

function calcEqualPrincipal(principal: number, annualRate: number, months: number): LoanResult {
  const r = annualRate / 100 / 12;
  const monthlyPrincipal = principal / months;
  const schedule: MonthRecord[] = [];
  let remaining = principal;
  let totalPayment = 0;
  for (let i = 1; i <= months; i++) {
    const interest = remaining * r;
    const payment = monthlyPrincipal + interest;
    remaining -= monthlyPrincipal;
    totalPayment += payment;
    schedule.push({ month: i, payment, principal: monthlyPrincipal, interest, remaining: Math.max(remaining, 0) });
  }
  return {
    monthlyPayment: schedule[0]?.payment ?? 0,
    totalPayment,
    totalInterest: totalPayment - principal,
    schedule,
  };
}

function calcLoan(principal: number, annualRate: number, months: number, repayType: RepayType): LoanResult {
  if (principal <= 0 || months <= 0) {
    return { monthlyPayment: 0, totalPayment: 0, totalInterest: 0, schedule: [] };
  }
  return repayType === 'equal_payment'
    ? calcEqualPayment(principal, annualRate, months)
    : calcEqualPrincipal(principal, annualRate, months);
}

const fmt = (n: number, d = 2) =>
  n.toLocaleString('zh-CN', { minimumFractionDigits: d, maximumFractionDigits: d });

const fmtWan = (n: number) => n >= 10000 ? `${fmt(n / 10000, 2)} 万` : `${fmt(n, 2)} 元`;

function Field({
  label, value, onChange, unit, min = 0, max = 99999, step = 1, note,
}: {
  label: string; value: number; onChange: (v: number) => void;
  unit?: string; min?: number; max?: number; step?: number; note?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}{unit && <span className="ml-1 text-gray-400">({unit})</span>}
      </label>
      <input
        type="number" min={min} max={max} step={step} value={value}
        onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(v); }}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {note && <p className="text-xs text-gray-400 mt-0.5">{note}</p>}
    </div>
  );
}

function ResultCard({
  label, value, sub, color = 'blue',
}: {
  label: string; value: string; sub?: string; color?: 'blue' | 'orange' | 'red' | 'green';
}) {
  const cls = {
    blue:   'bg-blue-50 text-blue-700 border-blue-100',
    orange: 'bg-orange-50 text-orange-700 border-orange-100',
    red:    'bg-red-50 text-red-700 border-red-100',
    green:  'bg-green-50 text-green-700 border-green-100',
  }[color];
  return (
    <div className={`rounded-xl p-4 border text-center ${cls}`}>
      <div className="text-xs font-medium opacity-75 mb-1">{label}</div>
      <div className="text-xl font-bold">{value}</div>
      {sub && <div className="text-xs opacity-60 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function LoanPanel() {
  const [loanType, setLoanType]   = useState<LoanType>('commercial');
  const [repayType, setRepayType] = useState<RepayType>('equal_payment');
  const [housePrice, setHousePrice]         = useState(200);
  const [downPaymentPct, setDownPaymentPct] = useState(30);
  const [commRate, setCommRate]   = useState(3.1);
  const [commYears, setCommYears] = useState(30);
  const [provRate, setProvRate]   = useState(2.85);
  const [provYears, setProvYears] = useState(30);
  const [provMax, setProvMax]     = useState(120);
  const [combProvAmount, setCombProvAmount] = useState(60);
  const [combProvRate, setCombProvRate]     = useState(2.85);
  const [combProvYears, setCombProvYears]   = useState(30);
  const [combCommRate, setCombCommRate]     = useState(3.1);
  const [combCommYears, setCombCommYears]   = useState(30);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showAll, setShowAll]           = useState(false);

  type CombinedResult = {
    prov: LoanResult; comm: LoanResult; provAmt: number; commAmt: number;
  };

  const calcResult = useMemo((): {
    downPayment: number; loanAmount: number;
    commercial?: LoanResult; provident?: LoanResult; combined?: CombinedResult;
    provActualLoan?: number; // 公积金实际可贷金额（可能小于 loanAmount）
  } => {
    const downPayment = housePrice * downPaymentPct / 100;
    const loanAmount  = housePrice - downPayment;
    if (loanType === 'commercial') {
      return { downPayment, loanAmount, commercial: calcLoan(loanAmount * 10000, commRate, commYears * 12, repayType) };
    }
    if (loanType === 'provident') {
      const actualLoan = Math.min(loanAmount, provMax);
      // loanAmount 保持真实贷款总额用于显示；actualLoan 是公积金实际可贷金额
      return { downPayment, loanAmount, provident: calcLoan(actualLoan * 10000, provRate, provYears * 12, repayType), provActualLoan: actualLoan };
    }
    const provAmt = Math.min(combProvAmount, loanAmount);
    const commAmt = Math.max(0, loanAmount - provAmt);
    return {
      downPayment, loanAmount,
      combined: {
        prov: calcLoan(provAmt * 10000, combProvRate, combProvYears * 12, repayType),
        comm: calcLoan(commAmt * 10000, combCommRate, combCommYears * 12, repayType),
        provAmt, commAmt,
      },
    };
  }, [housePrice, downPaymentPct, loanType, repayType,
      commRate, commYears, provRate, provYears, provMax,
      combProvAmount, combProvRate, combProvYears, combCommRate, combCommYears]);

  const { loanAmount, downPayment, commercial, provident, combined, provActualLoan } = calcResult;

  const summary = useMemo(() => {
    if (commercial) {
      return { firstPayment: commercial.monthlyPayment, totalInterest: commercial.totalInterest, totalPayment: commercial.totalPayment, schedule: commercial.schedule };
    }
    if (provident) {
      return { firstPayment: provident.monthlyPayment, totalInterest: provident.totalInterest, totalPayment: provident.totalPayment, schedule: provident.schedule };
    }
    if (combined) {
      const { prov, comm } = combined;
      const len = Math.max(prov.schedule.length, comm.schedule.length);
      const schedule: MonthRecord[] = Array.from({ length: len }, (_, i) => {
        const p = prov.schedule[i]; const c = comm.schedule[i];
        return {
          month: i + 1,
          payment:   (p?.payment ?? 0)   + (c?.payment ?? 0),
          principal: (p?.principal ?? 0) + (c?.principal ?? 0),
          interest:  (p?.interest ?? 0)  + (c?.interest ?? 0),
          remaining: (p?.remaining ?? 0) + (c?.remaining ?? 0),
        };
      });
      return {
        firstPayment: (prov.schedule[0]?.payment ?? 0) + (comm.schedule[0]?.payment ?? 0),
        totalInterest: prov.totalInterest + comm.totalInterest,
        totalPayment:  prov.totalPayment  + comm.totalPayment,
        schedule,
      };
    }
    return { firstPayment: 0, totalInterest: 0, totalPayment: 0, schedule: [] as MonthRecord[] };
  }, [commercial, provident, combined]);

  // 公积金模式下，实际贷款额可能因额度上限被截断，需用实际贷款额计算占比
  const actualLoanAmount = loanType === 'provident' && provActualLoan !== undefined ? provActualLoan : loanAmount;
  const principalPct = summary.totalPayment > 0 ? actualLoanAmount * 10000 / summary.totalPayment * 100 : 0;
  const interestPct  = 100 - principalPct;
  const lastPayment  = summary.schedule[summary.schedule.length - 1]?.payment ?? 0;
  const visibleRows  = showAll ? summary.schedule : summary.schedule.slice(0, 24);

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-5">

        {/* 顶部说明 */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <h2 className="text-base font-bold text-gray-800 mb-1">🏦 房贷计算器</h2>
          <p className="text-xs text-gray-400">
            支持商业贷款、公积金贷款、组合贷款，等额月供与等额本金两种还款方式，含完整还款计划表。
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* ── 左侧：参数输入 ── */}
          <div className="space-y-4">

            {/* 1. 房屋信息 */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <span className="w-5 h-5 bg-blue-500 rounded flex items-center justify-center text-white text-xs">1</span>
                房屋信息
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <Field label="房屋总价" unit="万元" value={housePrice} onChange={setHousePrice} min={10} max={99999} step={1} />
                <Field
                  label="首付比例" unit="%" value={downPaymentPct} onChange={setDownPaymentPct}
                  min={20} max={100} step={1}
                  note={`首付 ${fmt(downPayment, 1)} 万 · 贷款 ${fmt(loanAmount, 1)} 万`}
                />
              </div>
            </div>

            {/* 2. 贷款类型 */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="w-5 h-5 bg-blue-500 rounded flex items-center justify-center text-white text-xs">2</span>
                贷款类型
              </h3>
              <div className="flex gap-2 mb-4">
                {([
                  { v: 'commercial', label: '商业贷款' },
                  { v: 'provident',  label: '公积金贷款' },
                  { v: 'combined',   label: '组合贷款' },
                ] as { v: LoanType; label: string }[]).map(({ v, label }) => (
                  <button key={v} onClick={() => setLoanType(v)}
                    className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors ${
                      loanType === v ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>

              {loanType === 'commercial' && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="年利率" unit="%" value={commRate} onChange={setCommRate} min={0.1} max={20} step={0.01} note="参考：LPR 3.1%（2025）" />
                  <Field label="贷款年限" unit="年" value={commYears} onChange={setCommYears} min={1} max={30} step={1} />
                </div>
              )}

              {loanType === 'provident' && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="公积金利率" unit="%" value={provRate} onChange={setProvRate} min={0.1} max={10} step={0.01} note="参考：2.85%（≥5年）" />
                  <Field label="贷款年限" unit="年" value={provYears} onChange={setProvYears} min={1} max={30} step={1} />
                  <div className="col-span-2">
                    <Field label="额度上限" unit="万元" value={provMax} onChange={setProvMax} min={10} max={200} step={10} note="各城市上限不同，请按当地政策填写" />
                  </div>
                </div>
              )}

              {loanType === 'combined' && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-gray-500 border-b border-gray-100 pb-1.5">公积金部分</p>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="金额" unit="万元" value={combProvAmount}
                      onChange={v => setCombProvAmount(Math.min(v, loanAmount))} min={1} max={200} step={1} />
                    <Field label="利率" unit="%" value={combProvRate} onChange={setCombProvRate} min={0.1} max={10} step={0.01} />
                    <Field label="年限" unit="年" value={combProvYears} onChange={setCombProvYears} min={1} max={30} step={1} />
                  </div>
                  <p className="text-xs font-semibold text-gray-500 border-b border-gray-100 pb-1.5">商业贷款部分</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="flex items-end pb-2">
                      <span className="text-xs text-gray-500">商业 {fmt(combined?.commAmt ?? 0, 1)} 万</span>
                    </div>
                    <Field label="利率" unit="%" value={combCommRate} onChange={setCombCommRate} min={0.1} max={20} step={0.01} />
                    <Field label="年限" unit="年" value={combCommYears} onChange={setCombCommYears} min={1} max={30} step={1} />
                  </div>
                </div>
              )}
            </div>

            {/* 3. 还款方式 */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="w-5 h-5 bg-blue-500 rounded flex items-center justify-center text-white text-xs">3</span>
                还款方式
              </h3>
              <div className="space-y-2">
                {([
                  { v: 'equal_payment',   label: '等额月供（等额还款）', desc: '每月还款金额固定，前期利息占比高，还款压力均衡，适合收入稳定的购房者。' },
                  { v: 'equal_principal', label: '等额本金（递减还款）', desc: '每月还款本金固定，利息逐月递减，月供逐渐降低，总利息更少，但前期月供压力较大。' },
                ] as { v: RepayType; label: string; desc: string }[]).map(({ v, label, desc }) => (
                  <label key={v}
                    className={`flex gap-3 p-3 rounded-lg cursor-pointer border transition-colors ${
                      repayType === v ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                    }`}>
                    <input type="radio" name="repayType" value={v} checked={repayType === v}
                      onChange={() => setRepayType(v)} className="mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-gray-700">{label}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* ── 右侧：计算结果 ── */}
          <div className="space-y-4">

            {/* 核心结果 */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">📊 计算结果</h3>
              <div className="flex flex-wrap gap-3 text-xs text-gray-500 mb-4 bg-gray-50 rounded-lg px-3 py-2.5">
                <span>房价 <strong className="text-gray-700">{housePrice} 万</strong></span>
                <span className="text-gray-300">|</span>
                <span>首付 <strong className="text-gray-700">{fmt(downPayment, 1)} 万</strong></span>
                <span className="text-gray-300">|</span>
                <span>贷款 <strong className="text-gray-700">{fmt(loanAmount, 1)} 万</strong></span>
                {loanType === 'provident' && provActualLoan !== undefined && provActualLoan < loanAmount && (
                  <span className="text-orange-500">（公积金实贷 {fmt(provActualLoan, 1)} 万，受额度上限限制）</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <ResultCard
                  label={repayType === 'equal_payment' ? '每月固定月供' : '首月月供'}
                  value={`¥${fmt(summary.firstPayment)}`}
                  sub="元 / 月" color="blue"
                />
                <ResultCard
                  label="还款总额" value={fmtWan(summary.totalPayment)}
                  sub={`实贷 ${fmt(loanType === 'provident' && provActualLoan !== undefined ? provActualLoan : loanAmount, 1)} 万`} color="orange"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <ResultCard
                  label="利息总额" value={fmtWan(summary.totalInterest)}
                  sub={`占还款 ${fmt(interestPct, 1)}%`} color="red"
                />
                <ResultCard
                  label="本金总额"
                  value={`${fmt(loanType === 'provident' && provActualLoan !== undefined ? provActualLoan : loanAmount, 1)} 万`}
                  sub={`占还款 ${fmt(principalPct, 1)}%`} color="green"
                />
              </div>
            </div>

            {/* 组合贷款拆分 */}
            {loanType === 'combined' && combined && (
              <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">组合贷款拆分</h3>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-100">
                      <th className="py-2 text-left font-medium">类型</th>
                      <th className="py-2 text-right font-medium">贷款额</th>
                      <th className="py-2 text-right font-medium">月供</th>
                      <th className="py-2 text-right font-medium">利息合计</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    <tr>
                      <td className="py-2 text-gray-600">公积金</td>
                      <td className="py-2 text-right">{fmt(combined.provAmt, 1)} 万</td>
                      <td className="py-2 text-right text-blue-600 font-semibold">¥{fmt(combined.prov.monthlyPayment)}</td>
                      <td className="py-2 text-right text-red-500">{fmtWan(combined.prov.totalInterest)}</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-gray-600">商业</td>
                      <td className="py-2 text-right">{fmt(combined.commAmt, 1)} 万</td>
                      <td className="py-2 text-right text-blue-600 font-semibold">¥{fmt(combined.comm.monthlyPayment)}</td>
                      <td className="py-2 text-right text-red-500">{fmtWan(combined.comm.totalInterest)}</td>
                    </tr>
                    <tr className="border-t border-gray-200 font-semibold">
                      <td className="py-2 text-gray-700">合计</td>
                      <td className="py-2 text-right text-gray-700">{fmt(loanAmount, 1)} 万</td>
                      <td className="py-2 text-right text-blue-700">¥{fmt(summary.firstPayment)}</td>
                      <td className="py-2 text-right text-red-600">{fmtWan(summary.totalInterest)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* 还款构成可视化 */}
            {summary.totalPayment > 0 && (
              <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">还款构成</h3>
                <div className="flex rounded-full overflow-hidden h-4 mb-2.5">
                  <div className="bg-blue-500 transition-all duration-500" style={{ width: `${principalPct}%` }} />
                  <div className="bg-red-400 flex-1" />
                </div>
                <div className="flex justify-between text-xs text-gray-500 mb-3">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" />
                    本金 {fmt(principalPct, 1)}%（{fmt(actualLoanAmount, 1)} 万）
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-red-400 inline-block" />
                    利息 {fmt(interestPct, 1)}%（{fmtWan(summary.totalInterest)}）
                  </span>
                </div>

                {repayType === 'equal_principal' && summary.schedule.length > 0 && (
                  <div className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2 mb-3">
                    首月 <strong className="text-gray-600">¥{fmt(summary.firstPayment)}</strong>
                    {' → '}末期 <strong className="text-gray-600">¥{fmt(lastPayment)}</strong>
                    <span className="mx-2 text-gray-300">|</span>
                    每月递减约 ¥{fmt((summary.firstPayment - lastPayment) / Math.max(summary.schedule.length - 1, 1), 2)}
                  </div>
                )}

                {/* 分年度剩余本金 */}
                <div className="grid grid-cols-3 gap-2 text-xs text-center">
                  {[5, 10, 20].map(yr => {
                    const idx = Math.min(yr * 12 - 1, summary.schedule.length - 1);
                    const paid = summary.schedule.slice(0, idx + 1).reduce((s, r) => s + r.payment, 0);
                    const rem  = summary.schedule[idx]?.remaining ?? 0;
                    return (
                      <div key={yr} className="bg-gray-50 rounded-lg p-2">
                        <div className="font-medium text-gray-600">{yr} 年后</div>
                        <div className="text-gray-500 mt-0.5">已还 {fmtWan(paid)}</div>
                        <div className="text-orange-500 mt-0.5">余 {rem > 0 ? fmtWan(rem) : '已还清'}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── 还款计划表 ── */}
        {summary.schedule.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div
              className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-100"
              onClick={() => { setShowSchedule(v => !v); setShowAll(false); }}
            >
              <h3 className="text-sm font-semibold text-gray-700">
                📅 还款计划表
                <span className="ml-2 text-xs font-normal text-gray-400">共 {summary.schedule.length} 期</span>
              </h3>
              <span className="text-gray-400 text-sm">{showSchedule ? '▲ 收起' : '▼ 展开'}</span>
            </div>

            {showSchedule && (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 border-b border-gray-100">
                        <th className="px-4 py-2.5 text-right font-semibold w-16">期数</th>
                        <th className="px-4 py-2.5 text-right font-semibold">月供（元）</th>
                        <th className="px-4 py-2.5 text-right font-semibold">还本金（元）</th>
                        <th className="px-4 py-2.5 text-right font-semibold">还利息（元）</th>
                        <th className="px-4 py-2.5 text-right font-semibold">剩余本金（元）</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {visibleRows.map((row, idx) => (
                        <tr key={row.month} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                          <td className="px-4 py-2 text-right text-gray-500 font-mono">{row.month}</td>
                          <td className="px-4 py-2 text-right font-semibold text-blue-600">{fmt(row.payment)}</td>
                          <td className="px-4 py-2 text-right text-gray-700">{fmt(row.principal)}</td>
                          <td className="px-4 py-2 text-right text-red-500">{fmt(row.interest)}</td>
                          <td className="px-4 py-2 text-right text-gray-500">{fmt(row.remaining)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {summary.schedule.length > 24 && (
                  <div className="px-5 py-3 border-t border-gray-100 text-center">
                    <button
                      onClick={() => setShowAll(v => !v)}
                      className="text-xs text-blue-500 hover:text-blue-700 font-medium"
                    >
                      {showAll ? `▲ 只显示前 24 期` : `▼ 展开全部 ${summary.schedule.length} 期`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
