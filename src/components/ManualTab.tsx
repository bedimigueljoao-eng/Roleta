import React, { useRef, useState } from 'react';
import {
  Upload,
  FileSpreadsheet,
  Database,
  Check,
  ArrowLeftRight,
  Trash2,
  ClipboardPaste,
} from 'lucide-react';
import type {
  BankrollConfig,
  BankrollSessionState,
  ContinuousLearningState,
  MasterRecommendation,
  SpinEntry,
} from '../types/roulette';
import { extractNumbersFromScreenshot } from '../engine/rouletteAiAnalyst';
import { ROULETTE_DEMOS, parseRouletteNumbersFromText } from '../data/rouletteDemos';
import { getNumberColor } from '../engine/rouletteConstants';
import { DecisionCockpit } from './DecisionCockpit';
import { EuropeanWheelAndTable } from './EuropeanWheelAndTable';
import { RouletteNumberChip } from './RouletteNumberChip';

interface ManualTabProps {
  recommendation: MasterRecommendation;
  learning: ContinuousLearningState;
  bankrollConfig: BankrollConfig;
  bankrollState: BankrollSessionState;
  spins: SpinEntry[];
  onSubmitNumber: (num: number) => void;
  onReplaceHistoricalBase: (numbers: number[], source: 'ocr_500' | 'demo' | 'import') => void;
  onClearHistoricalBase: () => void;
  onUndoLastSpin: () => void;
  onClearSessionSpins: () => void;
}

export const ManualTab: React.FC<ManualTabProps> = ({
  recommendation,
  learning,
  bankrollConfig,
  bankrollState,
  spins,
  onSubmitNumber,
  onReplaceHistoricalBase,
  onClearHistoricalBase,
  onUndoLastSpin,
  onClearSessionSpins,
}) => {
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrNote, setOcrNote] = useState<string | null>(null);
  const [previewNumbers, setPreviewNumbers] = useState<number[]>([]);
  const [pasteText, setPasteText] = useState('');
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [showHistoricalGrid, setShowHistoricalGrid] = useState(false);

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const dataFileInputRef = useRef<HTMLInputElement | null>(null);

  const historicalSpins = spins.filter((s) => s.originBucket === 'historical');
  const sessionSpins = spins.filter((s) => s.originBucket === 'session');
  const lastNumber = spins.length > 0 ? spins[spins.length - 1].number : null;

  const processScreenshot = async (dataUrl: string) => {
    setPreviewImageUrl(dataUrl);
    setOcrLoading(true);
    setOcrNote('Processando print dos até 500 resultados anteriores...');
    const res = await extractNumbersFromScreenshot(dataUrl, 500);
    setOcrLoading(false);
    setPreviewNumbers(res.numbers);
    setPasteText(res.numbers.join(', '));
    setOcrNote(res.note);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result === 'string') {
        await processScreenshot(reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handlePasteArea = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        if (!blob) continue;
        const reader = new FileReader();
        reader.onload = async () => {
          if (typeof reader.result === 'string') {
            await processScreenshot(reader.result);
          }
        };
        reader.readAsDataURL(blob);
        break;
      }
    }
  };

  const handleDataFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      let parsed: number[] = [];
      try {
        const json = JSON.parse(content);
        if (Array.isArray(json)) {
          parsed = json
            .map((item) => (typeof item === 'number' ? item : Number(item?.number)))
            .filter((n) => Number.isInteger(n) && n >= 0 && n <= 36);
        } else if (Array.isArray(json?.spins)) {
          parsed = json.spins
            .map((item: { number?: number }) => Number(item?.number))
            .filter((n: number) => Number.isInteger(n) && n >= 0 && n <= 36);
        } else if (Array.isArray(json?.numbers)) {
          parsed = json.numbers.filter((n: number) => Number.isInteger(n) && n >= 0 && n <= 36);
        }
      } catch {
        parsed = parseRouletteNumbersFromText(content);
      }

      const capped = parsed.slice(-500);
      setPreviewNumbers(capped);
      setPasteText(capped.join(', '));
      setOcrNote(
        capped.length > 0
          ? `Arquivo lido: ${capped.length} número(s) válidos (0–36) prontos para revisar e aplicar.`
          : 'Nenhum número válido (0–36) encontrado no arquivo.'
      );
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleTextChange = (val: string) => {
    setPasteText(val);
    setPreviewNumbers(parseRouletteNumbersFromText(val).slice(0, 500));
  };

  const handleInvertPreview = () => {
    const reversed = [...previewNumbers].reverse();
    setPreviewNumbers(reversed);
    setPasteText(reversed.join(', '));
  };

  const handleApplyHistoricalPreview = () => {
    if (previewNumbers.length === 0) return;
    onReplaceHistoricalBase(previewNumbers.slice(0, 500), previewImageUrl ? 'ocr_500' : 'import');
    setOcrNote(
      `Base histórica aplicada com ${Math.min(500, previewNumbers.length)} resultados. Agora lance os próximos resultados à mão abaixo.`
    );
    setPreviewNumbers([]);
    setPasteText('');
    setPreviewImageUrl(null);
  };

  const handleLoad500Demo = () => {
    const demo500 = ROULETTE_DEMOS[0];
    onReplaceHistoricalBase(demo500.numbers, 'demo');
    setOcrNote(
      `Dataset demo de ${demo500.numbers.length} giros carregado na Base Histórica. Pronta para entrada manual em tempo real.`
    );
  };

  return (
    <div className="space-y-5" onPaste={handlePasteArea}>
      {/* Live Recommendation & Quick Enter Cockpit */}
      <DecisionCockpit
        recommendation={recommendation}
        learning={learning}
        bankrollConfig={bankrollConfig}
        bankrollState={bankrollState}
        spins={spins}
        onSubmitNumber={onSubmitNumber}
        onUndoLastSpin={onUndoLastSpin}
        onClearSessionSpins={onClearSessionSpins}
      />

      {/* Section 1: Load 500 Previous Results (Screenshot OCR / Paste / JSON-CSV / Demo 500) */}
      <section className="bg-[#131A26] border border-[#232E42] rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              Base Histórica Prévia (até 500 resultados anteriores)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Carregue print da grade de 500 giros, cole texto, importe JSON/CSV ou teste com o demo de 500 giros.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={ocrLoading}
              className="min-h-[42px] px-3.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-colors"
            >
              <Upload className="w-4 h-4" />
              <span>{ocrLoading ? 'Extraindo OCR...' : 'Carregar Print (até 500)'}</span>
            </button>

            <button
              type="button"
              onClick={() => dataFileInputRef.current?.click()}
              className="min-h-[42px] px-3.5 rounded-lg bg-[#1A2436] hover:bg-[#233149] border border-[#2C3B57] text-slate-100 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4 text-slate-300" />
              <span>Importar JSON / CSV</span>
            </button>

            <button
              type="button"
              onClick={handleLoad500Demo}
              className="min-h-[42px] px-3.5 rounded-lg bg-[#1A2436] hover:bg-[#233149] border border-[#2C3B57] text-emerald-300 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors"
            >
              <Database className="w-4 h-4" />
              <span>Demo 500 Giros</span>
            </button>

            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            <input
              ref={dataFileInputRef}
              type="file"
              accept=".json,.csv,.txt"
              onChange={handleDataFileImport}
              className="hidden"
            />
          </div>
        </div>

        {/* Paste / Edit Text Input for Historical Batch */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <ClipboardPaste className="w-3.5 h-3.5" />
              Cole números (0–36) separados por vírgula/espaço ou cole um print com Ctrl+V
            </span>
            <span className="font-mono tabular-nums">
              Prévia: {previewNumbers.length}/500
            </span>
          </div>
          <textarea
            rows={2}
            value={pasteText}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder="Ex: 32, 15, 0, 19, 4, 21, 2, 25... (aceita até 500 resultados para revisão antes de aplicar)"
            className="w-full p-3 rounded-lg bg-[#0E141F] border border-[#263248] text-xs font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {ocrNote && (
          <p className="text-xs text-emerald-300 bg-emerald-950/30 border border-emerald-500/30 rounded-lg px-3 py-2">
            {ocrNote}
          </p>
        )}

        {/* Editable Preview Before Applying */}
        {previewNumbers.length > 0 && (
          <div className="p-3 rounded-lg bg-[#0E141F] border border-[#2A3952] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-200">
                Prévia de Revisão ({previewNumbers.length} números · Mais antigo → Mais novo)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleInvertPreview}
                  className="min-h-[36px] px-3 rounded-md bg-[#182233] hover:bg-[#223047] text-xs text-slate-200 flex items-center gap-1.5"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  <span>Inverter Ordem</span>
                </button>
                <button
                  type="button"
                  onClick={handleApplyHistoricalPreview}
                  className="min-h-[36px] px-4 rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Aplicar à Base Histórica</span>
                </button>
              </div>
            </div>

            {previewImageUrl && (
              <img
                src={previewImageUrl}
                alt="Print carregado dos resultados anteriores"
                className="max-h-40 rounded border border-[#232E42] object-contain"
              />
            )}

            <div className="max-h-36 overflow-y-auto flex flex-wrap gap-1">
              {previewNumbers.map((num, idx) => (
                <RouletteNumberChip key={`prev-${idx}`} number={num} size="xs" />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Section 2: Quick Keypad 0-36 + Interactive Wheel & Felt Table */}
      <section className="bg-[#131A26] border border-[#232E42] rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              Teclado Rápido 0–36 (Entrada à Mão)
            </h2>
            <p className="text-xs text-slate-400">
              Toque em qualquer número para lançar instantaneamente na sessão e atualizar a próxima sugestão.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400 tabular-nums">
            Último: {lastNumber !== null ? `#${lastNumber}` : '—'}
          </span>
        </div>

        <div className="grid grid-cols-7 sm:grid-cols-10 md:grid-cols-13 gap-1.5">
          {Array.from({ length: 37 }, (_, n) => {
            const c = getNumberColor(n);
            const isHighlighted = recommendation.coveredNumbers.includes(n);
            return (
              <button
                key={n}
                type="button"
                onClick={() => onSubmitNumber(n)}
                className={`min-h-[44px] rounded-lg border font-mono text-sm font-bold tabular-nums transition-transform active:scale-95 ${
                  c === 'green'
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400/50'
                    : c === 'red'
                      ? 'bg-rose-700 hover:bg-rose-600 text-white border-rose-500/40'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border-slate-600/60'
                } ${isHighlighted ? 'ring-2 ring-emerald-400' : ''}`}
              >
                {n}
              </button>
            );
          })}
        </div>
      </section>

      {/* Interactive European Wheel & Felt Table */}
      <EuropeanWheelAndTable
        onSelectNumber={onSubmitNumber}
        highlightedNumbers={recommendation.coveredNumbers}
        lastNumber={lastNumber}
      />

      {/* Section 3: Visual Separation between Loaded Historical Base (up to 500) and Live Session Spins */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Session Spins (Current live manual entries) */}
        <div className="lg:col-span-5 bg-[#131A26] border border-emerald-500/35 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-emerald-300">
                Giros da Sessão Atual ({sessionSpins.length})
              </h3>
              <p className="text-xs text-slate-400">
                Resultados lançados nesta sessão com avaliação OK / X
              </p>
            </div>
          </div>

          {sessionSpins.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">
              Nenhum giro lançado manualmente nesta sessão ainda. Use o teclado acima ou o campo Enter.
            </p>
          ) : (
            <div className="max-h-56 overflow-y-auto flex flex-wrap gap-2 pt-1">
              {[...sessionSpins].reverse().map((spin) => (
                <RouletteNumberChip
                  key={spin.id}
                  number={spin.number}
                  size="md"
                  isSession
                  outcome={spin.predictionResult?.outcome}
                />
              ))}
            </div>
          )}
        </div>

        {/* Historical Base (up to 500 previous results) */}
        <div className="lg:col-span-7 bg-[#131A26] border border-[#232E42] rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Base Histórica Carregada ({historicalSpins.length}/500)
              </h3>
              <p className="text-xs text-slate-400">
                Separada visualmente da sessão atual · alimenta estatística e aprendizagem contínua
              </p>
            </div>
            <div className="flex items-center gap-2">
              {historicalSpins.length > 60 && (
                <button
                  type="button"
                  onClick={() => setShowHistoricalGrid((v) => !v)}
                  className="px-3 py-1.5 rounded-lg bg-[#1A2436] hover:bg-[#233149] text-xs text-slate-200"
                >
                  {showHistoricalGrid ? 'Mostrar últimos 60' : `Ver todos (${historicalSpins.length})`}
                </button>
              )}
              <button
                type="button"
                onClick={onClearHistoricalBase}
                disabled={historicalSpins.length === 0}
                className="px-3 py-1.5 rounded-lg bg-[#1A2436] hover:bg-rose-950/60 disabled:opacity-40 text-xs text-slate-300 hover:text-rose-200 flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Limpar Base</span>
              </button>
            </div>
          </div>

          {historicalSpins.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">
              Nenhuma base histórica carregada. Use "Carregar Print (até 500)" ou "Demo 500 Giros" acima.
            </p>
          ) : (
            <div className="max-h-56 overflow-y-auto flex flex-wrap gap-1.5">
              {(showHistoricalGrid ? [...historicalSpins].reverse() : [...historicalSpins].slice(-60).reverse()).map(
                (spin) => (
                  <RouletteNumberChip key={spin.id} number={spin.number} size="xs" />
                )
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
