import type {
  BetTargetType,
  Column,
  Dozen,
  Half,
  Parity,
  RouletteColor,
  WheelSector,
} from '../types/roulette';

/**
 * Authentic European Single-Zero Roulette wheel sequence (37 pockets clockwise).
 */
export const EUROPEAN_WHEEL_SEQUENCE: readonly number[] = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24,
  16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

export const RED_NUMBERS = new Set<number>([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export const BLACK_NUMBERS = new Set<number>([
  2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35,
]);

export const SECTOR_VOISINS = new Set<number>([
  22, 18, 29, 7, 28, 12, 35, 3, 26, 0, 32, 15, 19, 4, 21, 2, 25,
]);

export const SECTOR_TIERS = new Set<number>([
  27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33,
]);

export const SECTOR_ORPHELINS = new Set<number>([
  1, 20, 14, 31, 9, 17, 34, 6,
]);

export const SECTOR_ZERO_SPIEL = new Set<number>([
  12, 35, 3, 26, 0, 32, 15,
]);

/** Standard 3x12 European table layout rows (top-to-bottom from dealer perspective) */
export const TABLE_ROWS: readonly number[][] = [
  [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36], // Col 3
  [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35], // Col 2
  [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34], // Col 1
];

export function isValidRouletteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 36;
}

export function getNumberColor(n: number): RouletteColor {
  if (n === 0) return 'green';
  return RED_NUMBERS.has(n) ? 'red' : 'black';
}

export function getNumberDozen(n: number): Dozen {
  if (n === 0) return 'none';
  if (n <= 12) return '1st';
  if (n <= 24) return '2nd';
  return '3rd';
}

export function getNumberColumn(n: number): Column {
  if (n === 0) return 'none';
  const mod = n % 3;
  if (mod === 1) return 'col1';
  if (mod === 2) return 'col2';
  return 'col3';
}

export function getNumberParity(n: number): Parity {
  if (n === 0) return 'none';
  return n % 2 === 0 ? 'even' : 'odd';
}

export function getNumberHalf(n: number): Half {
  if (n === 0) return 'none';
  return n <= 18 ? 'low' : 'high';
}

export function getNumberSector(n: number): WheelSector {
  if (SECTOR_VOISINS.has(n)) return 'voisins';
  if (SECTOR_TIERS.has(n)) return 'tiers';
  return 'orphelins';
}

export function getWheelNeighbors(center: number, radius = 2): number[] {
  const idx = EUROPEAN_WHEEL_SEQUENCE.indexOf(center);
  if (idx === -1) return [];
  const total = EUROPEAN_WHEEL_SEQUENCE.length;
  const result: number[] = [];
  for (let offset = -radius; offset <= radius; offset++) {
    const wrapped = (idx + offset + total) % total;
    result.push(EUROPEAN_WHEEL_SEQUENCE[wrapped]);
  }
  return result;
}

export function getCoveredNumbersForTarget(
  target: BetTargetType,
  options?: { neighborCenter?: number; neighborRadius?: number; straightNumbers?: number[] }
): number[] {
  switch (target) {
    case 'red':
      return Array.from(RED_NUMBERS);
    case 'black':
      return Array.from(BLACK_NUMBERS);
    case 'even':
      return Array.from({ length: 18 }, (_, i) => (i + 1) * 2);
    case 'odd':
      return Array.from({ length: 18 }, (_, i) => i * 2 + 1);
    case 'low':
      return Array.from({ length: 18 }, (_, i) => i + 1);
    case 'high':
      return Array.from({ length: 18 }, (_, i) => i + 19);
    case 'dozen_1':
      return Array.from({ length: 12 }, (_, i) => i + 1);
    case 'dozen_2':
      return Array.from({ length: 12 }, (_, i) => i + 13);
    case 'dozen_3':
      return Array.from({ length: 12 }, (_, i) => i + 25);
    case 'col_1':
      return Array.from({ length: 12 }, (_, i) => i * 3 + 1);
    case 'col_2':
      return Array.from({ length: 12 }, (_, i) => i * 3 + 2);
    case 'col_3':
      return Array.from({ length: 12 }, (_, i) => i * 3 + 3);
    case 'sector_voisins':
      return Array.from(SECTOR_VOISINS);
    case 'sector_tiers':
      return Array.from(SECTOR_TIERS);
    case 'sector_orphelins':
      return Array.from(SECTOR_ORPHELINS);
    case 'sector_zero_spiel':
      return Array.from(SECTOR_ZERO_SPIEL);
    case 'neighbors':
      return getWheelNeighbors(options?.neighborCenter ?? 0, options?.neighborRadius ?? 2);
    case 'straight':
      return (options?.straightNumbers && options.straightNumbers.length > 0
        ? options.straightNumbers
        : [0]
      ).filter(isValidRouletteNumber);
  }
}

export const BET_TARGET_LABELS: Record<BetTargetType, string> = {
  red: 'Vermelho',
  black: 'Preto',
  even: 'Par',
  odd: 'Ímpar',
  low: 'Baixo (1–18)',
  high: 'Alto (19–36)',
  dozen_1: '1ª Dúzia (1–12)',
  dozen_2: '2ª Dúzia (13–24)',
  dozen_3: '3ª Dúzia (25–36)',
  col_1: '1ª Coluna',
  col_2: '2ª Coluna',
  col_3: '3ª Coluna',
  sector_voisins: 'Voisins du Zéro',
  sector_tiers: 'Tiers du Cylindre',
  sector_orphelins: 'Orphelins',
  sector_zero_spiel: 'Zero Spiel (Jeu Zéro)',
  neighbors: 'Vizinhos na Roda',
  straight: 'Pleno / Fichas Diretas',
};

/**
 * Evaluates normalized net profit/loss (in units) for a 1-unit total stake distributed across covered numbers.
 * - Even money (18 numbers): +1 on win, -1 on loss
 * - Dozen / Column (12 numbers): +2 on win, -1 on loss
 * - Multi-number wheel bets (sector, neighbors, straight set):
 *   Splits 1 unit evenly across `k = covered.length` straight-up pockets -> win pays (36 / k) - 1, loss pays -1.
 */
export function evaluateTargetNetUnits(
  landedNumber: number,
  target: BetTargetType,
  coveredNumbers: number[]
): { won: boolean; netUnits: number } {
  const k = coveredNumbers.length;
  if (k === 0) return { won: false, netUnits: 0 };

  const won = coveredNumbers.includes(landedNumber);
  if (!won) {
    return { won: false, netUnits: -1 };
  }

  if (
    target === 'red' ||
    target === 'black' ||
    target === 'even' ||
    target === 'odd' ||
    target === 'low' ||
    target === 'high'
  ) {
    return { won: true, netUnits: 1 };
  }

  if (
    target === 'dozen_1' ||
    target === 'dozen_2' ||
    target === 'dozen_3' ||
    target === 'col_1' ||
    target === 'col_2' ||
    target === 'col_3'
  ) {
    return { won: true, netUnits: 2 };
  }

  // Normalized 1-unit total allocation across k covered straight numbers (36/k - 1)
  return { won: true, netUnits: Number((36 / k - 1).toFixed(4)) };
}

export function getTargetPayoutMultiplier(
  target: BetTargetType,
  coveredCount: number
): number {
  if (
    target === 'red' ||
    target === 'black' ||
    target === 'even' ||
    target === 'odd' ||
    target === 'low' ||
    target === 'high'
  ) {
    return 1;
  }
  if (
    target === 'dozen_1' ||
    target === 'dozen_2' ||
    target === 'dozen_3' ||
    target === 'col_1' ||
    target === 'col_2' ||
    target === 'col_3'
  ) {
    return 2;
  }
  if (coveredCount <= 0) return 0;
  return Number((36 / coveredCount - 1).toFixed(2));
}

export function getTheoreticalHitRate(target: BetTargetType, coveredCount: number): number {
  if (coveredCount <= 0) return 0;
  return Number(((coveredCount / 37) * 100).toFixed(2));
}
