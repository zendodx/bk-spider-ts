/**
 * 采光分析 - 太阳时间与日期计算
 * 迁移自 building-sunlight-simulator/js/utils.js 中的太阳时间相关函数
 */

import { isValidTimeZone, roundTo } from './utils';

function parseDateParts(date: string | Date): { year: number; month: number; day: number } | null {
  if (typeof date === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!match) return null;
    const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
    const check = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    if (
      check.getUTCFullYear() !== parts.year ||
      check.getUTCMonth() + 1 !== parts.month ||
      check.getUTCDate() !== parts.day
    ) {
      return null;
    }
    return parts;
  }
  if (date instanceof Date && Number.isFinite(date.getTime())) {
    return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
  }
  return null;
}

/**
 * 计算一年中的第几天，使用 UTC 日历差避免本地时区和夏令时误差。
 */
export function getDayOfYear(date: string | Date): number {
  const parts = parseDateParts(date);
  if (!parts) return NaN;
  const current = Date.UTC(parts.year, parts.month - 1, parts.day);
  const start = Date.UTC(parts.year, 0, 0);
  return Math.round((current - start) / 86400000);
}

/**
 * 根据日期计算太阳赤纬角：δ = 23.45° × sin(360° × (284 + N) / 365)
 */
export function calculateSolarDeclination(date: string | Date): number {
  const dayOfYear = getDayOfYear(date);
  if (!Number.isFinite(dayOfYear)) return NaN;
  const angle = (360 * (284 + dayOfYear)) / 365;
  const declination = 23.45 * Math.sin((angle * Math.PI) / 180);
  return roundTo(declination, 2);
}

/**
 * NOAA 近似公式计算均时差（分钟）。
 */
export function calculateEquationOfTime(date: string | Date): number {
  const dayOfYear = getDayOfYear(date);
  if (!Number.isFinite(dayOfYear)) return NaN;
  const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1);
  return (
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma))
  );
}

/**
 * 获取指定日期中午的 IANA 时区 UTC 偏移（分钟，东正西负）。
 */
export function getTimeZoneOffsetMinutes(date: string | Date, timeZone: string): number {
  const parts = parseDateParts(date);
  if (!parts || !isValidTimeZone(timeZone)) return NaN;
  const utcNoon = Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const values: Record<string, number> = {};
  formatter.formatToParts(new Date(utcNoon)).forEach(part => {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  });
  const representedAsUtc = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second);
  return Math.round((representedAsUtc - utcNoon) / 60000);
}

/**
 * 当地民用时间转换为真太阳时所需的小时偏移。
 */
export function calculateSolarTimeOffset(date: string | Date, longitude: number, timeZone: string): number {
  const lon = Number(longitude);
  const utcOffsetMinutes = getTimeZoneOffsetMinutes(date, timeZone);
  const equationOfTimeMinutes = calculateEquationOfTime(date);
  if (![lon, utcOffsetMinutes, equationOfTimeMinutes].every(Number.isFinite)) return NaN;
  return (4 * lon - utcOffsetMinutes + equationOfTimeMinutes) / 60;
}

const SEASON_PRESET_MONTH_DAYS: Record<string, string> = {
  'march-equinox': '03-20',
  'june-solstice': '06-21',
  'september-equinox': '09-23',
  'december-solstice': '12-22',
};

export type SeasonPreset = 'march-equinox' | 'june-solstice' | 'september-equinox' | 'december-solstice';

export function getSeasonPresetDate(preset: SeasonPreset, year: number = new Date().getFullYear()): string | null {
  const monthDay = SEASON_PRESET_MONTH_DAYS[preset];
  return monthDay ? `${year}-${monthDay}` : null;
}

const NORTHERN_LABELS: Record<SeasonPreset, string> = {
  'march-equinox': '春分',
  'june-solstice': '夏至',
  'september-equinox': '秋分',
  'december-solstice': '冬至',
};

const SOUTHERN_LABELS: Record<SeasonPreset, string> = {
  'march-equinox': '秋分',
  'june-solstice': '冬至',
  'september-equinox': '春分',
  'december-solstice': '夏至',
};

export function getSeasonLabel(preset: SeasonPreset, latitude: number): string {
  const southern = Number(latitude) < 0;
  return (southern ? SOUTHERN_LABELS : NORTHERN_LABELS)[preset] || '';
}

/**
 * 格式化日期为 YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
