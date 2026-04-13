/**
 * 收藏房源 PDF 模板
 * 使用 @react-pdf/renderer 渲染
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
// process.cwd() 在 Next.js 中指向项目根目录
const FONTS_DIR = path.join(process.cwd(), 'public', 'fonts');

Font.register({
  family: 'NotoSansSC',
  fonts: [
    {
      src: path.join(FONTS_DIR, 'NotoSansSC-Regular.ttf'),
      fontWeight: 'normal',
    },
    {
      src: path.join(FONTS_DIR, 'NotoSansSC-Bold.otf'),
      fontWeight: 'bold',
    },
  ],
});

// ===== 列宽常量（A4 横向可用宽度 ≈ 785pt）=====
// 固定列合计：20+70+50+62+88+38+30+52+34+28+44+38+50 = 604
// 备注 flex:1 自动填满剩余 ~181pt
const COL = {
  index:       20,
  image:       70,
  location:    50,
  community:   62,
  title:       88,
  type:        38,
  area:        30,
  floor:       52,
  orientation: 34,
  year:        28,
  unitPrice:   44,
  totalPrice:  38,
  link:        50,
  // note: flex: 1
} as const;

// 单元格基础样式（overflow: hidden 防止文字溢出串列）
const CELL_BASE = {
  overflow: 'hidden' as const,
  paddingHorizontal: 3,
  paddingVertical: 4,
};

// ===== 样式定义 =====
const styles = StyleSheet.create({
  page: {
    fontFamily: 'NotoSansSC',
    fontSize: 8,
    paddingTop: 26,
    paddingBottom: 38,
    paddingHorizontal: 28,
    backgroundColor: '#ffffff',
    color: '#1f2937',
  },
  // 页眉
  header: {
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: '#f59e0b',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  headerSubtitle: {
    fontSize: 8,
    color: '#6b7280',
    marginTop: 2,
  },
  headerMeta: {
    textAlign: 'right',
  },
  headerMetaText: {
    fontSize: 7,
    color: '#9ca3af',
  },
  // 表格外框
  table: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 3,
    overflow: 'hidden',
  },
  // 表头行
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#fef9c3',
    borderBottomWidth: 1,
    borderBottomColor: '#d1d5db',
  },
  // 数据行（含图片，minHeight 与图片高度匹配）
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    minHeight: 48,
  },
  tableRowEven: { backgroundColor: '#fffbeb' },
  tableRowOdd:  { backgroundColor: '#ffffff' },

  // ===== 列容器 =====
  colIndex:       { ...CELL_BASE, width: COL.index,       justifyContent: 'center', alignItems: 'flex-end' },
  colImage:       { width: COL.image, paddingHorizontal: 3, paddingVertical: 3, overflow: 'hidden' },
  colLocation:    { ...CELL_BASE, width: COL.location,    justifyContent: 'center' },
  colCommunity:   { ...CELL_BASE, width: COL.community,   justifyContent: 'center' },
  colTitle:       { ...CELL_BASE, width: COL.title,       justifyContent: 'center' },
  colType:        { ...CELL_BASE, width: COL.type,        justifyContent: 'center', alignItems: 'center' },
  colArea:        { ...CELL_BASE, width: COL.area,        justifyContent: 'center', alignItems: 'flex-end' },
  colFloor:       { ...CELL_BASE, width: COL.floor,       justifyContent: 'center', alignItems: 'center' },
  colOrientation: { ...CELL_BASE, width: COL.orientation, justifyContent: 'center', alignItems: 'center' },
  colYear:        { ...CELL_BASE, width: COL.year,        justifyContent: 'center', alignItems: 'center' },
  colUnitPrice:   { ...CELL_BASE, width: COL.unitPrice,   justifyContent: 'center', alignItems: 'flex-end' },
  colTotalPrice:  { ...CELL_BASE, width: COL.totalPrice,  justifyContent: 'center', alignItems: 'flex-end' },
  colLink:        { ...CELL_BASE, width: COL.link,        justifyContent: 'center' },
  colNote:        { ...CELL_BASE, flex: 1,                justifyContent: 'center' },

  // ===== 表头文字 =====
  thText: {
    fontSize: 7,
    fontWeight: 'bold',
    color: '#78350f',
  },

  // ===== 数据单元格文字（统一 fontSize=7，单行截断）=====
  tdBase: {
    fontSize: 7,
    color: '#374151',
  },
  tdMuted: {
    fontSize: 7,
    color: '#9ca3af',
  },
  tdBold: {
    fontSize: 7,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  tdPriceUnit: {
    fontSize: 7,
    fontWeight: 'bold',
    color: '#c2410c',
  },
  tdPriceTotal: {
    fontSize: 7,
    fontWeight: 'bold',
    color: '#1d4ed8',
  },
  tdLink: {
    fontSize: 7,
    color: '#2563eb',
    textDecoration: 'underline',
  },

  // ===== 图片 =====
  imgThumb: {
    width: 64,
    height: 42,
    objectFit: 'cover',
    borderRadius: 2,
  },
  imgPlaceholder: {
    width: 64,
    height: 42,
    backgroundColor: '#f3f4f6',
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imgPlaceholderText: {
    fontSize: 6,
    color: '#d1d5db',
  },

  // ===== 备注（允许 2 行）=====
  noteText: {
    fontSize: 6.5,
    color: '#6b7280',
    lineHeight: 1.4,
  },

  // ===== 分组标题 =====
  groupHeader: {
    flexDirection: 'row',
    backgroundColor: '#fff7ed',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#fed7aa',
  },
  groupHeaderText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#9a3412',
  },

  // ===== 页脚 =====
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
    fontSize: 6.5,
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
  v == null ? '-' : `${(Number(v) * 10000).toFixed(0)}`;

const fmtPrice = (v: number | null): string =>
  v == null ? '-' : `${Number(v).toFixed(2)}万`;

const fmtArea = (v: number | null): string =>
  v == null ? '-' : `${Number(v).toFixed(1)}`;

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

// ===== PDF 文档组件 =====
export function FavoritesPdfDocument({ rows, generatedAt, filterDesc, includeNote = false }: PdfTemplateProps) {
  const grouped = groupByCommunity(rows);

  // 扁平化行列表（含分组标题）
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
            {filterDesc && (
              <Text style={styles.headerSubtitle}>{filterDesc}</Text>
            )}
          </View>
          <View style={styles.headerMeta}>
            <Text style={styles.headerMetaText}>生成时间：{generatedAt}</Text>
            <Text style={styles.headerMetaText}>贝壳找房爬虫 · TypeScript + Electron</Text>
          </View>
        </View>

        {/* ===== 房源列表表格 ===== */}
        <View style={styles.table}>
          {/* 表头 */}
          <View style={styles.tableHeader}>
            <View style={styles.colIndex}>    <Text style={styles.thText}>#</Text></View>
            <View style={styles.colImage}>    <Text style={styles.thText}>缩略图</Text></View>
            <View style={styles.colLocation}> <Text style={styles.thText}>省/市/区</Text></View>
            <View style={styles.colCommunity}><Text style={styles.thText}>小区</Text></View>
            <View style={styles.colTitle}>    <Text style={styles.thText}>标题</Text></View>
            <View style={styles.colType}>     <Text style={styles.thText}>户型</Text></View>
            <View style={styles.colArea}>     <Text style={styles.thText}>面积</Text></View>
            <View style={styles.colFloor}>    <Text style={styles.thText}>楼层</Text></View>
            <View style={styles.colOrientation}><Text style={styles.thText}>朝向</Text></View>
            <View style={styles.colYear}>     <Text style={styles.thText}>年份</Text></View>
            <View style={styles.colUnitPrice}><Text style={styles.thText}>单价(元)</Text></View>
            <View style={styles.colTotalPrice}><Text style={styles.thText}>总价</Text></View>
            <View style={styles.colLink}>     <Text style={styles.thText}>链接</Text></View>
            {includeNote && (
              <View style={styles.colNote}><Text style={styles.thText}>备注</Text></View>
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
            const location = [row.city, row.district].filter(Boolean).join('/');

            return (
              <View
                key={row.id}
                style={[
                  styles.tableRow,
                  isEven ? styles.tableRowEven : styles.tableRowOdd,
                ]}
              >
                {/* 序号 */}
                <View style={styles.colIndex}>
                  <Text style={styles.tdMuted}>{idx}</Text>
                </View>

                {/* 缩略图 */}
                <View style={styles.colImage}>
                  {row.image_data ? (
                    <Image src={row.image_data} style={styles.imgThumb} />
                  ) : (
                    <View style={styles.imgPlaceholder}>
                      <Text style={styles.imgPlaceholderText}>暂无图片</Text>
                    </View>
                  )}
                </View>

                {/* 省/市/区（只显示市+区，省略省节省宽度） */}
                <View style={styles.colLocation}>
                  <Text style={styles.tdMuted} numberOfLines={2}>{location || '-'}</Text>
                </View>

                {/* 小区 */}
                <View style={styles.colCommunity}>
                  <Text style={styles.tdBold} numberOfLines={2}>{row.community || '-'}</Text>
                </View>

                {/* 标题 */}
                <View style={styles.colTitle}>
                  <Text style={styles.tdBase} numberOfLines={2}>{row.title || '-'}</Text>
                </View>

                {/* 户型 */}
                <View style={styles.colType}>
                  <Text style={styles.tdBase} numberOfLines={1}>{row.house_type || '-'}</Text>
                </View>

                {/* 面积 */}
                <View style={styles.colArea}>
                  <Text style={styles.tdBase} numberOfLines={1}>{fmtArea(row.area)}</Text>
                </View>

                {/* 楼层 */}
                <View style={styles.colFloor}>
                  <Text style={styles.tdBase} numberOfLines={2}>{row.floor_info || '-'}</Text>
                </View>

                {/* 朝向 */}
                <View style={styles.colOrientation}>
                  <Text style={styles.tdBase} numberOfLines={1}>{row.orientation || '-'}</Text>
                </View>

                {/* 年份 */}
                <View style={styles.colYear}>
                  <Text style={styles.tdBase} numberOfLines={1}>{row.build_year ?? '-'}</Text>
                </View>

                {/* 单价 */}
                <View style={styles.colUnitPrice}>
                  <Text style={styles.tdPriceUnit} numberOfLines={1}>{fmtUnit(row.unit_price)}</Text>
                </View>

                {/* 总价 */}
                <View style={styles.colTotalPrice}>
                  <Text style={styles.tdPriceTotal} numberOfLines={1}>{fmtPrice(row.total_price)}</Text>
                </View>

                {/* 链接 */}
                <View style={styles.colLink}>
                  {row.detail_url ? (
                    <Link src={row.detail_url} style={styles.tdLink}>查看详情</Link>
                  ) : (
                    <Text style={styles.tdMuted}>-</Text>
                  )}
                </View>

                {/* 备注（允许 3 行，超出截断） */}
                {includeNote && (
                  <View style={styles.colNote}>
                    <Text style={styles.noteText} numberOfLines={3}>{row.note || ''}</Text>
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
            render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `第 ${pageNumber} / ${totalPages} 页`}
          />
        </View>
      </Page>
    </Document>
  );
}
