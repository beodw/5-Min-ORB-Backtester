import type { PriceData } from '@/types';

export const findClosestIndex = (data: PriceData[], timestamp: number): number => {
    if (!data || data.length === 0) return 0;
    return data.reduce((prev, curr, index) => {
        const prevDiff = Math.abs(data[prev].date.getTime() - timestamp);
        const currDiff = Math.abs(curr.date.getTime() - timestamp);
        return currDiff < prevDiff ? index : prev;
    }, 0);
};
