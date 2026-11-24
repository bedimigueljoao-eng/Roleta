import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import type { RoiRegion } from '../types/roulette';

export interface RouletteSplitBrowserPluginInterface {
  openSplitBrowser(options: {
    url: string;
    splitPercent: number;
    preserveCookies?: boolean;
  }): Promise<{ opened: boolean; url: string }>;
  closeSplitBrowser(): Promise<{ closed: boolean }>;
  updateSplitPercent(options: { splitPercent: number }): Promise<{ splitPercent: number }>;
  navigateTo(options: { url: string }): Promise<{ url: string }>;
  setRoiOverlay(options: {
    visible: boolean;
    roi?: RoiRegion;
  }): Promise<{ visible: boolean } & RoiRegion>;
  captureRoiFrame(options: {
    roi: RoiRegion;
  }): Promise<{ imageDataUrl: string; width: number; height: number }>;
  addListener(
    eventName: 'roiChanged',
    listenerFunc: (roi: RoiRegion) => void
  ): Promise<PluginListenerHandle>;
}

const NativePlugin = registerPlugin<RouletteSplitBrowserPluginInterface>('RouletteSplitBrowser');

export function isNativeAndroidPlatform(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export async function nativeOpenSplitBrowser(url: string, splitPercent: number): Promise<boolean> {
  if (!isNativeAndroidPlatform()) return false;
  try {
    const res = await NativePlugin.openSplitBrowser({
      url,
      splitPercent,
      preserveCookies: true,
    });
    return res.opened;
  } catch {
    return false;
  }
}

export async function nativeCloseSplitBrowser(): Promise<boolean> {
  if (!isNativeAndroidPlatform()) return false;
  try {
    const res = await NativePlugin.closeSplitBrowser();
    return res.closed;
  } catch {
    return false;
  }
}

export async function nativeUpdateSplitPercent(splitPercent: number): Promise<void> {
  if (!isNativeAndroidPlatform()) return;
  try {
    await NativePlugin.updateSplitPercent({ splitPercent });
  } catch {
    // ignore
  }
}

export async function nativeNavigateUrl(url: string): Promise<void> {
  if (!isNativeAndroidPlatform()) return;
  try {
    await NativePlugin.navigateTo({ url });
  } catch {
    // ignore
  }
}

export async function nativeSetRoiOverlay(visible: boolean, roi?: RoiRegion): Promise<void> {
  if (!isNativeAndroidPlatform()) return;
  try {
    await NativePlugin.setRoiOverlay({ visible, roi });
  } catch {
    // ignore
  }
}

export async function nativeSubscribeRoiChanges(
  onChange: (roi: RoiRegion) => void
): Promise<(() => void) | null> {
  if (!isNativeAndroidPlatform()) return null;
  try {
    const handle = await NativePlugin.addListener('roiChanged', onChange);
    return () => {
      handle.remove();
    };
  } catch {
    return null;
  }
}

/**
 * On Android APK: captures ONLY the native WebView ROI rectangle via PixelCopy/Bitmap
 * without recording the entire system screen.
 */
export async function nativeCaptureRoiFrame(roi: RoiRegion): Promise<string | null> {
  if (!isNativeAndroidPlatform()) return null;
  try {
    const res = await NativePlugin.captureRoiFrame({ roi });
    return res.imageDataUrl ?? null;
  } catch {
    return null;
  }
}

/**
 * Web/Desktop helper: crops a VideoFrame or HTMLImageElement / Canvas according to RoiRegion
 * and returns a clean JPEG base64 DataURL.
 */
export function cropCanvasByRoi(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  roi: RoiRegion
): string {
  const sx = Math.max(0, Math.floor((roi.xPercent / 100) * sourceWidth));
  const sy = Math.max(0, Math.floor((roi.yPercent / 100) * sourceHeight));
  const sw = Math.max(
    20,
    Math.min(sourceWidth - sx, Math.floor((roi.widthPercent / 100) * sourceWidth))
  );
  const sh = Math.max(
    20,
    Math.min(sourceHeight - sy, Math.floor((roi.heightPercent / 100) * sourceHeight))
  );

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas.toDataURL('image/jpeg', 0.92);
}
