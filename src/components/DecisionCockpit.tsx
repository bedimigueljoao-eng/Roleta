import React, { useEffect, useState } from 'react';
import {
  Undo2,
  Trash2,
  ShieldAlert,
  TrendingUp,
  PauseCircle,
  Send,
  Coins,
  CheckCircle2,
  Eye,
  Clock,
  X,
} from 'lucide-react';
import type {
  BankrollConfig,
  BankrollSessionState,
  BetTargetType,
  ContinuousLearningState,
  MasterRecommendation,
  SpinEntry,
} from '../types/roulette';
import { isValidRouletteNumber } from '../engine/rouletteConstants';
import { RouletteNumberChip } from './RouletteNumberChip';

export interface PendingRealBet {
  betTarget: BetTargetType;
  targetLabel: string;
  coveredNumbers: number[];
  stakeAmount: number;
  payoutMultiplier: number;
  isForcedOverride: boolean;
}

interface DecisionCockpitProps {
  recommendation: MasterRecommendation;
  learning: ContinuousLearningState;
  bankrollConfig: BankrollConfig;
  bankrollState: BankrollSessionState;
  spins: SpinEntry[];
  pendingBet: PendingRealBet | null;
  onArmPendingBet: (bet: PendingRealBet | null) => void;
  onChangeBankrollConfig: (next: BankrollConfig) => void;
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
  pendingBet,
  onArmPendingBet,
  onChangeBankrollConfig,
  onSubmitNumber,
  onUndoLastSpin,
  onClearSessionSpins,
  compact = false,
}) => {
  const [quickInput, setQuickInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [ignoreWait, setIgnoreWait] = useState(false);
  const [stakeInput, setStakeInput] = useState<number>(bankrollState.minRecommendedBet);
  const [editingBalance, setEditingBalance] = useState(false);
  const [balanceDraft, setBalanceDraft] = useState(String(bankrollConfig.initialBankroll));

  useEffect(() => {
    setStakeInput(bankrollState.minRecommendedBet);
  }, [bankrollState.minRecommendedBet]);

  useEffect(() => {
    setBalanceDraft(String(bankrollConfig.initialBankroll));
  }, [bankrollConfig.initialBankroll]);

  // Reset forced override automatically once a real ENTRAR trigger activates
  useEffect(() => {
    if (recommendation.action === 'ENTRAR' && ignoreWait) {
      setIgnoreWait(false);
    }
  }, [recommendation.action, ignoreWait]);

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

  const recent18 = spins.slice(-18).reverse();

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

  const handleSaveInitialBalance = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number(balanceDraft);
    if (!Number.isFinite(parsed) || parsed < 1) return;
    onChangeBankrollConfig({
      ...bankrollConfig,
      initialBankroll: Math.round(parsed),
    });
    setEditingBalance(false);
  };

  const isNaturalEnter = recommendation.action === 'ENTRAR' && recommendation.betTarget !== null;
  const forced = recommendation.forcedSuggestion;
  const showActionableTarget = isNaturalEnter || (ignoreWait && forced !== null);

  const activeTarget = isNaturalEnter
    ? {
        betTarget: recommendation.betTarget!,
        targetLabel: recommendation.targetLabel,
        coveredNumbers: recommendation.coveredNumbers,
        confidence: recommendation.confidence,
        payoutMultiplier: recommendation.payoutMultiplier,
        isForced: false,
      }
    : ignoreWait && forced
      ? {
          betTarget: forced.betTarget,
          targetLabel: forced.targetLabel,
          coveredNumbers: forced.coveredNumbers,
          confidence: forced.confidence,
          payoutMultiplier: forced.payoutMultiplier,
          isForced: true,
        }
      : null;

  const safeStake = Math.max(1, Number.isFinite(stakeInput) ? stakeInput : bankrollState.minRecommendedBet);
  const estimatedNetGain = activeTarget
    ? Number((safeStake * activeTarget.payoutMultiplier).toFixed(0))
    : 0;

  const handleConfirmApostei = () => {
    if (!activeTarget) return;
    onArmPendingBet({
      betTarget: activeTarget.betTarget,
      targetLabel: activeTarget.targetLabel,
      coveredNumbers: activeTarget.coveredNumbers,
      stakeAmount: safeStake,
      payoutMultiplier: activeTarget.payoutMultiplier,
      isForcedOverride: activeTarget.isForced,
    });
  };

  return (
    <section className="bg-[#131A26] border border-[#232E42] rounded-xl p-3 sm:p-4 space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
        {/* Left: Primary Decision Action + Wait Countdown + Ignore Wait + "Apostei" */}
        <div
          className={`lg:col-span-5 rounded-lg border p-3.5 flex flex-col justify-between gap-2.5 ${
            isNaturalEnter
              ? 'bg-emerald-950/35 border-emerald-500/50'
              : ignoreWait && activeTarget
                ? 'bg-amber-950/25 border-amber-500/50'
                : 'bg-[#0E141F] border-[#232E42]'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] text-slate-400">Sugestão de Aposta</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                {isNaturalEnter ? (
                  <TrendingUp className="w-5 h-5 text-emerald-400 shrink-0" />
                ) : (
                  <PauseCircle className="w-5 h-5 text-amber-400 shrink-0" />
                )}
                <span
                  className={`font-display text-xl sm:text-2xl font-bold tracking-tight ${
                    isNaturalEnter
                      ? 'text-emerald-400'
                      : ignoreWait && activeTarget
                        ? 'text-amber-300'
                        : 'text-amber-300'
                  }`}
                >
                  {isNaturalEnter
                    ? 'ENTRAR'
                    : ignoreWait && activeTarget
                      ? 'LEITURA DIRECIONAL'
                      : 'AGUARDAR'}
                </span>

                {activeTarget ? (
                  <span className="font-mono text-xs font-semibold tabular-nums text-slate-200">
                    · {activeTarget.confidence}% conf.
                  </span>
                ) : recommendation.roundsToWait !== null ? (
                  <span className="inline-flex items-center gap-1 font-mono text-xs text-amber-300 tabular-nums">
                    <Clock className="w-3.5 h-3.5" />
                    <span>~{recommendation.roundsToWait} rod.</span>
                  </span>
                ) : null}
              </div>
            </div>

            {!isNaturalEnter && forced && !recommendation.blockedByBankroll && (
              <button
                type="button"
                onClick={() => setIgnoreWait((v) => !v)}
                className={`min-h-[34px] px-2.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap border transition-colors ${
                  ignoreWait
                    ? 'bg-amber-500 text-slate-950 border-amber-400'
                    : 'bg-[#182233] hover:bg-[#223047] text-amber-300 border-[#2B3B56]'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>{ignoreWait ? 'Voltar Aguardar' : 'Ignorar Aguardar'}</span>
              </button>
            )}
          </div>

          <div>
            <p className="text-sm sm:text-base font-semibold text-slate-100">
              {activeTarget ? activeTarget.targetLabel : recommendation.targetLabel}
            </p>
            <p className="mt-0.5 text-xs text-slate-300 leading-relaxed">
              {activeTarget && activeTarget.isForced
                ? `Modo Ignorar Aguardar: ${forced?.reason ?? ''}`
                : recommendation.reasons[0] ?? 'Aguardando próximo resultado para avaliar gatilhos.'}
            </p>
            {!isNaturalEnter && !recommendation.blockedByBankroll && (
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                <span>Aguardar até:</span>
                {[3, 6, 10].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => onChangeBankrollConfig({ ...bankrollConfig, maxWaitRounds: r })}
                    className={`px-2 py-0.5 rounded font-mono ${
                      bankrollConfig.maxWaitRounds === r
                        ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40'
                        : 'bg-[#182233] text-slate-400 hover:text-white'
                    }`}
                  >
                    {r} rod.
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* "Apostei" Stake + Estimated Profit Strip */}
          {showActionableTarget && activeTarget && (
            <div className="pt-2 border-t border-[#1E293B] space-y-2">
              {pendingBet ? (
                <div className="flex items-center justify-between gap-2 bg-emerald-500/15 border border-emerald-500/40 rounded-lg px-3 py-2 text-xs">
                  <div className="flex items-center gap-2 text-emerald-200">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      Aposta armada em <strong>{pendingBet.targetLabel}</strong> ·{' '}
                      <span className="font-mono tabular-nums">
                        {bankrollConfig.currencySymbol} {pendingBet.stakeAmount}
                      </span>{' '}
                      (ganho est.{' '}
                      <span className="font-mono text-emerald-300">
                        +{bankrollConfig.currencySymbol}{' '}
                        {(pendingBet.stakeAmount * pendingBet.payoutMultiplier).toFixed(0)}
                      </span>
                      )
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onArmPendingBet(null)}
                    className="p-1 text-slate-300 hover:text-rose-300"
                    title="Cancelar aposta marcada"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 bg-[#131A26] border border-[#263248] rounded-lg px-2 py-1">
                    <span className="text-[11px] text-slate-400">Valor:</span>
                    <input
                      type="number"
                      min={1}
                      value={stakeInput}
                      onChange={(e) => setStakeInput(Number(e.target.value))}
                      className="w-16 bg-transparent font-mono text-xs font-semibold text-slate-100 tabular-nums focus:outline-none"
                    />
                    <span className="text-[11px] font-mono text-slate-400">
                      {bankrollConfig.currencySymbol}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setStakeInput(bankrollState.minRecommendedBet)}
                    className="px-2 py-1.5 rounded bg-[#182233] hover:bg-[#223047] text-[11px] font-mono text-slate-300"
                  >
                    Mín ({bankrollState.minRecommendedBet})
                  </button>

                  <span className="text-[11px] font-mono text-emerald-300 tabular-nums">
                    Ganho est.: +{bankrollConfig.currencySymbol} {estimatedNetGain}
                  </span>

                  <button
                    type="button"
                    onClick={handleConfirmApostei}
                    className="ml-auto min-h-[36px] px-3.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <Coins className="w-3.5 h-3.5" />
                    <span>Apostei</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {recommendation.blockedByBankroll && (
            <div className="flex items-center gap-2 text-xs text-rose-300 bg-rose-950/40 border border-rose-500/40 rounded-md px-3 py-2">
              <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{recommendation.bankrollBlockReason}</span>
            </div>
          )}
        </div>

        {/* Middle: Editable Saldo Atual, Real Bets W/L & Min Bet Strategy */}
        <div className="lg:col-span-4 grid grid-cols-2 gap-2.5">
          <div className="bg-[#0E141F] border border-[#1E293B] rounded-lg p-3 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] text-slate-400">Saldo Atual</span>
              <button
                type="button"
                onClick={() => setEditingBalance((v) => !v)}
                className="text-[11px] text-emerald-400 hover:underline"
              >
                {editingBalance ? 'Fechar' : 'Definir'}
              </button>
            </div>
            {editingBalance ? (
              <form onSubmit={handleSaveInitialBalance} className="mt-1 flex gap-1">
                <input
                  type="number"
                  min={1}
                  value={balanceDraft}
                  onChange={(e) => setBalanceDraft(e.target.value)}
                  className="w-full min-h-[34px] px-2 rounded bg-[#131A26] border border-[#2B374E] font-mono text-xs text-slate-100"
                />
                <button
                  type="submit"
                  className="px-2.5 rounded bg-emerald-500 text-slate-950 text-xs font-bold"
                >
                  OK
                </button>
              </form>
            ) : (
              <div>
                <p className="font-mono text-lg sm:text-xl font-bold tabular-nums text-slate-100">
                  {bankrollConfig.currencySymbol} {bankrollState.currentBankroll.toFixed(0)}
                </p>
                <p
                  className={`text-[11px] font-mono tabular-nums ${
                    bankrollState.sessionNetProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {bankrollState.sessionNetProfit >= 0 ? '+' : ''}
                  {bankrollConfig.currencySymbol} {bankrollState.sessionNetProfit.toFixed(0)} sessão
                </p>
              </div>
            )}
          </div>

          <div className="bg-[#0E141F] border border-[#1E293B] rounded-lg p-3 flex flex-col justify-between">
            <span className="text-[11px] text-slate-400">Apostas & Acerto</span>
            <div>
              <p className="font-mono text-lg sm:text-xl font-bold tabular-nums text-slate-100">
                {bankrollState.realBetsPlaced > 0
                  ? `${bankrollState.realBetsWon}/${bankrollState.realBetsPlaced}`
                  : `${sessionHitRate}%`}
              </p>
              <p className="text-[11px] text-slate-400 font-mono tabular-nums">
                {bankrollState.realBetsPlaced > 0
                  ? `Erros: ${bankrollState.realBetsLost} (-${bankrollConfig.currencySymbol} ${bankrollState.realTotalLostAmount.toFixed(0)})`
                  : `${evaluatedSession.length > 0 ? `${sessionWins}/${evaluatedSession.length} sinais` : `${learning.overallWins}/${learning.overallSignals} backtest`}`}
              </p>
            </div>
          </div>

          <div className="col-span-2 bg-[#0E141F] border border-[#1E293B] rounded-lg p-3 space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
              <span>
                Aposta Mín. ({bankrollConfig.minBetPercent}%):{' '}
                <strong className="font-mono text-emerald-300">
                  {bankrollConfig.currencySymbol} {bankrollState.minRecommendedBet}
                </strong>
              </span>
              <span className="font-mono tabular-nums">
                Base: {historicalCount} · Sessão: {sessionSpins.length}
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {evaluatedSession.length > 0 ? (
                evaluatedSession.slice(-12).map((s) => (
                  <span
                    key={s.id}
                    className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold border ${
                      s.predictionResult?.outcome === 'OK'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    }`}
                  >
                    {s.predictionResult?.outcome}
                  </span>
                ))
              ) : learning.recentOutcomes.length > 0 ? (
                learning.recentOutcomes.slice(-12).map((o, idx) => (
                  <span
                    key={idx}
                    className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold border ${
                      o === 'OK'
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                    }`}
                  >
                    {o}
                  </span>
                ))
              ) : (
                <span className="text-[11px] text-slate-500">
                  Marque "Apostei" antes do giro para contabilizar ganhos e perdas reais.
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Quick Enter Launch + Session Actions */}
        <div className="lg:col-span-3 bg-[#0E141F] border border-[#1E293B] rounded-lg p-3 flex flex-col justify-between gap-2.5">
          <form onSubmit={handleQuickSubmit} className="space-y-1.5">
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
                className="w-full min-h-[42px] px-3 rounded-lg bg-[#131A26] border border-[#2B374E] text-slate-100 font-mono text-base tabular-nums focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                className="min-h-[42px] px-3.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs flex items-center gap-1 shrink-0 transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
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
              className="flex-1 min-h-[38px] px-2.5 rounded-lg bg-[#182233] hover:bg-[#1E2B40] disabled:opacity-40 text-slate-200 text-xs font-medium flex items-center justify-center gap-1 transition-colors"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>Desfazer</span>
            </button>
            <button
              type="button"
              onClick={onClearSessionSpins}
              disabled={sessionSpins.length === 0}
              className="flex-1 min-h-[38px] px-2.5 rounded-lg bg-[#182233] hover:bg-rose-950/60 disabled:opacity-40 text-slate-200 hover:text-rose-200 text-xs font-medium flex items-center justify-center gap-1 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Limpar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Latest Numbers Strip */}
      {!compact && (
        <div className="pt-2 border-t border-[#1E293B] flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-slate-400 mr-1">Últimos giros:</span>
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
