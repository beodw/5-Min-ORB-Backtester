
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
  ReferenceLine,
} from "recharts";
import type { PriceData, Trade, RiskRewardTool as RRToolType, OpeningRange } from "@/types";
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
  openingRange: OpeningRange | null;
}

const Candlestick = (props: any) => {
    const { x, y, width, height, payload } = props;
    if (x === undefined || y === undefined || !payload || height <= 0) return null;

    const { open, high, low, close } = payload;
    const isGrowing = close > open;
    const color = isGrowing ? 'hsl(var(--accent))' : 'hsl(var(--destructive))';
    
    const pixelsPerPrice = high !== low ? height / (high - low) : 0;

    const bodyTopPrice = Math.max(open, close);
    const bodyTopY = y + (high - bodyTopPrice) * pixelsPerPrice;
    
    const bodyHeight = Math.abs(open - close) * pixelsPerPrice;

    return (
        <g>
            <path d={`M ${x + width / 2},${y} L ${x + width / 2},${y + height}`} stroke={color} strokeWidth={1} />
            <rect x={x} y={bodyTopY} width={width} height={Math.max(1, bodyHeight)} fill={color} />
        </g>
    );
};


export function InteractiveChart({ data, trades, onChartClick, rrTools, onUpdateTool, onRemoveTool, isPlacingRR, timeframe, timeZone, endDate, openingRange }: InteractiveChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const aggregatedData = useMemo(() => {
    if (!data || data.length === 0) {
      return [];
    }
  
    // Always filter by endDate first.
    const filteredByDate = endDate ? data.filter(point => point.date <= endDate) : data;
  
    if (timeframe === '1m') {
      return filteredByDate;
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
  
    const interval = getIntervalMinutes(timeframe) * 60 * 1000;
    if (interval <= 60000) return filteredByDate;
  
    const result: PriceData[] = [];
    let currentCandle: PriceData | null = null;
    
    for (const point of filteredByDate) {
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
  }, [data, timeframe, endDate]);
  
  const [xDomain, setXDomain] = useState<[number, number]>([0, 100]);
  const [yDomain, setYDomain] = useState<[number, number]>([0, 100]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number, domain: [number, number] } | null>(null);

  const windowedData = useMemo(() => {
    if (!aggregatedData.length) return [];
    const [start, end] = xDomain;
    const buffer = 100;
    const startIndex = Math.max(0, Math.floor(start) - buffer);
    const endIndex = Math.min(aggregatedData.length, Math.ceil(end) + buffer);
    
    return aggregatedData.slice(startIndex, endIndex);
  }, [xDomain, aggregatedData]);

  useEffect(() => {
    if (aggregatedData.length === 0) return;

    let targetIndex: number;

    if (endDate) {
      // Find the last available candle within the endDate
      let foundIndex = -1;
      for(let i = aggregatedData.length - 1; i >= 0; i--) {
        if(aggregatedData[i].date <= endDate) {
          foundIndex = i;
          break;
        }
      }
      targetIndex = foundIndex !== -1 ? foundIndex : aggregatedData.length - 1;

    } else {
      targetIndex = aggregatedData.length - 1;
    }
    
    const domainWidth = 100; // Default view width
    const newEnd = targetIndex + (domainWidth * 0.2); // position end of data 20% from the right edge
    const newStart = newEnd - domainWidth;

    setXDomain(prev => {
      const isInitialLoadOrDateChange = (prev[0] === 0 && prev[1] === 100) || endDate;
      if (isInitialLoadOrDateChange) {
         return [newStart > 0 ? newStart : 0, newEnd];
      }
      // Auto-pan if new candle is off-screen
      if (aggregatedData.length - 1 > prev[1]) {
        const panAmount = (aggregatedData.length - 1) - prev[1];
        return [prev[0] + panAmount + 1, prev[1] + panAmount + 1];
      }
      return prev;
    });

  }, [endDate, aggregatedData.length, timeframe]);


  useEffect(() => {
    if (aggregatedData.length === 0 && !openingRange) return;

    let min = Infinity;
    let max = -Infinity;

    if (windowedData.length > 0) {
      for (const d of windowedData) {
        if (d.low < min) min = d.low;
        if (d.high > max) max = d.high;
      }
    }
    
    if (openingRange) {
        min = Math.min(min, openingRange.low);
        max = Math.max(max, openingRange.high);
    }
    
    if (min === Infinity || max === -Infinity) {
      return;
    }

    const padding = (max - min) * 0.1 || 10;
    setYDomain([min - padding, max + padding]);
  }, [windowedData, openingRange, aggregatedData.length]);

  const xTimeDomain = useMemo(() => {
    if (!aggregatedData || aggregatedData.length === 0) return [0, 0];
    
    const [start, end] = xDomain;
    
    const firstPointTime = aggregatedData[0].date.getTime();
    
    const interval = aggregatedData.length > 1 
      ? aggregatedData[1].date.getTime() - firstPointTime
      : 60000; 

    const startTime = firstPointTime + start * interval;
    const endTime = firstPointTime + end * interval;

    return [startTime, endTime];

  }, [aggregatedData, xDomain]);


  const handleClick = (e: any) => {
    if (e && e.activeTooltipIndex !== undefined && e.activeTooltipIndex >= 0 && e.activePayload?.[0]?.payload) {
        const dataIndex = aggregatedData.findIndex(d => d.date === e.activePayload[0].payload.date);
        if (dataIndex !== -1) {
            onChartClick({
              close: e.activePayload[0].payload.close,
              date: new Date(e.activePayload[0].payload.date),
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
    const chartX = mouseX - 60;
    const plotWidth = width - 80;
    
    if (chartX < 0 || chartX > plotWidth) return;
  
    setXDomain(prevDomain => {
        const [domainStart, domainEnd] = prevDomain;
        const domainWidth = domainEnd - domainStart;
        const mouseIndex = domainStart + (chartX / plotWidth) * domainWidth;
        
        const zoomFactor = 1.1;
        let newDomainWidth = e.deltaY < 0 ? domainWidth / zoomFactor : domainWidth * zoomFactor;
      
        let newStart = mouseIndex - (mouseIndex - domainStart) * (newDomainWidth / domainWidth);
        
        if (newDomainWidth < 10) {
          newDomainWidth = 10;
          const center = mouseIndex;
          newStart = center - newDomainWidth / 2;
        }
        
        if (newStart < 0) {
          newStart = 0;
        }
        
        let newEnd = newStart + newDomainWidth;
      
        return [newStart, newEnd];
    });
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

    if (newStart < 0) {
      newStart = 0;
    }
    let newEnd = newStart + domainWidth;
    
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
    if (isNaN(date.getTime())) return '';
    
    const [start, end] = xDomain;
    const timePerIndex = aggregatedData.length > 1 
      ? aggregatedData[1].date.getTime() - aggregatedData[0].date.getTime() 
      : 60000;
    
    const visibleRangeInMs = (end - start) * timePerIndex;
    const visibleRangeInMinutes = visibleRangeInMs / 60000;

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
          <p className="label font-bold text-foreground">{`${new Date(data.date).toLocaleString([], {
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
        <ComposedChart data={windowedData} onClick={handleClick} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
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
            allowDataOverflow={true}
          />
          <YAxis
            orientation="right"
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => typeof value === 'number' ? value.toFixed(2) : ''}
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

          {openingRange && (
            <>
              <ReferenceLine
                y={openingRange.high}
                yAxisId="main"
                stroke="hsl(var(--primary))"
                strokeDasharray="4 4"
                strokeWidth={1}
                ifOverflow="extendDomain"
                label={{ 
                  value: openingRange.high.toFixed(2), 
                  position: 'right', 
                  fill: 'hsl(var(--primary-foreground))', 
                  fontSize: 10,
                  dy: -5,
                  dx: 5
                }}
              />
              <ReferenceLine
                y={openingRange.low}
                yAxisId="main"
                stroke="hsl(var(--primary))"
                strokeDasharray="4 4"
                strokeWidth={1}
                ifOverflow="extendDomain"
                label={{ 
                  value: openingRange.low.toFixed(2), 
                  position: 'right', 
                  fill: 'hsl(var(--primary-foreground))',
                  fontSize: 10,
                  dy: 5,
                  dx: 5
                }}
              />
            </>
          )}

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
