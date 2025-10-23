
"use client";

import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  UTCTimestamp,
  Time,
  TimeRange,
} from "lightweight-charts";
import type { PriceData, Trade, RiskRewardTool as RRToolType, PriceMarker as PriceMarkerType, MeasurementTool as MeasurementToolType, OpeningRange, AggregatedPriceData } from "@/types";
import { RiskRewardTool } from "./risk-reward-tool";
import { PriceMarker } from "./price-marker";
import { MeasurementTool } from "./measurement-tool";
import { useMemo, useRef, useState, useCallback, useEffect } from "react";

export type ChartClickData = {
    price: number;
    date: Date;
    dataIndex: number;
    closePrice: number;
    yDomain: [number, number];
    xDomain: [number, number];
    candle: PriceData;
};

interface InteractiveChartProps {
  data: AggregatedPriceData;
  trades: Trade[];
  onChartClick: (data: ChartClickData) => void;
  onChartMouseMove: (data: ChartClickData) => void;
  rrTools: RRToolType[];
  onUpdateTool: (tool: RRToolType) => void;
  onRemoveTool: (id: string) => void;
  isPlacingRR: boolean;
  isPlacingPriceMarker: boolean;
  priceMarkers: PriceMarkerType[];
  onRemovePriceMarker: (id: string) => void;
  onUpdatePriceMarker: (id: string, price: number) => void;
  measurementTools: MeasurementToolType[];
  onRemoveMeasurementTool: (id: string) => void;
  liveMeasurementTool: MeasurementToolType | null;
  pipValue: number;
  timeframe: string;
  timeZone: string;
  endDate?: Date;
  isYAxisLocked: boolean;
  openingRange: OpeningRange | null;
  tab: 'backtester' | 'journal';
}

const convertToCandlestickData = (priceData: PriceData[]): CandlestickData[] => {
    return priceData.map(d => ({
        time: (d.date.getTime() / 1000) as UTCTimestamp,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
    }));
}

const getAggregationLevel = (rangeInMinutes: number) => {
    const minutesInDay = 1440;
    if (rangeInMinutes > 30 * minutesInDay) return '1d';
    if (rangeInMinutes > 7 * minutesInDay) return '1h';
    if (rangeInMinutes > 2 * minutesInDay) return '15m';
    return '1m';
};


export function InteractiveChart({ 
    data, 
    timeZone, 
    endDate
}: InteractiveChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const [currentAggregation, setCurrentAggregation] = useState('1m');

    const handleVisibleTimeRangeChange = (newVisibleTimeRange: TimeRange | null) => {
        if (!newVisibleTimeRange || !chartRef.current) return;

        const from = (newVisibleTimeRange.from as UTCTimestamp) * 1000;
        const to = (newVisibleTimeRange.to as UTCTimestamp) * 1000;

        const rangeInMinutes = (to - from) / (60 * 1000);
        const newAggregation = getAggregationLevel(rangeInMinutes);

        if (newAggregation !== currentAggregation) {
            setCurrentAggregation(newAggregation);
        }
    };
    
    const displayData = useMemo(() => {
        const selectedData = data[currentAggregation as keyof AggregatedPriceData] || data['1m'];
        if (endDate) {
            return selectedData.filter(point => point.date <= endDate);
        }
        return selectedData;
    }, [data, currentAggregation, endDate]);


    useEffect(() => {
        if (!chartContainerRef.current) return;
        
        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { color: 'hsl(var(--background))' },
                textColor: 'hsl(var(--foreground))',
            },
            grid: {
                vertLines: { color: 'hsl(var(--border))' },
                horzLines: { color: 'hsl(var(--border))' },
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
                borderColor: 'hsl(var(--border))',
            },
            rightPriceScale: {
                borderColor: 'hsl(var(--border))',
            },
            crosshair: {
                mode: 1, // Magnet mode
            },
        });
        chartRef.current = chart;

        const candlestickSeries = chart.addCandlestickSeries({
            upColor: 'hsl(var(--accent))',
            downColor: 'hsl(var(--destructive))',
            borderDownColor: 'hsl(var(--destructive))',
            borderUpColor: 'hsl(var(--accent))',
            wickDownColor: 'hsl(var(--destructive))',
            wickUpColor: 'hsl(var(--accent))',
        });
        candlestickSeriesRef.current = candlestickSeries;
        
        chart.timeScale().fitContent();

        chart.timeScale().subscribeVisibleTimeRangeChange(handleVisibleTimeRangeChange);

        return () => {
            chart.timeScale().unsubscribeVisibleTimeRangeChange(handleVisibleTimeRangeChange);
            chart.remove();
            chartRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (candlestickSeriesRef.current) {
            const chartData = convertToCandlestickData(displayData);
            candlestickSeriesRef.current.setData(chartData);

            // Don't auto-scroll if user is zoomed in
            const timeScale = chartRef.current?.timeScale();
            if (timeScale) {
                const logicalRange = timeScale.getVisibleLogicalRange();
                if(logicalRange && logicalRange.from < 5 && logicalRange.to > 5) {
                    timeScale.scrollToPosition(chartData.length, false);
                }
            }
        }
    }, [displayData]);

    useEffect(() => {
        if (chartRef.current) {
            chartRef.current.applyOptions({
                timeScale: {
                    timeVisible: true,
                    secondsVisible: true,
                }
            });
        }
    }, [timeZone]);

    return (
        <div ref={chartContainerRef} className="w-full h-full relative" />
    );
}
