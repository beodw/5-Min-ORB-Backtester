import type { PriceData } from '@/types';

function generateMockPriceData(numPoints = 500): PriceData[] {
  const data: PriceData[] = [];
  let price = 100;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - numPoints);

  for (let i = 0; i < numPoints; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);

    // Create a trend with some seasonality and noise
    const trend = i * 0.1;
    const seasonality = Math.sin(i / 20) * 10;
    const noise = (Math.random() - 0.5) * 8;
    
    price = 100 + trend + seasonality + noise;

    data.push({
      date,
      price: Math.max(10, price), // Ensure price doesn't go below a certain threshold
    });
  }
  return data;
}

export const mockPriceData = generateMockPriceData();
