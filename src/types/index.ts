

import type { Time, Coordinate, IChartApi, ISeriesApi } from 'lightweight-charts';

export interface PriceData {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  wick: [number, number];
}

export type AggregatedPriceData = {
  '1m': PriceData[];
  '15m': PriceData[];
  '1h': PriceData[];
  '1d': PriceData[];
};

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
  entryDate: Date;
  widthInPoints: number;
  position: 'long' | 'short';
}

export interface PriceMarker {
  id: string;
  price: number;
  label?: string;
  isDeletable?: boolean;
}

export interface OpeningRange {
  high: number;
  low: number;
}

export interface MeasurementPoint {
  index: number;
  price: number;
}

export interface MeasurementTool {
  id: string;
  startPoint: MeasurementPoint;
  endPoint: MeasurementPoint;
}

export interface JournalTrade {
  pair: string;
  dateTaken: Date;
  dateClosed: Date;
  maxR: number;
  status: 'traded' | 'not traded' | 'default';
  originalRow: string[]; // To preserve the original CSV row data
  originalOutcome: 'Win' | 'Loss';
  outcome: 'Win' | 'Loss';
}

export interface ChartApi {
    timeToCoordinate: ((time: Time) => Coordinate | null) | undefined;
    coordinateToTime: ((coord: number) => Time | null) | undefined;
    priceToCoordinate: ((price: number) => Coordinate | null) | undefined;
    coordinateToPrice: ((coord: number) => number | null) | undefined;
    chartElement: HTMLDivElement | null;
    data: PriceData[];
    chart: IChartApi | null;
    series: ISeriesApi<'Candlestick'> | null;
}

    