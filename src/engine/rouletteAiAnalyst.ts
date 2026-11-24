import { createWorker } from 'tesseract.js';
import type {
  AiAnalysisResult,
  BankrollSessionState,
  ContinuousLearningState,
  RouletteStatsSummary,
  RouletteStrategy,
} from '../types/roulette';
import { isValidRouletteNumber } from './rouletteConstants';

function buildApiUrl(path: string, customBaseUrl?: string): string {
  const base = (customBaseUrl ?? '').trim().replace(/\/+$/, '');
  if (!base) return path;
  return `${base}${path}`;
}

/**
 * Enhances contrast & upscales a cropped roulette strip DataURL for higher-accuracy local Tesseract OCR.
 */
async function preprocessImageForOcr(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = img.width < 600 ? 2 : 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, img.width * scale);
      canvas.height = Math.max(1, img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.filter = 'grayscale(100%) contrast(155%) brightness(110%)';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function runLocalTesseractOcr(
  imageDataUrl: string,
  maxNumbers: number
): Promise<number[]> {
  try {
    const enhancedUrl = await preprocessImageForOcr(imageDataUrl);
    const worker = await createWorker('eng');
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789 ,.-|',
    });
    const {
      data: { text },
    } = await worker.recognize(enhancedUrl);
    await worker.terminate();

    const matches = text.match(/\b\d{1,2}\b/g) ?? [];
    return matches
      .map((m) => Number(m))
      .filter((n) => isValidRouletteNumber(n))
      .slice(0, maxNumbers);
  } catch {
    return [];
  }
}

/**
 * Deterministic local quantitative analyst fallback when offline or running standalone APK without server.
 */
export function runLocalQuantitativeAnalysis(
  stats: RouletteStatsSummary,
  learning: ContinuousLearningState,
  strategies: RouletteStrategy[],
  bankroll: BankrollSessionState
): AiAnalysisResult {
  const n = stats.sampleSize;
  const observedPatterns: string[] = [];
  const strategyDiagnostics: string[] = [];
  const riskWarnings: string[] = [];
  const suggestedAdjustments: string[] = [];

  if (n < 30) {
    riskWarnings.push(
      `Amostra atual reduzida (n = ${n} giros). Variância elevada: recomenda-se base histórica ≥ 100 giros antes de ajustar pesos.`
    );
  }

  const maxAbsenceDozen = [...stats.dozens].sort((a, b) => b.currentAbsence - a.currentAbsence)[0];
  if (maxAbsenceDozen && maxAbsenceDozen.currentAbsence >= 5) {
    observedPatterns.push(
      `${maxAbsenceDozen.label} está ausente há ${maxAbsenceDozen.currentAbsence} giros seguidos (máxima na amostra: ${maxAbsenceDozen.maxAbsence}).`
    );
  }

  const topColor = [...stats.colors]
    .filter((c) => c.key !== 'green')
    .sort((a, b) => Math.abs(b.deviationPercent) - Math.abs(a.deviationPercent))[0];
  if (topColor) {
    observedPatterns.push(
      `Cor ${topColor.label}: ${topColor.frequencyPercent}% observado vs. ${topColor.theoreticalPercent}% teórico (desvio de ${
        topColor.deviationPercent > 0 ? '+' : ''
      }${topColor.deviationPercent}%).`
    );
  }

  const zeroStat = stats.colors.find((c) => c.key === 'green');
  if (zeroStat) {
    observedPatterns.push(
      `Zero (0) saiu ${zeroStat.count}x (${zeroStat.frequencyPercent}% vs. 2.70% teórico), ausente há ${zeroStat.currentAbsence} giros.`
    );
  }

  const topSector = [...stats.sectors].sort((a, b) => b.deviationPercent - a.deviationPercent)[0];
  if (topSector) {
    observedPatterns.push(
      `Setor mais ativo na roda: ${topSector.label} (${topSector.frequencyPercent}% vs. ${topSector.theoreticalPercent}% teórico).`
    );
  }

  const enabledReports = learning.reports.filter((r) => r.enabled);
  const bestReport = [...enabledReports].sort((a, b) => b.roi - a.roi)[0];
  const worstReport = [...enabledReports].sort((a, b) => a.roi - b.roi)[0];

  if (bestReport) {
    strategyDiagnostics.push(
      `Melhor desempenho point-in-time: "${bestReport.strategyName}" com ${bestReport.hitRate}% de acerto (${bestReport.totalSignals} sinais) e ROI de ${bestReport.roi}%.`
    );
  }
  if (worstReport && worstReport.strategyId !== bestReport?.strategyId) {
    strategyDiagnostics.push(
      `Menor eficiência atual: "${worstReport.strategyName}" (${worstReport.hitRate}% de acerto · ROI ${worstReport.roi}% · MDD ${worstReport.maxDrawdownUnits}u).`
    );
  }

  const activeCount = strategies.filter((s) => s.enabled).length;
  strategyDiagnostics.push(
    `${activeCount} estratégia(s) ativa(s) gerando confluência; taxa global point-in-time: ${learning.overallPointInTimeHitRate}% em ${learning.overallSignals} sinais.`
  );

  if (bankroll.consecutiveLosses >= 2) {
    riskWarnings.push(
      `Sequência atual de ${bankroll.consecutiveLosses} perda(s) na sessão. Evite qualquer aumento de ficha (proteção anti-Martingale).`
    );
  }
  if (stats.chiSquareScore > 50 && n >= 100) {
    riskWarnings.push(
      `Qui-quadrado elevado (${stats.chiSquareScore}) indica dispersão acentuada nos números individuais nesta janela.`
    );
  }
  if (riskWarnings.length === 0) {
    riskWarnings.push('Volatilidade dentro do intervalo esperado para Roleta Europeia (1 zero).');
  }

  if (worstReport && worstReport.roi < -8 && worstReport.totalSignals >= 12) {
    suggestedAdjustments.push(
      `Considere desativar ou elevar o limiar de entrada da estratégia "${worstReport.strategyName}" no Ciclo de Melhoria.`
    );
  }
  if (learning.overallMaxDrawdown > 10) {
    suggestedAdjustments.push(
      'Drawdown acumulado acima de 10 unidades: teste exigir confluência mínima de 2 estratégias antes de ENTRAR.'
    );
  }
  if (suggestedAdjustments.length === 0) {
    suggestedAdjustments.push(
      'Manter unidade fixa e acompanhar validação out-of-sample nas janelas de 100 e 300 giros.'
    );
  }

  return {
    source: 'local',
    generatedAt: Date.now(),
    headline:
      n === 0
        ? 'Aguardando dados para análise quantitativa'
        : `Diagnóstico Quantitativo Local · n = ${n} giros`,
    summary:
      n === 0
        ? 'Carregue um print, um dataset demo de 500 giros ou lance resultados manualmente para iniciar a leitura estatística.'
        : `Análise de ${n} giros da Roleta Europeia (${stats.historicalCount} base histórica · ${stats.sessionCount} sessão atual). Taxa global point-in-time de ${learning.overallPointInTimeHitRate}% (${learning.overallNetUnits >= 0 ? '+' : ''}${learning.overallNetUnits}u).`,
    observedPatterns,
    strategyDiagnostics,
    riskWarnings,
    suggestedAdjustments,
    independenceDisclaimer: stats.independenceNotice,
  };
}

export async function requestRouletteAiAnalysis(payload: {
  stats: RouletteStatsSummary;
  learning: ContinuousLearningState;
  strategies: RouletteStrategy[];
  bankroll: BankrollSessionState;
  recentNumbers: number[];
  apiServerUrl?: string;
}): Promise<AiAnalysisResult> {
  try {
    const res = await fetch(buildApiUrl('/api/roulette-ai', payload.apiServerUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sampleSize: payload.stats.sampleSize,
        historicalCount: payload.stats.historicalCount,
        sessionCount: payload.stats.sessionCount,
        recentNumbers: payload.recentNumbers.slice(-40),
        colors: payload.stats.colors,
        dozens: payload.stats.dozens,
        sectors: payload.stats.sectors,
        chiSquareScore: payload.stats.chiSquareScore,
        learningSummary: {
          overallHitRate: payload.learning.overallPointInTimeHitRate,
          overallSignals: payload.learning.overallSignals,
          overallNetUnits: payload.learning.overallNetUnits,
          overallMaxDrawdown: payload.learning.overallMaxDrawdown,
          reports: payload.learning.reports.map((r) => ({
            name: r.strategyName,
            enabled: r.enabled,
            signals: r.totalSignals,
            hitRate: r.hitRate,
            theoreticalHitRate: r.theoreticalHitRate,
            roi: r.roi,
            maxDrawdown: r.maxDrawdownUnits,
            validationRoi: r.validationMetrics.roi,
            efficacyDropAlert: r.efficacyDropAlert,
          })),
        },
        bankroll: payload.bankroll,
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as AiAnalysisResult;
      if (data && Array.isArray(data.observedPatterns)) {
        return data;
      }
    }
  } catch {
    // Offline / APK without backend -> fallback to deterministic local analyst
  }

  return runLocalQuantitativeAnalysis(
    payload.stats,
    payload.learning,
    payload.strategies,
    payload.bankroll
  );
}

/**
 * Extracts roulette numbers (0..36) from screenshot via Gemini Server OCR (if reachable),
 * automatically falling back to local on-device Tesseract OCR (works inside Android APK offline too!).
 */
export async function extractNumbersFromScreenshot(
  imageBase64DataUrl: string,
  maxNumbers = 500,
  apiServerUrl?: string
): Promise<{ numbers: number[]; method: 'gemini-ocr' | 'tesseract-local' | 'local-none'; note: string }> {
  try {
    const res = await fetch(buildApiUrl('/api/roulette-ocr', apiServerUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageDataUrl: imageBase64DataUrl,
        maxNumbers,
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as { numbers?: number[]; note?: string };
      if (Array.isArray(data.numbers) && data.numbers.length > 0) {
        const clean = data.numbers.filter((n) => Number.isInteger(n) && n >= 0 && n <= 36);
        if (clean.length > 0) {
          return {
            numbers: clean,
            method: 'gemini-ocr',
            note:
              data.note ??
              `OCR Servidor extraiu ${clean.length} número(s) válidos (0–36). Confira na prévia antes de enviar.`,
          };
        }
      }
    }
  } catch {
    // Server unavailable (e.g., standalone APK) -> proceed directly to on-device Tesseract OCR
  }

  const localNumbers = await runLocalTesseractOcr(imageBase64DataUrl, maxNumbers);
  if (localNumbers.length > 0) {
    return {
      numbers: localNumbers,
      method: 'tesseract-local',
      note: `OCR Local (Tesseract) extraiu ${localNumbers.length} número(s) da ROI. Confira na prévia editável antes de aplicar.`,
    };
  }

  return {
    numbers: [],
    method: 'local-none',
    note: 'Não foi possível ler números nítidos nesta área. Ajuste o quadro ROI sobre os números ou digite/cole manualmente na prévia abaixo.',
  };
}
