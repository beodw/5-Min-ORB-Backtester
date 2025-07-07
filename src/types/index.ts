
export interface PriceData {
  date: Date;
  price: number;
}

export interface RiskRewardTool {
  id: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  entryIndex: number;
  widthInPoints: number;
  position: 'long' | 'short';
}
