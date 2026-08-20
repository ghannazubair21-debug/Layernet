export type RiskLevel = "Low" | "Medium" | "High";

export type Transaction = {
  id: string;
  amount: number;
  type: string;
  location: string;
  device: string;
  timestamp: string; // ISO string
  riskScore: number; // 0-100
  risk: RiskLevel;
  status: "Cleared" | "Flagged" | "Reviewed";
};

export type AnalysisResult = {
  id: string;
  riskScore: number;
  risk: RiskLevel;
  probability: number; // 0-1
  decision: "Clear" | "Review" | "Block";
  factors: string[];
  recommendation: string;
  explanation: string;
};
