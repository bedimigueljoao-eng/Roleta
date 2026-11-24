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
  RefreshCw,
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
  nativeSetRoiOverlay,
  nativeSubscribeRoiChanges,
  nativeUpdateSplitPercent,
} from '../bridge/nativeBrowserBridge';
import { extractNumbersFromScreenshot } from '../engine/rouletteAiAnalyst';
import { parseRouletteNumbersFromText } from '../data/rouletteDemos';
import { isValidRouletteNumber } from '../engine/rouletteConstants';
import { RouletteNumberChip } from './RouletteNumberChip';
import { DecisionCockpit, type PendingRealBet } from './DecisionCockpit';

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
  pendingBet: PendingRealBet | null;
  onArmPendingBet: (bet: PendingRealBet | null) => void;
  onChangeBankrollConfig: (next: BankrollConfig) => void;
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
  pendingBet,
  onArmPendingBet,
  onChangeBankrollConfig,
  onSubmitNumber,
  onBatchAddNumbers,
  onUndoLastSpin,
  onClearSessionSpins,
}) => {
  const [urlInput, setUrlInput] = useState(browserUrl);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [showRoiCalibrator, setShowRoiCalibrator] = useState(true);
  const [captureStreamActive, setCaptureStreamActive] = useState(false);
  const [autoFollowActive, setAutoFollowActive] = useState(false);
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrStatusNote, setOcrStatusNote] = useState<string | null>(null);
  const [extractedNumbers, setExtractedNumbers] = useState<number[]>([]);
  const [manualPatchText, setManualPatchText] = useState('');
  const [addSingleInput, setAddSingleInput] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const paneRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>({ active: false, startX: 0, startY: 0, origX: 0, origY: 0 });
  const lastAutoTailRef = useRef<string>('');

  const isAndroid = isNativeAndroidPlatform();

  useEffect(() => {
    setUrlInput(browserUrl);
  }, [browserUrl]);

  // Subscribe to finger-drag ROI events from Android native overlay
  useEffect(() => {
    if (!isAndroid) return;
    let unsub: (() => void) | null = null;
    nativeSubscribeRoiChanges((nextRoi) => {
      onChangeRoiRegion(nextRoi);
    }).then((fn) => {
      unsub = fn;
    });
    return () => {
      if (unsub) unsub();
    };
  }, [isAndroid, onChangeRoiRegion]);

  // Sync Android ROI overlay visibility & coordinates whenever toggled or moved
  useEffect(() => {
    if (!isAndroid || !browserOpen) return;
    nativeSetRoiOverlay(showRoiCalibrator, roiRegion);
  }, [isAndroid, browserOpen, showRoiCalibrator, roiRegion]);

  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (isAndroid) {
        nativeCloseSplitBrowser();
      }
    };
  }, [isAndroid]);

  // Auto-follow live OCR loop when capturing another tab on Desktop/Web
  useEffect(() => {
    if (!autoFollowActive || !captureStreamActive) return;
    const timer = window.setInterval(async () => {
      if (!videoRef.current || videoRef.current.videoWidth <= 0 || ocrLoading) return;
      const dataUrl = cropCanvasByRoi(
        videoRef.current,
        videoRef.current.videoWidth,
        videoRef.current.videoHeight,
        roiRegion
      );
      if (!dataUrl) return;
      const res = await extractNumbersFromScreenshot(dataUrl, 30, bankrollConfig.apiServerUrl);
      if (res.numbers.length > 0) {
        const tailSig = res.numbers.slice(-5).join(',');
        if (tailSig && tailSig !== lastAutoTailRef.current) {
          const prevSig = lastAutoTailRef.current;
          lastAutoTailRef.current = tailSig;
          setCapturedPreviewUrl(dataUrl);
          setExtractedNumbers(res.numbers);
          setManualPatchText(res.numbers.join(', '));
          // If we already have a baseline, append only the newest spin automatically
          if (prevSig) {
            const newest = res.numbers[res.numbers.length - 1];
            if (isValidRouletteNumber(newest)) {
              onBatchAddNumbers([newest], 'session', 'ocr_live');
              setOcrStatusNote(`Acompanhamento automático: novo giro #${newest} registrado.`);
            }
          } else {
            setOcrStatusNote(
              `Acompanhamento conectado (${res.numbers.length} números lidos). Próximos giros entram automático.`
            );
          }
        }
      }
    }, 6000);

    return () => window.clearInterval(timer);
  }, [
    autoFollowActive,
    captureStreamActive,
    roiRegion,
    ocrLoading,
    bankrollConfig.apiServerUrl,
    onBatchAddNumbers,
  ]);

  const handleToggleBrowser = async () => {
    const next = !browserOpen;
    setBrowserOpen(next);
    if (isAndroid) {
      if (next) {
        const safePct = Math.min(64, Math.max(34, splitPercent));
        await nativeOpenSplitBrowser(urlInput, safePct);
        await nativeSetRoiOverlay(showRoiCalibrator, roiRegion);
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
    if (!browserOpen) {
      setBrowserOpen(true);
      if (isAndroid) {
        await nativeOpenSplitBrowser(normalized, Math.min(64, Math.max(34, splitPercent)));
        await nativeSetRoiOverlay(showRoiCalibrator, roiRegion);
        return;
      }
    }
    if (isAndroid) {
      await nativeNavigateUrl(normalized);
    }
  };

  const handleSplitChange = async (pct: number) => {
    onChangeSplitPercent(pct);
    if (!browserOpen) {
      setBrowserOpen(true);
      if (isAndroid) {
        await nativeOpenSplitBrowser(urlInput, pct);
        await nativeSetRoiOverlay(showRoiCalibrator, roiRegion);
        return;
      }
    }
    if (isAndroid && browserOpen) {
      await nativeUpdateSplitPercent(pct);
    }
  };

  const handleStartScreenCapture = async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setOcrStatusNote(
        'Captura de outra aba indisponível neste aparelho. No telefone use o Navegador Embutido acima ou Carregar Print.'
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 10 },
        audio: false,
      });
      mediaStreamRef.current = stream;
      setCaptureStreamActive(true);
      setBrowserOpen(true);
      setShowRoiCalibrator(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        setCaptureStreamActive(false);
        setAutoFollowActive(false);
      });
      setOcrStatusNote(
        'Outra aba conectada! Arraste o quadro amarelo sobre os números da roleta e clique em "Fazer Print e Ler" ou ative "Acompanhar Auto".'
      );
    } catch {
      setOcrStatusNote(
        'Captura cancelada. Você pode selecionar a aba do cassino novamente ou colar um print (Ctrl+V).'
      );
    }
  };

  const runOcrOnDataUrl = async (dataUrl: string) => {
    setOcrLoading(true);
    setOcrStatusNote('Lendo números (0–36) do quadro ROI...');
    const res = await extractNumbersFromScreenshot(dataUrl, 60, bankrollConfig.apiServerUrl);
    setOcrLoading(false);
    setExtractedNumbers(res.numbers);
    setManualPatchText(res.numbers.join(', '));
    setOcrStatusNote(res.note);
  };

  const handleCaptureRegisterPrint = async () => {
    setOcrStatusNote(null);

    if (isAndroid) {
      if (!browserOpen) {
        setOcrStatusNote('Abra o Navegador Embutido acima primeiro ou carregue um print da galeria.');
        return;
      }
      const dataUrl = await nativeCaptureRoiFrame(roiRegion);
      if (dataUrl) {
        setCapturedPreviewUrl(dataUrl);
        await runOcrOnDataUrl(dataUrl);
        return;
      }
      setOcrStatusNote('Não foi possível capturar a WebView. Tente posicionar o quadro ROI novamente.');
      return;
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

    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result === 'string') {
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
      `${extractedNumbers.length} número(s) enviados para o motor em tempo real.`
    );
    setExtractedNumbers([]);
    setManualPatchText('');
  };

  // Drag ROI box directly on Web/Desktop split pane
  const handleRoiPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStateRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: roiRegion.xPercent,
      origY: roiRegion.yPercent,
    };
  };

  const handleRoiPointerMove = (e: React.PointerEvent) => {
    if (!dragStateRef.current.active || !paneRef.current) return;
    const rect = paneRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const dxPct = ((e.clientX - dragStateRef.current.startX) / rect.width) * 100;
    const dyPct = ((e.clientY - dragStateRef.current.startY) / rect.height) * 100;
    const nextX = Math.max(0, Math.min(100 - roiRegion.widthPercent, Math.round(dragStateRef.current.origX + dxPct)));
    const nextY = Math.max(0, Math.min(100 - roiRegion.heightPercent, Math.round(dragStateRef.current.origY + dyPct)));
    onChangeRoiRegion({ ...roiRegion, xPercent: nextX, yPercent: nextY });
  };

  const handleRoiPointerUp = () => {
    dragStateRef.current.active = false;
  };

  const browserHeightPx = Math.round((splitPercent / 100) * 520);

  return (
    <div className="space-y-3" onPaste={handlePastePrint}>
      {/* Always-accessible Split-Screen, Resize, ROI & OCR Toolbar */}
      <div className="bg-[#131A26] border border-[#232E42] rounded-xl p-3 space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <form onSubmit={handleNavigate} className="flex-1 min-w-[210px] flex items-center gap-2">
            <div className="relative flex-1">
              <Globe className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://www.kwanzabet.ao"
                aria-label="URL do cassino ou roleta"
                className="w-full min-h-[40px] pl-9 pr-3 rounded-lg bg-[#0E141F] border border-[#263248] text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <button
              type="submit"
              className="min-h-[40px] px-3.5 rounded-lg bg-[#1E293B] hover:bg-[#28354B] text-slate-100 text-xs font-semibold whitespace-nowrap transition-colors"
            >
              Abrir URL
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handleToggleBrowser}
              className={`min-h-[40px] px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                browserOpen
                  ? 'bg-rose-500/20 text-rose-200 border border-rose-500/40'
                  : 'bg-emerald-500 text-slate-950'
              }`}
            >
              {browserOpen ? 'Fechar Tela Dividida' : 'Abrir Tela Dividida'}
            </button>

            <div className="flex items-center gap-1 bg-[#0E141F] border border-[#232E42] rounded-lg p-1">
              {[38, 48, 58].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => handleSplitChange(pct)}
                  className={`px-2 py-1 rounded text-xs font-mono tabular-nums transition-colors ${
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
              className={`min-h-[40px] px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 border whitespace-nowrap transition-colors ${
                showRoiCalibrator
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                  : 'bg-[#0E141F] border-[#263248] text-slate-300 hover:text-white'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>{showRoiCalibrator ? 'Ocultar Quadro OCR' : 'Posicionar Quadro OCR'}</span>
            </button>
          </div>
        </div>

        {/* Capture & Cross-Tab PC / Android OCR Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#1E293B]">
          <div className="flex flex-wrap items-center gap-2">
            {!isAndroid && (
              <>
                <button
                  type="button"
                  onClick={handleStartScreenCapture}
                  className="min-h-[40px] px-3 rounded-lg bg-[#1A2436] hover:bg-[#233149] border border-[#2C3B57] text-slate-100 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors"
                >
                  <MonitorPlay className="w-4 h-4 text-emerald-400" />
                  <span>{captureStreamActive ? 'Trocar Aba do PC' : 'Ler Outra Aba / Ecrã (PC)'}</span>
                </button>

                {captureStreamActive && (
                  <button
                    type="button"
                    onClick={() => setAutoFollowActive((v) => !v)}
                    className={`min-h-[40px] px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap border transition-colors ${
                      autoFollowActive
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                        : 'bg-[#1A2436] text-emerald-300 border-[#2C3B57]'
                    }`}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${autoFollowActive ? 'animate-spin' : ''}`} />
                    <span>{autoFollowActive ? 'Acompanhando Auto (6s)' : 'Acompanhar Auto'}</span>
                  </button>
                )}
              </>
            )}

            <button
              type="button"
              onClick={handleCaptureRegisterPrint}
              disabled={ocrLoading}
              className="min-h-[40px] px-3.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-colors"
            >
              <Camera className="w-4 h-4" />
              <span>{ocrLoading ? 'Lendo OCR...' : 'Fazer Print e Ler OCR'}</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={ocrLoading}
              className="min-h-[40px] px-3 rounded-lg bg-[#1A2436] hover:bg-[#233149] border border-[#2C3B57] text-slate-100 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors"
            >
              <Upload className="w-4 h-4 text-slate-300" />
              <span>Enviar Print</span>
            </button>

            {capturedPreviewUrl && (
              <button
                type="button"
                onClick={() => runOcrOnDataUrl(capturedPreviewUrl)}
                disabled={ocrLoading}
                className="min-h-[40px] px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-colors"
              >
                <ScanText className="w-4 h-4" />
                <span>Re-ler</span>
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

          <span className="text-[11px] text-slate-400">
            {isAndroid
              ? 'Android: ajuste 38%/48%/58%, arraste o quadro amarelo sobre os números e toque em "Fazer Print e Ler OCR"'
              : 'PC/Web: clique em "Ler Outra Aba / Ecrã" para acompanhar outra aba do navegador em tempo real'}
          </span>
        </div>

        {/* ROI Positioning Sliders (works on BOTH Android native WebView and PC screen capture) */}
        {showRoiCalibrator && (
          <div className="p-2.5 rounded-lg bg-[#0E141F] border border-amber-500/30 grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            <label className="space-y-1">
              <span className="text-slate-300 font-mono tabular-nums">
                Posição X: {roiRegion.xPercent}%
              </span>
              <input
                type="range"
                min={0}
                max={85}
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
                Largura Quadro: {roiRegion.widthPercent}%
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
                Altura Quadro: {roiRegion.heightPercent}%
              </span>
              <input
                type="range"
                min={5}
                max={65}
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

      {/* Top Split Pane on Web / Desktop (with Draggable ROI Box) */}
      {browserOpen && !isAndroid && (
        <div
          ref={paneRef}
          className="relative bg-[#0E141F] border border-[#232E42] rounded-xl overflow-hidden select-none"
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

          {!captureStreamActive && (
            <div className="absolute top-2 right-2 flex items-center gap-2 bg-[#0B0F17]/90 border border-[#232E42] rounded-lg px-2.5 py-1.5 text-[11px] text-slate-300 backdrop-blur-sm">
              <span>No PC, use "Ler Outra Aba / Ecrã" se o site bloquear iframe</span>
              <a
                href={browserUrl}
                target="_blank"
                rel="noreferrer"
                className="text-emerald-400 hover:underline inline-flex items-center gap-1 font-medium"
              >
                <span>Abrir Aba</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          {/* Draggable ROI Calibration Overlay Box */}
          {showRoiCalibrator && (
            <div
              onPointerDown={handleRoiPointerDown}
              onPointerMove={handleRoiPointerMove}
              onPointerUp={handleRoiPointerUp}
              className="absolute cursor-move border-2 border-amber-400 bg-amber-400/15 rounded touch-none"
              style={{
                left: `${roiRegion.xPercent}%`,
                top: `${roiRegion.yPercent}%`,
                width: `${roiRegion.widthPercent}%`,
                height: `${roiRegion.heightPercent}%`,
              }}
            >
              <span className="inline-block bg-amber-400 text-slate-950 text-[10px] font-bold px-1.5 py-0.5 rounded-br">
                ARRASTE SOBRE OS NÚMEROS (QUADRO OCR)
              </span>
            </div>
          )}
        </div>
      )}

      {/* OCR Extraction & Editable Preview Drawer */}
      {(capturedPreviewUrl || extractedNumbers.length > 0 || ocrStatusNote) && (
        <div className="bg-[#131A26] border border-[#2A3952] rounded-xl p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Prévia Editável da Leitura OCR ({extractedNumbers.length} números)
              </h3>
              {ocrStatusNote && <p className="text-xs text-slate-300 mt-0.5">{ocrStatusNote}</p>}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleInvertOrder}
                disabled={extractedNumbers.length < 2}
                className="min-h-[36px] px-3 rounded-lg bg-[#1A2436] hover:bg-[#223048] disabled:opacity-40 text-xs text-slate-200 flex items-center gap-1.5"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>Inverter</span>
              </button>
              <button
                type="button"
                onClick={handlePushToEngine}
                disabled={extractedNumbers.length === 0}
                className="min-h-[36px] px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 text-xs font-bold flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Aplicar ao Motor</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
            {capturedPreviewUrl && (
              <div className="lg:col-span-4 bg-[#0E141F] border border-[#1E293B] rounded-lg p-2">
                <p className="text-[11px] text-slate-400 mb-1">Recorte ROI capturado</p>
                <img
                  src={capturedPreviewUrl}
                  alt="Recorte ROI dos números da roleta"
                  className="w-full max-h-32 object-contain rounded"
                />
              </div>
            )}

            <div className={`${capturedPreviewUrl ? 'lg:col-span-8' : 'lg:col-span-12'} space-y-2`}>
              <div className="flex flex-wrap gap-1.5">
                {extractedNumbers.map((num, idx) => (
                  <div key={`${idx}-${num}`} className="relative">
                    <RouletteNumberChip number={num} size="sm" />
                    <button
                      type="button"
                      onClick={() => handleRemoveExtractedIndex(idx)}
                      aria-label={`Remover ${num}`}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-slate-900 border border-slate-600 text-slate-300 hover:text-rose-400 flex items-center justify-center"
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
                  className="flex-1 min-w-[200px] min-h-[38px] px-3 rounded-lg bg-[#0E141F] border border-[#263248] text-xs font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
                />
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={36}
                    value={addSingleInput}
                    onChange={(e) => setAddSingleInput(e.target.value)}
                    placeholder="0–36"
                    className="w-16 min-h-[38px] px-2 rounded-lg bg-[#0E141F] border border-[#263248] text-xs font-mono text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={handleAddSingleToPreview}
                    className="min-h-[38px] px-3 rounded-lg bg-[#1A2436] hover:bg-[#233149] text-xs text-slate-200 flex items-center gap-1"
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

      {/* Bottom Quant Cockpit */}
      <DecisionCockpit
        recommendation={recommendation}
        learning={learning}
        bankrollConfig={bankrollConfig}
        bankrollState={bankrollState}
        spins={spins}
        pendingBet={pendingBet}
        onArmPendingBet={onArmPendingBet}
        onChangeBankrollConfig={onChangeBankrollConfig}
        onSubmitNumber={onSubmitNumber}
        onUndoLastSpin={onUndoLastSpin}
        onClearSessionSpins={onClearSessionSpins}
      />
    </div>
  );
};
