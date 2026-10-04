export type RiskLevel = "Low" | "Medium" | "High";
export type TransactionDecision = "Clear" | "Review" | "Block";
export type ModelFamily =
  | "xgboost"
  | "random-forest"
  | "isolation-forest"
  | "temporal-transformer";

export type DeviceInformation = {
  id?: string;
  type?: string;
  operatingSystem?: string;
  browser?: string;
};

/** Source transaction facts. Account and device identifiers are optional because current inputs may not provide them. */
export type TransactionRecord = {
  transactionId: string;
  accountId?: string;
  timestamp: string;
  amount: number;
  type: string;
  location?: string;
  channel?: string;
  deviceId?: string;
  deviceInfo?: DeviceInformation;
  /** Optional upstream velocity snapshot; asOf must be strictly earlier than timestamp. */
  velocity?: {
    asOf: string;
    transactionsLastHour?: number;
    transactionsLast24Hours?: number;
    amountLast24Hours?: number;
  };
};

/** UI/history projection. Risk and workflow fields are kept separate from TransactionRecord input features. */
export type Transaction = TransactionRecord & {
  riskScore: number;
  risk: RiskLevel;
  status: "Cleared" | "Flagged" | "Reviewed";
};

export type TransactionFeatures = {
  schemaVersion: "layernet.transaction-features.v1";
  amount: number;
  amountLog1p: number;
  hourUtc: number;
  hourSin: number;
  hourCos: number;
  dayOfWeekUtc: number;
  isWeekendUtc: boolean;
  minutesSincePreviousTransaction: number | null;
  transactionsLastHour: number | null;
  transactionsLast24Hours: number | null;
  amountLast24Hours: number | null;
  locationChanged: boolean | null;
  channelChanged: boolean | null;
  deviceChanged: boolean | null;
  userBehavior: {
    historicalTransactionCount: number;
    averageAmount: number | null;
    amountStandardDeviation: number | null;
    amountZScore: number | null;
  };
};

export type BehavioralBaseline = {
  accountId: string | null;
  asOf: string;
  historicalTransactionCount: number;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  averageAmount: number | null;
  amountStandardDeviation: number | null;
  mostCommonLocation: string | null;
  mostCommonChannel: string | null;
  mostCommonDeviceId: string | null;
};

export type AnalysisResult = {
  transactionId: string;
  riskScore: number;
  risk: RiskLevel;
  decision: TransactionDecision;
  factors: string[];
  recommendation: string;
  explanation: string;
  method: string;
  scoreMeaning: string;
  limitations: string[];
  features: TransactionFeatures;
  behavioralBaseline: BehavioralBaseline;
};

export type ModelInferenceInput = {
  transaction: TransactionRecord;
  features: TransactionFeatures;
};

/** Contract for future trained-model adapters. No implementation is registered in Phase 1. */
export type ModelPrediction = {
  family: ModelFamily;
  modelVersion: string;
  score: number;
  scoreMeaning: string;
  evidence?: string[];
};

export interface TrainedFraudModel {
  readonly family: ModelFamily;
  predict(input: ModelInferenceInput): Promise<ModelPrediction>;
}

export type EnsembleScore = {
  score: number;
  method: string;
  componentPredictions: ModelPrediction[];
};

export interface EnsembleScorer {
  combine(predictions: ModelPrediction[]): EnsembleScore;
}

export interface TransactionRepository {
  list(): Promise<Transaction[]>;
  save(transaction: Transaction): Promise<void>;
  clear(): Promise<void>;
}
