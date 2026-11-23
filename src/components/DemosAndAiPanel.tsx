import React, { useRef, useState } from 'react';
import {
  Database,
  Download,
  Upload,
  BrainCircuit,
  Save,
  Smartphone,
} from 'lucide-react';
import type {
  AiAnalysisResult,
  BankrollConfig,
  BankrollSessionState,
  ContinuousLearningState,
  LearningBackupPayload,
  RouletteStatsSummary,
  RouletteStrategy,
  SessionExportPayload,
  SpinEntry,
  StrategySnapshot,
} from '../types/roulette';
import { ROULETTE_DEMOS, exportSpinsToCsv, parseRouletteNumbersFromText } from '../data/rouletteDemos';
import { requestRouletteAiAnalysis } from '../engine/rouletteAiAnalyst';

interface DemosAndAiPanelProps {
  spins: SpinEntry[];
  strategies: RouletteStrategy[];
  snapshots: StrategySnapshot[];
  bankrollConfig: BankrollConfig;
  bankrollState: BankrollSessionState;
  stats: RouletteStatsSummary;
  learning: ContinuousLearningState;
  onLoadDemo: (numbers: number[]) => void;
  onImportSessionSpins: (spins: SpinEntry[]) => void;
  onRestoreLearningBackup: (payload: LearningBackupPayload) => void;
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const DemosAndAiPanel: React.FC<DemosAndAiPanelProps> = ({
  spins,
  strategies,
  snapshots,
  bankrollConfig,
  bankrollState,
  stats,
  learning,
  onLoadDemo,
  onImportSessionSpins,
  onRestoreLearningBackup,
}) => {
  const [aiResult, setAiResult] = useState<AiAnalysisResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const sessionImportRef = useRef<HTMLInputElement | null>(null);
  const learningImportRef = useRef<HTMLInputElement | null>(null);

  const handleRunAiAnalyst = async () => {
    setAiLoading(true);
    const result = await requestRouletteAiAnalysis({
      stats,
      learning,
      strategies,
      bankroll: bankrollState,
      recentNumbers: spins.map((s) => s.number),
    });
    setAiResult(result);
    setAiLoading(false);
  };

  const handleExportSessionJson = () => {
    const payload: SessionExportPayload = {
      version: 1,
      exportedAt: Date.now(),
      spins,
      bankrollConfig,
    };
    downloadTextFile(
      `roleta-quant-sessao-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(payload, null, 2),
      'application/json'
    );
    setStatusMessage(`Sessão exportada em JSON (${spins.length} giros).`);
  };

  const handleExportSessionCsv = () => {
    const csv = exportSpinsToCsv(spins);
    downloadTextFile(
      `roleta-quant-sessao-${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
      'text/csv;charset=utf-8;'
    );
    setStatusMessage(`Sessão exportada em CSV (${spins.length} giros).`);
  };

  const handleExportLearningBackup = () => {
    const backup: LearningBackupPayload = {
      version: 1,
      exportedAt: Date.now(),
      strategies,
      snapshots,
      bankrollConfig,
    };
    downloadTextFile(
      `roleta-quant-backup-aprendizagem-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(backup, null, 2),
      'application/json'
    );
    setStatusMessage(
      `Backup de aprendizagem exportado (${strategies.length} estratégias e ${snapshots.length} snapshots) separadamente da sessão.`
    );
  };

  const handleImportSessionFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed?.spins)) {
          onImportSessionSpins(parsed.spins);
          setStatusMessage(`Sessão restaurada com ${parsed.spins.length} giros.`);
          return;
        }
      } catch {
        // Fallback to CSV / number list
      }
      const nums = parseRouletteNumbersFromText(text);
      if (nums.length > 0) {
        const now = Date.now();
        onImportSessionSpins(
          nums.map((n, i) => ({
            id: `imp_${now}_${i}`,
            number: n,
            timestamp: now + i * 1000,
            source: 'import',
            originBucket: 'historical',
          }))
        );
        setStatusMessage(`Importados ${nums.length} giros do arquivo CSV/texto.`);
      } else {
        setStatusMessage('Arquivo inválido ou sem números 0–36.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImportLearningBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(
          typeof reader.result === 'string' ? reader.result : ''
        ) as LearningBackupPayload;
        if (Array.isArray(parsed?.strategies)) {
          onRestoreLearningBackup(parsed);
          setStatusMessage(
            `Backup de aprendizagem restaurado (${parsed.strategies.length} estratégias) sem apagar sua sessão atual.`
          );
          return;
        }
      } catch {
        // ignore
      }
      setStatusMessage('Arquivo de backup de aprendizagem inválido.');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-5">
      {/* AI Quantitative & Pattern Analyst */}
      <section className="bg-[#131A26] border border-[#232E42] rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-emerald-400" />
              <span>IA de Análise Estatística e de Padrões da Roleta</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Lê o histórico atual ({stats.sampleSize} giros) e os relatórios de backtesting para apontar padrões, riscos e ajustes. Funciona via servidor Gemini ou localmente no APK offline.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRunAiAnalyst}
            disabled={aiLoading}
            className="min-h-[42px] px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 text-xs font-bold flex items-center gap-2 whitespace-nowrap"
          >
            <BrainCircuit className="w-4 h-4" />
            <span>{aiLoading ? 'Analisando amostra...' : 'Executar Análise IA'}</span>
          </button>
        </div>

        {aiResult ? (
          <div className="bg-[#0E141F] border border-[#232E42] rounded-xl p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E293B] pb-3">
              <div>
                <h3 className="text-sm font-semibold text-emerald-300">{aiResult.headline}</h3>
                <p className="text-xs text-slate-300 mt-1">{aiResult.summary}</p>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                Motor: {aiResult.source === 'gemini' ? 'Gemini Server' : 'Motor Quant Local'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="space-y-1.5">
                <h4 className="font-semibold text-slate-200">Padrões & Desvios Observados</h4>
                <ul className="space-y-1 text-slate-300 list-disc pl-4">
                  {aiResult.observedPatterns.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>

              <div className="space-y-1.5">
                <h4 className="font-semibold text-slate-200">Diagnóstico das Estratégias</h4>
                <ul className="space-y-1 text-slate-300 list-disc pl-4">
                  {aiResult.strategyDiagnostics.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </div>

              <div className="space-y-1.5">
                <h4 className="font-semibold text-amber-300">Alertas de Risco</h4>
                <ul className="space-y-1 text-slate-300 list-disc pl-4">
                  {aiResult.riskWarnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>

              <div className="space-y-1.5">
                <h4 className="font-semibold text-emerald-300">Sugestões de Ajuste</h4>
                <ul className="space-y-1 text-slate-300 list-disc pl-4">
                  {aiResult.suggestedAdjustments.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 border-t border-[#1E293B] pt-2.5">
              {aiResult.independenceDisclaimer}
            </p>
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            Clique em "Executar Análise IA" para gerar o relatório diagnóstico sobre o conjunto de dados e desempenho atual das estratégias.
          </p>
        )}
      </section>

      {/* Built-in Demo Bank */}
      <section className="bg-[#131A26] border border-[#232E42] rounded-xl p-4 space-y-3">
        <div>
          <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-400" />
            <span>Banco de Demos Embutido (100% Roleta Europeia)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Carregue cenários prontos na Base Histórica para validar backtesting, aprendizagem contínua e otimização.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {ROULETTE_DEMOS.map((demo) => (
            <div
              key={demo.id}
              className="bg-[#0E141F] border border-[#1E293B] rounded-lg p-3.5 flex flex-col justify-between gap-3"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-100">{demo.name}</h3>
                  <span className="font-mono text-xs text-emerald-400 tabular-nums shrink-0">
                    {demo.spinCount} giros
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">{demo.description}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onLoadDemo(demo.numbers);
                  setStatusMessage(`${demo.name} carregado na Base Histórica.`);
                }}
                className="min-h-[38px] px-3.5 rounded-lg bg-[#1A2436] hover:bg-emerald-500 hover:text-slate-950 text-xs font-semibold text-slate-100 transition-colors self-start"
              >
                Carregar Demo na Base Histórica
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Separate Session Export/Import & Learning Backup */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#131A26] border border-[#232E42] rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-100">
            Sessão Atual · Exportar / Importar (JSON e CSV)
          </h3>
          <p className="text-xs text-slate-400">
            Exporte ou importe apenas os giros da sessão e base histórica ({spins.length} resultados).
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleExportSessionJson}
              className="min-h-[40px] px-3.5 rounded-lg bg-[#1A2436] hover:bg-[#233149] text-xs text-slate-100 flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Exportar JSON</span>
            </button>
            <button
              type="button"
              onClick={handleExportSessionCsv}
              className="min-h-[40px] px-3.5 rounded-lg bg-[#1A2436] hover:bg-[#233149] text-xs text-slate-100 flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Exportar CSV</span>
            </button>
            <button
              type="button"
              onClick={() => sessionImportRef.current?.click()}
              className="min-h-[40px] px-3.5 rounded-lg bg-[#1A2436] hover:bg-[#233149] text-xs text-slate-100 flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5 text-amber-300" />
              <span>Importar JSON / CSV</span>
            </button>
            <input
              ref={sessionImportRef}
              type="file"
              accept=".json,.csv,.txt"
              onChange={handleImportSessionFile}
              className="hidden"
            />
          </div>
        </div>

        <div className="bg-[#131A26] border border-[#232E42] rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <Save className="w-4 h-4 text-emerald-400" />
            <span>Backup de Aprendizagem (Separado da Sessão)</span>
          </h3>
          <p className="text-xs text-slate-400">
            Salve ou restaure estratégias personalizadas, pesos aprendidos, snapshots de evolução e banca sem misturar com os giros da mesa atual.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleExportLearningBackup}
              className="min-h-[40px] px-3.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar Backup Aprendizagem</span>
            </button>
            <button
              type="button"
              onClick={() => learningImportRef.current?.click()}
              className="min-h-[40px] px-3.5 rounded-lg bg-[#1A2436] hover:bg-[#233149] text-xs text-slate-100 flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5 text-emerald-400" />
              <span>Restaurar Backup</span>
            </button>
            <input
              ref={learningImportRef}
              type="file"
              accept=".json"
              onChange={handleImportLearningBackup}
              className="hidden"
            />
          </div>
        </div>
      </section>

      {/* Android APK / GitHub Build Info */}
      <section className="bg-[#131A26] border border-[#232E42] rounded-xl p-4 space-y-2">
        <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-emerald-400" />
          <span>Compilação Android APK via GitHub Actions + Capacitor</span>
        </h3>
        <p className="text-xs text-slate-300 leading-relaxed">
          O projeto já inclui <span className="font-mono text-slate-100">capacitor.config.ts</span>, o plugin nativo{' '}
          <span className="font-mono text-slate-100">RouletteSplitBrowserPlugin.kt</span> (WebView em tela dividida com cookies preservados e captura de ROI sem gravação da tela inteira) e o workflow{' '}
          <span className="font-mono text-slate-100">.github/workflows/android-apk.yml</span> para gerar e baixar o{' '}
          <span className="font-mono text-emerald-300">app-debug.apk</span> diretamente da aba Actions ao enviar para o GitHub.
        </p>
      </section>

      {statusMessage && (
        <p className="text-xs text-emerald-300 bg-emerald-950/30 border border-emerald-500/30 rounded-lg px-3 py-2">
          {statusMessage}
        </p>
      )}
    </div>
  );
};
