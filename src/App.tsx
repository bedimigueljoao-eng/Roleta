import React, { useEffect, useMemo, useState } from 'react';
import {
  Globe,
  Hand,
  Sliders,
  TrendingUp,
  BarChart3,
  Database,
} from 'lucide-react';
import type {
  BankrollConfig,
  LearningBackupPayload,
  RoiRegion,
  RouletteStrategy,
  SpinEntry,
  SpinSource,
  StrategySnapshot,
} from './types/roulette';
import { evaluateTargetNetUnits, isValidRouletteNumber } from './engine/rouletteConstants';
import { computeRouletteStats } from './engine/rouletteStats';
import { DEFAULT_BANKROLL_CONFIG, computeBankrollState } from './engine/rouletteBankroll';
import {
  BUILTIN_STRATEGIES,
  buildMasterRecommendation,
} from './engine/strategyBuilder';
import { runContinuousLearningCycle } from './engine/continuousLearning';
import {
  applyProposalAsNewVariation,
  createEvolutionSnapshot,
  generateOptimizationProposals,
} from './engine/strategyOptimizer';
import { numbersToSpinEntries } from './data/rouletteDemos';
import {
  DEFAULT_ROI_REGION,
  loadLearningState,
  loadSessionState,
  saveLearningState,
  saveSessionState,
} from './utils/storage';
import { SplitBrowserTab } from './components/SplitBrowserTab';
import { ManualTab } from './components/ManualTab';
import { type PendingRealBet } from './components/DecisionCockpit';
import { StrategyBuilderPanel } from './components/StrategyBuilderPanel';
import { LearningBacktestPanel } from './components/LearningBacktestPanel';
import { StatsAndBankrollPanel } from './components/StatsAndBankrollPanel';
import { DemosAndAiPanel } from './components/DemosAndAiPanel';

type CentralMode = 'browser' | 'manual';
type WorkspaceSection = 'operacao' | 'estrategias' | 'aprendizagem' | 'estatisticas' | 'demos_ia';

export default function App() {
  const [hydrated, setHydrated] = useState(false);
  const [centralMode, setCentralMode] = useState<CentralMode>('manual');
  const [workspaceSection, setWorkspaceSection] = useState<WorkspaceSection>('operacao');

  // Session state (kept separate from learning backup)
  const [spins, setSpins] = useState<SpinEntry[]>([]);
  const [browserUrl, setBrowserUrl] = useState('https://www.kwanzabet.ao');
  const [splitPercent, setSplitPercent] = useState(48);
  const [roiRegion, setRoiRegion] = useState<RoiRegion>(DEFAULT_ROI_REGION);
  const [minConfluence, setMinConfluence] = useState(1);
  const [pendingBet, setPendingBet] = useState<PendingRealBet | null>(null);

  // Learning & Bankroll backup state
  const [strategies, setStrategies] = useState<RouletteStrategy[]>(BUILTIN_STRATEGIES);
  const [snapshots, setSnapshots] = useState<StrategySnapshot[]>([]);
  const [bankrollConfig, setBankrollConfig] = useState<BankrollConfig>(DEFAULT_BANKROLL_CONFIG);

  // Load persisted IndexedDB / localStorage state on mount
  useEffect(() => {
    let active = true;
    (async () => {
      const [session, learning] = await Promise.all([
        loadSessionState(),
        loadLearningState(),
      ]);
      if (!active) return;
      setSpins(session.spins);
      setBrowserUrl(session.browserUrl);
      setSplitPercent(session.splitPercent);
      setRoiRegion(session.roiRegion);
      setMinConfluence(session.minConfluence);

      setStrategies(learning.strategies);
      setSnapshots(learning.snapshots);
      setBankrollConfig(learning.bankrollConfig);
      setHydrated(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  // Persist Session State
  useEffect(() => {
    if (!hydrated) return;
    saveSessionState({
      spins,
      browserUrl,
      splitPercent,
      roiRegion,
      minConfluence,
      updatedAt: Date.now(),
    });
  }, [hydrated, spins, browserUrl, splitPercent, roiRegion, minConfluence]);

  // Persist Learning Backup State separately
  useEffect(() => {
    if (!hydrated) return;
    saveLearningState({
      strategies,
      snapshots,
      bankrollConfig,
      updatedAt: Date.now(),
    });
  }, [hydrated, strategies, snapshots, bankrollConfig]);

  const orderedNumbers = useMemo(() => spins.map((s) => s.number), [spins]);

  const stats = useMemo(() => computeRouletteStats(spins), [spins]);

  const bankrollState = useMemo(
    () => computeBankrollState(bankrollConfig, spins),
    [bankrollConfig, spins]
  );

  // Continuous Learning point-in-time evaluation & transparent learnedWeight calculation
  const { learningState, weightedStrategies } = useMemo(() => {
    const res = runContinuousLearningCycle(strategies, orderedNumbers, 0.7);
    return {
      learningState: res.learningState,
      weightedStrategies: res.updatedStrategies,
    };
  }, [strategies, orderedNumbers]);

  // Master live recommendation for the NEXT spin
  const masterRecommendation = useMemo(
    () =>
      buildMasterRecommendation(
        weightedStrategies,
        orderedNumbers,
        bankrollConfig,
        bankrollState,
        minConfluence
      ),
    [weightedStrategies, orderedNumbers, bankrollConfig, bankrollState, minConfluence]
  );

  // Optimization proposals for Improvement Cycle
  const optimizationProposals = useMemo(
    () => generateOptimizationProposals(weightedStrategies, learningState.reports, orderedNumbers),
    [weightedStrategies, learningState.reports, orderedNumbers]
  );

  // Append a single spin manually, evaluating the prediction that was active right BEFORE this spin
  const handleAddSingleSpin = (num: number, source: SpinSource = 'manual') => {
    if (!isValidRouletteNumber(num)) return;

    const currentBankroll = computeBankrollState(bankrollConfig, spins);
    const currentRec = buildMasterRecommendation(
      weightedStrategies,
      orderedNumbers,
      bankrollConfig,
      currentBankroll,
      minConfluence
    );

    let predictionResult: SpinEntry['predictionResult'];
    if (currentRec.action === 'ENTRAR' && currentRec.betTarget) {
      const res = evaluateTargetNetUnits(num, currentRec.betTarget, currentRec.coveredNumbers);
      predictionResult = {
        action: 'ENTRAR',
        targetLabel: currentRec.targetLabel,
        outcome: res.won ? 'OK' : 'X',
        netUnits: res.netUnits,
        confidence: currentRec.confidence,
      };
    } else {
      predictionResult = {
        action: 'AGUARDAR',
        targetLabel: currentRec.targetLabel,
        outcome: 'SKIP',
        netUnits: 0,
        confidence: currentRec.confidence,
      };
    }

    let realBet: SpinEntry['realBet'];
    if (pendingBet) {
      const won = pendingBet.coveredNumbers.includes(num);
      const profitAmount = won
        ? Number((pendingBet.stakeAmount * pendingBet.payoutMultiplier).toFixed(2))
        : -pendingBet.stakeAmount;
      realBet = {
        targetLabel: pendingBet.targetLabel,
        stakeAmount: pendingBet.stakeAmount,
        won,
        profitAmount,
      };
      setPendingBet(null);
    }

    const entry: SpinEntry = {
      id: `spin_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      number: num,
      timestamp: Date.now(),
      source,
      originBucket: 'session',
      predictionResult,
      realBet,
    };

    setSpins((prev) => [...prev, entry]);
  };

  // Batch append (e.g. from OCR live strip), evaluating sequentially point-in-time
  const handleBatchAddNumbers = (
    numbers: number[],
    bucket: 'historical' | 'session',
    source: 'ocr_live'
  ) => {
    const valid = numbers.filter(isValidRouletteNumber);
    if (valid.length === 0) return;

    const betToSettle = bucket === 'session' ? pendingBet : null;
    if (betToSettle) {
      setPendingBet(null);
    }

    setSpins((prev) => {
      let runningSpins = [...prev];
      valid.forEach((n, idx) => {
        const runningNumbers = runningSpins.map((s) => s.number);
        const runningBankroll = computeBankrollState(bankrollConfig, runningSpins);
        const rec = buildMasterRecommendation(
          weightedStrategies,
          runningNumbers,
          bankrollConfig,
          runningBankroll,
          minConfluence
        );

        let predictionResult: SpinEntry['predictionResult'];
        if (bucket === 'session' && rec.action === 'ENTRAR' && rec.betTarget) {
          const res = evaluateTargetNetUnits(n, rec.betTarget, rec.coveredNumbers);
          predictionResult = {
            action: 'ENTRAR',
            targetLabel: rec.targetLabel,
            outcome: res.won ? 'OK' : 'X',
            netUnits: res.netUnits,
            confidence: rec.confidence,
          };
        } else if (bucket === 'session') {
          predictionResult = {
            action: 'AGUARDAR',
            targetLabel: rec.targetLabel,
            outcome: 'SKIP',
            netUnits: 0,
            confidence: rec.confidence,
          };
        }

        let realBet: SpinEntry['realBet'];
        if (idx === 0 && betToSettle) {
          const won = betToSettle.coveredNumbers.includes(n);
          realBet = {
            targetLabel: betToSettle.targetLabel,
            stakeAmount: betToSettle.stakeAmount,
            won,
            profitAmount: won
              ? Number((betToSettle.stakeAmount * betToSettle.payoutMultiplier).toFixed(2))
              : -betToSettle.stakeAmount,
          };
        }

        runningSpins.push({
          id: `spin_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 7)}`,
          number: n,
          timestamp: Date.now(),
          source,
          originBucket: bucket,
          predictionResult,
          realBet,
        });
      });
      return runningSpins;
    });
  };

  // Replace only the historical base (up to 500 previous results), keeping current session spins intact
  const handleReplaceHistoricalBase = (
    numbers: number[],
    source: 'ocr_500' | 'demo' | 'import'
  ) => {
    const capped = numbers.filter(isValidRouletteNumber).slice(-500);
    const historicalEntries = numbersToSpinEntries(capped, source, 'historical');
    setSpins((prev) => {
      const sessionOnly = prev.filter((s) => s.originBucket === 'session');
      return [...historicalEntries, ...sessionOnly];
    });
  };

  const handleClearHistoricalBase = () => {
    setSpins((prev) => prev.filter((s) => s.originBucket === 'session'));
  };

  const handleUndoLastSpin = () => {
    setSpins((prev) => prev.slice(0, -1));
  };

  const handleClearSessionSpins = () => {
    setPendingBet(null);
    setSpins((prev) => prev.filter((s) => s.originBucket === 'historical'));
  };

  const handleResetSessionBankrollCounters = () => {
    setPendingBet(null);
    setSpins((prev) =>
      prev.map((s) =>
        s.originBucket === 'session'
          ? { ...s, predictionResult: undefined, realBet: undefined }
          : s
      )
    );
  };

  const handleApplyOptimizationProposal = (proposal: (typeof optimizationProposals)[number]) => {
    setStrategies((prev) => applyProposalAsNewVariation(prev, proposal));
  };

  const handleSaveSnapshot = (label: string) => {
    const snap = createEvolutionSnapshot(
      label,
      weightedStrategies,
      spins.length,
      learningState.overallPointInTimeHitRate,
      learningState.overallNetUnits,
      learningState.overallSignals
    );
    setSnapshots((prev) => [snap, ...prev]);
  };

  const handleRestoreSnapshot = (snap: StrategySnapshot) => {
    setStrategies(snap.strategies);
  };

  const handleRestoreLearningBackup = (payload: LearningBackupPayload) => {
    if (Array.isArray(payload.strategies) && payload.strategies.length > 0) {
      setStrategies(payload.strategies);
    }
    if (Array.isArray(payload.snapshots)) {
      setSnapshots(payload.snapshots);
    }
    if (payload.bankrollConfig) {
      setBankrollConfig(payload.bankrollConfig);
    }
  };

  const selectCentralTab = (mode: CentralMode) => {
    setCentralMode(mode);
    setWorkspaceSection('operacao');
  };

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex flex-col pb-16 md:pb-6">
      {/* Top Navigation Bar (Strict 3-Zone Contract) */}
      <header className="sticky top-0 z-30 bg-[#0B0F17]/95 backdrop-blur-md border-b border-[#1E293B]">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => setWorkspaceSection('operacao')}
            className="font-display text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0 text-left"
          >
            Roleta Quant Lab
          </button>

          {/* Zone 2: Clean single-line text links */}
          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium">
            {(
              [
                ['operacao', 'Operação'],
                ['estrategias', 'Estratégias'],
                ['aprendizagem', 'Aprendizagem & Backtest'],
                ['estatisticas', 'Estatísticas & Banca'],
                ['demos_ia', 'Demos & IA'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setWorkspaceSection(key)}
                className={`whitespace-nowrap shrink-0 transition-colors py-1 border-b-2 ${
                  workspaceSection === key
                    ? 'text-emerald-400 border-emerald-400'
                    : 'text-slate-400 hover:text-slate-100 border-transparent'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          {/* Zone 3: 2 Central Mode Switcher */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#131A26] border border-[#232E42] shrink-0">
            <button
              type="button"
              onClick={() => selectCentralTab('browser')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                centralMode === 'browser' && workspaceSection === 'operacao'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Navegador Embutido</span>
            </button>
            <button
              type="button"
              onClick={() => selectCentralTab('manual')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                centralMode === 'manual' && workspaceSection === 'operacao'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Hand className="w-3.5 h-3.5" />
              <span>Manual</span>
            </button>
          </div>
        </div>
      </header>

      {/* Secondary Context Strip (Unboxed metadata + mobile/tablet section links) */}
      <div className="border-b border-[#182132] bg-[#0D121C]">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
            <span>Roleta Europeia 0–36</span>
            <span aria-hidden="true">·</span>
            <span>n = {stats.sampleSize} giros</span>
            <span aria-hidden="true">·</span>
            <span>{strategies.filter((s) => s.enabled).length} estratégias ativas</span>
            <span aria-hidden="true">·</span>
            <span
              className={
                masterRecommendation.action === 'ENTRAR' ? 'text-emerald-400 font-semibold' : 'text-amber-300'
              }
            >
              Sinal: {masterRecommendation.action}
            </span>
          </div>

          {/* Tablet compact section switcher */}
          <div className="flex lg:hidden items-center gap-1.5 overflow-x-auto">
            {(
              [
                ['operacao', 'Operação'],
                ['estrategias', 'Estratégias'],
                ['aprendizagem', 'Backtest'],
                ['estatisticas', 'Banca'],
                ['demos_ia', 'Demos/IA'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setWorkspaceSection(key)}
                className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap ${
                  workspaceSection === key
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-5">
        {workspaceSection === 'operacao' && centralMode === 'browser' && (
          <SplitBrowserTab
            browserUrl={browserUrl}
            onChangeUrl={setBrowserUrl}
            splitPercent={splitPercent}
            onChangeSplitPercent={setSplitPercent}
            roiRegion={roiRegion}
            onChangeRoiRegion={setRoiRegion}
            recommendation={masterRecommendation}
            learning={learningState}
            bankrollConfig={bankrollConfig}
            bankrollState={bankrollState}
            spins={spins}
            pendingBet={pendingBet}
            onArmPendingBet={setPendingBet}
            onChangeBankrollConfig={setBankrollConfig}
            onSubmitNumber={(num) => handleAddSingleSpin(num, 'manual')}
            onBatchAddNumbers={handleBatchAddNumbers}
            onUndoLastSpin={handleUndoLastSpin}
            onClearSessionSpins={handleClearSessionSpins}
          />
        )}

        {workspaceSection === 'operacao' && centralMode === 'manual' && (
          <ManualTab
            recommendation={masterRecommendation}
            learning={learningState}
            bankrollConfig={bankrollConfig}
            bankrollState={bankrollState}
            spins={spins}
            pendingBet={pendingBet}
            onArmPendingBet={setPendingBet}
            onChangeBankrollConfig={setBankrollConfig}
            onSubmitNumber={(num) => handleAddSingleSpin(num, 'manual')}
            onReplaceHistoricalBase={handleReplaceHistoricalBase}
            onClearHistoricalBase={handleClearHistoricalBase}
            onUndoLastSpin={handleUndoLastSpin}
            onClearSessionSpins={handleClearSessionSpins}
          />
        )}

        {workspaceSection === 'estrategias' && (
          <StrategyBuilderPanel
            strategies={weightedStrategies}
            onChangeStrategies={setStrategies}
            minConfluence={minConfluence}
            onChangeMinConfluence={setMinConfluence}
          />
        )}

        {workspaceSection === 'aprendizagem' && (
          <LearningBacktestPanel
            learning={learningState}
            strategies={weightedStrategies}
            proposals={optimizationProposals}
            snapshots={snapshots}
            spinCount={spins.length}
            onApplyProposal={handleApplyOptimizationProposal}
            onSaveSnapshot={handleSaveSnapshot}
            onRestoreSnapshot={handleRestoreSnapshot}
          />
        )}

        {workspaceSection === 'estatisticas' && (
          <StatsAndBankrollPanel
            stats={stats}
            bankrollConfig={bankrollConfig}
            bankrollState={bankrollState}
            onChangeBankrollConfig={setBankrollConfig}
            onResetSessionBankroll={handleResetSessionBankrollCounters}
          />
        )}

        {workspaceSection === 'demos_ia' && (
          <DemosAndAiPanel
            spins={spins}
            strategies={weightedStrategies}
            snapshots={snapshots}
            bankrollConfig={bankrollConfig}
            bankrollState={bankrollState}
            stats={stats}
            learning={learningState}
            onLoadDemo={(nums) => handleReplaceHistoricalBase(nums, 'demo')}
            onImportSessionSpins={(imported) => setSpins(imported)}
            onRestoreLearningBackup={handleRestoreLearningBackup}
          />
        )}
      </main>

      {/* Mobile Bottom Ergonomic Thumb Bar with safe-area padding */}
      <nav
        aria-label="Navegação móvel"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 min-h-[56px] pb-[env(safe-area-inset-bottom,0px)] bg-[#0B0F17]/95 backdrop-blur-md border-t border-[#1E293B] grid grid-cols-5 items-center"
      >
        <button
          type="button"
          onClick={() => selectCentralTab('browser')}
          className={`flex flex-col items-center justify-center h-full text-[10px] font-medium ${
            workspaceSection === 'operacao' && centralMode === 'browser'
              ? 'text-emerald-400'
              : 'text-slate-400'
          }`}
        >
          <Globe className="w-4 h-4 mb-0.5" />
          <span>Navegador</span>
        </button>

        <button
          type="button"
          onClick={() => selectCentralTab('manual')}
          className={`flex flex-col items-center justify-center h-full text-[10px] font-medium ${
            workspaceSection === 'operacao' && centralMode === 'manual'
              ? 'text-emerald-400'
              : 'text-slate-400'
          }`}
        >
          <Hand className="w-4 h-4 mb-0.5" />
          <span>Manual</span>
        </button>

        <button
          type="button"
          onClick={() => setWorkspaceSection('estrategias')}
          className={`flex flex-col items-center justify-center h-full text-[10px] font-medium ${
            workspaceSection === 'estrategias' ? 'text-emerald-400' : 'text-slate-400'
          }`}
        >
          <Sliders className="w-4 h-4 mb-0.5" />
          <span>Estratégias</span>
        </button>

        <button
          type="button"
          onClick={() => setWorkspaceSection('aprendizagem')}
          className={`flex flex-col items-center justify-center h-full text-[10px] font-medium ${
            workspaceSection === 'aprendizagem' ? 'text-emerald-400' : 'text-slate-400'
          }`}
        >
          <TrendingUp className="w-4 h-4 mb-0.5" />
          <span>Backtest</span>
        </button>

        <button
          type="button"
          onClick={() =>
            setWorkspaceSection((prev) => (prev === 'estatisticas' ? 'demos_ia' : 'estatisticas'))
          }
          className={`flex flex-col items-center justify-center h-full text-[10px] font-medium ${
            workspaceSection === 'estatisticas' || workspaceSection === 'demos_ia'
              ? 'text-emerald-400'
              : 'text-slate-400'
          }`}
        >
          {workspaceSection === 'demos_ia' ? (
            <Database className="w-4 h-4 mb-0.5" />
          ) : (
            <BarChart3 className="w-4 h-4 mb-0.5" />
          )}
          <span>{workspaceSection === 'demos_ia' ? 'Demos/IA' : 'Banca'}</span>
        </button>
      </nav>
    </div>
  );
}
