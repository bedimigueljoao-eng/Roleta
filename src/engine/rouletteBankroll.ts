import type { BankrollConfig, BankrollSessionState, SpinEntry } from '../types/roulette';

export const DEFAULT_BANKROLL_CONFIG: BankrollConfig = {
  initialBankroll: 1000,
  baseChip: 20,
  minBetPercent: 2,
  minBetFloor: 10,
  maxWaitRounds: 6,
  stopLossAmount: 200,
  profitTargetAmount: 250,
  pauseAfterConsecutiveLosses: 3,
  antiMartingaleProtection: true,
  currencySymbol: 'Kz',
  apiServerUrl: '',
};

/**
 * Computes real-time session bankroll state combining strategy signal stats
 * and user-confirmed real wagers ("Apostei").
 */
export function computeBankrollState(
  config: BankrollConfig,
  spins: SpinEntry[]
): BankrollSessionState {
  let simNetProfit = 0;
  let consecutiveLosses = 0;
  let consecutiveWins = 0;
  let totalBetsPlaced = 0;
  let betsWon = 0;
  let betsLost = 0;
  let peakProfit = 0;
  let maxSessionDrawdown = 0;

  let realBetsPlaced = 0;
  let realBetsWon = 0;
  let realBetsLost = 0;
  let realTotalWonAmount = 0;
  let realTotalLostAmount = 0;
  let realNetProfit = 0;

  for (const spin of spins) {
    if (spin.originBucket !== 'session') continue;

    // 1. User-confirmed real bets ("Apostei")
    if (spin.realBet) {
      realBetsPlaced++;
      realNetProfit += spin.realBet.profitAmount;
      if (spin.realBet.won) {
        realBetsWon++;
        realTotalWonAmount += spin.realBet.profitAmount;
      } else {
        realBetsLost++;
        realTotalLostAmount += Math.abs(spin.realBet.profitAmount);
      }
    }

    // 2. Strategy signals
    const pred = spin.predictionResult;
    if (!pred || pred.action !== 'ENTRAR' || pred.outcome === 'SKIP') continue;

    const stake = config.baseChip;
    const profit = pred.netUnits * stake;
    simNetProfit += profit;
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

    const activeTrackProfit = realBetsPlaced > 0 ? realNetProfit : simNetProfit;
    if (activeTrackProfit > peakProfit) {
      peakProfit = activeTrackProfit;
    }
    const drawdown = peakProfit - activeTrackProfit;
    if (drawdown > maxSessionDrawdown) {
      maxSessionDrawdown = drawdown;
    }
  }

  // If user has placed real confirmed bets via "Apostei", bankroll reflects real balance!
  const effectiveNetProfit = realBetsPlaced > 0 ? realNetProfit : simNetProfit;
  const currentBankroll = Number(
    Math.max(0, config.initialBankroll + effectiveNetProfit).toFixed(2)
  );

  // Recommended minimum stake strategy: max(table floor, bankroll * minBetPercent%)
  const pctStake = Math.round((currentBankroll * (config.minBetPercent || 2)) / 100);
  const minRecommendedBet = Math.max(config.minBetFloor || 10, pctStake);

  const stopLossReached =
    config.stopLossAmount > 0 && effectiveNetProfit <= -Math.abs(config.stopLossAmount);
  const profitTargetReached =
    config.profitTargetAmount > 0 && effectiveNetProfit >= Math.abs(config.profitTargetAmount);
  const lossStreakTriggered =
    config.pauseAfterConsecutiveLosses > 0 &&
    consecutiveLosses >= config.pauseAfterConsecutiveLosses;

  let isPaused = false;
  let pauseReason: string | null = null;

  if (stopLossReached) {
    isPaused = true;
    pauseReason = `Stop-loss atingido (${config.currencySymbol} ${effectiveNetProfit.toFixed(0)}). Proteção de banca ativa.`;
  } else if (profitTargetReached) {
    isPaused = true;
    pauseReason = `Meta de lucro alcançada (+${config.currencySymbol} ${effectiveNetProfit.toFixed(0)}). Recomendado encerrar sessão.`;
  } else if (lossStreakTriggered) {
    isPaused = true;
    pauseReason = `Pausa automática após ${consecutiveLosses} perdas consecutivas (limite: ${config.pauseAfterConsecutiveLosses}).`;
  }

  return {
    currentBankroll,
    sessionNetProfit: Number(effectiveNetProfit.toFixed(2)),
    consecutiveLosses,
    consecutiveWins,
    totalBetsPlaced,
    betsWon,
    betsLost,
    realBetsPlaced,
    realBetsWon,
    realBetsLost,
    realTotalWonAmount: Number(realTotalWonAmount.toFixed(2)),
    realTotalLostAmount: Number(realTotalLostAmount.toFixed(2)),
    realNetProfit: Number(realNetProfit.toFixed(2)),
    minRecommendedBet,
    isPaused,
    pauseReason,
    stopLossReached,
    profitTargetReached,
    maxSessionDrawdown: Number(maxSessionDrawdown.toFixed(2)),
    peakProfit: Number(peakProfit.toFixed(2)),
  };
}

/**
 * Anti-Martingale sizing: never doubles stake after losses. Keeps 1 unit flat.
 */
export function getRecommendedUnitSize(
  config: BankrollConfig,
  state: BankrollSessionState
): number {
  if (state.isPaused) return 0;
  if (config.antiMartingaleProtection) {
    return 1;
  }
  return 1;
}
