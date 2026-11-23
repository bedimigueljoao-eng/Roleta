import type {
  ContinuousLearningState,
  PointInTimePrediction,
  RouletteStrategy,
  StrategyEvaluationReport,
  WindowMetrics,
} from '../types/roulette';
import {
  evaluateTargetNetUnits,
  getCoveredNumbersForTarget,
  getTheoreticalHitRate,
} from './rouletteConstants';
import { evaluateStrategySignal } from './strategyBuilder';

const ROLLING_WINDOWS = [50, 100, 300, 500] as const;
const MIN_WARMUP_SPINS = 6;

function computeWindowMetrics(
  predictions: PointInTimePrediction[],
  windowSize: number,
  totalAvailableSpins: number,
  theoreticalHitRate: number
): WindowMetrics {
  const actualSpins = Math.min(windowSize, Math.max(0, totalAvailableSpins - MIN_WARMUP_SPINS));
  const slice =
    totalAvailableSpins <= windowSize
      ? predictions
      : predictions.filter((p) => p.spinIndex >= totalAvailableSpins - windowSize);

  const triggered = slice.filter((p) => p.action === 'ENTRAR');
  const wins = triggered.filter((p) => p.won).length;
  const losses = triggered.length - wins;
  const hitRate = triggered.length > 0 ? Number(((wins / triggered.length) * 100).toFixed(2)) : 0;

  let netUnits = 0;
  let peak = 0;
  let maxDd = 0;
  for (const p of triggered) {
    netUnits += p.netUnits;
    if (netUnits > peak) peak = netUnits;
    const dd = peak - netUnits;
    if (dd > maxDd) maxDd = dd;
  }

  const roi =
    triggered.length > 0 ? Number(((netUnits / triggered.length) * 100).toFixed(2)) : 0;

  return {
    windowSize,
    actualSpins,
    signalsTriggered: triggered.length,
    wins,
    losses,
    hitRate,
    theoreticalHitRate,
    netUnits: Number(netUnits.toFixed(2)),
    roi,
    maxDrawdownUnits: Number(maxDd.toFixed(2)),
  };
}

/**
 * Evaluates a single strategy strictly point-in-time (`history[0..i-1]` -> predicts `history[i]`).
 * Never peeks into future spins.
 */
export function evaluateStrategyPointInTime(
  strategy: RouletteStrategy,
  numbersOldestToNewest: number[],
  trainRatio = 0.7
): {
  report: StrategyEvaluationReport;
  predictions: PointInTimePrediction[];
} {
  const n = numbersOldestToNewest.length;
  const predictions: PointInTimePrediction[] = [];
  let cumulativeUnits = 0;

  const defaultCovered = getCoveredNumbersForTarget(strategy.betTarget, {
    neighborCenter: strategy.neighborCenter,
    neighborRadius: strategy.neighborRadius,
    straightNumbers: strategy.straightNumbers,
  });
  const theoreticalHitRate = getTheoreticalHitRate(strategy.betTarget, defaultCovered.length);

  for (let i = MIN_WARMUP_SPINS; i < n; i++) {
    const pastSlice = numbersOldestToNewest.slice(0, i);
    const nextLanded = numbersOldestToNewest[i];
    const sig = evaluateStrategySignal(strategy, pastSlice);

    if (sig.action === 'ENTRAR') {
      const evalRes = evaluateTargetNetUnits(nextLanded, sig.betTarget, sig.coveredNumbers);
      cumulativeUnits += evalRes.netUnits;
      predictions.push({
        spinIndex: i,
        spinNumber: nextLanded,
        strategyId: strategy.id,
        action: 'ENTRAR',
        betTarget: sig.betTarget,
        coveredNumbers: sig.coveredNumbers,
        won: evalRes.won,
        netUnits: evalRes.netUnits,
        cumulativeUnits: Number(cumulativeUnits.toFixed(2)),
        confidence: sig.rawConfidence,
      });
    }
  }

  const totalSignals = predictions.length;
  const wins = predictions.filter((p) => p.won).length;
  const losses = totalSignals - wins;
  const hitRate = totalSignals > 0 ? Number(((wins / totalSignals) * 100).toFixed(2)) : 0;

  let peak = 0;
  let maxDrawdownUnits = 0;
  const equityCurve: { index: number; netUnits: number; won: boolean }[] = [];

  for (let k = 0; k < predictions.length; k++) {
    const cur = predictions[k];
    if (cur.cumulativeUnits > peak) peak = cur.cumulativeUnits;
    const dd = peak - cur.cumulativeUnits;
    if (dd > maxDrawdownUnits) maxDrawdownUnits = dd;
    equityCurve.push({
      index: cur.spinIndex,
      netUnits: cur.cumulativeUnits,
      won: cur.won,
    });
  }

  const netUnits = Number(cumulativeUnits.toFixed(2));
  const roi = totalSignals > 0 ? Number(((netUnits / totalSignals) * 100).toFixed(2)) : 0;

  const windows: Record<number, WindowMetrics> = {};
  for (const w of ROLLING_WINDOWS) {
    windows[w] = computeWindowMetrics(predictions, w, n, theoreticalHitRate);
  }

  // Train / Out-of-Sample Validation split
  const splitIdx = Math.max(MIN_WARMUP_SPINS + 1, Math.floor(n * trainRatio));
  const trainPreds = predictions.filter((p) => p.spinIndex < splitIdx);
  const valPreds = predictions.filter((p) => p.spinIndex >= splitIdx);

  const trainMetrics = computeWindowMetrics(trainPreds, splitIdx, splitIdx, theoreticalHitRate);
  const validationMetrics = computeWindowMetrics(
    valPreds,
    n - splitIdx,
    n - splitIdx + MIN_WARMUP_SPINS,
    theoreticalHitRate
  );

  // Cross-window consistency score (0..100)
  const validWindowRois = ROLLING_WINDOWS.map((w) => windows[w])
    .filter((m) => m.signalsTriggered >= 3)
    .map((m) => m.roi);

  let consistencyScore = 50;
  if (validWindowRois.length >= 2) {
    const mean = validWindowRois.reduce((a, b) => a + b, 0) / validWindowRois.length;
    const variance =
      validWindowRois.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / validWindowRois.length;
    const stdDev = Math.sqrt(variance);
    consistencyScore = Math.max(0, Math.min(100, Math.round(80 - stdDev * 0.6 + (mean > 0 ? 15 : -10))));
  }

  // Recent 20-signal hit rate vs baseline
  const recent20 = predictions.slice(-20);
  const recentHitRate =
    recent20.length > 0
      ? Number(((recent20.filter((p) => p.won).length / recent20.length) * 100).toFixed(2))
      : 0;

  // Transparent Bayesian-shrunk weight update from out-of-sample validation + total signals
  // Shrinks toward baseWeight when sample size is small (Laplace prior weight = 20 signals)
  const valSignals = validationMetrics.signalsTriggered;
  const valRoiFactor =
    valSignals > 0 ? Math.max(-0.35, Math.min(0.45, validationMetrics.roi / 100)) : 0;
  const shrinkage = totalSignals / (totalSignals + 20);
  const rawAdjustedWeight = strategy.baseWeight * (1 + shrinkage * valRoiFactor);
  const updatedLearnedWeight = Number(
    Math.max(0.35, Math.min(1.65, rawAdjustedWeight)).toFixed(3)
  );

  // Sample & efficacy drop alerts
  const sampleAlert =
    totalSignals < 15
      ? `Amostra pequena (n = ${totalSignals} entradas). Peso mantido próximo da base até atingir ≥ 15 sinais.`
      : null;

  const efficacyDropAlert =
    recent20.length >= 8 && recentHitRate < theoreticalHitRate - 10
      ? `Queda de eficácia recente: ${recentHitRate}% nos últimos ${recent20.length} sinais vs. ${theoreticalHitRate}% esperado.`
      : null;

  return {
    report: {
      strategyId: strategy.id,
      strategyName: strategy.name,
      enabled: strategy.enabled,
      totalSpinsEvaluated: Math.max(0, n - MIN_WARMUP_SPINS),
      totalSignals,
      wins,
      losses,
      hitRate,
      theoreticalHitRate,
      netUnits,
      roi,
      maxDrawdownUnits,
      consistencyScore,
      windows,
      trainMetrics,
      validationMetrics,
      recentHitRate,
      previousLearnedWeight: strategy.learnedWeight,
      updatedLearnedWeight,
      sampleAlert,
      efficacyDropAlert,
      equityCurve,
    },
    predictions,
  };
}

/**
 * Runs the continuous learning cycle across all strategies and returns updated weights + telemetry.
 */
export function runContinuousLearningCycle(
  strategies: RouletteStrategy[],
  numbersOldestToNewest: number[],
  trainRatio = 0.7
): {
  learningState: ContinuousLearningState;
  updatedStrategies: RouletteStrategy[];
} {
  const reports: StrategyEvaluationReport[] = [];
  const allPredictions: PointInTimePrediction[] = [];
  const updatedStrategies: RouletteStrategy[] = [];

  for (const strategy of strategies) {
    const { report, predictions } = evaluateStrategyPointInTime(
      strategy,
      numbersOldestToNewest,
      trainRatio
    );
    reports.push(report);
    if (strategy.enabled) {
      allPredictions.push(...predictions);
    }
    updatedStrategies.push({
      ...strategy,
      learnedWeight: report.updatedLearnedWeight,
    });
  }

  // Sort combined timeline to compute overall point-in-time metrics
  allPredictions.sort((a, b) => a.spinIndex - b.spinIndex);
  const overallSignals = allPredictions.length;
  const overallWins = allPredictions.filter((p) => p.won).length;
  const overallPointInTimeHitRate =
    overallSignals > 0 ? Number(((overallWins / overallSignals) * 100).toFixed(2)) : 0;

  let overallNetUnits = 0;
  let peak = 0;
  let overallMaxDrawdown = 0;
  for (const p of allPredictions) {
    overallNetUnits += p.netUnits;
    if (overallNetUnits > peak) peak = overallNetUnits;
    const dd = peak - overallNetUnits;
    if (dd > overallMaxDrawdown) overallMaxDrawdown = dd;
  }

  const recentOutcomes = allPredictions.slice(-24).map((p) => (p.won ? 'OK' : 'X') as 'OK' | 'X');

  return {
    learningState: {
      lastEvaluatedSpinCount: numbersOldestToNewest.length,
      updatedAt: Date.now(),
      trainRatio,
      reports,
      overallPointInTimeHitRate,
      overallSignals,
      overallWins,
      overallNetUnits: Number(overallNetUnits.toFixed(2)),
      overallMaxDrawdown: Number(overallMaxDrawdown.toFixed(2)),
      recentOutcomes,
    },
    updatedStrategies,
  };
}
