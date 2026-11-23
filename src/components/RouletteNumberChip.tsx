import React from 'react';
import { getNumberColor } from '../engine/rouletteConstants';

interface RouletteNumberChipProps {
  number: number;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  outcome?: 'OK' | 'X' | 'SKIP';
  isSession?: boolean;
  onClick?: () => void;
  highlighted?: boolean;
}

export const RouletteNumberChip: React.FC<RouletteNumberChipProps> = ({
  number,
  size = 'md',
  outcome,
  isSession = false,
  onClick,
  highlighted = false,
}) => {
  const color = getNumberColor(number);

  const colorClasses =
    color === 'green'
      ? 'bg-emerald-600 text-white border-emerald-400/50'
      : color === 'red'
        ? 'bg-rose-600 text-white border-rose-400/40'
        : 'bg-slate-800 text-slate-100 border-slate-600/60';

  const sizeClasses =
    size === 'xs'
      ? 'w-7 h-7 text-xs'
      : size === 'sm'
        ? 'w-8 h-8 text-xs'
        : size === 'lg'
          ? 'w-11 h-11 text-sm'
          : 'w-9 h-9 text-xs';

  const ringClass = highlighted
    ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-[#0B0F17]'
    : isSession
      ? 'ring-1 ring-emerald-400/70'
      : '';

  const Tag = onClick ? 'button' : 'span';

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`relative inline-flex items-center justify-center rounded-md border font-mono font-semibold tabular-nums select-none shrink-0 transition-transform ${colorClasses} ${sizeClasses} ${ringClass} ${
        onClick ? 'hover:scale-105 active:scale-95 cursor-pointer' : ''
      }`}
      title={`Número ${number} (${color === 'green' ? 'Zero' : color === 'red' ? 'Vermelho' : 'Preto'})`}
    >
      {number}
      {outcome && outcome !== 'SKIP' && (
        <span
          className={`absolute -top-1.5 -right-1.5 px-1 rounded text-[9px] font-bold leading-tight border ${
            outcome === 'OK'
              ? 'bg-emerald-500 text-slate-950 border-emerald-300'
              : 'bg-rose-500 text-white border-rose-300'
          }`}
        >
          {outcome}
        </span>
      )}
    </Tag>
  );
};
