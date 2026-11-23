import type { DemoDataset, SpinEntry, SpinSource } from '../types/roulette';
import { isValidRouletteNumber } from '../engine/rouletteConstants';

function mulberry32(seed: number) {
  let a = seed;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateBalancedEuropeanSpins(count: number, seed: number): number[] {
  const rng = mulberry32(seed);
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    result.push(Math.floor(rng() * 37));
  }
  return result;
}

function generateHighVolatilitySpins(count: number, seed: number): number[] {
  const rng = mulberry32(seed);
  const redPool = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  const blackPool = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];
  const result: number[] = [];
  let mode: 'neutral' | 'red_run' | 'black_run' = 'neutral';
  let modeLeft = 0;

  for (let i = 0; i < count; i++) {
    if (modeLeft <= 0) {
      const r = rng();
      if (r < 0.25) {
        mode = 'red_run';
        modeLeft = 5 + Math.floor(rng() * 4);
      } else if (r < 0.5) {
        mode = 'black_run';
        modeLeft = 5 + Math.floor(rng() * 4);
      } else {
        mode = 'neutral';
        modeLeft = 8;
      }
    }
    modeLeft--;

    if (rng() < 0.04) {
      result.push(0);
    } else if (mode === 'red_run') {
      result.push(redPool[Math.floor(rng() * redPool.length)]);
    } else if (mode === 'black_run') {
      result.push(blackPool[Math.floor(rng() * blackPool.length)]);
    } else {
      result.push(Math.floor(rng() * 37));
    }
  }
  return result;
}

function generateVoisinsClusterSpins(count: number, seed: number): number[] {
  const rng = mulberry32(seed);
  const voisinsPool = [22, 18, 29, 7, 28, 12, 35, 3, 26, 0, 32, 15, 19, 4, 21, 2, 25];
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    if (rng() < 0.6) {
      result.push(voisinsPool[Math.floor(rng() * voisinsPool.length)]);
    } else {
      result.push(Math.floor(rng() * 37));
    }
  }
  return result;
}

export const ROULETTE_DEMOS: DemoDataset[] = [
  {
    id: 'demo_500_balanced',
    name: 'Demo 500 Giros · Roleta Europeia Padrão',
    description:
      'Conjunto completo de 500 resultados (0–36) com distribuição europeia realista para validar aprendizagem contínua, janelas 50/100/300/500 e divisão treino/validação.',
    spinCount: 500,
    profile: 'Equilibrado (500 giros)',
    numbers: generateBalancedEuropeanSpins(500, 20261123),
  },
  {
    id: 'demo_300_volatility',
    name: 'Demo 300 Giros · Alta Volatilidade e Sequências',
    description:
      'Cenário com sequências longas de cor e ocorrência elevada de Zero (0) para testar gatilhos de ausência e pausas anti-volatilidade.',
    spinCount: 300,
    profile: 'Alta Volatilidade (300 giros)',
    numbers: generateHighVolatilitySpins(300, 991847),
  },
  {
    id: 'demo_250_voisins',
    name: 'Demo 250 Giros · Concentração Voisins & Zeros',
    description:
      'Amostra com maior incidência na zona física Voisins du Zéro e pós-zero para testar estratégias de setor da roda.',
    spinCount: 250,
    profile: 'Setor Físico (250 giros)',
    numbers: generateVoisinsClusterSpins(250, 774211),
  },
  {
    id: 'demo_60_quick',
    name: 'Demo 60 Giros · Sessão Rápida',
    description:
      'Amostra compacta de 60 giros para validação rápida de entrada manual e detecção de amostra pequena.',
    spinCount: 60,
    profile: 'Sessão Curta (60 giros)',
    numbers: generateBalancedEuropeanSpins(60, 424242),
  },
];

export function numbersToSpinEntries(
  numbers: number[],
  source: SpinSource,
  originBucket: 'historical' | 'session'
): SpinEntry[] {
  const baseTime = Date.now() - numbers.length * 15000;
  return numbers.filter(isValidRouletteNumber).map((num, idx) => ({
    id: `spin_${baseTime}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
    number: num,
    timestamp: baseTime + idx * 15000,
    source,
    originBucket,
  }));
}

/**
 * Parses raw text (comma, space, newline, semicolon, or CSV rows) into valid 0..36 roulette numbers.
 */
export function parseRouletteNumbersFromText(rawText: string): number[] {
  const tokens = rawText
    .replace(/["']/g, ' ')
    .split(/[\s,;|\t\r\n]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const valid: number[] = [];
  for (const tok of tokens) {
    if (/^\d{1,2}$/.test(tok)) {
      const n = Number(tok);
      if (isValidRouletteNumber(n)) {
        valid.push(n);
      }
    }
  }
  return valid;
}

export function exportSpinsToCsv(spins: SpinEntry[]): string {
  const header = 'indice,numero,cor,origem,bucket,timestamp_iso';
  const rows = spins.map((s, idx) => {
    const color =
      s.number === 0
        ? 'verde'
        : [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].includes(s.number)
          ? 'vermelho'
          : 'preto';
    return `${idx + 1},${s.number},${color},${s.source},${s.originBucket},${new Date(
      s.timestamp
    ).toISOString()}`;
  });
  return [header, ...rows].join('\n');
}
