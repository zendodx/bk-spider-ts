'use client';

/**
 * 全局城市上下文
 * - 维护 cityHostMap（城市名 -> HOST URL）
 * - 维护当前选中城市 selectedCity（'' 表示全部）
 * - 提供 cityName -> host URL 的转换
 */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export interface CityContextValue {
  /** 城市名 -> HOST URL 映射（来自 settings.cityHostMap） */
  cityHostMap: Record<string, string>;
  /** 城市名列表（按名称排序） */
  cityNames: string[];
  /** 当前选中城市，'' 表示全部 */
  selectedCity: string;
  setSelectedCity: (city: string) => void;
  /** 当前城市对应的 HOST URL，'' 表示不限制 */
  selectedHost: string;
  /** 当前城市对应的 city 字段值（用于 SQL 过滤），'' 表示不限制 */
  selectedCityFilter: string;
  /** 重新加载配置 */
  reloadCityMap: () => Promise<void>;
}

const CityContext = createContext<CityContextValue>({
  cityHostMap: {},
  cityNames: [],
  selectedCity: '',
  setSelectedCity: () => {},
  selectedHost: '',
  selectedCityFilter: '',
  reloadCityMap: async () => {},
});

export function CityProvider({ children }: { children: ReactNode }) {
  const [cityHostMap, setCityHostMap] = useState<Record<string, string>>({});
  const [selectedCity, setSelectedCity] = useState('');

  const reloadCityMap = useCallback(async () => {
    try {
      const res  = await fetch('/api/settings');
      const json = await res.json();
      if (json.success && json.data?.cityHostMap) {
        setCityHostMap(json.data.cityHostMap as Record<string, string>);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    reloadCityMap();
  }, [reloadCityMap]);

  const cityNames = Object.keys(cityHostMap).sort((a, b) => a.localeCompare(b, 'zh'));

  const selectedHost = selectedCity ? (cityHostMap[selectedCity] ?? '') : '';

  // city 字段过滤值：就是城市名本身（数据库中 city 字段存的是"济南市"）
  const selectedCityFilter = selectedCity;

  return (
    <CityContext.Provider value={{
      cityHostMap,
      cityNames,
      selectedCity,
      setSelectedCity,
      selectedHost,
      selectedCityFilter,
      reloadCityMap,
    }}>
      {children}
    </CityContext.Provider>
  );
}

export function useCityContext() {
  return useContext(CityContext);
}
