import type { PriceData } from '@/types';

function generateMockPriceData(numPoints = 500): PriceData[] {
  const data: PriceData[] = [];
  let lastClose = 100;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - numPoints);

  for (let i = 0; i < numPoints; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);

    const open = lastClose;
    let close = open + (Math.random() - 0.5) * 5;

    // Ensure close and open are never identical to prevent zero-height candles
    if (open === close) {
      close += 0.01;
    }

    // Ensure high is always greater than low
    const high = Math.max(open, close) + Math.random() * 3 + 0.1;
    const low = Math.min(open, close) - Math.random() * 3 - 0.1;
    
    data.push({
      date,
      open,
      high,
      low,
      close,
    });

    lastClose = close;
  }
  return data;
}

export const mockPriceData = generateMockPriceData();
