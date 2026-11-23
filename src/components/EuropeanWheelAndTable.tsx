import React, { useState } from 'react';
import {
  EUROPEAN_WHEEL_SEQUENCE,
  SECTOR_ORPHELINS,
  SECTOR_TIERS,
  SECTOR_VOISINS,
  SECTOR_ZERO_SPIEL,
  TABLE_ROWS,
  getNumberColor,
} from '../engine/rouletteConstants';

interface EuropeanWheelAndTableProps {
  onSelectNumber: (num: number) => void;
  highlightedNumbers?: number[];
  lastNumber?: number | null;
}

type SectorHighlight = 'none' | 'voisins' | 'tiers' | 'orphelins' | 'zero_spiel';

export const EuropeanWheelAndTable: React.FC<EuropeanWheelAndTableProps> = ({
  onSelectNumber,
  highlightedNumbers = [],
  lastNumber = null,
}) => {
  const [sectorHighlight, setSectorHighlight] = useState<SectorHighlight>('none');
  const highlightedSet = new Set(highlightedNumbers);

  const isPocketHighlighted = (num: number): boolean => {
    if (highlightedSet.has(num)) return true;
    if (sectorHighlight === 'voisins') return SECTOR_VOISINS.has(num);
    if (sectorHighlight === 'tiers') return SECTOR_TIERS.has(num);
    if (sectorHighlight === 'orphelins') return SECTOR_ORPHELINS.has(num);
    if (sectorHighlight === 'zero_spiel') return SECTOR_ZERO_SPIEL.has(num);
    return false;
  };

  // Geometry for SVG European Wheel (37 pockets)
  const cx = 140;
  const cy = 140;
  const outerR = 128;
  const innerR = 76;
  const labelR = 104;
  const sliceAngle = (2 * Math.PI) / 37;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
      {/* European SVG Wheel */}
      <div className="xl:col-span-5 flex flex-col items-center bg-[#131A26] border border-[#232E42] rounded-xl p-4">
        <div className="w-full flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-semibold text-slate-100">Roda Europeia (0–36)</h3>
          <div className="flex flex-wrap gap-1">
            {(
              [
                ['none', 'Alvo'],
                ['voisins', 'Voisins'],
                ['tiers', 'Tiers'],
                ['orphelins', 'Orphelins'],
                ['zero_spiel', 'Zero'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSectorHighlight(key)}
                className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                  sectorHighlight === key
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-[#1A2333] text-slate-300 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <svg
          viewBox="0 0 280 280"
          className="w-full max-w-[270px] h-auto select-none"
          role="img"
          aria-label="Roda da Roleta Europeia interativa"
        >
          <circle cx={cx} cy={cy} r={outerR + 6} fill="#0E141F" stroke="#2A374E" strokeWidth="2" />
          {EUROPEAN_WHEEL_SEQUENCE.map((num, idx) => {
            const startAngle = idx * sliceAngle - Math.PI / 2 - sliceAngle / 2;
            const endAngle = startAngle + sliceAngle;
            const midAngle = (startAngle + endAngle) / 2;

            const x1 = cx + outerR * Math.cos(startAngle);
            const y1 = cy + outerR * Math.sin(startAngle);
            const x2 = cx + outerR * Math.cos(endAngle);
            const y2 = cy + outerR * Math.sin(endAngle);

            const ix1 = cx + innerR * Math.cos(endAngle);
            const iy1 = cy + innerR * Math.sin(endAngle);
            const ix2 = cx + innerR * Math.cos(startAngle);
            const iy2 = cy + innerR * Math.sin(startAngle);

            const d = [
              `M ${x1} ${y1}`,
              `A ${outerR} ${outerR} 0 0 1 ${x2} ${y2}`,
              `L ${ix1} ${iy1}`,
              `A ${innerR} ${innerR} 0 0 0 ${ix2} ${iy2}`,
              'Z',
            ].join(' ');

            const color = getNumberColor(num);
            const active = isPocketHighlighted(num);
            const isLast = lastNumber === num;

            const fill =
              color === 'green' ? '#059669' : color === 'red' ? '#BE123C' : '#1E293B';

            const tx = cx + labelR * Math.cos(midAngle);
            const ty = cy + labelR * Math.sin(midAngle);

            return (
              <g
                key={num}
                onClick={() => onSelectNumber(num)}
                className="cursor-pointer hover:opacity-90"
              >
                <path
                  d={d}
                  fill={fill}
                  stroke={isLast ? '#FBBF24' : active ? '#34D399' : '#0B0F17'}
                  strokeWidth={isLast ? 2.4 : active ? 1.8 : 0.9}
                />
                {active && (
                  <circle
                    cx={cx + (innerR + 7) * Math.cos(midAngle)}
                    cy={cy + (innerR + 7) * Math.sin(midAngle)}
                    r={2.5}
                    fill="#34D399"
                  />
                )}
                <text
                  x={tx}
                  y={ty}
                  fill="#F8FAFC"
                  fontSize="9"
                  fontWeight={isLast ? '700' : '600'}
                  fontFamily="JetBrains Mono, monospace"
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {num}
                </text>
              </g>
            );
          })}

          {/* Inner hub */}
          <circle cx={cx} cy={cy} r={innerR - 4} fill="#111827" stroke="#2D3B55" strokeWidth="1.5" />
          <text
            x={cx}
            y={cy - 8}
            fill="#94A3B8"
            fontSize="10"
            textAnchor="middle"
            fontFamily="Plus Jakarta Sans, sans-serif"
          >
            Último giro
          </text>
          <text
            x={cx}
            y={cy + 14}
            fill={
              lastNumber === null
                ? '#64748B'
                : lastNumber === 0
                  ? '#34D399'
                  : getNumberColor(lastNumber) === 'red'
                    ? '#FB7185'
                    : '#F8FAFC'
            }
            fontSize="24"
            fontWeight="700"
            textAnchor="middle"
            fontFamily="JetBrains Mono, monospace"
          >
            {lastNumber === null ? '—' : lastNumber}
          </text>
        </svg>
        <p className="text-xs text-slate-400 mt-2 text-center">
          Toque em qualquer número da roda física para registrar o giro
        </p>
      </div>

      {/* European Felt Table 0-36 */}
      <div className="xl:col-span-7 bg-[#131A26] border border-[#232E42] rounded-xl p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-semibold text-slate-100">Mesa Europeia Interativa</h3>
          <span className="text-xs text-slate-400">
            {highlightedNumbers.length > 0
              ? `${highlightedNumbers.length} números destacados pela sugestão`
              : 'Clique no número para lançar à mão'}
          </span>
        </div>

        <div className="overflow-x-auto pb-1">
          <div className="min-w-[480px] grid grid-cols-13 gap-1.5">
            {/* Zero column spanning 3 rows */}
            <button
              type="button"
              onClick={() => onSelectNumber(0)}
              className={`row-span-3 min-h-[138px] rounded-md border font-mono font-bold text-base tabular-nums transition-colors flex items-center justify-center ${
                lastNumber === 0
                  ? 'bg-emerald-500 text-slate-950 border-amber-300 ring-2 ring-amber-400'
                  : isPocketHighlighted(0)
                    ? 'bg-emerald-600 text-white border-emerald-300 ring-2 ring-emerald-400'
                    : 'bg-emerald-700/90 hover:bg-emerald-600 text-white border-emerald-500/40'
              }`}
            >
              0
            </button>

            {/* 3x12 grid */}
            {TABLE_ROWS.map((row) =>
              row.map((num) => {
                const color = getNumberColor(num);
                const isLast = lastNumber === num;
                const active = isPocketHighlighted(num);
                return (
                  <button
                    key={num}
                    type="button"
                    onClick={() => onSelectNumber(num)}
                    className={`min-h-[44px] rounded-md border font-mono font-semibold text-sm tabular-nums transition-all active:scale-95 ${
                      color === 'red'
                        ? 'bg-rose-700/90 hover:bg-rose-600 text-white border-rose-500/40'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border-slate-600/60'
                    } ${
                      isLast
                        ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-[#131A26]'
                        : active
                          ? 'ring-2 ring-emerald-400'
                          : ''
                    }`}
                  >
                    {num}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Outside summary indicator bar */}
        <div className="mt-3 grid grid-cols-3 gap-1.5 text-center text-xs text-slate-400 font-medium">
          <div className="py-1.5 rounded bg-[#0E141F] border border-[#1E293B]">1ª Dúzia (1–12)</div>
          <div className="py-1.5 rounded bg-[#0E141F] border border-[#1E293B]">2ª Dúzia (13–24)</div>
          <div className="py-1.5 rounded bg-[#0E141F] border border-[#1E293B]">3ª Dúzia (25–36)</div>
        </div>
      </div>
    </div>
  );
};
