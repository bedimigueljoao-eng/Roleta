import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '15mb' }));

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, hasGemini: Boolean(getGeminiClient()) });
});

/**
 * Extracts European Roulette numbers (0..36) from a screenshot (live strip or 500-spin history grid).
 */
app.post('/api/roulette-ocr', async (req, res) => {
  try {
    const { imageDataUrl, maxNumbers } = req.body ?? {};
    if (typeof imageDataUrl !== 'string' || !imageDataUrl.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Imagem base64 inválida.' });
    }

    const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ error: 'Formato DataURL inválido.' });
    }

    const mimeType = match[1];
    const base64Data = match[2];
    const limit = typeof maxNumbers === 'number' && maxNumbers > 0 ? Math.min(500, maxNumbers) : 500;

    const ai = getGeminiClient();
    if (!ai) {
      return res.status(200).json({
        numbers: [],
        note: 'Chave Gemini não configurada no servidor. Cole ou edite os números manualmente na prévia.',
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Data,
            },
          },
          {
            text: `Analise esta captura de tela de histórico de Roleta Europeia (números válidos de 0 a 36).
Extraia TODOS os números da roleta visíveis na faixa ou grade de histórico em ordem cronológica (do mais antigo para o mais recente se houver leitura esquerda->direita ou grade de histórico; caso haja dúvida na direção, preserve a ordem de leitura natural da grade).
Retorne apenas inteiros válidos entre 0 e 36, no máximo ${limit} números. Ignore saldos, horas, valores de aposta, multiplicadores ou textos.`,
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            numbers: {
              type: Type.ARRAY,
              items: { type: Type.INTEGER },
              description: 'Lista ordenada de números de roleta entre 0 e 36.',
            },
            note: {
              type: Type.STRING,
              description: 'Breve observação sobre a leitura (ex.: direção lida ou clareza da imagem).',
            },
          },
          required: ['numbers', 'note'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{"numbers":[],"note":""}').trim()) as {
      numbers?: unknown[];
      note?: string;
    };

    const cleanNumbers = (Array.isArray(parsed.numbers) ? parsed.numbers : [])
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 36)
      .slice(0, limit);

    return res.json({
      numbers: cleanNumbers,
      note:
        parsed.note ||
        `Extraídos ${cleanNumbers.length} número(s) válidos (0–36). Confira na prévia editável antes de aplicar.`,
    });
  } catch (err) {
    console.error('OCR error:', err);
    return res.status(500).json({
      error: 'Falha ao processar OCR da imagem.',
      numbers: [],
    });
  }
});

/**
 * Quantitative & pattern analyst endpoint for European Roulette.
 */
app.post('/api/roulette-ai', async (req, res) => {
  try {
    const payload = req.body ?? {};
    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({ error: 'Gemini API key indisponível no servidor.' });
    }

    const promptText = `Você é o Analista Quantitativo de Roleta Europeia (0–36) do sistema Roleta Quant Lab.
Analise os dados reais abaixo da sessão e do backtesting point-in-time e responda em português objetivo, sem promessas de lucro garantido, respeitando rigorosamente a independência estatística dos giros.

Dados da Sessão e Estratégias:
${JSON.stringify(payload, null, 2)}

Produza uma análise estruturada com:
- headline: título curto e direto
- summary: resumo quantitativo objetivo citando n=${payload.sampleSize ?? 0}
- observedPatterns: 3 a 4 padrões/desvios observados nos números, cores, dúzias ou setores físicos
- strategyDiagnostics: 2 a 4 observações sobre desempenho das estratégias (taxa de acerto, ROI, drawdown, validação out-of-sample)
- riskWarnings: 2 a 3 alertas de risco (variância, tamanho da amostra, sequência de perdas ou volatilidade)
- suggestedAdjustments: 2 a 3 ajustes práticos de limiar, confluência ou pausa para testar no backtest
- independenceDisclaimer: aviso claro lembrando que cada giro da Roleta Europeia é estatisticamente independente (1/37 por número).`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: promptText,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            headline: { type: Type.STRING },
            summary: { type: Type.STRING },
            observedPatterns: { type: Type.ARRAY, items: { type: Type.STRING } },
            strategyDiagnostics: { type: Type.ARRAY, items: { type: Type.STRING } },
            riskWarnings: { type: Type.ARRAY, items: { type: Type.STRING } },
            suggestedAdjustments: { type: Type.ARRAY, items: { type: Type.STRING } },
            independenceDisclaimer: { type: Type.STRING },
          },
          required: [
            'headline',
            'summary',
            'observedPatterns',
            'strategyDiagnostics',
            'riskWarnings',
            'suggestedAdjustments',
            'independenceDisclaimer',
          ],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    return res.json({
      source: 'gemini',
      generatedAt: Date.now(),
      ...parsed,
    });
  } catch (err) {
    console.error('AI analyst error:', err);
    return res.status(500).json({ error: 'Falha ao consultar Analista IA.' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Roleta Quant Lab running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
