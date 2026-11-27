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
    const behavioralBaseline = createBehavioralBaseline(transaction, history);
    // Reuse the same baseline for feature output instead of recalculating its
    // account history and statistics a second time.
    const features = engineerTransactionFeatures(transaction, history, behavioralBaseline);
    const fallback = analyzeTransaction(transaction);

    return { ...fallback, features, behavioralBaseline };
  }
}

export const transactionService = new TransactionService(new LocalStorageTransactionRepository());
