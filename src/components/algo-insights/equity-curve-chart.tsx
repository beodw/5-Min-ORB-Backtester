"use client";

import {
  ResponsiveContainer,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Area,
} from "recharts";
import type { Trade } from "@/types";

interface EquityCurveChartProps {
  trades: Trade[];
}

export function EquityCurveChart({ trades }: EquityCurveChartProps) {
  const equityData = trades.reduce((acc, trade, index) => {
    const previousEquity = acc.length > 0 ? acc[acc.length - 1].equity : 0;
    acc.push({
      name: `Trade ${index + 1}`,
      equity: previousEquity + trade.profit,
      date: trade.exitDate,
    });
    return acc;
  }, [] as { name: string; equity: number, date: Date }[]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="p-2 bg-card border border-border rounded-lg shadow-lg">
          <p className="label font-bold text-foreground">{payload[0].payload.name}</p>
          <p className="intro text-primary">{`Equity: $${payload[0].value.toFixed(2)}`}</p>
        </div>
      );
    }
    return null;
  };
  
  if(trades.length === 0) {
      return (
          <div className="flex items-center justify-center h-full text-muted-foreground">
              <p>No trades to display.</p>
          </div>
      )
  }

  return (
    <div className="w-full h-[250px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={equityData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
        <defs>
            <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.8}/>
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
            </linearGradient>
          </defs>
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
          />
          <Tooltip content={<CustomTooltip />} />
          <Area type="monotone" dataKey="equity" stroke="hsl(var(--primary))" fill="url(#colorEquity)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
