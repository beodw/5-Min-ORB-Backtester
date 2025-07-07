import type { PriceData } from '@/types';

function generateMockPriceData(numPoints = 500): PriceData[] {
  const data: PriceData[] = [];
  let lastPrice = 100;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - numPoints);

  for (let i = 0; i < numPoints; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    
    // Simple random walk for the price
    const newPrice = lastPrice + (Math.random() - 0.49) * 4;
    
    data.push({
      date,
      price: newPrice,
    });

    lastPrice = newPrice;
  }
  return data;
}

export const mockPriceData = generateMockPriceData();
