"use client";

import {
  ResponsiveContainer,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Line,
  ReferenceDot,
} from "recharts";
import type { PriceData, Trade, RiskRewardTool as RRToolType } from "@/types";
import { RiskRewardTool } from "./risk-reward-tool";
import { useRef } from "react";
import { cn } from "@/lib/utils";

interface InteractiveChartProps {
  data: PriceData[];
  trades: Trade[];
  onChartClick: (data: { price: number; date: Date, dataIndex: number }) => void;
  rrTool: RRToolType | null;
  setRrTool: (tool: RRToolType | null) => void;
  isPlacingRR: boolean;
}

export function InteractiveChart({ data, trades, onChartClick, rrTool, setRrTool, isPlacingRR }: InteractiveChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const handleClick = (e: any) => {
    if (e && e.activeTooltipIndex !== undefined) {
      onChartClick({
        price: e.activePayload[0].value,
        date: new Date(e.activeLabel),
        dataIndex: e.activeTooltipIndex,
      });
    }
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="p-2 bg-card border border-border rounded-lg shadow-lg">
          <p className="label font-bold text-foreground">{`Date: ${new Date(label).toLocaleDateString()}`}</p>
          <p className="intro text-primary">{`Price: $${payload[0].value.toFixed(2)}`}</p>
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
        <LineChart data={data} onClick={handleClick} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
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
            domain={['dataMin', 'dataMax']}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--accent))', strokeWidth: 1, strokeDasharray: '3 3' }}/>
          <Line
            type="monotone"
            dataKey="price"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={false}
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
        </LineChart>
      </ResponsiveContainer>
      {rrTool && chartContainerRef.current && (
        <RiskRewardTool 
          tool={rrTool} 
          setTool={setRrTool} 
          data={data}
          chartContainer={chartContainerRef.current}
        />
      )}
    </div>
  );
}
