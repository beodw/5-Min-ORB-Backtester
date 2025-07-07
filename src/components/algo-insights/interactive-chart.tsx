
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
import { useMemo, useRef } from "react";
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

const Candlestick = (props: any) => {
  const { x, y, width, height, low, high, open, close } = props;
  const isGrowing = open < close;
  const color = isGrowing ? 'hsl(var(--accent))' : 'hsl(var(--destructive))';
  const ratio = Math.abs(height / (open - close));

  return (
    <g stroke={color} fill={color} strokeWidth="1">
      <path
        d={`M${x + width / 2},${y} L${x + width / 2},${y + height}`}
      />
      <rect
        x={x}
        y={isGrowing ? y + (open - low) * ratio : y + (close - low) * ratio}
        width={width}
        height={Math.max(1, Math.abs(open - close) * ratio)}
      />
    </g>
  );
};


export function InteractiveChart({ data, trades, onChartClick, rrTools, onUpdateTool, onRemoveTool, isPlacingRR }: InteractiveChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const handleClick = (e: any) => {
    if (e && e.activeTooltipIndex !== undefined) {
      const payload = e.activePayload?.[0]?.payload;
      if (payload) {
        onChartClick({
          close: payload.close,
          date: new Date(payload.date),
          dataIndex: e.activeTooltipIndex,
        });
      }
    }
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      // The payload for the bar is an array [low, high], but the original data is in payload[0].payload
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
  
  const yDomain = useMemo(() => {
    if (!data || data.length === 0) return [0, 100];
    const lows = data.map(d => d.low);
    const highs = data.map(d => d.high);
    const min = Math.min(...lows);
    const max = Math.max(...highs);
    const padding = (max - min) * 0.1; // 10% padding
    return [min - padding, max + padding];
  }, [data]);


  return (
    <div 
      ref={chartContainerRef} 
      className={cn(
        "w-full h-[350px] md:h-[500px] lg:h-full relative",
        isPlacingRR && "cursor-crosshair"
      )}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} onClick={handleClick} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" />
          <XAxis
            dataKey="date"
            tickFormatter={(date) => new Date(date).toLocaleDateString()}
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => `$${value.toFixed(2)}`}
            domain={yDomain}
            allowDataOverflow={true}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--accent))', strokeWidth: 1, strokeDasharray: '3 3' }}/>
          
          <Bar
            dataKey="close"
            shape={<Candlestick />}
          />

          {trades.map((trade) => (
            <ReferenceDot
              key={trade.id}
              x={trade.entryDate.toString()}
              y={trade.entryPrice}
              r={5}
              fill={trade.type === 'win' ? 'hsl(var(--accent))' : 'hsl(var(--destructive))'}
              stroke="hsl(var(--card))"
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
        />
      ))}
    </div>
  );
}
