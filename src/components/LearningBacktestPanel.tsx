import React, { useMemo, useState } from 'react';
import { Sparkles, AlertTriangle, BookmarkPlus, RotateCcw } from 'lucide-react';
import type {
  ContinuousLearningState,
  OptimizationProposal,
  RouletteStrategy,
  StrategySnapshot,
} from '../types/roulette';

interface LearningBacktestPanelProps {
  learning: ContinuousLearningState;
  strategies: RouletteStrategy[];
  proposals: OptimizationProposal[];
  snapshots: StrategySnapshot[];
  spinCount: number;
  onApplyProposal: (proposal: OptimizationProposal) => void;
  onSaveSnapshot: (label: string) => void;
  onRestoreSnapshot: (snapshot: StrategySnapshot) => void;
}

export const LearningBacktestPanel: React.FC<LearningBacktestPanelProps> = ({
  learning,
  strategies,
  proposals,
  snapshots,
  spinCount,
  onApplyProposal,
  onSaveSnapshot,
  onRestoreSnapshot,
}) => {
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>(
    () => learning.reports[0]?.strategyId ?? ''
  );
  const [snapshotLabel, setSnapshotLabel] = useState('');

  const selectedReport = useMemo(
    () =>
      learning.reports.find((r) => r.strategyId === selectedStrategyId) ?? learning.reports[0],
    [learning.reports, selectedStrategyId]
  );

  // Build SVG Equity Curve coordinates for selected strategy
  const equitySvg = useMemo(() => {
    const curve = selectedReport?.equityCurve ?? [];
    if (curve.length < 2) return null;
    const width = 640;
    const height = 160;
    const padX = 16;
    const padY = 16;
    const vals = curve.map((c) => c.netUnits);
    const minV = Math.min(0, ...vals);
    const maxV = Math.max(1, ...vals);
    const range = Math.max(1, maxV - minV);

    const points = curve
      .map((pt, i) => {
        const x = padX + (i / (curve.length - 1)) * (width - padX * 2);
        const y = height - padY - ((pt.netUnits - minV) / range) * (height - padY * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

    const zeroY = height - padY - ((0 - minV) / range) * (height - padY * 2);
    return { points, zeroY, width, height, lastVal: curve[curve.length - 1].netUnits };
  }, [selectedReport]);

  const handleSaveSnap = (e: React.FormEvent) => {
    e.preventDefault();
    const label = snapshotLabel.trim() || `Versão v${snapshots.length + 1} (${spinCount} giros)`;
    onSaveSnapshot(label);
    setSnapshotLabel('');
  };

  return (
    <div className="space-y-5">
      {/* Top KPI Strip: Point-in-time & Out-of-Sample Overview */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-[#131A26] border border-[#232E42] rounded-xl p-4">
          <p className="text-xs text-slate-400">Acerto Point-in-Time</p>
          <p className="font-mono text-2xl font-bold tabular-nums text-slate-100 mt-1">
            {learning.overallPointInTimeHitRate}%
          </p>
          <p className="text-[11px] font-mono text-slate-400 tabular-nums mt-1">
            {learning.overallWins}/{learning.overallSignals} sinais avaliados
          </p>
        </div>

        <div className="bg-[#131A26] border border-[#232E42] rounded-xl p-4">
          <p className="text-xs text-slate-400">P&L Simulado (1u fixa)</p>
          <p
            className={`font-mono text-2xl font-bold tabular-nums mt-1 ${
              learning.overallNetUnits >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {learning.overallNetUnits >= 0 ? '+' : ''}
            {learning.overallNetUnits}u
          </p>
          <p className="text-[11px] font-mono text-slate-400 tabular-nums mt-1">
            Amostra n = {spinCount} giros
          </p>
        </div>

        <div className="bg-[#131A26] border border-[#232E42] rounded-xl p-4">
          <p className="text-xs text-slate-400">Drawdown Máximo Global</p>
          <p className="font-mono text-2xl font-bold tabular-nums text-amber-300 mt-1">
            -{learning.overallMaxDrawdown}u
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Sem lookahead (t → t+1)</p>
        </div>

        <div className="bg-[#131A26] border border-[#232E42] rounded-xl p-4">
          <p className="text-xs text-slate-400">Divisão Treino / Validação</p>
          <p className="font-mono text-2xl font-bold tabular-nums text-slate-100 mt-1">
            70% / 30%
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Out-of-sample transparente</p>
        </div>
      </section>

      {/* Strategy Comparison Matrix */}
      <section className="bg-[#131A26] border border-[#232E42] rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              Comparação de Estratégias · Backtest & Aprendizagem Contínua
            </h2>
            <p className="text-xs text-slate-400">
              Clique em uma linha para inspecionar a curva de capital e as janelas móveis (50 / 100 / 300 / 500).
            </p>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {strategies.filter((s) => s.enabled).length} ativas de {strategies.length}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#232E42] text-slate-400">
                <th className="py-2.5 pr-3 font-medium">Estratégia</th>
                <th className="py-2.5 px-2 text-right font-medium">Sinais</th>
                <th className="py-2.5 px-2 text-right font-medium">Acerto</th>
                <th className="py-2.5 px-2 text-right font-medium">Teórico</th>
                <th className="py-2.5 px-2 text-right font-medium">P&L</th>
                <th className="py-2.5 px-2 text-right font-medium">ROI</th>
                <th className="py-2.5 px-2 text-right font-medium">MDD</th>
                <th className="py-2.5 px-2 text-right font-medium">Out-of-Sample</th>
                <th className="py-2.5 pl-2 text-right font-medium">Peso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B]">
              {learning.reports.map((r) => {
                const isSelected = selectedReport?.strategyId === r.strategyId;
                return (
                  <tr
                    key={r.strategyId}
                    onClick={() => setSelectedStrategyId(r.strategyId)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-[#1B2638]' : 'hover:bg-[#172030]'
                    }`}
                  >
                    <td className="py-2.5 pr-3">
                      <div className="font-medium text-slate-100">{r.strategyName}</div>
                      {(r.sampleAlert || r.efficacyDropAlert) && (
                        <div className="text-[11px] text-amber-300 flex items-center gap-1 mt-0.5">
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          <span>{r.efficacyDropAlert ?? r.sampleAlert}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-300">
                      {r.totalSignals}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-100 font-semibold">
                      {r.hitRate}%
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-400">
                      {r.theoreticalHitRate}%
                    </td>
                    <td
                      className={`py-2.5 px-2 text-right font-mono tabular-nums font-semibold ${
                        r.netUnits >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {r.netUnits >= 0 ? '+' : ''}
                      {r.netUnits}u
                    </td>
                    <td
                      className={`py-2.5 px-2 text-right font-mono tabular-nums ${
                        r.roi >= 0 ? 'text-emerald-300' : 'text-rose-300'
                      }`}
                    >
                      {r.roi >= 0 ? '+' : ''}
                      {r.roi}%
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-amber-300">
                      -{r.maxDrawdownUnits}u
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-200">
                      {r.validationMetrics.signalsTriggered > 0
                        ? `${r.validationMetrics.hitRate}% (${r.validationMetrics.roi >= 0 ? '+' : ''}${
                            r.validationMetrics.roi
                          }%)`
                        : '—'}
                    </td>
                    <td className="py-2.5 pl-2 text-right font-mono tabular-nums text-emerald-300">
                      {r.updatedLearnedWeight.toFixed(2)}x
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Selected Strategy Equity Curve & Rolling Windows */}
      {selectedReport && (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 bg-[#131A26] border border-[#232E42] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-100">
                Curva de Capital · {selectedReport.strategyName}
              </h3>
              <span className="text-xs font-mono tabular-nums text-slate-400">
                Consistência: {selectedReport.consistencyScore}/100
              </span>
            </div>

            {equitySvg ? (
              <svg
                viewBox={`0 0 ${equitySvg.width} ${equitySvg.height}`}
                className="w-full h-44 bg-[#0E141F] border border-[#1E293B] rounded-lg"
              >
                <line
                  x1={16}
                  y1={equitySvg.zeroY}
                  x2={equitySvg.width - 16}
                  y2={equitySvg.zeroY}
                  stroke="#334155"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />
                <polyline
                  fill="none"
                  stroke={equitySvg.lastVal >= 0 ? '#10B981' : '#F43F5E'}
                  strokeWidth="2.2"
                  points={equitySvg.points}
                />
              </svg>
            ) : (
              <div className="h-44 flex items-center justify-center bg-[#0E141F] border border-[#1E293B] rounded-lg text-xs text-slate-500">
                Aguardando pelo menos 2 sinais disparados para traçar a curva point-in-time.
              </div>
            )}
          </div>

          <div className="lg:col-span-5 bg-[#131A26] border border-[#232E42] rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-100">
              Janelas Móveis & Validação Out-of-Sample
            </h3>
            <div className="space-y-2 text-xs">
              {[50, 100, 300, 500].map((w) => {
                const m = selectedReport.windows[w];
                return (
                  <div
                    key={w}
                    className="flex items-center justify-between bg-[#0E141F] border border-[#1E293B] rounded-lg px-3 py-2 font-mono tabular-nums"
                  >
                    <span className="text-slate-300">Últimos {w} giros</span>
                    <span className="text-slate-400">{m.signalsTriggered} sinais</span>
                    <span className="text-slate-100 font-semibold">{m.hitRate}%</span>
                    <span className={m.netUnits >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      {m.netUnits >= 0 ? '+' : ''}
                      {m.netUnits}u
                    </span>
                  </div>
                );
              })}

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="bg-[#0E141F] border border-[#1E293B] rounded-lg p-2.5 font-mono tabular-nums">
                  <p className="text-[11px] text-slate-400">Treino (70%)</p>
                  <p className="text-sm font-bold text-slate-100 mt-0.5">
                    {selectedReport.trainMetrics.hitRate}% · ROI {selectedReport.trainMetrics.roi}%
                  </p>
                </div>
                <div className="bg-[#0E141F] border border-[#1E293B] rounded-lg p-2.5 font-mono tabular-nums">
                  <p className="text-[11px] text-slate-400">Validação (30%)</p>
                  <p className="text-sm font-bold text-emerald-300 mt-0.5">
                    {selectedReport.validationMetrics.hitRate}% · ROI{' '}
                    {selectedReport.validationMetrics.roi}%
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Optimization Proposals & Evolution Snapshots */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 bg-[#131A26] border border-[#232E42] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>Ciclo de Melhoria · Propostas Simuladas</span>
            </h3>
            <span className="text-xs text-slate-400">{proposals.length} proposta(s)</span>
          </div>

          {proposals.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">
              {spinCount < 30
                ? 'Carregue pelo menos 30 giros (ex.: Demo 500 Giros) para gerar propostas de melhoria baseadas em backtest.'
                : 'Nenhuma variação candidata superou o ROI/drawdown atual das estratégias ativas.'}
            </p>
          ) : (
            <div className="space-y-2.5">
              {proposals.map((prop) => (
                <div
                  key={prop.id}
                  className="bg-[#0E141F] border border-[#232E42] rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-100">
                      {prop.strategyName} · {prop.title}
                    </p>
                    <p className="text-xs text-slate-400">{prop.rationale}</p>
                    <p className="text-[11px] font-mono text-emerald-300 tabular-nums">
                      Simulação: Acerto {prop.simulatedBaselineHitRate}% → {prop.simulatedProposedHitRate}%
                      · ROI {prop.simulatedBaselineRoi}% → {prop.simulatedProposedRoi}% · MDD{' '}
                      {prop.simulatedBaselineDrawdown}u → {prop.simulatedProposedDrawdown}u
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onApplyProposal(prop)}
                    className="min-h-[38px] px-3.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold whitespace-nowrap shrink-0"
                  >
                    Aplicar e Testar Variação
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Version Snapshots */}
        <div className="lg:col-span-5 bg-[#131A26] border border-[#232E42] rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-100">
            Snapshots de Evolução / Versão ({snapshots.length})
          </h3>

          <form onSubmit={handleSaveSnap} className="flex gap-2">
            <input
              type="text"
              value={snapshotLabel}
              onChange={(e) => setSnapshotLabel(e.target.value)}
              placeholder="Rótulo da versão (opcional)"
              className="flex-1 min-h-[38px] px-3 rounded-lg bg-[#0E141F] border border-[#263248] text-xs text-slate-100"
            />
            <button
              type="submit"
              className="min-h-[38px] px-3 rounded-lg bg-[#1A2436] hover:bg-[#233149] text-xs text-emerald-300 font-semibold flex items-center gap-1.5 whitespace-nowrap"
            >
              <BookmarkPlus className="w-3.5 h-3.5" />
              <span>Salvar Versão</span>
            </button>
          </form>

          <div className="max-h-52 overflow-y-auto space-y-2">
            {snapshots.length === 0 ? (
              <p className="text-xs text-slate-500 py-3">
                Salve snapshots antes de testar novas variações para comparar versões.
              </p>
            ) : (
              snapshots.map((snap) => (
                <div
                  key={snap.id}
                  className="bg-[#0E141F] border border-[#1E293B] rounded-lg p-2.5 flex items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <p className="font-medium text-slate-100">{snap.label}</p>
                    <p className="text-[11px] font-mono text-slate-400 tabular-nums">
                      n={snap.spinCount} · Acerto {snap.overallHitRate}% · ROI {snap.overallRoi}%
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRestoreSnapshot(snap)}
                    className="min-h-[34px] px-2.5 rounded bg-[#1A2436] hover:bg-[#233149] text-slate-200 flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Restaurar</span>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
