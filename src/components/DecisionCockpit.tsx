import React, { useState } from 'react';
import { Undo2, Trash2, ShieldAlert, TrendingUp, PauseCircle, Send } from 'lucide-react';
import type {
  BankrollConfig,
  BankrollSessionState,
  ContinuousLearningState,
  MasterRecommendation,
  SpinEntry,
} from '../types/roulette';
import { isValidRouletteNumber } from '../engine/rouletteConstants';
import { RouletteNumberChip } from './RouletteNumberChip';

interface DecisionCockpitProps {
  recommendation: MasterRecommendation;
  learning: ContinuousLearningState;
  bankrollConfig: BankrollConfig;
  bankrollState: BankrollSessionState;
  spins: SpinEntry[];
  onSubmitNumber: (num: number) => void;
  onUndoLastSpin: () => void;
  onClearSessionSpins: () => void;
  compact?: boolean;
}

export const DecisionCockpit: React.FC<DecisionCockpitProps> = ({
  recommendation,
  learning,
  bankrollConfig,
  bankrollState,
  spins,
  onSubmitNumber,
  onUndoLastSpin,
  onClearSessionSpins,
  compact = false,
}) => {
  const [quickInput, setQuickInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);

  const sessionSpins = spins.filter((s) => s.originBucket === 'session');
  const historicalCount = spins.length - sessionSpins.length;
  const evaluatedSession = sessionSpins.filter(
    (s) => s.predictionResult && s.predictionResult.outcome !== 'SKIP'
  );
  const sessionWins = evaluatedSession.filter((s) => s.predictionResult?.outcome === 'OK').length;
  const sessionHitRate =
    evaluatedSession.length > 0
      ? Number(((sessionWins / evaluatedSession.length) * 100).toFixed(1))
      : learning.overallPointInTimeHitRate;

  const recent18 = spins.slice(-18).reverse(); // Newest first for quick visual scan

  const handleQuickSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = quickInput.trim();
    if (!/^\d{1,2}$/.test(trimmed)) {
      setInputError('Digite um número inteiro de 0 a 36.');
      return;
    }
    const val = Number(trimmed);
    if (!isValidRouletteNumber(val)) {
      setInputError('Número fora da faixa da Roleta Europeia (0–36).');
      return;
    }
    setInputError(null);
    onSubmitNumber(val);
    setQuickInput('');
  };

  const isEnter = recommendation.action === 'ENTRAR';

  return (
    <section className="bg-[#131A26] border border-[#232E42] rounded-xl p-4 space-y-4">
      {/* Main Recommendation Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Left: Primary Decision Action */}
        <div
          className={`lg:col-span-5 rounded-lg border p-4 flex flex-col justify-between ${
            isEnter
              ? 'bg-emerald-950/35 border-emerald-500/50'
              : 'bg-[#0E141F] border-[#232E42]'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-slate-400">Melhor Sugestão de Aposta</p>
              <div className="mt-1 flex items-center gap-2.5">
                {isEnter ? (
                  <TrendingUp className="w-5 h-5 text-emerald-400 shrink-0" />
                ) : (
                  <PauseCircle className="w-5 h-5 text-amber-400 shrink-0" />
                )}
                <span
                  className={`font-display text-2xl font-bold tracking-tight ${
                    isEnter ? 'text-emerald-400' : 'text-amber-300'
                  }`}
                >
                  {recommendation.action}
                </span>
                {recommendation.confidence > 0 && (
                  <span className="font-mono text-sm font-semibold tabular-nums text-slate-200">
                    · {recommendation.confidence}% confiança
                  </span>
                )}
              </div>
            </div>

            {isEnter && (
              <div className="text-right font-mono tabular-nums">
                <p className="text-xs text-slate-400">Entrada sugerida</p>
                <p className="text-sm font-semibold text-emerald-300">
                  {recommendation.suggestedUnits} unid. ({bankrollConfig.currencySymbol}{' '}
                  {(recommendation.suggestedUnits * bankrollConfig.baseChip).toFixed(0)})
                </p>
              </div>
            )}
          </div>

          <div className="mt-3">
            <p className="text-base font-semibold text-slate-100">{recommendation.targetLabel}</p>
            <p className="mt-1 text-xs text-slate-300 leading-relaxed">
              {recommendation.reasons[0] ?? 'Aguardando próximo resultado para avaliar gatilhos.'}
            </p>
            {recommendation.coveredNumbers.length > 0 && recommendation.coveredNumbers.length <= 18 && (
              <p className="mt-2 text-[11px] font-mono text-slate-400 tabular-nums">
                Cobertura ({recommendation.coveredNumbers.length}/37):{' '}
                {recommendation.coveredNumbers.slice(0, 12).join(', ')}
                {recommendation.coveredNumbers.length > 12 ? '…' : ''}
              </p>
            )}
          </div>

          {recommendation.blockedByBankroll && (
            <div className="mt-3 flex items-center gap-2 text-xs text-rose-300 bg-rose-950/40 border border-rose-500/40 rounded-md px-3 py-2">
              <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{recommendation.bankrollBlockReason}</span>
            </div>
          )}
        </div>

        {/* Middle: KPIs & OK / X Hit Rate */}
        <div className="lg:col-span-4 grid grid-cols-2 gap-3">
          <div className="bg-[#0E141F] border border-[#1E293B] rounded-lg p-3 flex flex-col justify-between">
            <span className="text-xs text-slate-400">% de Acerto</span>
            <div>
              <p className="font-mono text-2xl font-bold tabular-nums text-slate-100">
                {sessionHitRate}%
              </p>
              <p className="text-[11px] text-slate-400 font-mono tabular-nums mt-0.5">
                {evaluatedSession.length > 0
                  ? `${sessionWins}/${evaluatedSession.length} sessão`
                  : `${learning.overallWins}/${learning.overallSignals} backtest`}
              </p>
            </div>
          </div>

          <div className="bg-[#0E141F] border border-[#1E293B] rounded-lg p-3 flex flex-col justify-between">
            <span className="text-xs text-slate-400">Banca da Sessão</span>
            <div>
              <p
                className={`font-mono text-xl font-bold tabular-nums ${
                  bankrollState.sessionNetProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {bankrollState.sessionNetProfit >= 0 ? '+' : ''}
                {bankrollConfig.currencySymbol} {bankrollState.sessionNetProfit.toFixed(0)}
              </p>
              <p className="text-[11px] text-slate-400 font-mono tabular-nums mt-0.5">
                Saldo: {bankrollConfig.currencySymbol} {bankrollState.currentBankroll.toFixed(0)}
              </p>
            </div>
          </div>

          <div className="col-span-2 bg-[#0E141F] border border-[#1E293B] rounded-lg p-3">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span>Histórico de Sinais (OK / X)</span>
              <span className="font-mono tabular-nums">
                Base: {historicalCount} · Sessão: {sessionSpins.length}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {evaluatedSession.length > 0 ? (
                evaluatedSession.slice(-14).map((s) => (
                  <span
                    key={s.id}
                    className={`px-1.5 py-0.5 rounded font-mono text-[11px] font-bold border ${
                      s.predictionResult?.outcome === 'OK'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    }`}
                  >
                    {s.predictionResult?.outcome}
                  </span>
                ))
              ) : learning.recentOutcomes.length > 0 ? (
                learning.recentOutcomes.slice(-14).map((o, idx) => (
                  <span
                    key={idx}
                    className={`px-1.5 py-0.5 rounded font-mono text-[11px] font-bold border ${
                      o === 'OK'
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                    }`}
                  >
                    {o}
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-500">
                  Lance ou carregue resultados para acompanhar OK / X em tempo real.
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Quick Enter Launch + Session Actions */}
        <div className="lg:col-span-3 bg-[#0E141F] border border-[#1E293B] rounded-lg p-3 flex flex-col justify-between gap-3">
          <form onSubmit={handleQuickSubmit} className="space-y-2">
            <label htmlFor="quick-spin-input" className="block text-xs text-slate-300 font-medium">
              Lançamento Rápido (0–36 + Enter)
            </label>
            <div className="flex gap-2">
              <input
                id="quick-spin-input"
                type="number"
                min={0}
                max={36}
                inputMode="numeric"
                value={quickInput}
                onChange={(e) => setQuickInput(e.target.value)}
                placeholder="Ex: 17"
                className="w-full min-h-[44px] px-3 rounded-lg bg-[#131A26] border border-[#2B374E] text-slate-100 font-mono text-base tabular-nums focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                className="min-h-[44px] px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm flex items-center gap-1.5 shrink-0 transition-colors"
              >
                <Send className="w-4 h-4" />
                <span>Lançar</span>
              </button>
            </div>
            {inputError && <p className="text-xs text-rose-400">{inputError}</p>}
          </form>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onUndoLastSpin}
              disabled={spins.length === 0}
              className="flex-1 min-h-[40px] px-3 rounded-lg bg-[#182233] hover:bg-[#1E2B40] disabled:opacity-40 text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>Desfazer</span>
            </button>
            <button
              type="button"
              onClick={onClearSessionSpins}
              disabled={sessionSpins.length === 0}
              className="flex-1 min-h-[40px] px-3 rounded-lg bg-[#182233] hover:bg-rose-950/60 disabled:opacity-40 text-slate-200 hover:text-rose-200 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Limpar Sessão</span>
            </button>
          </div>
        </div>
      </div>

      {/* Latest Numbers Strip */}
      {!compact && (
        <div className="pt-2 border-t border-[#1E293B] flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400 mr-1">Últimos giros (mais novo à esquerda):</span>
          {recent18.length === 0 ? (
            <span className="text-xs text-slate-500">Nenhum resultado registrado ainda.</span>
          ) : (
            recent18.map((spin) => (
              <RouletteNumberChip
                key={spin.id}
                number={spin.number}
                size="sm"
                isSession={spin.originBucket === 'session'}
                outcome={spin.predictionResult?.outcome}
              />
            ))
          )}
        </div>
      )}
    </section>
  );
};
