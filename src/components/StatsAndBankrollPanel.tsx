import React from 'react';
import { ShieldCheck, AlertCircle, RotateCcw } from 'lucide-react';
import type {
  BankrollConfig,
  BankrollSessionState,
  CategoryStat,
  RouletteStatsSummary,
} from '../types/roulette';
import { RouletteNumberChip } from './RouletteNumberChip';

interface StatsAndBankrollPanelProps {
  stats: RouletteStatsSummary;
  bankrollConfig: BankrollConfig;
  bankrollState: BankrollSessionState;
  onChangeBankrollConfig: (next: BankrollConfig) => void;
  onResetSessionBankroll: () => void;
}

const CategoryTable: React.FC<{ title: string; rows: CategoryStat[] }> = ({ title, rows }) => (
  <div className="bg-[#131A26] border border-[#232E42] rounded-xl p-4 space-y-2.5">
    <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse text-xs">
        <thead>
          <tr className="border-b border-[#232E42] text-slate-400">
            <th className="py-1.5 pr-2 font-medium">Categoria</th>
            <th className="py-1.5 px-2 text-right font-medium">Qtd</th>
            <th className="py-1.5 px-2 text-right font-medium">Obs.</th>
            <th className="py-1.5 px-2 text-right font-medium">Teor.</th>
            <th className="py-1.5 px-2 text-right font-medium">Desvio</th>
            <th className="py-1.5 px-2 text-right font-medium">Ausência</th>
            <th className="py-1.5 pl-2 text-right font-medium">Máx.Seq</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#1E293B]">
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="py-2 pr-2 text-slate-200 font-medium">{r.label}</td>
              <td className="py-2 px-2 text-right font-mono tabular-nums text-slate-300">
                {r.count}
              </td>
              <td className="py-2 px-2 text-right font-mono tabular-nums text-slate-100 font-semibold">
                {r.frequencyPercent}%
              </td>
              <td className="py-2 px-2 text-right font-mono tabular-nums text-slate-400">
                {r.theoreticalPercent}%
              </td>
              <td
                className={`py-2 px-2 text-right font-mono tabular-nums ${
                  Math.abs(r.deviationPercent) >= 5
                    ? r.deviationPercent > 0
                      ? 'text-emerald-400'
                      : 'text-amber-300'
                    : 'text-slate-400'
                }`}
              >
                {r.deviationPercent > 0 ? '+' : ''}
                {r.deviationPercent}%
              </td>
              <td className="py-2 px-2 text-right font-mono tabular-nums text-slate-200">
                {r.currentAbsence} (máx {r.maxAbsence})
              </td>
              <td className="py-2 pl-2 text-right font-mono tabular-nums text-slate-400">
                {r.maxStreak}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

export const StatsAndBankrollPanel: React.FC<StatsAndBankrollPanelProps> = ({
  stats,
  bankrollConfig,
  bankrollState,
  onChangeBankrollConfig,
  onResetSessionBankroll,
}) => {
  return (
    <div className="space-y-5">
      {/* Statistical Independence Notice + Sample Size Header */}
      <section className="bg-[#131A26] border border-[#232E42] rounded-xl p-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-100">
            Estatística da Roleta Europeia (0–36) · n ={' '}
            <span className="font-mono tabular-nums text-emerald-400">{stats.sampleSize}</span> giros
          </h2>
          <span className="text-xs font-mono text-slate-400 tabular-nums">
            Base Histórica: {stats.historicalCount} · Sessão Atual: {stats.sessionCount} · Qui²:{' '}
            {stats.chiSquareScore}
          </span>
        </div>
        <p className="text-xs text-amber-200/90 bg-amber-950/25 border border-amber-500/30 rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
          <span>{stats.independenceNotice}</span>
        </p>
      </section>

      {/* Bankroll Configuration & Live Guardrails */}
      <section className="bg-[#131A26] border border-[#232E42] rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Gestão de Banca & Proteção Anti-Martingale</span>
            </h3>
            <p className="text-xs text-slate-400">
              Controle de stop-loss, meta de lucro e pausa automática após perdas consecutivas.
            </p>
          </div>
          <button
            type="button"
            onClick={onResetSessionBankroll}
            className="min-h-[38px] px-3.5 rounded-lg bg-[#1A2436] hover:bg-[#233149] text-xs text-slate-200 flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reiniciar Contadores da Sessão</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-[#0E141F] border border-[#1E293B] rounded-lg p-3">
            <span className="text-slate-400">Banca Atual</span>
            <p className="font-mono text-lg font-bold tabular-nums text-slate-100 mt-0.5">
              {bankrollConfig.currencySymbol} {bankrollState.currentBankroll.toFixed(0)}
            </p>
          </div>
          <div className="bg-[#0E141F] border border-[#1E293B] rounded-lg p-3">
            <span className="text-slate-400">Lucro/Prejuízo Sessão</span>
            <p
              className={`font-mono text-lg font-bold tabular-nums mt-0.5 ${
                bankrollState.sessionNetProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {bankrollState.sessionNetProfit >= 0 ? '+' : ''}
              {bankrollConfig.currencySymbol} {bankrollState.sessionNetProfit.toFixed(0)}
            </p>
          </div>
          <div className="bg-[#0E141F] border border-[#1E293B] rounded-lg p-3">
            <span className="text-slate-400">Perdas Seguidas</span>
            <p className="font-mono text-lg font-bold tabular-nums text-amber-300 mt-0.5">
              {bankrollState.consecutiveLosses} / {bankrollConfig.pauseAfterConsecutiveLosses}
            </p>
          </div>
          <div className="bg-[#0E141F] border border-[#1E293B] rounded-lg p-3">
            <span className="text-slate-400">Drawdown Máx. Sessão</span>
            <p className="font-mono text-lg font-bold tabular-nums text-slate-200 mt-0.5">
              -{bankrollConfig.currencySymbol} {bankrollState.maxSessionDrawdown.toFixed(0)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          <label className="space-y-1">
            <span className="text-slate-400">Banca Inicial</span>
            <input
              type="number"
              min={10}
              value={bankrollConfig.initialBankroll}
              onChange={(e) =>
                onChangeBankrollConfig({
                  ...bankrollConfig,
                  initialBankroll: Math.max(10, Number(e.target.value)),
                })
              }
              className="w-full min-h-[40px] px-3 rounded-lg bg-[#0E141F] border border-[#263248] font-mono text-slate-100"
            />
          </label>
          <label className="space-y-1">
            <span className="text-slate-400">Ficha Base</span>
            <input
              type="number"
              min={1}
              value={bankrollConfig.baseChip}
              onChange={(e) =>
                onChangeBankrollConfig({
                  ...bankrollConfig,
                  baseChip: Math.max(1, Number(e.target.value)),
                })
              }
              className="w-full min-h-[40px] px-3 rounded-lg bg-[#0E141F] border border-[#263248] font-mono text-slate-100"
            />
          </label>
          <label className="space-y-1">
            <span className="text-slate-400">Stop-Loss Sessão</span>
            <input
              type="number"
              min={10}
              value={bankrollConfig.stopLossAmount}
              onChange={(e) =>
                onChangeBankrollConfig({
                  ...bankrollConfig,
                  stopLossAmount: Math.max(10, Number(e.target.value)),
                })
              }
              className="w-full min-h-[40px] px-3 rounded-lg bg-[#0E141F] border border-[#263248] font-mono text-slate-100"
            />
          </label>
          <label className="space-y-1">
            <span className="text-slate-400">Meta de Lucro</span>
            <input
              type="number"
              min={10}
              value={bankrollConfig.profitTargetAmount}
              onChange={(e) =>
                onChangeBankrollConfig({
                  ...bankrollConfig,
                  profitTargetAmount: Math.max(10, Number(e.target.value)),
                })
              }
              className="w-full min-h-[40px] px-3 rounded-lg bg-[#0E141F] border border-[#263248] font-mono text-slate-100"
            />
          </label>
          <label className="space-y-1">
            <span className="text-slate-400">Pausa após N Perdas</span>
            <input
              type="number"
              min={1}
              max={10}
              value={bankrollConfig.pauseAfterConsecutiveLosses}
              onChange={(e) =>
                onChangeBankrollConfig({
                  ...bankrollConfig,
                  pauseAfterConsecutiveLosses: Math.max(1, Number(e.target.value)),
                })
              }
              className="w-full min-h-[40px] px-3 rounded-lg bg-[#0E141F] border border-[#263248] font-mono text-slate-100"
            />
          </label>
          <label className="space-y-1">
            <span className="text-slate-400">Moeda</span>
            <input
              type="text"
              maxLength={5}
              value={bankrollConfig.currencySymbol}
              onChange={(e) =>
                onChangeBankrollConfig({
                  ...bankrollConfig,
                  currencySymbol: e.target.value || 'Kz',
                })
              }
              className="w-full min-h-[40px] px-3 rounded-lg bg-[#0E141F] border border-[#263248] font-mono text-slate-100"
            />
          </label>
        </div>

        <label className="flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer">
          <input
            type="checkbox"
            checked={bankrollConfig.antiMartingaleProtection}
            onChange={(e) =>
              onChangeBankrollConfig({
                ...bankrollConfig,
                antiMartingaleProtection: e.target.checked,
              })
            }
            className="w-4 h-4 accent-emerald-500"
          />
          <span>
            Proteção Anti-Martingale ativa (bloqueia dobra progressiva após derrotas e mantém unidade fixa controlada)
          </span>
        </label>
      </section>

      {/* Hot & Cold Numbers + Full 0-36 Frequency Grid */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4 bg-[#131A26] border border-[#232E42] rounded-xl p-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-100 mb-2">Números Mais Frequentes</h3>
            <div className="space-y-1.5">
              {stats.hotNumbers.map((item) => (
                <div
                  key={`hot-${item.number}`}
                  className="flex items-center justify-between text-xs bg-[#0E141F] border border-[#1E293B] rounded-lg px-2.5 py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <RouletteNumberChip number={item.number} size="xs" />
                    <span className="font-mono tabular-nums text-slate-200">
                      {item.count}x ({item.frequencyPercent}%)
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-emerald-400 tabular-nums">
                    há {item.lastSeenAgo} giros
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-100 mb-2">Números Mais Atrasados</h3>
            <div className="space-y-1.5">
              {stats.coldNumbers.map((item) => (
                <div
                  key={`cold-${item.number}`}
                  className="flex items-center justify-between text-xs bg-[#0E141F] border border-[#1E293B] rounded-lg px-2.5 py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <RouletteNumberChip number={item.number} size="xs" />
                    <span className="font-mono tabular-nums text-slate-300">
                      {item.count}x ({item.frequencyPercent}%)
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-amber-300 tabular-nums">
                    ausente {item.lastSeenAgo}g
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-8 bg-[#131A26] border border-[#232E42] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-100">
              Mapa de Frequência 0–36 vs. Probabilidade Teórica (1/37 = 2.70%)
            </h3>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
            {stats.numberStats.map((ns) => (
              <div
                key={ns.number}
                className="bg-[#0E141F] border border-[#1E293B] rounded-lg p-2 flex flex-col items-center gap-1"
              >
                <RouletteNumberChip number={ns.number} size="xs" />
                <span className="font-mono text-[11px] font-semibold tabular-nums text-slate-100">
                  {ns.count}x · {ns.frequencyPercent}%
                </span>
                <span className="font-mono text-[10px] tabular-nums text-slate-400">
                  aus. {ns.lastSeenAgo}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Category Tables */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CategoryTable title="Cores & Zero (18/37 = 48.65% · 1/37 = 2.70%)" rows={stats.colors} />
        <CategoryTable title="Setores Físicos da Roda Europeia" rows={stats.sectors} />
        <CategoryTable title="Dúzias (12/37 = 32.43%)" rows={stats.dozens} />
        <CategoryTable title="Colunas (12/37 = 32.43%)" rows={stats.columns} />
        <CategoryTable title="Paridade (18/37 = 48.65%)" rows={stats.parities} />
        <CategoryTable title="Metades Baixo / Alto (18/37 = 48.65%)" rows={stats.halves} />
      </section>
    </div>
  );
};
