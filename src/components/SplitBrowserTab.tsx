import React, { useEffect, useRef, useState } from 'react';
import {
  Globe,
  Camera,
  ScanText,
  Crosshair,
  Upload,
  Check,
  ArrowLeftRight,
  MonitorPlay,
  ExternalLink,
  X,
  Plus,
} from 'lucide-react';
import type {
  BankrollConfig,
  BankrollSessionState,
  ContinuousLearningState,
  MasterRecommendation,
  RoiRegion,
  SpinEntry,
} from '../types/roulette';
import {
  cropCanvasByRoi,
  isNativeAndroidPlatform,
  nativeCaptureRoiFrame,
  nativeCloseSplitBrowser,
  nativeNavigateUrl,
  nativeOpenSplitBrowser,
  nativeUpdateSplitPercent,
} from '../bridge/nativeBrowserBridge';
import { extractNumbersFromScreenshot } from '../engine/rouletteAiAnalyst';
import { parseRouletteNumbersFromText } from '../data/rouletteDemos';
import { isValidRouletteNumber } from '../engine/rouletteConstants';
import { RouletteNumberChip } from './RouletteNumberChip';
import { DecisionCockpit } from './DecisionCockpit';

interface SplitBrowserTabProps {
  browserUrl: string;
  onChangeUrl: (url: string) => void;
  splitPercent: number;
  onChangeSplitPercent: (pct: number) => void;
  roiRegion: RoiRegion;
  onChangeRoiRegion: (roi: RoiRegion) => void;
  recommendation: MasterRecommendation;
  learning: ContinuousLearningState;
  bankrollConfig: BankrollConfig;
  bankrollState: BankrollSessionState;
  spins: SpinEntry[];
  onSubmitNumber: (num: number) => void;
  onBatchAddNumbers: (numbers: number[], bucket: 'historical' | 'session', source: 'ocr_live') => void;
  onUndoLastSpin: () => void;
  onClearSessionSpins: () => void;
}

export const SplitBrowserTab: React.FC<SplitBrowserTabProps> = ({
  browserUrl,
  onChangeUrl,
  splitPercent,
  onChangeSplitPercent,
  roiRegion,
  onChangeRoiRegion,
  recommendation,
  learning,
  bankrollConfig,
  bankrollState,
  spins,
  onSubmitNumber,
  onBatchAddNumbers,
  onUndoLastSpin,
  onClearSessionSpins,
}) => {
  const [urlInput, setUrlInput] = useState(browserUrl);
  const [browserOpen, setBrowserOpen] = useState(true);
  const [showRoiCalibrator, setShowRoiCalibrator] = useState(false);
  const [captureStreamActive, setCaptureStreamActive] = useState(false);
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrStatusNote, setOcrStatusNote] = useState<string | null>(null);
  const [extractedNumbers, setExtractedNumbers] = useState<number[]>([]);
  const [manualPatchText, setManualPatchText] = useState('');
  const [addSingleInput, setAddSingleInput] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isAndroid = isNativeAndroidPlatform();

  useEffect(() => {
    setUrlInput(browserUrl);
  }, [browserUrl]);

  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const handleToggleBrowser = async () => {
    const next = !browserOpen;
    setBrowserOpen(next);
    if (isAndroid) {
      if (next) {
        await nativeOpenSplitBrowser(urlInput, splitPercent);
      } else {
        await nativeCloseSplitBrowser();
      }
    }
  };

  const handleNavigate = async (e: React.FormEvent) => {
    e.preventDefault();
    let normalized = urlInput.trim();
    if (normalized && !/^https?:\/\//i.test(normalized)) {
      normalized = `https://${normalized}`;
    }
    setUrlInput(normalized);
    onChangeUrl(normalized);
    if (!browserOpen) setBrowserOpen(true);
    if (isAndroid) {
      await nativeNavigateUrl(normalized);
    }
  };

  const handleSplitChange = async (pct: number) => {
    onChangeSplitPercent(pct);
    if (isAndroid && browserOpen) {
      await nativeUpdateSplitPercent(pct);
    }
  };

  const handleStartScreenCapture = async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setOcrStatusNote('Captura de janela indisponível neste navegador. Use Enviar Print ou Colar (Ctrl+V).');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 10 },
        audio: false,
      });
      mediaStreamRef.current = stream;
      setCaptureStreamActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        setCaptureStreamActive(false);
      });
      setOcrStatusNote('Captura de quadro conectada. Posicione a mira ROI e clique em "Fazer Print do Registro".');
    } catch {
      setOcrStatusNote('Captura cancelada. Você pode enviar ou colar (Ctrl+V) uma imagem do registro.');
    }
  };

  const handleCaptureRegisterPrint = async () => {
    setOcrStatusNote(null);

    if (isAndroid) {
      const dataUrl = await nativeCaptureRoiFrame(roiRegion);
      if (dataUrl) {
        setCapturedPreviewUrl(dataUrl);
        await runOcrOnDataUrl(dataUrl);
        return;
      }
    }

    if (captureStreamActive && videoRef.current && videoRef.current.videoWidth > 0) {
      const dataUrl = cropCanvasByRoi(
        videoRef.current,
        videoRef.current.videoWidth,
        videoRef.current.videoHeight,
        roiRegion
      );
      if (dataUrl) {
        setCapturedPreviewUrl(dataUrl);
        await runOcrOnDataUrl(dataUrl);
        return;
      }
    }

    // Otherwise open file picker for instant print upload
    fileInputRef.current?.click();
  };

  const runOcrOnDataUrl = async (dataUrl: string) => {
    setOcrLoading(true);
    setOcrStatusNote('Lendo números (0–36) do print capturado...');
    const res = await extractNumbersFromScreenshot(dataUrl, 60);
    setOcrLoading(false);
    setExtractedNumbers(res.numbers);
    setManualPatchText(res.numbers.join(', '));
    setOcrStatusNote(res.note);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result === 'string') {
        // Crop by ROI if user wants full or ROI? For uploaded print of strip, send directly or crop via Image
        const img = new Image();
        img.onload = async () => {
          const dataUrl = showRoiCalibrator
            ? cropCanvasByRoi(img, img.width, img.height, roiRegion)
            : (reader.result as string);
          setCapturedPreviewUrl(dataUrl);
          await runOcrOnDataUrl(dataUrl);
        };
        img.src = reader.result;
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handlePastePrint = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        if (!blob) continue;
        const reader = new FileReader();
        reader.onload = async () => {
          if (typeof reader.result === 'string') {
            setCapturedPreviewUrl(reader.result);
            await runOcrOnDataUrl(reader.result);
          }
        };
        reader.readAsDataURL(blob);
        break;
      }
    }
  };

  const handleSyncManualText = (text: string) => {
    setManualPatchText(text);
    setExtractedNumbers(parseRouletteNumbersFromText(text));
  };

  const handleRemoveExtractedIndex = (idx: number) => {
    const next = extractedNumbers.filter((_, i) => i !== idx);
    setExtractedNumbers(next);
    setManualPatchText(next.join(', '));
  };

  const handleInvertOrder = () => {
    const next = [...extractedNumbers].reverse();
    setExtractedNumbers(next);
    setManualPatchText(next.join(', '));
  };

  const handleAddSingleToPreview = () => {
    const num = Number(addSingleInput.trim());
    if (!isValidRouletteNumber(num)) return;
    const next = [...extractedNumbers, num];
    setExtractedNumbers(next);
    setManualPatchText(next.join(', '));
    setAddSingleInput('');
  };

  const handlePushToEngine = () => {
    if (extractedNumbers.length === 0) return;
    onBatchAddNumbers(extractedNumbers, 'session', 'ocr_live');
    setOcrStatusNote(
      `${extractedNumbers.length} número(s) enviados para o motor em tempo real e avaliados.`
    );
    setExtractedNumbers([]);
    setManualPatchText('');
  };

  // Compute dynamic viewport height for split pane on web/desktop
  const browserHeightPx = Math.round((splitPercent / 100) * 520);

  return (
    <div className="space-y-4" onPaste={handlePastePrint}>
      {/* Top Browser Toolbar */}
      <div className="bg-[#131A26] border border-[#232E42] rounded-xl p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <form onSubmit={handleNavigate} className="flex-1 min-w-[240px] flex items-center gap-2">
            <div className="relative flex-1">
              <Globe className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://www.kwanzabet.ao"
                aria-label="URL do cassino ou roleta"
                className="w-full min-h-[42px] pl-9 pr-3 rounded-lg bg-[#0E141F] border border-[#263248] text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <button
              type="submit"
              className="min-h-[42px] px-4 rounded-lg bg-[#1E293B] hover:bg-[#28354B] text-slate-100 text-xs font-semibold whitespace-nowrap transition-colors"
            >
              Ir
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleToggleBrowser}
              className={`min-h-[42px] px-3.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                browserOpen
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40'
                  : 'bg-emerald-500 text-slate-950'
              }`}
            >
              {browserOpen ? 'Fechar Navegador' : 'Abrir Navegador'}
            </button>

            <div className="flex items-center gap-1 bg-[#0E141F] border border-[#232E42] rounded-lg p-1">
              {[45, 56, 66].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => handleSplitChange(pct)}
                  className={`px-2.5 py-1.5 rounded text-xs font-mono tabular-nums transition-colors ${
                    splitPercent === pct
                      ? 'bg-emerald-500 text-slate-950 font-bold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {pct}%
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowRoiCalibrator((v) => !v)}
              className={`min-h-[42px] px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 border whitespace-nowrap transition-colors ${
                showRoiCalibrator
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                  : 'bg-[#0E141F] border-[#263248] text-slate-300 hover:text-white'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>Mira / ROI</span>
            </button>
          </div>
        </div>

        {/* Capture & OCR Action Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#1E293B]">
          <div className="flex flex-wrap items-center gap-2">
            {!isAndroid && (
              <button
                type="button"
                onClick={handleStartScreenCapture}
                className="min-h-[42px] px-3.5 rounded-lg bg-[#1A2436] hover:bg-[#233149] border border-[#2C3B57] text-slate-100 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors"
              >
                <MonitorPlay className="w-4 h-4 text-emerald-400" />
                <span>{captureStreamActive ? 'Quadro Conectado' : 'Capturar Janela/Aba'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleCaptureRegisterPrint}
              disabled={ocrLoading}
              className="min-h-[42px] px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-colors"
            >
              <Camera className="w-4 h-4" />
              <span>Fazer Print do Registro</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={ocrLoading}
              className="min-h-[42px] px-3.5 rounded-lg bg-[#1A2436] hover:bg-[#233149] border border-[#2C3B57] text-slate-100 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors"
            >
              <Upload className="w-4 h-4 text-slate-300" />
              <span>Carregar Print / Colar Ctrl+V</span>
            </button>

            {capturedPreviewUrl && (
              <button
                type="button"
                onClick={() => runOcrOnDataUrl(capturedPreviewUrl)}
                disabled={ocrLoading}
                className="min-h-[42px] px-3.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-colors"
              >
                <ScanText className="w-4 h-4" />
                <span>{ocrLoading ? 'Lendo...' : 'Ler Print'}</span>
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          <span className="text-xs text-slate-400">
            {isAndroid
              ? 'Modo Android Nativo (WebView com cookies + ROI sem gravar tela inteira)'
              : 'Web / Desktop · Tela Dividida · Cole print com Ctrl+V'}
          </span>
        </div>

        {/* ROI Calibration Controls */}
        {showRoiCalibrator && (
          <div className="p-3 rounded-lg bg-[#0E141F] border border-amber-500/30 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <label className="space-y-1">
              <span className="text-slate-300 font-mono tabular-nums">
                Posição X: {roiRegion.xPercent}%
              </span>
              <input
                type="range"
                min={0}
                max={80}
                value={roiRegion.xPercent}
                onChange={(e) =>
                  onChangeRoiRegion({ ...roiRegion, xPercent: Number(e.target.value) })
                }
                className="w-full accent-amber-400"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-300 font-mono tabular-nums">
                Posição Y: {roiRegion.yPercent}%
              </span>
              <input
                type="range"
                min={0}
                max={90}
                value={roiRegion.yPercent}
                onChange={(e) =>
                  onChangeRoiRegion({ ...roiRegion, yPercent: Number(e.target.value) })
                }
                className="w-full accent-amber-400"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-300 font-mono tabular-nums">
                Largura ROI: {roiRegion.widthPercent}%
              </span>
              <input
                type="range"
                min={10}
                max={100}
                value={roiRegion.widthPercent}
                onChange={(e) =>
                  onChangeRoiRegion({ ...roiRegion, widthPercent: Number(e.target.value) })
                }
                className="w-full accent-amber-400"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-300 font-mono tabular-nums">
                Altura ROI: {roiRegion.heightPercent}%
              </span>
              <input
                type="range"
                min={5}
                max={60}
                value={roiRegion.heightPercent}
                onChange={(e) =>
                  onChangeRoiRegion({ ...roiRegion, heightPercent: Number(e.target.value) })
                }
                className="w-full accent-amber-400"
              />
            </label>
          </div>
        )}
      </div>

      {/* Top Split Pane: Embedded Browser / Screen Stream + ROI Overlay */}
      {browserOpen && !isAndroid && (
        <div
          className="relative bg-[#0E141F] border border-[#232E42] rounded-xl overflow-hidden"
          style={{ height: `${browserHeightPx}px` }}
        >
          {captureStreamActive ? (
            <video
              ref={videoRef}
              muted
              playsInline
              className="w-full h-full object-contain bg-black"
            />
          ) : (
            <iframe
              src={browserUrl}
              title="Navegador Embutido Roleta Quant Lab"
              className="w-full h-full bg-white"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          )}

          {/* Subtle top info bar over iframe in case X-Frame-Options blocks external site */}
          <div className="absolute top-2 right-2 flex items-center gap-2 bg-[#0B0F17]/90 border border-[#232E42] rounded-lg px-2.5 py-1.5 text-[11px] text-slate-300 backdrop-blur-sm">
            <span>Se o site bloquear iframe na Web, use Capturar Janela ou APK Android</span>
            <a
              href={browserUrl}
              target="_blank"
              rel="noreferrer"
              className="text-emerald-400 hover:underline inline-flex items-center gap-1 font-medium"
            >
              <span>Abrir</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* ROI Calibration Overlay Box */}
          {showRoiCalibrator && (
            <div
              className="absolute pointer-events-none border-2 border-amber-400 bg-amber-400/10 rounded"
              style={{
                left: `${roiRegion.xPercent}%`,
                top: `${roiRegion.yPercent}%`,
                width: `${roiRegion.widthPercent}%`,
                height: `${roiRegion.heightPercent}%`,
              }}
            >
              <span className="inline-block bg-amber-400 text-slate-950 text-[10px] font-bold px-1.5 py-0.5 rounded-br">
                MIRA ROI · FAIXA DE NÚMEROS
              </span>
            </div>
          )}
        </div>
      )}

      {/* OCR Extraction & Editable Preview Drawer */}
      {(capturedPreviewUrl || extractedNumbers.length > 0 || ocrStatusNote) && (
        <div className="bg-[#131A26] border border-[#2A3952] rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Prévia Editável da Leitura do Print ({extractedNumbers.length} números)
              </h3>
              {ocrStatusNote && <p className="text-xs text-slate-300 mt-0.5">{ocrStatusNote}</p>}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleInvertOrder}
                disabled={extractedNumbers.length < 2}
                className="min-h-[38px] px-3 rounded-lg bg-[#1A2436] hover:bg-[#223048] disabled:opacity-40 text-xs text-slate-200 flex items-center gap-1.5"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>Inverter Ordem</span>
              </button>
              <button
                type="button"
                onClick={handlePushToEngine}
                disabled={extractedNumbers.length === 0}
                className="min-h-[38px] px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 text-xs font-bold flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Enviar para o Motor em Tempo Real</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {capturedPreviewUrl && (
              <div className="lg:col-span-4 bg-[#0E141F] border border-[#1E293B] rounded-lg p-2">
                <p className="text-[11px] text-slate-400 mb-1.5">Recorte / Print capturado</p>
                <img
                  src={capturedPreviewUrl}
                  alt="Print da faixa de resultados da roleta"
                  className="w-full max-h-36 object-contain rounded"
                />
              </div>
            )}

            <div className={`${capturedPreviewUrl ? 'lg:col-span-8' : 'lg:col-span-12'} space-y-2.5`}>
              <div className="flex flex-wrap gap-1.5">
                {extractedNumbers.map((num, idx) => (
                  <div key={`${idx}-${num}`} className="relative group">
                    <RouletteNumberChip number={num} size="sm" />
                    <button
                      type="button"
                      onClick={() => handleRemoveExtractedIndex(idx)}
                      aria-label={`Remover ${num}`}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-slate-900 border border-slate-600 text-slate-300 hover:text-rose-400 flex items-center justify-center opacity-90"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={manualPatchText}
                  onChange={(e) => handleSyncManualText(e.target.value)}
                  placeholder="Edite ou cole números separados por vírgula (ex: 17, 0, 32, 5)"
                  className="flex-1 min-w-[220px] min-h-[40px] px-3 rounded-lg bg-[#0E141F] border border-[#263248] text-xs font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
                />
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={36}
                    value={addSingleInput}
                    onChange={(e) => setAddSingleInput(e.target.value)}
                    placeholder="0–36"
                    className="w-20 min-h-[40px] px-2.5 rounded-lg bg-[#0E141F] border border-[#263248] text-xs font-mono text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={handleAddSingleToPreview}
                    className="min-h-[40px] px-3 rounded-lg bg-[#1A2436] hover:bg-[#233149] text-xs text-slate-200 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fixed Bottom Roulette Quant Panel */}
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
    </div>
  );
};
