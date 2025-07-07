
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
import { useMemo, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface InteractiveChartProps {
  data: PriceData[];
  trades: Trade[];
  onChartClick: (data: { close: number; date: Date, dataIndex: number }) => void;
  rrTools: RRToolType[];
  onUpdateTool: (tool: RRToolType) => void;
  onRemoveTool: (id: string) => void;
  isPlacingRR: boolean;
}

const Wick = (props: any) => {
    const { x, y, width, height, payload } = props;
    if (y === undefined || height === undefined) return null;
    const { open, close } = payload;
    const color = open < close ? 'hsl(var(--accent))' : 'hsl(var(--destructive))';
    return <path d={`M ${x + width/2},${y} L ${x + width/2},${y + height}`} stroke={color} strokeWidth={1}/>;
};

const Candlestick = (props: any) => {
    const { x, y, width, height, open, close } = props;
    if (x === undefined || y === undefined || height < 0) return null;
    const isGrowing = open < close;
    const color = isGrowing ? 'hsl(var(--accent))' : 'hsl(var(--destructive))';
    
    return (
        <rect 
            x={x}
            y={y}
            width={width}
            height={height}
            fill={color}
        />
    );
};


export function InteractiveChart({ data, trades, onChartClick, rrTools, onUpdateTool, onRemoveTool, isPlacingRR }: InteractiveChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [xDomain, setXDomain] = useState<[number, number]>([0, data.length > 1 ? data.length - 1 : 1]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number, domain: [number, number] } | null>(null);

  const visibleData = useMemo(() => {
    const [start, end] = xDomain;
    return data.slice(Math.floor(start), Math.ceil(end));
  }, [data, xDomain]);
  
  const yDomain = useMemo(() => {
    if (!visibleData || visibleData.length === 0) {
        if(data.length === 0) return [0, 100];
        const allLows = data.map(d => d.low);
        const allHighs = data.map(d => d.high);
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
  }, [visibleData, data]);


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

    if (newDomainWidth > data.length) {
      newDomainWidth = data.length;
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
    if (newEnd > data.length) {
        newEnd = data.length;
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
    if (newEnd > data.length) {
      newEnd = data.length;
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

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="p-2 bg-card border border-border rounded-lg shadow-lg text-sm">
          <p className="label font-bold text-foreground">{`Date: ${new Date(label).toLocaleDateString()}`}</p>
          <p>Open: <span className="font-mono text-primary">${data.open.toFixed(2)}</span></p>
          <p>High: <span className="font-mono text-primary">${data.high.toFixed(2)}</span></p>
          <p>Low: <span className="font-mono text-primary">${data.low.toFixed(2)}</span></p>
          <p>Close: <span className="font-mono text-primary">${data.close.toFixed(2)}</span></p>
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
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={visibleData} onClick={handleClick} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" />
          <XAxis
            dataKey="date"
            tickFormatter={(date) => new Date(date).toLocaleDateString()}
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={80}
            xAxisId="main"
          />
          <YAxis
            orientation="right"
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => `$${value.toFixed(2)}`}
            domain={yDomain}
            allowDataOverflow={true}
            yAxisId="main"
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--accent))', strokeWidth: 1, strokeDasharray: '3 3' }}/>
          
          <Bar dataKey="wick" shape={<Wick />} isAnimationActive={false} xAxisId="main" yAxisId="main"/>
          <Bar dataKey={d => [d.open, d.close]} shape={<Candlestick />} isAnimationActive={false} xAxisId="main" yAxisId="main"/>

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
      {chartContainerRef.current && rrTools.map(tool => (
        <RiskRewardTool 
          key={tool.id}
          tool={tool} 
          onUpdate={onUpdateTool}
          onRemove={onRemoveTool}
          data={data}
          chartContainer={chartContainerRef.current!}
          xDomain={xDomain}
          yDomain={yDomain}
        />
      ))}
    </div>
  );
}
