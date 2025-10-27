
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
  Coordinate,
  LineStyle,
  PriceScaleMode,
  ISeriesPrimitive,
  SeriesPrimitivePaneView,
  BitmapCoordinatesRenderingScope,
  AutoscaleInfo,
} from "lightweight-charts";
import type { PriceData, Trade, RiskRewardTool as RRToolType, PriceMarker as PriceMarkerType, MeasurementTool as MeasurementToolType, MeasurementPoint, OpeningRange } from "@/types";
import { RiskRewardTool } from "./risk-reward-tool";
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
  data: PriceData[];
  trades: Trade[];
  onChartClick: (data: ChartClickData) => void;
  rrTools: RRToolType[];
  onUpdateTool: (tool: RRToolType) => void;
  onToolUpdateWithHistory: (tool: RRToolType) => void;
  onRemoveTool: (id: string) => void;
  priceMarkers: PriceMarkerType[];
  onRemovePriceMarker: (id: string) => void;
  onUpdatePriceMarker: (id: string, price: number) => void;
  measurementTools: MeasurementToolType[];
  onRemoveMeasurementTool: (id: string) => void;
  liveMeasurementTool: MeasurementToolType | null;
  pipValue: number;
  timeframe: string;
  onAggregationChange: (agg: string) => void;
  timeZone: string;
  endDate?: Date;
  isYAxisLocked: boolean;
  openingRange: OpeningRange | null;
  tab: 'backtester' | 'journal';
  setChartApi: (api: any) => void;
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
    timeframe,
    timeZone,
    endDate,
    rrTools,
    priceMarkers,
    measurementTools,
liveMeasurementTool,
    onChartClick,
    onAggregationChange,
    onUpdateTool,
    onToolUpdateWithHistory,
    onRemoveTool,
    onRemovePriceMarker,
    onRemoveMeasurementTool,
    onUpdatePriceMarker,
    pipValue,
    isYAxisLocked,
    openingRange,
    tab,
    setChartApi,
}: InteractiveChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    
    const propsRef = useRef({ onChartClick, onUpdateTool, onToolUpdateWithHistory, onRemoveTool, onRemovePriceMarker, onRemoveMeasurementTool, onUpdatePriceMarker });
    propsRef.current = { onChartClick, onUpdateTool, onToolUpdateWithHistory, onRemoveTool, onRemovePriceMarker, onRemoveMeasurementTool, onUpdatePriceMarker };

    const onAggregationChangeRef = useRef(onAggregationChange);
    useEffect(() => {
        onAggregationChangeRef.current = onAggregationChange;
    });

    const displayData = useMemo(() => {
        if (endDate) {
            const endTimestamp = endDate.getTime();
            return data.filter(point => point.date.getTime() <= endTimestamp);
        }
        return data || [];
    }, [data, endDate]);
    
    const chartData = useMemo(() => convertToCandlestickData(displayData), [displayData]);


    useEffect(() => {
        if (!chartContainerRef.current) return;
        
        const getThemeColor = (cssVar: string): string => {
            const tempDiv = document.createElement('div');
            tempDiv.style.display = 'none';
            tempDiv.style.color = `hsl(var(${cssVar}))`;
            document.body.appendChild(tempDiv);
            const color = window.getComputedStyle(tempDiv).color;
            document.body.removeChild(tempDiv);
            return color;
        };
        
        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { color: 'transparent' },
                textColor: getThemeColor('--foreground'),
            },
            grid: {
                vertLines: { color: getThemeColor('--border') },
                horzLines: { color: getThemeColor('--border') },
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
                borderColor: getThemeColor('--border'),
            },
            rightPriceScale: {
                borderColor: getThemeColor('--border'),
            },
            crosshair: {
                mode: 1, // Magnet mode
            },
        });
        
        chartRef.current = chart;

        const series = chart.addCandlestickSeries({
            upColor: getThemeColor('--accent'),
            downColor: getThemeColor('--destructive'),
            borderDownColor: getThemeColor('--destructive'),
            borderUpColor: getThemeColor('--accent'),
            wickDownColor: getThemeColor('--destructive'),
            wickUpColor: getThemeColor('--accent'),
        });
        candlestickSeriesRef.current = series;
        
        const handleChartClickEvent = (param: MouseEventParams) => {
            if (!param.point || !param.time || !series || !chartRef.current) return;
            
            const price = series.coordinateToPrice(param.point.y) as number;
            if(price === null) return;
            
            const convertedData = convertToCandlestickData(displayData);
            const matchingCandles = convertedData.filter(d => d.time === param.time);
            if (matchingCandles.length === 0) return;
    
            const candle = matchingCandles[0];
            const dataIndex = displayData.findIndex(d => d.date.getTime() / 1000 === candle.time);
            if (dataIndex < 0) return;
    
            const logicalRange = chart.timeScale().getVisibleLogicalRange();
    
            propsRef.current.onChartClick({
                price,
                date: new Date((param.time as number) * 1000),
                dataIndex,
                closePrice: candle.close,
                xDomain: logicalRange ? [logicalRange.from, logicalRange.to] : [0, 0],
                candle: candle.original,
            });
        };
        
        chart.subscribeClick(handleChartClickEvent);

        const handleResize = () => chart.applyOptions({ width: chartContainerRef.current?.clientWidth, height: chartContainerRef.current?.clientHeight });
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            if(chartRef.current) {
                chartRef.current.unsubscribeClick(handleChartClickEvent);
                chartRef.current.remove();
                chartRef.current = null;
            }
            candlestickSeriesRef.current = null;
        };
    }, []); 

    useEffect(() => {
        if (candlestickSeriesRef.current) {
            candlestickSeriesRef.current.setData(chartData);

            if(tab === 'backtester' && endDate && chartData.length > 0) {
                 const timeScale = chartRef.current?.timeScale();
                 if(timeScale) {
                    const lastDataTime = chartData[chartData.length - 1].time;
                    timeScale.setVisibleRange({
                        from: lastDataTime - (60 * 60 * 3), 
                        to: lastDataTime
                    });
                 }
            } else if (chartData.length > 0) {
                 const timeScale = chartRef.current?.timeScale();
                 if (timeScale) {
                     timeScale.scrollToPosition(chartData.length - 1, false);
                 }
            }
        }
    }, [chartData, tab, endDate]); 
    
    useEffect(() => {
        if (chartRef.current && timeZone) {
            chartRef.current.applyOptions({
                localization: {
                    timeFormatter: (timestamp: UTCTimestamp) => {
                       return new Date(timestamp * 1000).toLocaleTimeString([], {timeZone});
                    }
                },
                timeScale: {
                    timeVisible: true,
                    secondsVisible: false,
                    rightOffset: 10,
                }
            });
        }
    }, [timeZone, chartData]);

    useEffect(() => {
        if (chartRef.current) {
            chartRef.current.priceScale('right').applyOptions({
                autoScale: isYAxisLocked,
            });
        }
    }, [isYAxisLocked]);
    
    const timeToCoordinate = useCallback((time: Time) => chartRef.current?.timeScale().timeToCoordinate(time), []);
    const coordinateToTime = useCallback((coord: number) => chartRef.current?.timeScale().coordinateToTime(coord), []);
    const priceToCoordinate = useCallback((price: number) => candlestickSeriesRef.current?.priceToCoordinate(price), []);
    const coordinateToPrice = useCallback((coord: number) => candlestickSeriesRef.current?.coordinateToPrice(coord), []);
    
    const chartApi = useMemo(() => ({
        timeToCoordinate,
        coordinateToTime,
        priceToCoordinate,
        coordinateToPrice,
        chartElement: chartContainerRef.current,
        data: displayData,
        chart: chartRef.current,
        series: candlestickSeriesRef.current,
    }), [timeToCoordinate, coordinateToTime, priceToCoordinate, coordinateToPrice, displayData]);
    
    useEffect(() => {
      setChartApi(chartApi);
    }, [chartApi, setChartApi]);

    const openingRangeLines = useRef<[IPriceLine?, IPriceLine?]>([undefined, undefined]);

    useEffect(() => {
        const series = candlestickSeriesRef.current;
        if (!series) return;
    
        if (openingRangeLines.current[0]) series.removePriceLine(openingRangeLines.current[0]);
        if (openingRangeLines.current[1]) series.removePriceLine(openingRangeLines.current[1]);
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
            openingRangeLines.current[0] = series.createPriceLine(highLine);
            openingRangeLines.current[1] = series.createPriceLine(lowLine);
        }
    }, [openingRange]);

    const priceMarkerLines = useRef(new Map<string, IPriceLine>());

    useEffect(() => {
        const series = candlestickSeriesRef.current;
        if (!series) return;

        const currentMarkerIds = new Set(priceMarkers.map(m => m.id));

        priceMarkerLines.current.forEach((line, id) => {
            if (!currentMarkerIds.has(id)) {
                series.removePriceLine(line);
                priceMarkerLines.current.delete(id);
            }
        });

        priceMarkers.forEach(marker => {
            const lineOptions: PriceLineOptions = {
                price: marker.price,
                color: 'orange',
                lineWidth: 2,
                lineStyle: 1, // Dotted
                axisLabelVisible: true,
                title: marker.price.toFixed(5),
            };

            if (priceMarkerLines.current.has(marker.id)) {
                priceMarkerLines.current.get(marker.id)?.applyOptions(lineOptions);
            } else {
                const newLine = series.createPriceLine(lineOptions);
                priceMarkerLines.current.set(marker.id, newLine);
            }
        });
    }, [priceMarkers, chartData]);

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        const series = candlestickSeriesRef.current;
        const chartElement = chartContainerRef.current;
        if (!series || !chartElement) return;

        const rect = chartElement.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const clickedPrice = series.coordinateToPrice(y as Coordinate);
        if (clickedPrice === null) return;
        
        let markerToDelete: PriceMarkerType | null = null;
        let minDistance = Infinity;

        priceMarkers.forEach(marker => {
            if (!marker.isDeletable) return;
            const priceDistance = Math.abs(marker.price - clickedPrice);
            // Heuristic for "close enough": check if the clicked price is within a small vertical distance
            // Let's use a fixed pixel tolerance for simplicity
            const yMarker = series.priceToCoordinate(marker.price);
            if (yMarker !== null) {
                const yDistance = Math.abs(y - yMarker);
                if (yDistance < 10 && priceDistance < minDistance) { // 10 pixels tolerance
                    minDistance = priceDistance;
                    markerToDelete = marker;
                }
            }
        });
        
        if (markerToDelete) {
            propsRef.current.onRemovePriceMarker(markerToDelete.id);
        }
    };
    
    return (
        <div 
            className="w-full h-full relative"
            onContextMenu={handleContextMenu}
        >
            <div ref={chartContainerRef} className="w-full h-full" />
            
            {chartApi.chartElement && rrTools.map(tool => (
                <RiskRewardTool
                    key={tool.id}
                    tool={tool}
                    chartApi={chartApi}
                    onUpdate={propsRef.current.onUpdateTool}
                    onUpdateWithHistory={propsRef.current.onToolUpdateWithHistory}
                    onRemove={propsRef.current.onRemoveTool}
                    pipValue={pipValue}
                />
            ))}
            
            {chartApi.chartElement && measurementTools.map(tool => (
                <MeasurementTool
                    key={tool.id}
                    tool={tool}
                    chartApi={chartApi}
                    onRemove={propsRef.current.onRemoveMeasurementTool}
                    pipValue={pipValue}
                />
            ))}

             {chartApi.chartElement && liveMeasurementTool && (
                <MeasurementTool
                    key={liveMeasurementTool.id}
                    tool={liveMeasurementTool}
                    chartApi={chartApi}
                    onRemove={() => {}}
                    pipValue={pipValue}
                    isLive
                />
            )}
            
             <div className="absolute top-2 left-2 text-xs text-muted-foreground bg-background/50 px-2 py-1 rounded">
                Timeframe: {timeframe.toUpperCase()}
            </div>
        </div>
    );
}

    