
"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceDot,
  Bar,
} from "recharts";
import type { PriceData, Trade, RiskRewardTool as RRToolType } from "@/types";
import { RiskRewardTool } from "./risk-reward-tool";
import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";

interface InteractiveChartProps {
  data: PriceData[];
  trades: Trade[];
  onChartClick: (data: { close: number; date: Date, dataIndex: number }) => void;
  rrTools: RRToolType[];
  onUpdateTool: (tool: RRToolType) => void;
  onRemoveTool: (id: string) => void;
  isPlacingRR: boolean;
  timeframe: string;
  timeZone: string;
  endDate?: Date;
}

const Candlestick = (props: any) => {
    const { x, y, width, height, payload } = props;
    if (y === undefined || height <= 0 || !payload) return null;

    const { open, high, low, close } = payload;
    const isGrowing = close > open;
    const color = isGrowing ? 'hsl(var(--accent))' : 'hsl(var(--destructive))';
    
    // This is our scale function: pixels per price unit.
    // We can only do this if there's a price range.
    const pixelsPerPrice = high !== low ? height / (high - low) : 0;

    // Calculate the top of the candle body
    const bodyTopPrice = Math.max(open, close);
    const bodyTopY = y + (high - bodyTopPrice) * pixelsPerPrice;
    
    // Calculate the height of the candle body
    const bodyHeight = Math.abs(open - close) * pixelsPerPrice;

    return (
        <g>
            <path d={`M ${x + width / 2},${y} L ${x + width / 2},${y + height}`} stroke={color} strokeWidth={1} />
            <rect x={x} y={bodyTopY} width={width} height={Math.max(1, bodyHeight)} fill={color} />
        </g>
    );
};


export function InteractiveChart({ data, trades, onChartClick, rrTools, onUpdateTool, onRemoveTool, isPlacingRR, timeframe, timeZone, endDate }: InteractiveChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const filteredData = useMemo(() => {
    if (!endDate) {
      return data;
    }
    return data.filter(point => point.date <= endDate);
  }, [data, endDate]);
  
  const aggregatedData = useMemo(() => {
    if (timeframe === '1m' || !filteredData || filteredData.length === 0) {
      return filteredData;
    }

    const getIntervalMinutes = (tf: string): number => {
      switch (tf) {
        case '30m': return 30;
        case '1H': return 60;
        case '4H': return 240;
        case '1D': return 1440; // 24 * 60
        default: return 1;
      }
    };

    const interval = getIntervalMinutes(timeframe) * 60 * 1000; // interval in milliseconds
    if (interval <= 60000) return filteredData;

    const result: PriceData[] = [];
    let currentCandle: PriceData | null = null;

    for (const point of filteredData) {
      const pointTime = point.date.getTime();
      const bucketTimestamp = Math.floor(pointTime / interval) * interval;
      
      if (!currentCandle || currentCandle.date.getTime() !== bucketTimestamp) {
        if (currentCandle) {
          result.push(currentCandle);
        }
        currentCandle = {
          date: new Date(bucketTimestamp),
          open: point.open,
          high: point.high,
          low: point.low,
          close: point.close,
          wick: [point.low, point.high],
        };
      } else {
        currentCandle.high = Math.max(currentCandle.high, point.high);
        currentCandle.low = Math.min(currentCandle.low, point.low);
        currentCandle.close = point.close;
        currentCandle.wick = [currentCandle.low, currentCandle.high];
      }
    }
    if (currentCandle) {
      result.push(currentCandle);
    }
    
    return result;
  }, [filteredData, timeframe]);
  
  const [xDomain, setXDomain] = useState<[number, number]>([0, aggregatedData.length > 1 ? aggregatedData.length - 1 : 1]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number, domain: [number, number] } | null>(null);

  useEffect(() => {
    const initialVisibleCandles = 100;
    const end = aggregatedData.length > 1 ? aggregatedData.length - 1 : 1;
    const start = Math.max(0, end - initialVisibleCandles);
    setXDomain([start, end]);
  }, []);

  const visibleData = useMemo(() => {
    const [start, end] = xDomain;
    return aggregatedData.slice(Math.floor(start), Math.ceil(end));
  }, [aggregatedData, xDomain]);
  
  const yDomain = useMemo(() => {
    if (!visibleData || visibleData.length === 0) {
        if(aggregatedData.length === 0) return [0, 100];
        const allLows = aggregatedData.map(d => d.low);
        const allHighs = aggregatedData.map(d => d.high);
        const min = Math.min(...allLows);
        const max = Math.max(...allHighs);
        const padding = (max - min) * 0.1;
        return [min - padding, max + padding];
    }
    const lows = visibleData.map(d => d.low);
    const highs = visibleData.map(d => d.high);
    const min = Math.min(...lows);
    const max = Math.max(...highs);
    const padding = (max - min) * 0.1 || 10;
    return [min - padding, max + padding];
  }, [visibleData, aggregatedData]);

  const xTimeDomain = useMemo(() => {
    if (!visibleData || visibleData.length === 0) return [0, 0];
    const first = visibleData[0]?.date?.getTime();
    const last = visibleData[visibleData.length - 1]?.date?.getTime();
    if (!first || !last) return [0, 0];

    if (first === last) {
      // Pad by one minute on each side if only one data point is visible
      const oneMinute = 60 * 1000;
      return [first - oneMinute, last + oneMinute];
    }
    return [first, last];
  }, [visibleData]);


  const handleClick = (e: any) => {
    if (e && e.activeTooltipIndex !== undefined && e.activeTooltipIndex >= 0) {
      const payload = e.activePayload?.[0]?.payload;
      if (payload) {
        const dataIndex = Math.floor(xDomain[0]) + e.activeTooltipIndex;
        onChartClick({
          close: payload.close,
          date: new Date(payload.date),
          dataIndex: dataIndex,
        });
      }
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!chartContainerRef.current) return;
  
    const { left, width } = chartContainerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - left;
    const chartX = mouseX - 60; // Approximate adjustment for Y-axis margin
    const plotWidth = width - 80; // Approximate plot width
    
    if (chartX < 0 || chartX > plotWidth) return;
  
    const [domainStart, domainEnd] = xDomain;
    const domainWidth = domainEnd - domainStart;
    const mouseIndex = domainStart + (chartX / plotWidth) * domainWidth;
    
    const zoomFactor = 1.1;
    let newDomainWidth = e.deltaY < 0 ? domainWidth / zoomFactor : domainWidth * zoomFactor;

    if (newDomainWidth > aggregatedData.length) {
      newDomainWidth = aggregatedData.length;
    }
  
    let newStart = mouseIndex - (mouseIndex - domainStart) * (newDomainWidth / domainWidth);
    let newEnd = newStart + newDomainWidth;
    
    // Clamp the domain
    if (newDomainWidth < 10) { // Minimum zoom level (10 data points)
      newDomainWidth = 10;
      const center = mouseIndex;
      newStart = center - newDomainWidth / 2;
      newEnd = center + newDomainWidth / 2;
    }
    
    if (newStart < 0) {
        newStart = 0;
        newEnd = newStart + newDomainWidth;
    }
    if (newEnd > aggregatedData.length) {
        newEnd = aggregatedData.length;
        newStart = newEnd - newDomainWidth;
    }
     if (newStart < 0) { newStart = 0; }
  
    setXDomain([newStart, newEnd]);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isPlacingRR || !chartContainerRef.current) return;
    e.preventDefault();
    setIsDragging(true);
    setDragStart({
      x: e.clientX,
      domain: xDomain,
    });
    chartContainerRef.current.style.cursor = 'grabbing';
  };
  
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !dragStart || !chartContainerRef.current) return;
    e.preventDefault();
    const { width } = chartContainerRef.current.getBoundingClientRect();
    const plotWidth = width - 80;
    if (plotWidth <= 0) return;
    
    const dx = e.clientX - dragStart.x;
    const [start, end] = dragStart.domain;
    const domainWidth = end - start;
    const indexPerPixel = domainWidth / plotWidth;
    const deltaIndex = dx * indexPerPixel;

    let newStart = start - deltaIndex;
    let newEnd = end - deltaIndex;

    // Clamp to boundaries
    if (newStart < 0) {
      newStart = 0;
      newEnd = newStart + domainWidth;
    }
    if (newEnd > aggregatedData.length) {
      newEnd = aggregatedData.length;
      newStart = newEnd - domainWidth;
    }
    
    setXDomain([newStart, newEnd]);
  };
  
  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!chartContainerRef.current) return;
    setIsDragging(false);
    setDragStart(null);
    chartContainerRef.current.style.cursor = isPlacingRR ? 'crosshair' : 'grab';
  };
  
  const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) {
        handleMouseUp(e);
    }
  };

  const formatXAxis = useCallback((tickItem: any) => {
    const date = new Date(tickItem);
    const [start, end] = xDomain;
    const endIdx = Math.min(Math.ceil(end - 1), aggregatedData.length - 1);
    const startIdx = Math.max(0, Math.floor(start));
    
    const firstDate = aggregatedData[startIdx]?.date;
    const lastDate = aggregatedData[endIdx]?.date;

    if (!firstDate || !lastDate) return '';

    const visibleRangeInMinutes = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60);

    if (visibleRangeInMinutes > 3 * 24 * 60) {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric', timeZone });
    }
    if (visibleRangeInMinutes > 24 * 60) {
      return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone });
    }
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone });
  }, [xDomain, aggregatedData, timeZone]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="p-2 bg-card border border-border rounded-lg shadow-lg text-sm">
          <p className="label font-bold text-foreground">{`${new Date(label).toLocaleString([], {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              timeZone
            })}`}</p>
          <p>Open: <span className="font-mono text-primary">{data.open.toFixed(2)}</span></p>
          <p>High: <span className="font-mono text-primary">{data.high.toFixed(2)}</span></p>
          <p>Low: <span className="font-mono text-primary">{data.low.toFixed(2)}</span></p>
          <p>Close: <span className="font-mono text-primary">{data.close.toFixed(2)}</span></p>
        </div>
      );
    }
    return null;
  };

  return (
    <div 
      ref={chartContainerRef} 
      className={cn(
        "w-full h-full relative",
      )}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      style={{ cursor: isPlacingRR ? 'crosshair' : (isDragging ? 'grabbing' : 'grab') }}
    >
      {!aggregatedData || aggregatedData.length === 0 ? (
        <div className="flex items-center justify-center w-full h-full text-muted-foreground">
          No data available for the selected time range.
        </div>
      ) : (
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={visibleData} onClick={handleClick} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" />
          <XAxis
            dataKey="date"
            tickFormatter={formatXAxis}
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={80}
            xAxisId="main"
            domain={xTimeDomain}
            type="number"
          />
          <YAxis
            orientation="right"
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => value.toFixed(2)}
            domain={yDomain}
            allowDataOverflow={true}
            yAxisId="main"
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--accent))', strokeWidth: 1, strokeDasharray: '3 3' }}/>
          
          <Bar dataKey="wick" shape={<Candlestick />} isAnimationActive={false} xAxisId="main" yAxisId="main"/>

          {trades.map((trade) => (
            <ReferenceDot
              key={trade.id}
              x={trade.entryDate.toString()}
              y={trade.entryPrice}
              r={5}
              ifOverflow="extendDomain"
              fill={trade.type === 'win' ? 'hsl(var(--accent))' : 'hsl(var(--destructive))'}
              stroke="hsl(var(--card))"
              xAxisId="main" 
              yAxisId="main"
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
      )}
      {chartContainerRef.current && rrTools.map(tool => (
        <RiskRewardTool 
          key={tool.id}
          tool={tool} 
          onUpdate={onUpdateTool}
          onRemove={onRemoveTool}
          data={aggregatedData}
          chartContainer={chartContainerRef.current!}
          xDomain={xDomain}
          yDomain={yDomain}
        />
      ))}
    </div>
  );
}
