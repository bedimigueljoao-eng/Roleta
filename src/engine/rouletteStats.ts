import type {
  CategoryStat,
  NumberStat,
  RouletteStatsSummary,
  SpinEntry,
} from '../types/roulette';
import {
  getNumberColor,
  getNumberColumn,
  getNumberDozen,
  getNumberHalf,
  getNumberParity,
  SECTOR_ORPHELINS,
  SECTOR_TIERS,
  SECTOR_VOISINS,
  SECTOR_ZERO_SPIEL,
} from './rouletteConstants';

function buildCategoryStat(
  numbers: number[],
  key: string,
  label: string,
  theoreticalPercent: number,
  predicate: (n: number) => boolean
): CategoryStat {
  const total = numbers.length;
  let count = 0;
  let currentAbsence = 0;
  let maxAbsence = 0;
  let runningAbsence = 0;
  let currentStreak = 0;
  let maxStreak = 0;
  let runningStreak = 0;

  // numbers are ordered oldest -> newest
  for (let i = 0; i < total; i++) {
    const hit = predicate(numbers[i]);
    if (hit) {
      count++;
      runningAbsence = 0;
      runningStreak++;
      if (runningStreak > maxStreak) maxStreak = runningStreak;
    } else {
      runningStreak = 0;
      runningAbsence++;
      if (runningAbsence > maxAbsence) maxAbsence = runningAbsence;
    }
  }

  currentAbsence = runningAbsence;
  currentStreak = runningStreak;

  const frequencyPercent = total > 0 ? Number(((count / total) * 100).toFixed(2)) : 0;
  const deviationPercent = Number((frequencyPercent - theoreticalPercent).toFixed(2));

  return {
    key,
    label,
    count,
    frequencyPercent,
    theoreticalPercent,
    deviationPercent,
    currentAbsence,
    maxAbsence,
    currentStreak,
    maxStreak,
  };
}

/**
 * Computes full European Roulette statistical distribution and streaks.
 * Expects spins ordered oldest -> newest.
 */
export function computeRouletteStats(spins: SpinEntry[]): RouletteStatsSummary {
  const numbers = spins.map((s) => s.number);
  const n = numbers.length;
  const historicalCount = spins.filter((s) => s.originBucket === 'historical').length;
  const sessionCount = spins.filter((s) => s.originBucket === 'session').length;

  const theoreticalSingle = Number(((1 / 37) * 100).toFixed(2)); // 2.70%
  const theoretical18 = Number(((18 / 37) * 100).toFixed(2)); // 48.65%
  const theoretical12 = Number(((12 / 37) * 100).toFixed(2)); // 32.43%
  const theoreticalVoisins = Number(((17 / 37) * 100).toFixed(2)); // 45.95%
  const theoreticalTiers = Number(((12 / 37) * 100).toFixed(2)); // 32.43%
  const theoreticalOrphelins = Number(((8 / 37) * 100).toFixed(2)); // 21.62%
  const theoreticalZeroSpiel = Number(((7 / 37) * 100).toFixed(2)); // 18.92%

  const numberStats: NumberStat[] = [];
  let chiSquareScore = 0;
  const expectedPerPocket = n / 37;

  for (let num = 0; num <= 36; num++) {
    let count = 0;
    let lastIdx = -1;
    let maxAbsence = 0;
    let runningAbsence = 0;

    for (let i = 0; i < n; i++) {
      if (numbers[i] === num) {
        count++;
        lastIdx = i;
        runningAbsence = 0;
      } else {
        runningAbsence++;
        if (runningAbsence > maxAbsence) maxAbsence = runningAbsence;
      }
    }

    if (expectedPerPocket > 0) {
      chiSquareScore += Math.pow(count - expectedPerPocket, 2) / expectedPerPocket;
    }

    const frequencyPercent = n > 0 ? Number(((count / n) * 100).toFixed(2)) : 0;
    const deviationPercent = Number((frequencyPercent - theoreticalSingle).toFixed(2));
    const lastSeenAgo = lastIdx === -1 ? n : n - 1 - lastIdx;

    numberStats.push({
      number: num,
      count,
      frequencyPercent,
      theoreticalPercent: theoreticalSingle,
      deviationPercent,
      lastSeenAgo,
      maxAbsence,
    });
  }

  const hotNumbers = [...numberStats]
    .sort((a, b) => b.count - a.count || a.lastSeenAgo - b.lastSeenAgo)
    .slice(0, 6);

  const coldNumbers = [...numberStats]
    .sort((a, b) => a.count - b.count || b.lastSeenAgo - a.lastSeenAgo)
    .slice(0, 6);

  const colors: CategoryStat[] = [
    buildCategoryStat(numbers, 'red', 'Vermelho', theoretical18, (x) => getNumberColor(x) === 'red'),
    buildCategoryStat(numbers, 'black', 'Preto', theoretical18, (x) => getNumberColor(x) === 'black'),
    buildCategoryStat(numbers, 'green', 'Zero (0)', theoreticalSingle, (x) => x === 0),
  ];

  const dozens: CategoryStat[] = [
    buildCategoryStat(numbers, 'dozen_1', '1ª Dúzia (1–12)', theoretical12, (x) => getNumberDozen(x) === '1st'),
    buildCategoryStat(numbers, 'dozen_2', '2ª Dúzia (13–24)', theoretical12, (x) => getNumberDozen(x) === '2nd'),
    buildCategoryStat(numbers, 'dozen_3', '3ª Dúzia (25–36)', theoretical12, (x) => getNumberDozen(x) === '3rd'),
  ];

  const columns: CategoryStat[] = [
    buildCategoryStat(numbers, 'col_1', '1ª Coluna', theoretical12, (x) => getNumberColumn(x) === 'col1'),
    buildCategoryStat(numbers, 'col_2', '2ª Coluna', theoretical12, (x) => getNumberColumn(x) === 'col2'),
    buildCategoryStat(numbers, 'col_3', '3ª Coluna', theoretical12, (x) => getNumberColumn(x) === 'col3'),
  ];

  const parities: CategoryStat[] = [
    buildCategoryStat(numbers, 'even', 'Par', theoretical18, (x) => getNumberParity(x) === 'even'),
    buildCategoryStat(numbers, 'odd', 'Ímpar', theoretical18, (x) => getNumberParity(x) === 'odd'),
  ];

  const halves: CategoryStat[] = [
    buildCategoryStat(numbers, 'low', 'Baixo (1–18)', theoretical18, (x) => getNumberHalf(x) === 'low'),
    buildCategoryStat(numbers, 'high', 'Alto (19–36)', theoretical18, (x) => getNumberHalf(x) === 'high'),
  ];

  const sectors: CategoryStat[] = [
    buildCategoryStat(numbers, 'sector_voisins', 'Voisins du Zéro (17)', theoreticalVoisins, (x) => SECTOR_VOISINS.has(x)),
    buildCategoryStat(numbers, 'sector_tiers', 'Tiers du Cylindre (12)', theoreticalTiers, (x) => SECTOR_TIERS.has(x)),
    buildCategoryStat(numbers, 'sector_orphelins', 'Orphelins (8)', theoreticalOrphelins, (x) => SECTOR_ORPHELINS.has(x)),
    buildCategoryStat(numbers, 'sector_zero_spiel', 'Zero Spiel (7)', theoreticalZeroSpiel, (x) => SECTOR_ZERO_SPIEL.has(x)),
  ];

  return {
    sampleSize: n,
    historicalCount,
    sessionCount,
    numberStats,
    hotNumbers,
    coldNumbers,
    colors,
    dozens,
    columns,
    parities,
    halves,
    sectors,
    chiSquareScore: Number(chiSquareScore.toFixed(2)),
    independenceNotice:
      'Aviso de Independência Estatística: Cada giro da Roleta Europeia (0–36) é um evento independente (1/37 por número; 18/37 nas chances simples; 12/37 nas dúzias/colunas). Desvios observados na amostra (n) medem apenas variação passada e não alteram a probabilidade física do próximo giro.',
  };
}
