'use client';

/**
 * 采光分析 - 楼栋可视化分户编辑弹窗
 * 迁移自 building-sunlight-simulator/js/editor.js 中的「可视化分户」功能：
 * 通过拖拽条形图上的分隔手柄（或直接输入百分比）调整每层各户的宽度占比，
 * 并可设置分户轴角度，作为 3D 分析时切分楼栋户型的依据。
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  buildEqualUnitRatios,
  getVisualUnitRatioBounds,
  redistributeVisualUnitRatio,
} from '@/lib/sunlight/unit-ratios';
import { normalizeAngle } from '@/lib/sunlight/utils';

interface VisualSplitEditorModalProps {
  buildingName: string;
  floors: number;
  /** 每层户数（当前版本每栋楼各层户数一致，取自 building.units） */
  unitsPerFloor: number;
  /** 打开弹窗时的初始逐层比例（长度必为 floors，且每行长度等于 unitsPerFloor） */
  initialRatiosPerFloor: number[][];
  initialAngleDeg: number;
  onCancel: () => void;
  onSave: (result: { ratiosPerFloor: number[][]; angleDeg: number }) => void;
}

export default function VisualSplitEditorModal({
  buildingName,
  floors,
  unitsPerFloor,
  initialRatiosPerFloor,
  initialAngleDeg,
  onCancel,
  onSave,
}: VisualSplitEditorModalProps) {
  const [floorIndex, setFloorIndex] = useState(0);
  const [ratiosPerFloor, setRatiosPerFloor] = useState<number[][]>(() => initialRatiosPerFloor.map(row => row.slice()));
  const [angle, setAngle] = useState(() => normalizeAngle(initialAngleDeg || 0));
  const barRef = useRef<HTMLDivElement>(null);

  const ratios = ratiosPerFloor[floorIndex] ?? buildEqualUnitRatios(unitsPerFloor);
  const bounds = getVisualUnitRatioBounds(unitsPerFloor);
  const canApplyAll = floors > 1;

  const updateRatio = useCallback(
    (index: number, nextValue: number) => {
      setRatiosPerFloor(prev => {
        const next = prev.slice();
        next[floorIndex] = redistributeVisualUnitRatio(next[floorIndex], index, nextValue);
        return next;
      });
    },
    [floorIndex]
  );

  const handleHandlePointerDown = useCallback(
    (boundaryIndex: number, event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      const bar = barRef.current;
      if (!bar) return;
      const startX = event.clientX;
      const width = Math.max(1, bar.getBoundingClientRect().width);
      const startRatios = ratiosPerFloor[floorIndex].slice();
      const pairTotal = startRatios[boundaryIndex] + startRatios[boundaryIndex + 1];
      const minimum = bounds.min;

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const delta = (moveEvent.clientX - startX) / width;
        const left = Math.min(pairTotal - minimum, Math.max(minimum, startRatios[boundaryIndex] + delta));
        setRatiosPerFloor(prev => {
          const next = prev.slice();
          const row = startRatios.slice();
          row[boundaryIndex] = left;
          row[boundaryIndex + 1] = pairTotal - left;
          next[floorIndex] = row;
          return next;
        });
      };
      const handlePointerUp = () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerUp);
      };
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerUp);
      event.preventDefault();
    },
    [bounds.min, floorIndex, ratiosPerFloor]
  );

  const handleHandleKeyDown = useCallback(
    (boundaryIndex: number, event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const delta = event.key === 'ArrowLeft' ? -0.01 : 0.01;
      setRatiosPerFloor(prev => {
        const next = prev.slice();
        const row = next[floorIndex].slice();
        const pairTotal = row[boundaryIndex] + row[boundaryIndex + 1];
        const minimum = bounds.min;
        const left = Math.min(pairTotal - minimum, Math.max(minimum, row[boundaryIndex] + delta));
        row[boundaryIndex] = left;
        row[boundaryIndex + 1] = pairTotal - left;
        next[floorIndex] = row;
        return next;
      });
      event.preventDefault();
    },
    [bounds.min, floorIndex]
  );

  const handleEqualize = useCallback(() => {
    setRatiosPerFloor(prev => {
      const next = prev.slice();
      next[floorIndex] = buildEqualUnitRatios(unitsPerFloor);
      return next;
    });
  }, [floorIndex, unitsPerFloor]);

  const handleApplyAllFloors = useCallback(() => {
    setRatiosPerFloor(prev => {
      const source = prev[floorIndex].slice();
      return prev.map(() => source.slice());
    });
  }, [floorIndex]);

  const handleSave = useCallback(() => {
    onSave({ ratiosPerFloor, angleDeg: angle });
  }, [angle, onSave, ratiosPerFloor]);

  let cumulative = 0;
  const segments = ratios.map((ratio, index) => {
    const left = cumulative;
    cumulative += ratio;
    return { index, ratio, left };
  });

  const floorOptions = useMemo(() => new Array(floors).fill(null).map((_, i) => i), [floors]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onClick={e => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-800">
            可视化分户 — <span className="text-blue-600">{buildingName}</span>
          </h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-lg leading-none">
            ✕
          </button>
        </div>

        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            楼层
            <select
              value={floorIndex}
              onChange={e => setFloorIndex(Number(e.target.value))}
              className="px-2 py-1 border rounded text-xs"
            >
              {floorOptions.map(i => (
                <option key={i} value={i}>
                  第 {i + 1} 层
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            分户轴角度
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={angle}
              onChange={e => setAngle(normalizeAngle(Number(e.target.value)))}
              className="w-28 accent-blue-500"
            />
            <input
              type="number"
              min={-180}
              max={180}
              step={1}
              value={angle}
              onChange={e => setAngle(normalizeAngle(Number(e.target.value) || 0))}
              className="w-16 px-1.5 py-1 border rounded text-xs"
            />
            °
          </label>
        </div>

        {/* 条形分户示意图 */}
        <div ref={barRef} className="relative h-12 border border-gray-300 rounded overflow-hidden select-none bg-gray-50">
          {segments.map(({ index, ratio, left }) => (
            <div
              key={index}
              className="absolute top-0 h-full flex items-center justify-center text-[11px] text-white font-medium border-r border-white/60"
              style={{
                left: `${left * 100}%`,
                width: `${ratio * 100}%`,
                background: `hsl(${(index * 47) % 360}, 65%, 55%)`,
              }}
            >
              {index + 1}户 · {(ratio * 100).toFixed(1)}%
            </div>
          ))}
          {segments.slice(0, -1).map(({ index, left, ratio }) => {
            const boundaryPosition = left + ratio;
            return (
              <button
                key={`handle-${index}`}
                type="button"
                aria-label={`调整第 ${index + 1}/${index + 2} 户边界`}
                onPointerDown={e => handleHandlePointerDown(index, e)}
                onKeyDown={e => handleHandleKeyDown(index, e)}
                className="absolute top-0 h-full w-2 -ml-1 cursor-ew-resize bg-white/0 hover:bg-white/40 focus:bg-white/50 outline-none border-l-2 border-white"
                style={{ left: `${boundaryPosition * 100}%` }}
              />
            );
          })}
        </div>

        {/* 每户占比数字输入 */}
        <div className="grid grid-cols-4 gap-2 mt-3 max-h-40 overflow-y-auto pr-1">
          {ratios.map((ratio, index) => (
            <label key={index} className="flex items-center gap-1 text-xs text-gray-600">
              第{index + 1}户
              <input
                type="number"
                min={Number((bounds.min * 100).toFixed(2))}
                max={Number((bounds.max * 100).toFixed(2))}
                step={0.1}
                value={Number((ratio * 100).toFixed(1))}
                disabled={ratios.length === 1}
                onChange={e => updateRatio(index, Number(e.target.value) / 100)}
                className="w-16 px-1.5 py-1 border rounded text-xs disabled:bg-gray-100"
              />
              %
            </label>
          ))}
        </div>

        <div className="flex items-center justify-between mt-4 pt-3 border-t">
          <div className="flex gap-2">
            <button onClick={handleEqualize} className="px-2.5 py-1.5 border rounded text-xs hover:bg-gray-50">
              当前层等分
            </button>
            <button
              onClick={handleApplyAllFloors}
              disabled={!canApplyAll}
              className="px-2.5 py-1.5 border rounded text-xs hover:bg-gray-50 disabled:opacity-40"
              title={canApplyAll ? '将当前层的分户比例应用到全部楼层' : '仅一层，无需应用'}
            >
              应用到全部楼层
            </button>
          </div>
          <div className="flex gap-2">
            <button onClick={onCancel} className="px-3 py-1.5 border rounded text-xs hover:bg-gray-50">
              取消
            </button>
            <button onClick={handleSave} className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded text-xs">
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
