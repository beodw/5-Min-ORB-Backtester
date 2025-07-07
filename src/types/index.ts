export interface PriceData {
  date: Date;
  price: number;
}

export interface Trade {
  id: string;
  entryDate: Date;
  entryPrice: number;
  exitDate: Date;
  exitPrice: number;
  profit: number;
  type: 'win' | 'loss';
}

export interface PerformanceMetrics {
  totalProfitLoss: number;
  winRate: number;
  maxDrawdown: number;
  totalTrades: number;
  profitFactor: number;
  averageProfit: number;
  averageLoss: number;
}

export interface RiskRewardTool {
  id: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  entryIndex: number;
  widthInPoints: number;
}
