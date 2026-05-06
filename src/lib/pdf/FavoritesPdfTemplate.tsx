/**
 * 收藏房源 PDF 模板
 * 使用 @react-pdf/renderer 渲染
 *
 * 布局：每条房源占一行，横向分为 4 列
 *   ① 标题区（小区、标题、位置、链接、价格）
 *   ② 缩略图
 *   ③ 基本信息（户型、面积、楼层、朝向、楼龄）
 *   ④ 备注
 */

import React from 'react';
import path from 'path';
import {
  Document,
  Page,
  Text as _Text,
  View,
  Link,
  Image,
  StyleSheet,
  Font,
} from '@react-pdf/renderer';

// @react-pdf/renderer 的 Text 类型定义缺少 numberOfLines，用 any 补全
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Text = _Text as any;

// 使用本地字体文件（放在 public/fonts/ 目录下）
const FONTS_DIR = path.join(process.cwd(), 'public', 'fonts');

Font.register({
  family: 'NotoSansSC',
  fonts: [
    { src: path.join(FONTS_DIR, 'NotoSansSC-Regular.ttf'), fontWeight: 'normal' },
    { src: path.join(FONTS_DIR, 'NotoSansSC-Bold.otf'),    fontWeight: 'bold'   },
  ],
});

// ===== 4 列宽度（A4 横向可用宽度 ≈ 785pt）=====
// 标题区 240  缩略图 130  基本信息 220  备注 flex:1（≈195）
const COL_TITLE = 240;
const COL_IMAGE = 130;
const COL_INFO  = 220;
// 备注列 flex:1

// ===== 样式 =====
const styles = StyleSheet.create({
  page: {
    fontFamily: 'NotoSansSC',
    fontSize: 9,
    paddingTop: 28,
    paddingBottom: 40,
    paddingHorizontal: 28,
    backgroundColor: '#ffffff',
    color: '#1f2937',
  },

  // ── 页眉 ──
  header: {
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#f59e0b',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  headerSubtitle: {
    fontSize: 9,
    color: '#6b7280',
    marginTop: 3,
  },
  headerMeta: { textAlign: 'right' },
  headerMetaText: {
    fontSize: 8,
    color: '#9ca3af',
  },

  // ── 表格外框 ──
  table: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 4,
    overflow: 'hidden',
  },

  // ── 表头行 ──
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#fef9c3',
    borderBottomWidth: 1,
    borderBottomColor: '#d1d5db',
  },
  thCell: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    justifyContent: 'center',
  },
  thText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#78350f',
  },

  // ── 数据行 ──
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    minHeight: 80,
  },
  tableRowEven: { backgroundColor: '#fffbeb' },
  tableRowOdd:  { backgroundColor: '#ffffff' },

  // ── 列 1：标题区 ──
  colTitle: {
    width: COL_TITLE,
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: 'center',
    overflow: 'hidden',
    borderRightWidth: 1,
    borderRightColor: '#f3f4f6',
  },
  // 序号徽章
  idxBadge: {
    fontSize: 7,
    color: '#9ca3af',
    marginBottom: 3,
  },
  // 标题主文字
  titleMain: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#1f2937',
    lineHeight: 1.4,
    marginBottom: 3,
  },
  // 小区名
  communityText: {
    fontSize: 8,
    color: '#b45309',
    fontWeight: 'bold',
    marginBottom: 2,
  },
  // 位置
  locationText: {
    fontSize: 7.5,
    color: '#6b7280',
    marginBottom: 4,
  },
  // 价格行
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 2,
  },
  priceUnit: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#c2410c',
  },
  priceTotal: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#1d4ed8',
  },
  linkText: {
    fontSize: 7.5,
    color: '#2563eb',
    textDecoration: 'underline',
    marginTop: 4,
  },

  // ── 列 2：缩略图 ──
  colImage: {
    width: COL_IMAGE,
    paddingHorizontal: 8,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRightWidth: 1,
    borderRightColor: '#f3f4f6',
  },
  imgThumb: {
    width: 110,
    height: 74,
    objectFit: 'cover',
    borderRadius: 3,
  },
  imgPlaceholder: {
    width: 110,
    height: 74,
    backgroundColor: '#f3f4f6',
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imgPlaceholderText: {
    fontSize: 7,
    color: '#d1d5db',
  },

  // ── 列 3：基本信息 ──
  colInfo: {
    width: COL_INFO,
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: 'center',
    overflow: 'hidden',
    borderRightWidth: 1,
    borderRightColor: '#f3f4f6',
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  infoItem: {
    width: '50%',
    flexDirection: 'row',
    marginBottom: 5,
    alignItems: 'flex-start',
  },
  infoLabel: {
    fontSize: 7.5,
    color: '#9ca3af',
    width: 30,
    flexShrink: 0,
  },
  infoValue: {
    fontSize: 8,
    color: '#374151',
    lineHeight: 1.4,
    flex: 1,
  },

  // ── 列 4：备注 ──
  colNote: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: 'flex-start',
    overflow: 'hidden',
  },
  noteText: {
    fontSize: 8,
    color: '#6b7280',
    lineHeight: 1.6,
  },

  // ── 分组标题 ──
  groupHeader: {
    flexDirection: 'row',
    backgroundColor: '#fff7ed',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#fed7aa',
  },
  groupHeaderText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#9a3412',
  },

  // ── 页脚 ──
  footer: {
    position: 'absolute',
    bottom: 14,
    left: 28,
    right: 28,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingTop: 5,
  },
  footerText: {
    fontSize: 7,
    color: '#d1d5db',
  },
});

// ===== 类型定义 =====
export interface FavoriteRow {
  id: number;
  title: string;
  header_image: string | null;
  /** 由 API 路由预抓取并注入的 base64 data URL，仅在 PDF 渲染时使用 */
  image_data?: string;
  province: string;
  city: string;
  district: string;
  community: string;
  community_url: string | null;
  floor_info: string | null;
  build_year: number | null;
  house_type: string | null;
  area: number | null;
  orientation: string | null;
  total_price: number | null;
  unit_price: number | null;
  detail_url: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

interface PdfTemplateProps {
  rows: FavoriteRow[];
  generatedAt: string;
  filterDesc?: string;
  /** 是否展示备注列，默认不展示 */
  includeNote?: boolean;
}

// ===== 格式化工具 =====
const fmtUnit = (v: number | null): string =>
  v == null ? '-' : `${(Number(v) * 10000).toFixed(0)} 元/㎡`;

const fmtPrice = (v: number | null): string =>
  v == null ? '-' : `${Number(v).toFixed(2)} 万`;

const fmtArea = (v: number | null): string =>
  v == null ? '-' : `${Number(v).toFixed(1)} ㎡`;

// ===== 按小区分组 =====
function groupByCommunity(rows: FavoriteRow[]): Map<string, FavoriteRow[]> {
  const map = new Map<string, FavoriteRow[]>();
  for (const row of rows) {
    const key = row.community || '未知小区';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }
  return map;
}

// ===== 基本信息条目组件 =====
function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoItem}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

// ===== PDF 文档组件 =====
export function FavoritesPdfDocument({ rows, generatedAt, filterDesc, includeNote = false }: PdfTemplateProps) {
  const grouped = groupByCommunity(rows);

  interface GroupHeaderItem { type: 'group'; community: string; count: number }
  interface RowItem { type: 'row'; row: FavoriteRow; idx: number }
  type Item = GroupHeaderItem | RowItem;

  const flatItems: Item[] = [];
  let globalIdx = 0;
  for (const [community, communityRows] of grouped.entries()) {
    flatItems.push({ type: 'group', community, count: communityRows.length });
    for (const row of communityRows) {
      globalIdx++;
      flatItems.push({ type: 'row', row, idx: globalIdx });
    }
  }

  return (
    <Document
      title="收藏房源报告"
      author="贝壳找房爬虫"
      subject="收藏房源 PDF 导出"
      creator="bk_spider_ts"
    >
      <Page size="A4" orientation="landscape" style={styles.page}>

        {/* ===== 页眉 ===== */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>⭐ 收藏房源报告</Text>
            {filterDesc && <Text style={styles.headerSubtitle}>{filterDesc}</Text>}
          </View>
          <View style={styles.headerMeta}>
            <Text style={styles.headerMetaText}>生成时间：{generatedAt}</Text>
            <Text style={styles.headerMetaText}>贝壳找房爬虫 · TypeScript + Electron</Text>
          </View>
        </View>

        {/* ===== 表格 ===== */}
        <View style={styles.table}>

          {/* 表头 */}
          <View style={styles.tableHeader}>
            <View style={[styles.thCell, { width: COL_TITLE }]}>
              <Text style={styles.thText}>标题</Text>
            </View>
            <View style={[styles.thCell, { width: COL_IMAGE }]}>
              <Text style={styles.thText}>缩略图</Text>
            </View>
            <View style={[styles.thCell, { width: COL_INFO }]}>
              <Text style={styles.thText}>基本信息</Text>
            </View>
            {includeNote && (
              <View style={[styles.thCell, { flex: 1 }]}>
                <Text style={styles.thText}>备注</Text>
              </View>
            )}
          </View>

          {/* 数据行（含分组标题） */}
          {flatItems.map((item) => {
            if (item.type === 'group') {
              return (
                <View key={`group-${item.community}`} style={styles.groupHeader}>
                  <Text style={styles.groupHeaderText}>
                    {item.community}（{item.count} 套）
                  </Text>
                </View>
              );
            }

            const { row, idx } = item;
            const isEven = idx % 2 === 0;
            const location = [row.city, row.district].filter(Boolean).join(' / ');

            return (
              <View
                key={row.id}
                style={[styles.tableRow, isEven ? styles.tableRowEven : styles.tableRowOdd]}
              >
                {/* ── 列1：标题区 ── */}
                <View style={styles.colTitle}>
                  <Text style={styles.idxBadge}>#{idx}</Text>
                  <Text style={styles.communityText} numberOfLines={1}>
                    {row.community || '-'}
                  </Text>
                  <Text style={styles.titleMain} numberOfLines={3}>
                    {row.title || '-'}
                  </Text>
                  <Text style={styles.locationText} numberOfLines={1}>
                    {location || '-'}
                  </Text>
                  <View style={styles.priceRow}>
                    <Text style={styles.priceUnit}>{fmtUnit(row.unit_price)}</Text>
                    <Text style={styles.priceTotal}>{fmtPrice(row.total_price)}</Text>
                  </View>
                  {row.detail_url && (
                    <Link src={row.detail_url} style={styles.linkText}>查看详情 →</Link>
                  )}
                </View>

                {/* ── 列2：缩略图 ── */}
                <View style={styles.colImage}>
                  {row.image_data ? (
                    <Image src={row.image_data} style={styles.imgThumb} />
                  ) : (
                    <View style={styles.imgPlaceholder}>
                      <Text style={styles.imgPlaceholderText}>暂无图片</Text>
                    </View>
                  )}
                </View>

                {/* ── 列3：基本信息 ── */}
                <View style={styles.colInfo}>
                  <View style={styles.infoGrid}>
                    <InfoItem label="户型" value={row.house_type || '-'} />
                    <InfoItem label="面积" value={fmtArea(row.area)} />
                    <InfoItem label="楼层" value={row.floor_info || '-'} />
                    <InfoItem label="朝向" value={row.orientation || '-'} />
                    <InfoItem label="楼龄" value={row.build_year != null ? `${row.build_year} 年` : '-'} />
                  </View>
                </View>

                {/* ── 列4：备注 ── */}
                {includeNote && (
                  <View style={styles.colNote}>
                    <Text style={styles.noteText} numberOfLines={5}>
                      {row.note || ''}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* ===== 页脚 ===== */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>贝壳找房爬虫 · 收藏房源导出报告</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
              `第 ${pageNumber} / ${totalPages} 页`
            }
          />
        </View>

      </Page>
    </Document>
  );
}
