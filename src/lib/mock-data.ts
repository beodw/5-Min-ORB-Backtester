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
    const close = open + (Math.random() - 0.5) * 5;
    const high = Math.max(open, close) + Math.random() * 3;
    const low = Math.min(open, close) - Math.random() * 3;
    
    data.push({
      date,
      open: Math.max(10, open),
      high: Math.max(10, high),
      low: Math.max(10, low),
      close: Math.max(10, close),
    });

    lastClose = data[data.length - 1].close;
  }
  return data;
}

export const mockPriceData = generateMockPriceData();
