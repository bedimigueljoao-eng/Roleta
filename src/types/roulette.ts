export type RouletteColor = 'red' | 'black' | 'green';

export type Dozen = '1st' | '2nd' | '3rd' | 'none';

export type Column = 'col1' | 'col2' | 'col3' | 'none';

export type Parity = 'even' | 'odd' | 'none';

export type Half = 'low' | 'high' | 'none';

export type WheelSector = 'voisins' | 'tiers' | 'orphelins' | 'zero_spiel';

export type SpinSource = 'manual' | 'ocr_live' | 'ocr_500' | 'demo' | 'import';

export type OriginBucket = 'historical' | 'session';

export interface SpinEntry {
  id: string;
  number: number; // 0..36 strictly
  timestamp: number;
  source: SpinSource;
  originBucket: OriginBucket;
  /** Optional prediction outcome evaluated right when this spin landed */
  predictionResult?: {
    action: 'ENTRAR' | 'AGUARDAR';
    targetLabel: string;
    outcome: 'OK' | 'X' | 'SKIP';
    netUnits: number;
    confidence: number;
  };
  /** User-confirmed real wager ("Apostei") settled when this spin landed */
  realBet?: {
    targetLabel: string;
    stakeAmount: number;
    won: boolean;
    profitAmount: number;
  };
}

export type BetTargetType =
  | 'red'
  | 'black'
  | 'even'
  | 'odd'
  | 'low'
  | 'high'
  | 'dozen_1'
  | 'dozen_2'
  | 'dozen_3'
  | 'col_1'
  | 'col_2'
  | 'col_3'
  | 'sector_voisins'
  | 'sector_tiers'
  | 'sector_orphelins'
  | 'sector_zero_spiel'
  | 'neighbors'
  | 'straight';

export type TriggerConditionType =
  | 'absence_streak'
  | 'repeat_streak'
  | 'zero_hit'
  | 'hot_sector'
  | 'cold_sector'
  | 'hot_number'
  | 'alternation_break'
  | 'dozen_gap';

export type TriggerSubject =
  | BetTargetType
  | 'any_color'
  | 'any_dozen'
  | 'any_column'
  | 'any_parity';

export interface StrategyTrigger {
  id: string;
  type: TriggerConditionType;
  subject: TriggerSubject;
  threshold: number;
  lookbackWindow?: number;
}

export interface RouletteStrategy {
  id: string;
  name: string;
  description: string;
  isBuiltin: boolean;
  enabled: boolean;
  triggers: StrategyTrigger[];
  triggerLogic: 'ALL' | 'ANY';
  betTarget: BetTargetType;
  neighborCenter?: number;
  neighborRadius?: number;
  straightNumbers?: number[];
  baseWeight: number;
  learnedWeight: number;
  minConfidenceToEnter: number;
  maxVolatilityPause: boolean;
  createdAt: number;
  version: number;
  parentId?: string;
}

export interface StrategySignal {
  strategyId: string;
  strategyName: string;
  action: 'ENTRAR' | 'AGUARDAR';
  betTarget: BetTargetType;
  coveredNumbers: number[];
  rawConfidence: number; // 0..100
  weightedScore: number;
  roundsRemaining: number; // 0 when ready to trigger, >0 estimated rounds to trigger
  reason: string;
}

export interface ForcedDirectionalSuggestion {
  betTarget: BetTargetType;
  targetLabel: string;
  coveredNumbers: number[];
  confidence: number;
  payoutMultiplier: number;
  reason: string;
}

export interface MasterRecommendation {
  action: 'ENTRAR' | 'AGUARDAR';
  betTarget: BetTargetType | null;
  targetLabel: string;
  coveredNumbers: number[];
  confidence: number; // 0..100
  suggestedUnits: number;
  payoutMultiplier: number;
  roundsToWait: number | null;
  waitLabel: string;
  forcedSuggestion: ForcedDirectionalSuggestion | null;
  contributingSignals: StrategySignal[];
  reasons: string[];
  blockedByBankroll: boolean;
  bankrollBlockReason?: string;
  sampleSize: number;
}

export interface PointInTimePrediction {
  spinIndex: number;
  spinNumber: number;
  strategyId: string;
  action: 'ENTRAR' | 'AGUARDAR';
  betTarget: BetTargetType;
  coveredNumbers: number[];
  won: boolean;
  netUnits: number;
  cumulativeUnits: number;
  confidence: number;
}

export interface WindowMetrics {
  windowSize: number;
  actualSpins: number;
  signalsTriggered: number;
  wins: number;
  losses: number;
  hitRate: number; // %
  theoreticalHitRate: number; // %
  netUnits: number;
  roi: number; // %
  maxDrawdownUnits: number;
}

export interface StrategyEvaluationReport {
  strategyId: string;
  strategyName: string;
  enabled: boolean;
  totalSpinsEvaluated: number;
  totalSignals: number;
  wins: number;
  losses: number;
  hitRate: number;
  theoreticalHitRate: number;
  netUnits: number;
  roi: number;
  maxDrawdownUnits: number;
  consistencyScore: number; // 0..100
  windows: Record<number, WindowMetrics>;
  trainMetrics: WindowMetrics;
  validationMetrics: WindowMetrics; // Out-of-sample
  recentHitRate: number;
  previousLearnedWeight: number;
  updatedLearnedWeight: number;
  sampleAlert: string | null;
  efficacyDropAlert: string | null;
  equityCurve: { index: number; netUnits: number; won: boolean }[];
}

export interface ContinuousLearningState {
  lastEvaluatedSpinCount: number;
  updatedAt: number;
  trainRatio: number; // e.g. 0.7
  reports: StrategyEvaluationReport[];
  overallPointInTimeHitRate: number;
  overallSignals: number;
  overallWins: number;
  overallNetUnits: number;
  overallMaxDrawdown: number;
  recentOutcomes: ('OK' | 'X')[];
}

export interface OptimizationProposal {
  id: string;
  strategyId: string;
  strategyName: string;
  title: string;
  rationale: string;
  expectedImpact: string;
  patch: Partial<RouletteStrategy>;
  simulatedBaselineRoi: number;
  simulatedProposedRoi: number;
  simulatedBaselineDrawdown: number;
  simulatedProposedDrawdown: number;
  simulatedBaselineHitRate: number;
  simulatedProposedHitRate: number;
}

export interface StrategySnapshot {
  id: string;
  createdAt: number;
  label: string;
  spinCount: number;
  strategyCount: number;
  overallHitRate: number;
  overallRoi: number;
  strategies: RouletteStrategy[];
}

export interface BankrollConfig {
  initialBankroll: number;
  baseChip: number;
  minBetPercent: number; // e.g. 1% or 2% of current bankroll
  minBetFloor: number; // minimum table chip in currency
  maxWaitRounds: number; // e.g. 6 rounds max wait horizon
  stopLossAmount: number;
  profitTargetAmount: number;
  pauseAfterConsecutiveLosses: number;
  antiMartingaleProtection: boolean;
  currencySymbol: string;
  apiServerUrl?: string; // optional remote API base URL for standalone APK OCR/AI
}

export interface BankrollSessionState {
  currentBankroll: number;
  sessionNetProfit: number;
  consecutiveLosses: number;
  consecutiveWins: number;
  totalBetsPlaced: number;
  betsWon: number;
  betsLost: number;
  realBetsPlaced: number;
  realBetsWon: number;
  realBetsLost: number;
  realTotalWonAmount: number;
  realTotalLostAmount: number;
  realNetProfit: number;
  minRecommendedBet: number;
  isPaused: boolean;
  pauseReason: string | null;
  stopLossReached: boolean;
  profitTargetReached: boolean;
  maxSessionDrawdown: number;
  peakProfit: number;
}

export interface RoiRegion {
  xPercent: number; // 0..100
  yPercent: number; // 0..100
  widthPercent: number; // 5..100
  heightPercent: number; // 5..100
}

export interface NumberStat {
  number: number;
  count: number;
  frequencyPercent: number;
  theoreticalPercent: number;
  deviationPercent: number;
  lastSeenAgo: number; // spins since last seen (n if never)
  maxAbsence: number;
}

export interface CategoryStat {
  key: string;
  label: string;
  count: number;
  frequencyPercent: number;
  theoreticalPercent: number;
  deviationPercent: number;
  currentAbsence: number;
  maxAbsence: number;
  currentStreak: number;
  maxStreak: number;
}

export interface RouletteStatsSummary {
  sampleSize: number;
  historicalCount: number;
  sessionCount: number;
  numberStats: NumberStat[];
  hotNumbers: NumberStat[];
  coldNumbers: NumberStat[];
  colors: CategoryStat[];
  dozens: CategoryStat[];
  columns: CategoryStat[];
  parities: CategoryStat[];
  halves: CategoryStat[];
  sectors: CategoryStat[];
  chiSquareScore: number;
  independenceNotice: string;
}

export interface DemoDataset {
  id: string;
  name: string;
  description: string;
  spinCount: number;
  profile: string;
  numbers: number[];
}

export interface AiAnalysisResult {
  source: 'gemini' | 'local';
  generatedAt: number;
  headline: string;
  summary: string;
  observedPatterns: string[];
  strategyDiagnostics: string[];
  riskWarnings: string[];
  suggestedAdjustments: string[];
  independenceDisclaimer: string;
}

export interface LearningBackupPayload {
  version: 1;
  exportedAt: number;
  strategies: RouletteStrategy[];
  snapshots: StrategySnapshot[];
  bankrollConfig: BankrollConfig;
}

export interface SessionExportPayload {
  version: 1;
  exportedAt: number;
  spins: SpinEntry[];
  bankrollConfig: BankrollConfig;
}
