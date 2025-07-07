
"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceDot,
  Line,
} from "recharts";
import type { PriceData, Trade, RiskRewardTool as RRToolType } from "@/types";
import { RiskRewardTool } from "./risk-reward-tool";
import { useRef } from "react";
import { cn } from "@/lib/utils";

interface InteractiveChartProps {
  data: PriceData[];
  trades: Trade[];
  onChartClick: (data: { price: number; date: Date, dataIndex: number }) => void;
  rrTools: RRToolType[];
  onUpdateTool: (tool: RRToolType) => void;
  onRemoveTool: (id: string) => void;
  isPlacingRR: boolean;
}

export function InteractiveChart({ data, trades, onChartClick, rrTools, onUpdateTool, onRemoveTool, isPlacingRR }: InteractiveChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const handleClick = (e: any) => {
    if (e && e.activeTooltipIndex !== undefined) {
      const payload = e.activePayload?.[0]?.payload;
      if (payload) {
        onChartClick({
          price: payload.close, // Use close price for placing tools
          date: new Date(payload.date),
          dataIndex: e.activeTooltipIndex,
        });
      }
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
            tickFormatter={(value) => `$${value}`}
            domain={['dataMin - 5', 'dataMax + 5']}
            allowDataOverflow={true}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--accent))', strokeWidth: 1, strokeDasharray: '3 3' }}/>
          
          {/* Add invisible lines to scale Y-axis correctly to high/low */}
          <Line dataKey="high" stroke="transparent" dot={false} activeDot={false} />
          <Line dataKey="low" stroke="transparent" dot={false} activeDot={false} />

          {/* This is the visible line chart based on the close price */}
          <Line type="monotone" dataKey="close" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />

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
