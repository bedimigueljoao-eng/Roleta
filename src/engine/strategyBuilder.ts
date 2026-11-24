import type {
  BankrollConfig,
  BankrollSessionState,
  BetTargetType,
  MasterRecommendation,
  RouletteStrategy,
  StrategySignal,
  StrategyTrigger,
  TriggerSubject,
} from '../types/roulette';
import {
  BET_TARGET_LABELS,
  getCoveredNumbersForTarget,
  getNumberColor,
  getNumberParity,
  getTargetPayoutMultiplier,
} from './rouletteConstants';
import { getRecommendedUnitSize } from './rouletteBankroll';

export const BUILTIN_STRATEGIES: RouletteStrategy[] = [
  {
    id: 'builtin_color_absence_5',
    name: 'Reversão de Ausência de Cor (≥ 5)',
    description:
      'Entra na cor ausente quando Vermelho ou Preto acumula 5 ou mais giros consecutivos sem aparecer.',
    isBuiltin: true,
    enabled: true,
    triggers: [
      {
        id: 't1',
        type: 'absence_streak',
        subject: 'any_color',
        threshold: 5,
      },
    ],
    triggerLogic: 'ALL',
    betTarget: 'red',
    baseWeight: 1.0,
    learnedWeight: 1.0,
    minConfidenceToEnter: 58,
    maxVolatilityPause: true,
    createdAt: 1700000000000,
    version: 1,
  },
  {
    id: 'builtin_dozen_gap_7',
    name: 'Dúzia em Atraso Prolongado (≥ 7)',
    description:
      'Detecta quando uma dúzia (1–12, 13–24 ou 25–36) fica ausente por 7+ giros seguidos e aposta na sua retomada.',
    isBuiltin: true,
    enabled: true,
    triggers: [
      {
        id: 't2',
        type: 'dozen_gap',
        subject: 'any_dozen',
        threshold: 7,
      },
    ],
    triggerLogic: 'ALL',
    betTarget: 'dozen_1',
    baseWeight: 1.0,
    learnedWeight: 1.0,
    minConfidenceToEnter: 60,
    maxVolatilityPause: true,
    createdAt: 1700000000001,
    version: 1,
  },
  {
    id: 'builtin_post_zero_voisins',
    name: 'Pós-Zero · Setor Voisins du Zéro',
    description:
      'Após a saída do 0 nos últimos 2 giros, acompanha a zona física Voisins du Zéro na roda europeia.',
    isBuiltin: true,
    enabled: true,
    triggers: [
      {
        id: 't3',
        type: 'zero_hit',
        subject: 'sector_voisins',
        threshold: 2,
      },
    ],
    triggerLogic: 'ALL',
    betTarget: 'sector_voisins',
    baseWeight: 0.95,
    learnedWeight: 0.95,
    minConfidenceToEnter: 55,
    maxVolatilityPause: false,
    createdAt: 1700000000002,
    version: 1,
  },
  {
    id: 'builtin_hot_tiers_sector',
    name: 'Fluxo Quente · Tiers du Cylindre',
    description:
      'Entra no setor Tiers du Cylindre quando sua frequência nos últimos 18 giros supera o esperado em 45%+.',
    isBuiltin: true,
    enabled: true,
    triggers: [
      {
        id: 't4',
        type: 'hot_sector',
        subject: 'sector_tiers',
        threshold: 8,
        lookbackWindow: 18,
      },
    ],
    triggerLogic: 'ALL',
    betTarget: 'sector_tiers',
    baseWeight: 0.9,
    learnedWeight: 0.9,
    minConfidenceToEnter: 56,
    maxVolatilityPause: true,
    createdAt: 1700000000003,
    version: 1,
  },
  {
    id: 'builtin_parity_alternation',
    name: 'Quebra de Alternância Par / Ímpar',
    description:
      'Identifica sequência de 4+ alternâncias consecutivas entre Par e Ímpar e aposta na quebra de padrão.',
    isBuiltin: true,
    enabled: true,
    triggers: [
      {
        id: 't5',
        type: 'alternation_break',
        subject: 'any_parity',
        threshold: 4,
      },
    ],
    triggerLogic: 'ALL',
    betTarget: 'even',
    baseWeight: 0.85,
    learnedWeight: 0.85,
    minConfidenceToEnter: 54,
    maxVolatilityPause: true,
    createdAt: 1700000000004,
    version: 1,
  },
  {
    id: 'builtin_col_absence_6',
    name: 'Coluna Fria (≥ 6 giros)',
    description:
      'Monitora colunas ausentes por 6 ou mais rodadas e sinaliza entrada na coluna mais atrasada.',
    isBuiltin: true,
    enabled: false,
    triggers: [
      {
        id: 't6',
        type: 'absence_streak',
        subject: 'any_column',
        threshold: 6,
      },
    ],
    triggerLogic: 'ALL',
    betTarget: 'col_1',
    baseWeight: 0.9,
    learnedWeight: 0.9,
    minConfidenceToEnter: 58,
    maxVolatilityPause: true,
    createdAt: 1700000000005,
    version: 1,
  },
];

function countTrailingAbsence(numbers: number[], target: BetTargetType): number {
  const covered = new Set(getCoveredNumbersForTarget(target));
  let absence = 0;
  for (let i = numbers.length - 1; i >= 0; i--) {
    if (covered.has(numbers[i])) break;
    absence++;
  }
  return absence;
}

function countTrailingRepeat(numbers: number[], target: BetTargetType): number {
  const covered = new Set(getCoveredNumbersForTarget(target));
  let streak = 0;
  for (let i = numbers.length - 1; i >= 0; i--) {
    if (!covered.has(numbers[i])) break;
    streak++;
  }
  return streak;
}

function resolveDynamicSubject(
  subject: TriggerSubject,
  numbers: number[],
  fallbackTarget: BetTargetType
): BetTargetType {
  if (subject === 'any_color') {
    const redAbs = countTrailingAbsence(numbers, 'red');
    const blackAbs = countTrailingAbsence(numbers, 'black');
    return redAbs >= blackAbs ? 'red' : 'black';
  }
  if (subject === 'any_dozen') {
    const d1 = countTrailingAbsence(numbers, 'dozen_1');
    const d2 = countTrailingAbsence(numbers, 'dozen_2');
    const d3 = countTrailingAbsence(numbers, 'dozen_3');
    if (d1 >= d2 && d1 >= d3) return 'dozen_1';
    if (d2 >= d1 && d2 >= d3) return 'dozen_2';
    return 'dozen_3';
  }
  if (subject === 'any_column') {
    const c1 = countTrailingAbsence(numbers, 'col_1');
    const c2 = countTrailingAbsence(numbers, 'col_2');
    const c3 = countTrailingAbsence(numbers, 'col_3');
    if (c1 >= c2 && c1 >= c3) return 'col_1';
    if (c2 >= c1 && c2 >= c3) return 'col_2';
    return 'col_3';
  }
  if (subject === 'any_parity') {
    const lastNonZero = [...numbers].reverse().find((n) => n !== 0);
    if (lastNonZero === undefined) return fallbackTarget;
    // If alternating Par/Impar, breaking alternation means repeating the last parity
    return getNumberParity(lastNonZero) === 'even' ? 'even' : 'odd';
  }
  return subject;
}

function evaluateSingleTrigger(
  trigger: StrategyTrigger,
  numbers: number[],
  strategyTarget: BetTargetType
): {
  matched: boolean;
  strength: number;
  roundsRemaining: number;
  resolvedTarget?: BetTargetType;
  note: string;
} {
  if (numbers.length === 0) {
    return {
      matched: false,
      strength: 0,
      roundsRemaining: trigger.threshold,
      note: 'Aguardando giros iniciais.',
    };
  }

  const resolvedTarget = resolveDynamicSubject(trigger.subject, numbers, strategyTarget);

  switch (trigger.type) {
    case 'absence_streak':
    case 'dozen_gap': {
      const absence = countTrailingAbsence(numbers, resolvedTarget);
      const matched = absence >= trigger.threshold;
      const roundsRemaining = Math.max(0, trigger.threshold - absence);
      const strength = Math.min(100, Math.round((absence / Math.max(1, trigger.threshold)) * 68));
      return {
        matched,
        strength,
        roundsRemaining,
        resolvedTarget,
        note: `${BET_TARGET_LABELS[resolvedTarget]} ausente há ${absence} giros (gatilho ≥ ${trigger.threshold}).`,
      };
    }

    case 'repeat_streak': {
      const streak = countTrailingRepeat(numbers, resolvedTarget);
      const matched = streak >= trigger.threshold;
      const roundsRemaining = Math.max(0, trigger.threshold - streak);
      const strength = Math.min(100, Math.round((streak / Math.max(1, trigger.threshold)) * 65));
      return {
        matched,
        strength,
        roundsRemaining,
        resolvedTarget,
        note: `${BET_TARGET_LABELS[resolvedTarget]} repetido ${streak}x seguidas (gatilho ≥ ${trigger.threshold}).`,
      };
    }

    case 'zero_hit': {
      const lookback = Math.max(1, trigger.threshold);
      const slice = numbers.slice(-lookback);
      const hasZero = slice.includes(0);
      return {
        matched: hasZero,
        strength: hasZero ? 66 : 20,
        roundsRemaining: hasZero ? 0 : 1,
        resolvedTarget: strategyTarget,
        note: hasZero
          ? `Zero (0) saiu nos últimos ${lookback} giros.`
          : `Zero (0) não ocorreu nos últimos ${lookback} giros.`,
      };
    }

    case 'hot_sector': {
      const win = trigger.lookbackWindow ?? 20;
      const slice = numbers.slice(-win);
      const covered = new Set(getCoveredNumbersForTarget(resolvedTarget));
      const hits = slice.filter((n) => covered.has(n)).length;
      const matched = slice.length >= Math.min(8, win) && hits >= trigger.threshold;
      const roundsRemaining = matched ? 0 : Math.max(1, trigger.threshold - hits);
      const strength = Math.min(100, Math.round((hits / Math.max(1, trigger.threshold)) * 64));
      return {
        matched,
        strength,
        roundsRemaining,
        resolvedTarget,
        note: `${BET_TARGET_LABELS[resolvedTarget]} com ${hits} acertos em ${slice.length} giros (mín. ${trigger.threshold}).`,
      };
    }

    case 'cold_sector': {
      const win = trigger.lookbackWindow ?? 20;
      const slice = numbers.slice(-win);
      const covered = new Set(getCoveredNumbersForTarget(resolvedTarget));
      const hits = slice.filter((n) => covered.has(n)).length;
      const matched = slice.length >= Math.min(10, win) && hits <= trigger.threshold;
      const roundsRemaining = matched ? 0 : Math.max(1, hits - trigger.threshold);
      const strength = matched ? 64 : 25;
      return {
        matched,
        strength,
        roundsRemaining,
        resolvedTarget,
        note: `${BET_TARGET_LABELS[resolvedTarget]} com apenas ${hits} acertos em ${slice.length} giros (máx. ${trigger.threshold}).`,
      };
    }

    case 'hot_number': {
      const win = trigger.lookbackWindow ?? 37;
      const slice = numbers.slice(-win);
      const counts = new Map<number, number>();
      for (const n of slice) counts.set(n, (counts.get(n) ?? 0) + 1);
      let topNum = numbers[numbers.length - 1];
      let topCount = 0;
      counts.forEach((c, k) => {
        if (c > topCount) {
          topCount = c;
          topNum = k;
        }
      });
      const matched = topCount >= trigger.threshold;
      return {
        matched,
        strength: matched ? Math.min(90, 55 + topCount * 8) : 25,
        roundsRemaining: Math.max(0, trigger.threshold - topCount),
        resolvedTarget: strategyTarget,
        note: `Número #${topNum} apareceu ${topCount}x nos últimos ${slice.length} giros (gatilho ≥ ${trigger.threshold}).`,
      };
    }

    case 'alternation_break': {
      const recent = numbers.slice(-Math.max(trigger.threshold + 1, 6));
      let alternations = 0;
      if (trigger.subject === 'any_color') {
        for (let i = recent.length - 1; i > 0; i--) {
          const c1 = getNumberColor(recent[i]);
          const c2 = getNumberColor(recent[i - 1]);
          if (c1 !== 'green' && c2 !== 'green' && c1 !== c2) alternations++;
          else break;
        }
      } else {
        for (let i = recent.length - 1; i > 0; i--) {
          const p1 = getNumberParity(recent[i]);
          const p2 = getNumberParity(recent[i - 1]);
          if (p1 !== 'none' && p2 !== 'none' && p1 !== p2) alternations++;
          else break;
        }
      }
      const matched = alternations >= trigger.threshold;
      return {
        matched,
        strength: matched ? Math.min(88, 52 + alternations * 7) : 22,
        roundsRemaining: Math.max(0, trigger.threshold - alternations),
        resolvedTarget,
        note: `${alternations} alternâncias consecutivas detectadas (gatilho ≥ ${trigger.threshold}).`,
      };
    }
  }
}

/**
 * Pure causal signal evaluator: inspects only `historyOldestToNewest` up to now.
 */
export function evaluateStrategySignal(
  strategy: RouletteStrategy,
  historyOldestToNewest: number[]
): StrategySignal {
  if (historyOldestToNewest.length < 3 || strategy.triggers.length === 0) {
    return {
      strategyId: strategy.id,
      strategyName: strategy.name,
      action: 'AGUARDAR',
      betTarget: strategy.betTarget,
      coveredNumbers: getCoveredNumbersForTarget(strategy.betTarget, {
        neighborCenter: strategy.neighborCenter,
        neighborRadius: strategy.neighborRadius,
        straightNumbers: strategy.straightNumbers,
      }),
      rawConfidence: 0,
      weightedScore: 0,
      roundsRemaining: Math.max(1, 3 - historyOldestToNewest.length),
      reason: 'Amostra mínima de 3 giros necessária para avaliar gatilhos.',
    };
  }

  const results = strategy.triggers.map((tr) =>
    evaluateSingleTrigger(tr, historyOldestToNewest, strategy.betTarget)
  );

  const triggered =
    strategy.triggerLogic === 'ALL'
      ? results.every((r) => r.matched)
      : results.some((r) => r.matched);

  const roundsRemaining =
    strategy.triggerLogic === 'ALL'
      ? Math.max(...results.map((r) => r.roundsRemaining))
      : Math.min(...results.map((r) => r.roundsRemaining));

  const primarySubject = strategy.triggers[0]?.subject;
  const usesDynamicTarget =
    primarySubject === 'any_color' ||
    primarySubject === 'any_dozen' ||
    primarySubject === 'any_column' ||
    primarySubject === 'any_parity';

  const effectiveTarget =
    usesDynamicTarget && results[0]?.resolvedTarget
      ? results[0].resolvedTarget
      : strategy.betTarget;

  const coveredNumbers = getCoveredNumbersForTarget(effectiveTarget, {
    neighborCenter:
      effectiveTarget === 'neighbors'
        ? strategy.neighborCenter ?? historyOldestToNewest[historyOldestToNewest.length - 1]
        : undefined,
    neighborRadius: strategy.neighborRadius,
    straightNumbers: strategy.straightNumbers,
  });

  const avgStrength = Math.round(
    results.reduce((acc, r) => acc + r.strength, 0) / Math.max(1, results.length)
  );

  let volatilityBlocked = false;
  if (strategy.maxVolatilityPause && historyOldestToNewest.length >= 10) {
    const last10Zeros = historyOldestToNewest.slice(-10).filter((n) => n === 0).length;
    if (last10Zeros >= 2) {
      volatilityBlocked = true;
    }
  }

  const meetsConfidence = avgStrength >= strategy.minConfidenceToEnter;
  const shouldEnter = triggered && meetsConfidence && !volatilityBlocked;
  const weightedScore = shouldEnter ? avgStrength * strategy.learnedWeight : 0;

  let reason = results.map((r) => r.note).join(' ');
  if (volatilityBlocked) {
    reason = `Pausa de volatilidade ativa (2+ zeros nos últimos 10 giros). ${reason}`;
  } else if (triggered && !meetsConfidence) {
    reason = `Gatilho atingido, mas confiança (${avgStrength}%) abaixo do mínimo (${strategy.minConfidenceToEnter}%).`;
  }

  return {
    strategyId: strategy.id,
    strategyName: strategy.name,
    action: shouldEnter ? 'ENTRAR' : 'AGUARDAR',
    betTarget: effectiveTarget,
    coveredNumbers,
    rawConfidence: avgStrength,
    weightedScore,
    roundsRemaining: shouldEnter ? 0 : Math.max(1, roundsRemaining),
    reason,
  };
}

/**
 * Combines all enabled strategies weighted by continuous-learning `learnedWeight`,
 * applies bankroll guardrails, computes wait-horizon countdown and forced directional read.
 */
export function buildMasterRecommendation(
  strategies: RouletteStrategy[],
  historyOldestToNewest: number[],
  bankrollConfig: BankrollConfig,
  bankrollState: BankrollSessionState,
  minConfluenceRequired = 1
): MasterRecommendation {
  const sampleSize = historyOldestToNewest.length;
  const maxWaitCap = Math.max(1, bankrollConfig.maxWaitRounds || 6);

  if (bankrollState.isPaused) {
    return {
      action: 'AGUARDAR',
      betTarget: null,
      targetLabel: 'Sem Entrada (Banca Pausada)',
      coveredNumbers: [],
      confidence: 0,
      suggestedUnits: 0,
      payoutMultiplier: 0,
      roundsToWait: null,
      waitLabel: 'Sessão pausada por proteção de banca',
      forcedSuggestion: null,
      contributingSignals: [],
      reasons: [bankrollState.pauseReason ?? 'Proteção de banca ativa.'],
      blockedByBankroll: true,
      bankrollBlockReason: bankrollState.pauseReason ?? 'Proteção de banca ativa.',
      sampleSize,
    };
  }

  const enabled = strategies.filter((s) => s.enabled);
  if (enabled.length === 0) {
    return {
      action: 'AGUARDAR',
      betTarget: null,
      targetLabel: 'Nenhuma estratégia ativa',
      coveredNumbers: [],
      confidence: 0,
      suggestedUnits: 0,
      payoutMultiplier: 0,
      roundsToWait: null,
      waitLabel: 'Ative pelo menos 1 estratégia',
      forcedSuggestion: null,
      contributingSignals: [],
      reasons: ['Ative pelo menos uma estratégia no Criador de Estratégias.'],
      blockedByBankroll: false,
      sampleSize,
    };
  }

  const signals = enabled.map((s) => evaluateStrategySignal(s, historyOldestToNewest));
  const enterSignals = signals.filter((sig) => sig.action === 'ENTRAR');

  // Best directional lean even while waiting (used when user clicks "Ignorar Aguardar")
  const bestDirectionalSignal = [...signals].sort(
    (a, b) => b.rawConfidence - a.rawConfidence || a.roundsRemaining - b.roundsRemaining
  )[0];

  const forcedSuggestion = bestDirectionalSignal
    ? {
        betTarget: bestDirectionalSignal.betTarget,
        targetLabel: BET_TARGET_LABELS[bestDirectionalSignal.betTarget],
        coveredNumbers: bestDirectionalSignal.coveredNumbers,
        confidence: Math.max(35, bestDirectionalSignal.rawConfidence),
        payoutMultiplier: getTargetPayoutMultiplier(
          bestDirectionalSignal.betTarget,
          bestDirectionalSignal.coveredNumbers.length
        ),
        reason: bestDirectionalSignal.reason,
      }
    : null;

  if (enterSignals.length === 0 || enterSignals.length < minConfluenceRequired) {
    const minWait = Math.min(...signals.map((s) => Math.max(1, s.roundsRemaining)));
    const cappedWait = Math.min(maxWaitCap, minWait);
    const waitLabel =
      minWait > maxWaitCap
        ? `Aguardar até ${maxWaitCap} rodadas (gatilho estimado em ~${minWait})`
        : `Aguardar ~${cappedWait} rodada${cappedWait > 1 ? 's' : ''}`;

    return {
      action: 'AGUARDAR',
      betTarget: null,
      targetLabel: waitLabel,
      coveredNumbers: [],
      confidence: Math.max(
        0,
        ...signals.map((s) => Math.min(48, Math.round(s.rawConfidence * 0.7)))
      ),
      suggestedUnits: 0,
      payoutMultiplier: forcedSuggestion?.payoutMultiplier ?? 1,
      roundsToWait: cappedWait,
      waitLabel,
      forcedSuggestion,
      contributingSignals: signals,
      reasons:
        enterSignals.length > 0 && enterSignals.length < minConfluenceRequired
          ? [
              `Confluência insuficiente: ${enterSignals.length} sinal(is) ativo(s), mínimo exigido ${minConfluenceRequired}.`,
            ]
          : [
              bestDirectionalSignal
                ? `${waitLabel}. Mais próximo: ${bestDirectionalSignal.strategyName} (${bestDirectionalSignal.reason})`
                : 'Nenhum gatilho objetivo atingiu o limiar de entrada neste giro.',
            ],
      blockedByBankroll: false,
      sampleSize,
    };
  }

  // Group enter signals by betTarget and rank by total weighted score
  const targetScores = new Map<
    BetTargetType,
    { score: number; signals: StrategySignal[]; covered: number[] }
  >();

  for (const sig of enterSignals) {
    const existing = targetScores.get(sig.betTarget);
    if (existing) {
      existing.score += sig.weightedScore;
      existing.signals.push(sig);
    } else {
      targetScores.set(sig.betTarget, {
        score: sig.weightedScore,
        signals: [sig],
        covered: sig.coveredNumbers,
      });
    }
  }

  let bestTarget: BetTargetType | null = null;
  let bestGroup: { score: number; signals: StrategySignal[]; covered: number[] } | null = null;

  targetScores.forEach((group, target) => {
    if (!bestGroup || group.score > bestGroup.score) {
      bestTarget = target;
      bestGroup = group;
    }
  });

  if (!bestTarget || !bestGroup) {
    return {
      action: 'AGUARDAR',
      betTarget: null,
      targetLabel: 'Aguardar',
      coveredNumbers: [],
      confidence: 0,
      suggestedUnits: 0,
      payoutMultiplier: 0,
      roundsToWait: 1,
      waitLabel: 'Aguardar 1 rodada',
      forcedSuggestion,
      contributingSignals: signals,
      reasons: ['Sem consenso válido entre estratégias.'],
      blockedByBankroll: false,
      sampleSize,
    };
  }

  const chosen = bestGroup as { score: number; signals: StrategySignal[]; covered: number[] };
  const avgConfidence = Math.min(
    94,
    Math.round(
      chosen.signals.reduce((acc, s) => acc + s.rawConfidence, 0) / chosen.signals.length +
        (chosen.signals.length > 1 ? 6 : 0)
    )
  );

  const unitSize = getRecommendedUnitSize(bankrollConfig, bankrollState);
  const payoutMultiplier = getTargetPayoutMultiplier(bestTarget, chosen.covered.length);

  return {
    action: 'ENTRAR',
    betTarget: bestTarget,
    targetLabel: BET_TARGET_LABELS[bestTarget],
    coveredNumbers: chosen.covered,
    confidence: avgConfidence,
    suggestedUnits: unitSize,
    payoutMultiplier,
    roundsToWait: 0,
    waitLabel: 'Entrada confirmada agora',
    forcedSuggestion,
    contributingSignals: chosen.signals,
    reasons: chosen.signals.map((s) => `${s.strategyName}: ${s.reason}`),
    blockedByBankroll: false,
    sampleSize,
  };
}

// CRUD helpers for Strategy Builder
export function createCustomStrategy(
  input: Omit<RouletteStrategy, 'id' | 'isBuiltin' | 'createdAt' | 'version' | 'learnedWeight'>
): RouletteStrategy {
  return {
    ...input,
    id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    isBuiltin: false,
    learnedWeight: input.baseWeight,
    createdAt: Date.now(),
    version: 1,
  };
}

export function duplicateStrategy(strategy: RouletteStrategy): RouletteStrategy {
  return {
    ...strategy,
    id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: `${strategy.name} (Cópia)`,
    isBuiltin: false,
    createdAt: Date.now(),
    version: strategy.version + 1,
    parentId: strategy.id,
  };
}
