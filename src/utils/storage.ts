import type {
  BankrollConfig,
  RoiRegion,
  RouletteStrategy,
  SpinEntry,
  StrategySnapshot,
} from '../types/roulette';
import { DEFAULT_BANKROLL_CONFIG } from '../engine/rouletteBankroll';
import { BUILTIN_STRATEGIES } from '../engine/strategyBuilder';

const DB_NAME = 'RoletaQuantLabDB';
const DB_VERSION = 1;
const STORE_NAME = 'quant_store';

const SESSION_KEY = 'rql_current_session_v1';
const LEARNING_BACKUP_KEY = 'rql_learning_backup_v1';

export interface StoredSessionState {
  spins: SpinEntry[];
  browserUrl: string;
  splitPercent: number;
  roiRegion: RoiRegion;
  minConfluence: number;
  updatedAt: number;
}

export interface StoredLearningState {
  strategies: RouletteStrategy[];
  snapshots: StrategySnapshot[];
  bankrollConfig: BankrollConfig;
  updatedAt: number;
}

export const DEFAULT_ROI_REGION: RoiRegion = {
  xPercent: 4,
  yPercent: 72,
  widthPercent: 92,
  heightPercent: 18,
};

export const DEFAULT_SESSION_STATE: StoredSessionState = {
  spins: [],
  browserUrl: 'https://www.kwanzabet.ao',
  splitPercent: 56,
  roiRegion: DEFAULT_ROI_REGION,
  minConfluence: 1,
  updatedAt: Date.now(),
};

export const DEFAULT_LEARNING_STATE: StoredLearningState = {
  strategies: BUILTIN_STRATEGIES,
  snapshots: [],
  bankrollConfig: DEFAULT_BANKROLL_CONFIG,
  updatedAt: Date.now(),
};

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      resolve(null);
      return;
    }
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbSet<T>(key: string, value: T): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function loadSessionState(): Promise<StoredSessionState> {
  const fromIdb = await idbGet<StoredSessionState>(SESSION_KEY);
  if (fromIdb) return { ...DEFAULT_SESSION_STATE, ...fromIdb };

  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      return { ...DEFAULT_SESSION_STATE, ...JSON.parse(raw) };
    }
  } catch {
    // ignore storage parse failures
  }
  return DEFAULT_SESSION_STATE;
}

export async function saveSessionState(state: StoredSessionState): Promise<void> {
  const payload = { ...state, updatedAt: Date.now() };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota exceeded on localStorage; IndexedDB handles up to hundreds of MB
  }
  await idbSet(SESSION_KEY, payload);
}

export async function loadLearningState(): Promise<StoredLearningState> {
  const fromIdb = await idbGet<StoredLearningState>(LEARNING_BACKUP_KEY);
  if (fromIdb && Array.isArray(fromIdb.strategies) && fromIdb.strategies.length > 0) {
    return {
      ...DEFAULT_LEARNING_STATE,
      ...fromIdb,
      bankrollConfig: { ...DEFAULT_BANKROLL_CONFIG, ...(fromIdb.bankrollConfig ?? {}) },
    };
  }

  try {
    const raw = localStorage.getItem(LEARNING_BACKUP_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.strategies) && parsed.strategies.length > 0) {
        return {
          ...DEFAULT_LEARNING_STATE,
          ...parsed,
          bankrollConfig: { ...DEFAULT_BANKROLL_CONFIG, ...(parsed.bankrollConfig ?? {}) },
        };
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_LEARNING_STATE;
}

export async function saveLearningState(state: StoredLearningState): Promise<void> {
  const payload = { ...state, updatedAt: Date.now() };
  try {
    localStorage.setItem(LEARNING_BACKUP_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
  await idbSet(LEARNING_BACKUP_KEY, payload);
}
