import type {
  OptimizationProposal,
  RouletteStrategy,
  StrategyEvaluationReport,
  StrategySnapshot,
} from '../types/roulette';
import { evaluateStrategyPointInTime } from './continuousLearning';

/**
 * Generates concrete, testable optimization proposals by simulating candidate variations
 * strictly point-in-time against the current spin history.
 */
export function generateOptimizationProposals(
  strategies: RouletteStrategy[],
  reports: StrategyEvaluationReport[],
  numbersOldestToNewest: number[]
): OptimizationProposal[] {
  if (numbersOldestToNewest.length < 30) {
    return [];
  }

  const proposals: OptimizationProposal[] = [];

  for (const strategy of strategies) {
    const baseline = reports.find((r) => r.strategyId === strategy.id);
    if (!baseline) continue;

    // Candidate 1: Increase trigger threshold by +1 or +2 to reduce noise and drawdown
    if (strategy.triggers.length > 0 && strategy.triggers[0].threshold < 10) {
      const candidate: RouletteStrategy = {
        ...strategy,
        triggers: strategy.triggers.map((t, idx) =>
          idx === 0 ? { ...t, threshold: t.threshold + 1 } : t
        ),
      };
      const sim = evaluateStrategyPointInTime(candidate, numbersOldestToNewest).report;
      const improvesRoiOrDd =
        sim.roi > baseline.roi + 1 ||
        (sim.maxDrawdownUnits < baseline.maxDrawdownUnits - 1 && sim.totalSignals >= 5);

      if (improvesRoiOrDd) {
        proposals.push({
          id: `opt_thresh_${strategy.id}_${Date.now()}`,
          strategyId: strategy.id,
          strategyName: strategy.name,
          title: `Elevar limiar do gatilho (${strategy.triggers[0].threshold} → ${
            strategy.triggers[0].threshold + 1
          })`,
          rationale: `Filtrar entradas precoces aumenta a seletividade e melhora ROI de ${baseline.roi}% para ${sim.roi}% na amostra atual.`,
          expectedImpact: `ROI ${sim.roi >= 0 ? '+' : ''}${sim.roi}% · MDD ${sim.maxDrawdownUnits}u`,
          patch: {
            name: `${strategy.name} (Limiar ${strategy.triggers[0].threshold + 1})`,
            triggers: candidate.triggers,
          },
          simulatedBaselineRoi: baseline.roi,
          simulatedProposedRoi: sim.roi,
          simulatedBaselineDrawdown: baseline.maxDrawdownUnits,
          simulatedProposedDrawdown: sim.maxDrawdownUnits,
          simulatedBaselineHitRate: baseline.hitRate,
          simulatedProposedHitRate: sim.hitRate,
        });
      }
    }

    // Candidate 2: Enable high-volatility pause if disabled
    if (!strategy.maxVolatilityPause) {
      const candidate: RouletteStrategy = {
        ...strategy,
        maxVolatilityPause: true,
      };
      const sim = evaluateStrategyPointInTime(candidate, numbersOldestToNewest).report;
      if (sim.maxDrawdownUnits <= baseline.maxDrawdownUnits && sim.roi >= baseline.roi) {
        proposals.push({
          id: `opt_vol_${strategy.id}_${Date.now()}`,
          strategyId: strategy.id,
          strategyName: strategy.name,
          title: 'Ativar pausa em alta volatilidade (2+ zeros)',
          rationale:
            'Evita operar durante clusters anômalos de Zero (0), reduzindo o drawdown máximo sem sacrificar retornos.',
          expectedImpact: `MDD ${baseline.maxDrawdownUnits}u → ${sim.maxDrawdownUnits}u`,
          patch: {
            name: `${strategy.name} (Anti-Volatilidade)`,
            maxVolatilityPause: true,
          },
          simulatedBaselineRoi: baseline.roi,
          simulatedProposedRoi: sim.roi,
          simulatedBaselineDrawdown: baseline.maxDrawdownUnits,
          simulatedProposedDrawdown: sim.maxDrawdownUnits,
          simulatedBaselineHitRate: baseline.hitRate,
          simulatedProposedHitRate: sim.hitRate,
        });
      }
    }

    // Candidate 3: Raise minConfidenceToEnter by +6% if hitRate is below theoretical
    if (baseline.hitRate < baseline.theoreticalHitRate && strategy.minConfidenceToEnter < 75) {
      const newMinConf = Math.min(82, strategy.minConfidenceToEnter + 6);
      const candidate: RouletteStrategy = {
        ...strategy,
        minConfidenceToEnter: newMinConf,
      };
      const sim = evaluateStrategyPointInTime(candidate, numbersOldestToNewest).report;
      if (sim.roi > baseline.roi || sim.hitRate > baseline.hitRate) {
        proposals.push({
          id: `opt_conf_${strategy.id}_${Date.now()}`,
          strategyId: strategy.id,
          strategyName: strategy.name,
          title: `Exigir confiança mínima maior (${strategy.minConfidenceToEnter}% → ${newMinConf}%)`,
          rationale:
            'Descarta sinais marginais de baixa força estatística e concentra apenas nas entradas mais maduras.',
          expectedImpact: `Acerto ${baseline.hitRate}% → ${sim.hitRate}%`,
          patch: {
            name: `${strategy.name} (Conf. ${newMinConf}%)`,
            minConfidenceToEnter: newMinConf,
          },
          simulatedBaselineRoi: baseline.roi,
          simulatedProposedRoi: sim.roi,
          simulatedBaselineDrawdown: baseline.maxDrawdownUnits,
          simulatedProposedDrawdown: sim.maxDrawdownUnits,
          simulatedBaselineHitRate: baseline.hitRate,
          simulatedProposedHitRate: sim.hitRate,
        });
      }
    }
  }

  return proposals.slice(0, 6);
}

export function applyProposalAsNewVariation(
  strategies: RouletteStrategy[],
  proposal: OptimizationProposal
): RouletteStrategy[] {
  const source = strategies.find((s) => s.id === proposal.strategyId);
  if (!source) return strategies;

  const newVariation: RouletteStrategy = {
    ...source,
    ...proposal.patch,
    id: `opt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    isBuiltin: false,
    enabled: true,
    createdAt: Date.now(),
    version: source.version + 1,
    parentId: source.id,
  };

  return [newVariation, ...strategies];
}

export function createEvolutionSnapshot(
  label: string,
  strategies: RouletteStrategy[],
  spinCount: number,
  overallHitRate: number,
  overallNetUnits: number,
  overallSignals: number
): StrategySnapshot {
  const overallRoi =
    overallSignals > 0 ? Number(((overallNetUnits / overallSignals) * 100).toFixed(2)) : 0;

  return {
    id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    createdAt: Date.now(),
    label,
    spinCount,
    strategyCount: strategies.length,
    overallHitRate,
    overallRoi,
    strategies: JSON.parse(JSON.stringify(strategies)),
  };
}
