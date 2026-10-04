import { createBehavioralBaseline } from "./behavioralBaseline";
import { analyzeTransaction } from "./fraudAnalysis";
import { engineerTransactionFeatures } from "./featureEngineering";
import { LocalStorageTransactionRepository } from "./transactionStorage";
import type { AnalysisResult, Transaction, TransactionRecord, TransactionRepository } from "./types";

/** Application service; repository injection allows storage to move beyond browser localStorage. */
export class TransactionService {
  constructor(private readonly repository: TransactionRepository) {}

  list(): Promise<Transaction[]> {
    return this.repository.list();
  }

  save(transaction: Transaction): Promise<void> {
    return this.repository.save(transaction);
  }

  clear(): Promise<void> {
    return this.repository.clear();
  }

  async analyze(transaction: TransactionRecord): Promise<AnalysisResult> {
    const history = await this.repository.list();
    const features = engineerTransactionFeatures(transaction, history);
    const behavioralBaseline = createBehavioralBaseline(transaction, history);
    const fallback = analyzeTransaction(transaction);

    return { ...fallback, features, behavioralBaseline };
  }
}

export const transactionService = new TransactionService(new LocalStorageTransactionRepository());
