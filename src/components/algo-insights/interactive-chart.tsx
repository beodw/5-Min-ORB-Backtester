
"use client";

import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  UTCTimestamp,
  Time,
  TimeRange,
  PriceLineOptions,
  SeriesMarker,
  MouseEventParams,
  IPriceLine,
} from "lightweight-charts";
import type { PriceData, Trade, RiskRewardTool as RRToolType, PriceMarker as PriceMarkerType, MeasurementTool as MeasurementToolType, OpeningRange, AggregatedPriceData, MeasurementPoint } from "@/types";
import { RiskRewardTool } from "./risk-reward-tool";
import { PriceMarker } from "./price-marker";
import { MeasurementTool } from "./measurement-tool";
import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { findClosestIndex } from "@/lib/chart-utils";

export type ChartClickData = {
    price: number;
    date: Date;
    dataIndex: number;
    closePrice: number;
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

const convertToCandlestickData = (priceData: PriceData[]): (CandlestickData & { original: PriceData })[] => {
    if (!priceData) return [];
    return priceData.map(d => ({
        time: (d.date.getTime() / 1000) as UTCTimestamp,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
        original: d
    }));
}

const getAggregationLevel = (rangeInMinutes: number) => {
    const minutesInDay = 1440;
    if (rangeInMinutes > 60 * minutesInDay) return '1d';
    if (rangeInMinutes > 15 * minutesInDay) return '1h';
    if (rangeInMinutes > 3 * minutesInDay) return '15m';
    return '1m';
};


export function InteractiveChart({
    data,
    timeZone,
    endDate,
    rrTools,
    priceMarkers,
    measurementTools,
    liveMeasurementTool,
    onChartClick,
    onChartMouseMove,
    onUpdateTool,
    onRemoveTool,
    onRemovePriceMarker,
    onRemoveMeasurementTool,
    onUpdatePriceMarker,
    pipValue,
    isYAxisLocked,
    openingRange,
}: InteractiveChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const [currentAggregation, setCurrentAggregation] = useState('1m');
    const propsRef = useRef({ onChartClick, onChartMouseMove, displayData: [] as PriceData[] });

    const displayData = useMemo(() => {
        const selectedData = data[currentAggregation as keyof AggregatedPriceData] || data['1m'];
        if (endDate) {
            const endTimestamp = endDate.getTime();
            return selectedData.filter(point => point.date.getTime() <= endTimestamp);
        }
        return selectedData || [];
    }, [data, currentAggregation, endDate]);
    
    propsRef.current.displayData = displayData;

    const chartData = useMemo(() => convertToCandlestickData(displayData), [displayData]);

    useEffect(() => {
        propsRef.current.onChartClick = onChartClick;
        propsRef.current.onChartMouseMove = onChartMouseMove;
    }, [onChartClick, onChartMouseMove]);


    useEffect(() => {
        if (!chartContainerRef.current) return;
        
        const getThemeColor = (tailwindColorClass: string, property: 'color' | 'backgroundColor' = 'color'): string => {
            const tempDiv = document.createElement('div');
            tempDiv.className = `${tailwindColorClass} hidden`;
            document.body.appendChild(tempDiv);
            const color = getComputedStyle(tempDiv)[property];
            document.body.removeChild(tempDiv);
            return color;
        };

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { color: getThemeColor('bg-background', 'backgroundColor') },
                textColor: getThemeColor('text-foreground'),
            },
            grid: {
                vertLines: { color: getThemeColor('text-border') },
                horzLines: { color: getThemeColor('text-border') },
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
                borderColor: getThemeColor('text-border'),
            },
            rightPriceScale: {
                borderColor: getThemeColor('text-border'),
            },
            crosshair: {
                mode: 1, // Magnet mode
            },
        });
        
        chartRef.current = chart;

        const candlestickSeries = chart.addCandlestickSeries({
            upColor: getThemeColor('text-accent'),
            downColor: getThemeColor('text-destructive'),
            borderDownColor: getThemeColor('text-destructive'),
            borderUpColor: getThemeColor('text-accent'),
            wickDownColor: getThemeColor('text-destructive'),
            wickUpColor: getThemeColor('text-accent'),
        });
        candlestickSeriesRef.current = candlestickSeries;

        const handleEvent = (param: MouseEventParams, callback: (data: ChartClickData) => void) => {
            if (!param.point || !param.time || !candlestickSeriesRef.current || !chartRef.current) return;
            
            const price = candlestickSeriesRef.current.coordinateToPrice(param.point.y) as number;
            
            const convertedData = convertToCandlestickData(propsRef.current.displayData);
            const matchingCandles = convertedData.filter(d => d.time === param.time);
            if (matchingCandles.length === 0) return;
    
            const candle = matchingCandles[0];
            const dataIndex = propsRef.current.displayData.findIndex(d => d.date.getTime() / 1000 === candle.time);
            if (dataIndex < 0) return;
    
            const logicalRange = chartRef.current.timeScale().getVisibleLogicalRange();
    
            callback({
                price,
                date: new Date((param.time as number) * 1000),
                dataIndex,
                closePrice: candle.close,
                xDomain: logicalRange ? [logicalRange.from, logicalRange.to] : [0, 0],
                candle: candle.original,
            });
        };

        const handleChartClickEvent = (param: MouseEventParams) => handleEvent(param, propsRef.current.onChartClick);
        const handleChartMouseMoveEvent = (param: MouseEventParams) => handleEvent(param, propsRef.current.onChartMouseMove);
        
        chart.subscribeClick(handleChartClickEvent);
        chart.subscribeCrosshairMove(handleChartMouseMoveEvent);

        const handleResize = () => chart.applyOptions({ width: chartContainerRef.current?.clientWidth, height: chartContainerRef.current?.clientHeight });
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            if (chartRef.current) {
                chartRef.current.remove();
                chartRef.current = null;
            }
        };
    }, []); 

    useEffect(() => {
        if (!chartRef.current) return;
    
        const handleVisibleTimeRangeChange = (newVisibleTimeRange: TimeRange | null) => {
          if (!newVisibleTimeRange || !chartRef.current) return;
    
          const from = (newVisibleTimeRange.from as UTCTimestamp) * 1000;
          const to = (newVisibleTimeRange.to as UTCTimestamp) * 1000;
    
          const rangeInMinutes = (to - from) / (60 * 1000);
          const newAggregation = getAggregationLevel(rangeInMinutes);
          
          setCurrentAggregation(prev => {
              if (prev === newAggregation) {
                  return prev; // Don't cause a re-render if the aggregation level is the same
              }
              return newAggregation;
          });
        };
    
        const timeScale = chartRef.current.timeScale();
        timeScale.subscribeVisibleTimeRangeChange(handleVisibleTimeRangeChange);
    
        return () => {
          timeScale.unsubscribeVisibleTimeRangeChange(handleVisibleTimeRangeChange);
        };
      }, []);

    useEffect(() => {
        if (candlestickSeriesRef.current) {
            candlestickSeriesRef.current.setData(chartData);

            if(endDate && chartData.length > 0) {
                 const timeScale = chartRef.current?.timeScale();
                 if(timeScale) {
                    const lastDataTime = chartData[chartData.length - 1].time;
                    timeScale.setVisibleRange({
                        from: lastDataTime - (60 * 60 * 3), 
                        to: lastDataTime
                    });
                 }
            }
        }
    }, [chartData, endDate]); 
    
    useEffect(() => {
        if (chartRef.current) {
            chartRef.current.applyOptions({
                localization: {
                    timeFormatter: (timestamp: UTCTimestamp) => {
                       return new Date(timestamp * 1000).toLocaleTimeString();
                    }
                },
                timeScale: {
                    timeVisible: true,
                    secondsVisible: false,
                    rightOffset: 10,
                }
            });
        }
    }, [timeZone]);

    useEffect(() => {
        if (chartRef.current) {
            chartRef.current.priceScale('right').applyOptions({
                autoScale: isYAxisLocked,
            });
        }
    }, [isYAxisLocked]);
    
    const drawnObjects = useRef<{
        rrTools: { [id: string]: RiskRewardTool };
        priceMarkers: { [id: string]: PriceMarker };
        measurementTools: { [id: string]: MeasurementTool };
    }>({ rrTools: {}, priceMarkers: {}, measurementTools: {} }).current;
    
    const timeToCoordinate = useCallback((time: Time) => chartRef.current?.timeScale().timeToCoordinate(time), []);
    const coordinateToTime = useCallback((coord: number) => chartRef.current?.timeScale().coordinateToTime(coord), []);
    const priceToCoordinate = useCallback((price: number) => candlestickSeriesRef.current?.priceScale().priceToCoordinate(price), []);
    const coordinateToPrice = useCallback((coord: number) => candlestickSeriesRef.current?.priceScale().coordinateToPrice(coord), []);
    
    const chartApi = useMemo(() => ({
        timeToCoordinate,
        coordinateToTime,
        priceToCoordinate,
        coordinateToPrice,
        chartElement: chartContainerRef.current,
        data: displayData,
    }), [timeToCoordinate, coordinateToTime, priceToCoordinate, coordinateToPrice, displayData]);

    const openingRangeLines = useRef<[IPriceLine?, IPriceLine?]>([undefined, undefined]);

    useEffect(() => {
        if (!candlestickSeriesRef.current) return;
    
        if (openingRangeLines.current[0]) candlestickSeriesRef.current.removePriceLine(openingRangeLines.current[0]);
        if (openingRangeLines.current[1]) candlestickSeriesRef.current.removePriceLine(openingRangeLines.current[1]);
        openingRangeLines.current = [undefined, undefined];
    
        if (openingRange) {
            const highLine: PriceLineOptions = {
                price: openingRange.high,
                color: 'rgba(255, 255, 0, 0.7)',
                lineWidth: 1,
                lineStyle: 2, // Dashed
                axisLabelVisible: true,
                title: 'OR High',
            };
            const lowLine: PriceLineOptions = {
                price: openingRange.low,
                color: 'rgba(255, 255, 0, 0.7)',
                lineWidth: 1,
                lineStyle: 2, // Dashed
                axisLabelVisible: true,
                title: 'OR Low',
            };
            openingRangeLines.current[0] = candlestickSeriesRef.current.createPriceLine(highLine);
            openingRangeLines.current[1] = candlestickSeriesRef.current.createPriceLine(lowLine);
        }
    }, [openingRange]);


    return (
        <div className="w-full h-full relative">
            <div ref={chartContainerRef} className="w-full h-full" />
            
            {chartApi.chartElement && rrTools.map(tool => (
                <RiskRewardTool
                    key={tool.id}
                    tool={tool}
                    chart={chartApi}
                    onUpdate={onUpdateTool}
                    onRemove={onRemoveTool}
                    pipValue={pipValue}
                />
            ))}

            {chartApi.chartElement && priceMarkers.map(marker => (
                 <PriceMarker
                    key={marker.id}
                    marker={marker}
                    chart={chartApi}
                    onUpdate={onUpdatePriceMarker}
                    onRemove={onRemovePriceMarker}
                 />
            ))}
            
            {chartApi.chartElement && measurementTools.map(tool => (
                <MeasurementTool
                    key={tool.id}
                    tool={tool}
                    chart={chartApi}
                    onRemove={onRemoveMeasurementTool}
                    pipValue={pipValue}
                />
            ))}

             {chartApi.chartElement && liveMeasurementTool && (
                <MeasurementTool
                    key={liveMeasurementTool.id}
                    tool={liveMeasurementTool}
                    chart={chartApi}
                    onRemove={() => {}}
                    pipValue={pipValue}
                    isLive
                />
            )}
            
             <div className="absolute top-2 left-2 text-xs text-muted-foreground bg-background/50 px-2 py-1 rounded">
                Timeframe: {currentAggregation.toUpperCase()}
            </div>
        </div>
    );
}

    