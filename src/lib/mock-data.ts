import type { PriceData } from '@/types';

function generateMockPriceData(numPoints = 500): PriceData[] {
  const data: PriceData[] = [];
  let lastClose = 100;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - numPoints);

  for (let i = 0; i < numPoints; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);

    const open = lastClose + (Math.random() - 0.5) * 2;
    const volatility = Math.random() * 5 + 1; // Ensure some movement
    const close = open + (Math.random() - 0.5) * volatility;
    
    const high = Math.max(open, close) + Math.random() * 2;
    const low = Math.min(open, close) - Math.random() * 2;

    data.push({
      date,
      open,
      high,
      low,
      close,
      wick: [low, high],
    });

    lastClose = close;
  }
  return data;
}

export const mockPriceData = generateMockPriceData();
