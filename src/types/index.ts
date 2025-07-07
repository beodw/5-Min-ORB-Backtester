
export interface PriceData {
  date: Date;
  price: number;
}

// Added to fix a type error in InteractiveChart
export interface Trade {
    id: string;
    entryDate: Date;
    entryPrice: number;
    type: 'win' | 'loss';
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
