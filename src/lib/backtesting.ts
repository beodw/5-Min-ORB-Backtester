
import type { Trade, PriceData, PerformanceMetrics } from "@/types";

export function simulateTrade(
  entryIndex: number,
  priceData: PriceData[],
  takeProfitPrice: number,
  stopLossPrice: number,
  position: 'long' | 'short',
): Trade | null {
  const entryData = priceData[entryIndex];
  if (!entryData) return null;

  const entryPrice = entryData.price;

  for (let i = entryIndex + 1; i < priceData.length; i++) {
    const currentData = priceData[i];
    const currentPrice = currentData.price;

    if (position === 'long') {
      // Loss condition for long
      if (currentPrice <= stopLossPrice) {
        return {
          id: `trade-${entryIndex}-${new Date().getTime()}`,
          entryDate: entryData.date,
          entryPrice: entryPrice,
          exitDate: currentData.date,
          exitPrice: stopLossPrice,
          profit: stopLossPrice - entryPrice,
          type: 'loss',
          position: 'long',
        };
      }
      // Win condition for long
      if (currentPrice >= takeProfitPrice) {
        return {
          id: `trade-${entryIndex}-${new Date().getTime()}`,
          entryDate: entryData.date,
          entryPrice: entryPrice,
          exitDate: currentData.date,
          exitPrice: takeProfitPrice,
          profit: takeProfitPrice - entryPrice,
          type: 'win',
          position: 'long',
        };
      }
    } else { // 'short' position
      // Loss condition for short
      if (currentPrice >= stopLossPrice) {
        return {
          id: `trade-${entryIndex}-${new Date().getTime()}`,
          entryDate: entryData.date,
          entryPrice: entryPrice,
          exitDate: currentData.date,
          exitPrice: stopLossPrice,
          profit: entryPrice - stopLossPrice,
          type: 'loss',
          position: 'short',
        };
      }
      // Win condition for short
      if (currentPrice <= takeProfitPrice) {
        return {
          id: `trade-${entryIndex}-${new Date().getTime()}`,
          entryDate: entryData.date,
          entryPrice: entryPrice,
          exitDate: currentData.date,
          exitPrice: takeProfitPrice,
          profit: entryPrice - takeProfitPrice,
          type: 'win',
          position: 'short',
        };
      }
    }
  }

  // If trade is not closed by the end of the data, we don't include it
  return null;
}

export function calculatePerformanceMetrics(trades: Trade[]): PerformanceMetrics {
  if (trades.length === 0) {
    return {
      totalProfitLoss: 0,
      winRate: 0,
      maxDrawdown: 0,
      totalTrades: 0,
      profitFactor: 0,
      averageProfit: 0,
      averageLoss: 0,
    };
  }

  let totalProfitLoss = 0;
  let winningTrades = 0;
  let losingTrades = 0;
  let grossProfit = 0;
  let grossLoss = 0;

  let equity = 0;
  let peakEquity = 0;
  let maxDrawdown = 0;

  trades.forEach(trade => {
    totalProfitLoss += trade.profit;
    equity += trade.profit;
    
    if (equity > peakEquity) {
      peakEquity = equity;
    }
    
    const drawdown = peakEquity - equity;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }

    if (trade.type === 'win') {
      winningTrades++;
      grossProfit += trade.profit;
    } else {
      losingTrades++;
      grossLoss += Math.abs(trade.profit);
    }
  });

  const totalTrades = trades.length;
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : Infinity;
  const averageProfit = winningTrades > 0 ? grossProfit / winningTrades : 0;
  const averageLoss = losingTrades > 0 ? grossLoss / losingTrades : 0;

  return {
    totalProfitLoss,
    winRate,
    maxDrawdown,
    totalTrades,
    profitFactor,
    averageProfit,
    averageLoss,
  };
}
