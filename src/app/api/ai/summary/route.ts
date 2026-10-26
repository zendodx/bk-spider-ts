/**
 * AI 房源总结 API（库存 + 失效 综合分析）
 * POST /api/ai/summary
 * body: { community: string, city?: string }
 *
 * 口径说明：
 *   - 库存：小区最新采集日当天的在架房源（distinct detail_url）
 *   - 失效：历史出现过、但最新采集日已不在架的房源（卖出或下架）
 *   - 手记真实价格：house_note 表中用户实地记录的底价/成交价（可信度高于挂牌价）
 * 一次调用产出三段式报告：先分析库存 → 再分析失效 → 最后结合两者与手记真实价格给出购房决策建议。
 */

import { NextRequest } from 'next/server';
import { getDb, initDatabase } from '@/lib/db/database';
import { getDBPath } from '@/lib/settings';
import { callAiText } from '@/lib/ai/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface ListingStatRow {
  unit_price: number | null;   // 万/平
  total_price: number | null;  // 万
  area: number | null;
  house_type: string | null;
  orientation: string | null;
  follow_count: number;
  tags: string | null;
}

interface ExpiredStatRow extends ListingStatRow {
  first_seen: string;
  last_seen: string;
  appear_days: number;
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function countBy(values: (string | null)[]): [string, number][] {
  const map = new Map<string, number>();
  for (const v of values) {
    const key = (v ?? '').trim();
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function topTags(rows: ListingStatRow[], limit = 8): [string, number][] {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (!r.tags) continue;
    for (const tag of r.tags.split(/[,，、;；\s]+/)) {
      const t = tag.trim();
      if (!t) continue;
      map.set(t, (map.get(t) ?? 0) + 1);
    }
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

/** 通用统计描述块（元/平、万） */
function buildCommonStats(rows: ListingStatRow[]): string {
  const units  = rows.map(r => r.unit_price).filter((v): v is number => v != null && v > 0).map(v => v * 10000);
  const totals = rows.map(r => r.total_price).filter((v): v is number => v != null && v > 0);
  const areas  = rows.map(r => r.area).filter((v): v is number => v != null && v > 0);
  const follows = rows.map(r => r.follow_count ?? 0);

  const lines: string[] = [];
  if (units.length) {
    lines.push(`- 单价（元/平）：均价 ${Math.round(units.reduce((a, b) => a + b, 0) / units.length)}，中位 ${Math.round(median(units)!)}，区间 ${Math.round(Math.min(...units))} ~ ${Math.round(Math.max(...units))}`);
  }
  if (totals.length) {
    lines.push(`- 总价（万）：均价 ${(totals.reduce((a, b) => a + b, 0) / totals.length).toFixed(1)}，中位 ${median(totals)!.toFixed(1)}，区间 ${Math.min(...totals).toFixed(0)} ~ ${Math.max(...totals).toFixed(0)}`);
  }
  if (areas.length) {
    lines.push(`- 面积（㎡）：均值 ${(areas.reduce((a, b) => a + b, 0) / areas.length).toFixed(1)}，区间 ${Math.min(...areas).toFixed(0)} ~ ${Math.max(...areas).toFixed(0)}`);
  }
  const houseTypes = countBy(rows.map(r => r.house_type)).slice(0, 8);
  if (houseTypes.length) lines.push(`- 户型分布：${houseTypes.map(([t, c]) => `${t} ${c}套`).join('，')}`);
  const orientations = countBy(rows.map(r => r.orientation)).slice(0, 5);
  if (orientations.length) lines.push(`- 朝向分布：${orientations.map(([t, c]) => `${t} ${c}套`).join('，')}`);
  if (follows.length) {
    lines.push(`- 关注量：总计 ${follows.reduce((a, b) => a + b, 0)}，单套均值 ${(follows.reduce((a, b) => a + b, 0) / follows.length).toFixed(1)}，最高 ${Math.max(...follows)}`);
  }
  const tags = topTags(rows);
  if (tags.length) lines.push(`- 热门标签：${tags.map(([t, c]) => `${t}(${c})`).join('，')}`);
  return lines.join('\n');
}

export interface AiAnalysisRecord {
  id: number;
  community: string;
  city: string;
  base_date: string;
  inventory_count: number;
  expired_count: number;
  notes_count: number;
  summary: string;
  latency_ms: number;
  created_at: string;
}

/**
 * 查询历史分析记录
 * GET /api/ai/summary?community=xxx  指定小区（省略时返回全部小区的最近记录），最多 50 条
 */
export async function GET(request: NextRequest) {
  try {
    const community = new URL(request.url).searchParams.get('community')?.trim() ?? '';
    await initDatabase(getDBPath());
    const db = getDb(getDBPath());
    const rows = community
      ? db.prepare(`SELECT * FROM community_ai_analysis WHERE community = ? ORDER BY id DESC LIMIT 50`).all(community)
      : db.prepare(`SELECT * FROM community_ai_analysis ORDER BY id DESC LIMIT 50`).all();
    return Response.json({ success: true, data: rows as AiAnalysisRecord[] });
  } catch (e) {
    return Response.json({ success: false, error: String(e) }, { status: 500 });
  }
}

/** 删除一条历史分析记录 */
export async function DELETE(request: NextRequest) {
  try {
    const id = parseInt(new URL(request.url).searchParams.get('id') ?? '', 10);
    if (!id) {
      return Response.json({ success: false, error: '缺少 id 参数' }, { status: 400 });
    }
    await initDatabase(getDBPath());
    const db = getDb(getDBPath());
    db.prepare(`DELETE FROM community_ai_analysis WHERE id = ?`).run(id);
    return Response.json({ success: true, message: '已删除' });
  } catch (e) {
    return Response.json({ success: false, error: String(e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const community = String(body.community ?? '').trim();
    const city      = String(body.city ?? '').trim();
    if (!community) {
      return Response.json({ success: false, error: '请输入小区名称' }, { status: 400 });
    }

    const db = getDb(getDBPath());
    await initDatabase(getDBPath());
    const cityCond   = city ? `AND city LIKE '%' || ? || '%'` : '';
    const cityParams: string[] = city ? [city] : [];

    // 基准日期：该小区最新采集日
    const base = db.prepare(`
      SELECT date(MAX(created_at)) AS latest_date
      FROM house_listings
      WHERE is_deleted = 0 AND community = ? ${cityCond}
    `).get(community, ...cityParams) as { latest_date: string | null };
    const baseDate = base.latest_date;
    if (!baseDate) {
      return Response.json({ success: false, error: `小区「${community}」暂无采集数据` });
    }

    // ===== 一、库存：最新采集日在架房源（每个 detail_url 取最新一条） =====
    const inventoryRows = db.prepare(`
      SELECT h.unit_price, h.total_price, h.area, h.house_type, h.orientation, h.follow_count, h.tags
      FROM house_listings h
      INNER JOIN (
        SELECT detail_url, MAX(id) AS max_id
        FROM house_listings
        WHERE is_deleted = 0 AND community = ? AND date(created_at) = ? AND detail_url IS NOT NULL
        ${cityCond}
        GROUP BY detail_url
      ) t ON t.max_id = h.id
    `).all(community, baseDate, ...cityParams) as ListingStatRow[];

    // ===== 二、失效：每个 detail_url 的最后记录中，last_seen 早于基准日的部分 =====
    const expiredRows = db.prepare(`
      WITH per_url AS (
        SELECT detail_url,
               MAX(id) AS last_id,
               MIN(date(created_at)) AS first_seen,
               MAX(date(created_at)) AS last_seen,
               COUNT(DISTINCT date(created_at)) AS appear_days
        FROM house_listings
        WHERE is_deleted = 0 AND community = ? AND detail_url IS NOT NULL
        ${cityCond}
        GROUP BY detail_url
      )
      SELECT h.unit_price, h.total_price, h.area, h.house_type, h.orientation, h.follow_count, h.tags,
             p.first_seen, p.last_seen, p.appear_days
      FROM per_url p
      JOIN house_listings h ON h.id = p.last_id
      WHERE p.last_seen < ?
    `).all(community, ...cityParams, baseDate) as ExpiredStatRow[];

    const inventoryCount = inventoryRows.length;
    const expiredCount   = expiredRows.length;
    if (inventoryCount === 0 && expiredCount === 0) {
      return Response.json({ success: false, error: `小区「${community}」暂无可分析的房源数据` });
    }

    // 失效时间分布与挂牌周期
    let expiredExtra = '';
    if (expiredCount > 0) {
      const baseTs = new Date(baseDate + 'T00:00:00').getTime();
      const buckets = { d7: 0, d30: 0, d90: 0, older: 0 };
      let appearSum = 0;
      for (const r of expiredRows) {
        const days = Math.round((baseTs - new Date(r.last_seen + 'T00:00:00').getTime()) / 86400000);
        if (days <= 7) buckets.d7++;
        else if (days <= 30) buckets.d30++;
        else if (days <= 90) buckets.d90++;
        else buckets.older++;
        appearSum += r.appear_days;
      }
      expiredExtra = `\n- 失效时间分布：近7天 ${buckets.d7} 套，8~30天 ${buckets.d30} 套，31~90天 ${buckets.d90} 套，90天以上 ${buckets.older} 套`
        + `\n- 平均挂牌周期（出现天数）：${(appearSum / expiredCount).toFixed(1)} 天`;
    }

    // ===== 三、用户手记真实价格（house_note，可信度高于挂牌价，最多取最近 30 条） =====
    let notesText = '（无手记价格记录）';
    let notesCount = 0;
    try {
      const noteRows = db.prepare(`
        SELECT n.note, h.total_price, h.house_type, h.area
        FROM house_note n
        JOIN (
          SELECT detail_url, MAX(id) AS max_id
          FROM house_listings
          WHERE is_deleted = 0 AND community = ? AND detail_url IS NOT NULL
          ${cityCond}
          GROUP BY detail_url
        ) t ON t.detail_url = n.detail_url
        JOIN house_listings h ON h.id = t.max_id
        WHERE n.note != ''
        ORDER BY n.updated_at DESC
        LIMIT 30
      `).all(community, ...cityParams) as { note: string; total_price: number | null; house_type: string | null; area: number | null }[];
      notesCount = noteRows.length;
      if (notesCount > 0) {
        notesText = noteRows.map((r, i) => {
          const note = r.note.replace(/\s+/g, ' ').slice(0, 200);
          const listing = r.total_price != null ? `挂牌 ${r.total_price.toFixed(0)}万` : '挂牌价未知';
          const spec = [r.house_type, r.area != null ? `${r.area.toFixed(0)}㎡` : ''].filter(Boolean).join('/');
          return `${i + 1}. ${listing}${spec ? `（${spec}）` : ''}｜手记：${note}`;
        }).join('\n');
      }
    } catch { /* house_note 表不存在时忽略 */ }

    const inventoryStats = inventoryCount > 0 ? buildCommonStats(inventoryRows) : '（无在架房源）';
    const expiredStats   = expiredCount > 0 ? buildCommonStats(expiredRows) + expiredExtra : '（无失效房源样本）';

    // ===== 组装 Prompt：先库存 → 再失效 → 综合购房建议 =====
    const prompt = `你是一名资深二手房置业顾问。以下是小区「${community}」${city ? `（${city}）` : ''}截至 ${baseDate} 的房源统计数据，包含【在架库存 ${inventoryCount} 套】与【历史失效（卖出或下架）${expiredCount} 套】两部分，请撰写一份面向购房者的中文分析报告。

【一、在架库存统计】（${inventoryCount} 套）
${inventoryStats}

【二、历史失效房源统计】（${expiredCount} 套）
${expiredStats}

【三、用户手记真实价格参考】（${notesCount} 条，为用户实地了解到的真实底价/成交价，可信度高于挂牌价）
${notesText}

【重要背景】
统计数据中的价格均为贝壳挂牌价，普遍高于真实成交价；手记价格才是贴近市场的真实价格锚点。

【写作要求】
1. 使用 Markdown 格式，固定输出三个章节：
   ## 一、库存房源分析 —— 当前在架房源的价格水平、户型面积结构、供给特征与卖房心态（关注量解读）
   ## 二、失效房源分析 —— 什么样的房子卖出/下架了（价格段、户型、去化速度），反映出的真实成交偏好与流动性
   ## 三、综合购房建议 —— 结合库存、失效与手记真实价格：量化指出挂牌价与手记真实价的偏离幅度、真实议价空间、哪些户型/面积段流动性好值得入手、哪些是高价滞销盘需谨慎、谈判策略与入手时机，给出明确、可操作的购买判断
2. 紧扣统计数据与手记信息，不要编造；注意区分「元/平」与「万」两种价格单位
3. 手记价格样本存在时，第三章必须引用具体手记案例佐证议价判断；无手记时明确说明“缺少真实价格参考，议价判断仅基于挂牌价与失效价对照”
4. 某部分样本为 0 时，对应章节说明“暂无数据”并基于其他部分合理推断，不要强行编造
5. 总字数 600~900 字，语言精炼、结论明确、建议可执行`;

    const result = await callAiText(prompt, { maxTokens: 2500, timeoutMs: 120000 });
    if (!result.text) {
      return Response.json({ success: false, error: 'AI 返回内容为空，请重试' });
    }

    // 分析结果落库（供历史查询，避免重复调用 AI）
    const insert = db.prepare(`
      INSERT INTO community_ai_analysis (community, city, base_date, inventory_count, expired_count, notes_count, summary, latency_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(community, city, baseDate, inventoryCount, expiredCount, notesCount, result.text, result.latencyMs);
    const recordId = Number(insert.lastInsertRowid);
    const createdAt = (db.prepare(`SELECT created_at FROM community_ai_analysis WHERE id = ?`).get(recordId) as { created_at: string } | undefined)?.created_at ?? '';

    return Response.json({
      success: true,
      data: {
        id: recordId,
        summary: result.text,
        baseDate,
        inventoryCount,
        expiredCount,
        notesCount,
        latencyMs: result.latencyMs,
        createdAt,
      },
    });
  } catch (e) {
    return Response.json({ success: false, error: String(e) }, { status: 500 });
  }
}
