import type { BankrollConfig, BankrollSessionState, SpinEntry } from '../types/roulette';

export const DEFAULT_BANKROLL_CONFIG: BankrollConfig = {
  initialBankroll: 1000,
  baseChip: 10,
  stopLossAmount: 200,
  profitTargetAmount: 250,
  pauseAfterConsecutiveLosses: 3,
  antiMartingaleProtection: true,
  currencySymbol: 'Kz',
};

/**
 * Computes real-time session bankroll state strictly from session spins that had an active ENTRAR decision.
 */
export function computeBankrollState(
  config: BankrollConfig,
  spins: SpinEntry[]
): BankrollSessionState {
  let sessionNetProfit = 0;
  let consecutiveLosses = 0;
  let consecutiveWins = 0;
  let totalBetsPlaced = 0;
  let betsWon = 0;
  let betsLost = 0;
  let peakProfit = 0;
  let maxSessionDrawdown = 0;

  for (const spin of spins) {
    if (spin.originBucket !== 'session') continue;
    const pred = spin.predictionResult;
    if (!pred || pred.action !== 'ENTRAR' || pred.outcome === 'SKIP') continue;

    const stake = config.baseChip;
    const profit = pred.netUnits * stake;
    sessionNetProfit += profit;
    totalBetsPlaced++;

    if (pred.outcome === 'OK') {
      betsWon++;
      consecutiveWins++;
      consecutiveLosses = 0;
    } else if (pred.outcome === 'X') {
      betsLost++;
      consecutiveLosses++;
      consecutiveWins = 0;
    }

    if (sessionNetProfit > peakProfit) {
      peakProfit = sessionNetProfit;
    }
    const drawdown = peakProfit - sessionNetProfit;
    if (drawdown > maxSessionDrawdown) {
      maxSessionDrawdown = drawdown;
    }
  }

  const currentBankroll = Number((config.initialBankroll + sessionNetProfit).toFixed(2));
  const stopLossReached =
    config.stopLossAmount > 0 && sessionNetProfit <= -Math.abs(config.stopLossAmount);
  const profitTargetReached =
    config.profitTargetAmount > 0 && sessionNetProfit >= Math.abs(config.profitTargetAmount);
  const lossStreakTriggered =
    config.pauseAfterConsecutiveLosses > 0 &&
    consecutiveLosses >= config.pauseAfterConsecutiveLosses;

  let isPaused = false;
  let pauseReason: string | null = null;

  if (stopLossReached) {
    isPaused = true;
    pauseReason = `Stop-loss atingido (${config.currencySymbol} ${sessionNetProfit.toFixed(0)}). Proteção de banca ativa.`;
  } else if (profitTargetReached) {
    isPaused = true;
    pauseReason = `Meta de lucro alcançada (+${config.currencySymbol} ${sessionNetProfit.toFixed(0)}). Recomendado encerrar sessão.`;
  } else if (lossStreakTriggered) {
    isPaused = true;
    pauseReason = `Pausa automática após ${consecutiveLosses} perdas consecutivas (limite configurado: ${config.pauseAfterConsecutiveLosses}).`;
  }

  return {
    currentBankroll,
    sessionNetProfit: Number(sessionNetProfit.toFixed(2)),
    consecutiveLosses,
    consecutiveWins,
    totalBetsPlaced,
    betsWon,
    betsLost,
    isPaused,
    pauseReason,
    stopLossReached,
    profitTargetReached,
    maxSessionDrawdown: Number(maxSessionDrawdown.toFixed(2)),
    peakProfit: Number(peakProfit.toFixed(2)),
  };
}

/**
 * Anti-Martingale sizing: never doubles stake after losses. Keeps 1 unit flat or conservative cap.
 */
export function getRecommendedUnitSize(
  config: BankrollConfig,
  state: BankrollSessionState
): number {
  if (state.isPaused) return 0;
  if (config.antiMartingaleProtection) {
    // Strictly flat 1 unit when anti-Martingale protection is enabled, or 1.5x cap only after 2+ wins if bankroll is positive
    if (state.consecutiveWins >= 2 && state.sessionNetProfit > 0) {
      return 1;
    }
    return 1;
  }
  return 1;
}
