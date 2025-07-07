"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import type { PerformanceMetrics as PerformanceMetricsType } from "@/types";

interface PerformanceMetricsProps {
  metrics: PerformanceMetricsType;
  onClearTrades: () => void;
}

const MetricCard = ({ title, value, prefix = "", suffix = "", colorClass = "text-foreground" }) => (
    <div className="bg-secondary/30 p-3 rounded-lg text-center">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className={`text-xl font-bold font-headline ${colorClass}`}>{prefix}{value}{suffix}</p>
    </div>
);

export function PerformanceMetrics({ metrics, onClearTrades }: PerformanceMetricsProps) {
  const formatCurrency = (value: number) => {
    return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  };
  
  const profitLossColor = metrics.totalProfitLoss >= 0 ? "text-accent" : "text-destructive";

  return (
    <Card className="bg-card/80 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="font-headline text-xl">Performance</CardTitle>
        <Button variant="ghost" size="icon" onClick={onClearTrades} disabled={metrics.totalTrades === 0}>
          <Trash2 className="h-4 w-4" />
          <span className="sr-only">Clear Trades</span>
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          <MetricCard 
            title="Total P/L" 
            value={formatCurrency(metrics.totalProfitLoss)} 
            colorClass={profitLossColor}
          />
          <MetricCard 
            title="Win Rate" 
            value={metrics.winRate.toFixed(2)}
            suffix="%"
            colorClass={metrics.winRate > 50 ? "text-accent" : "text-destructive"}
          />
          <MetricCard 
            title="Total Trades" 
            value={metrics.totalTrades}
          />
           <MetricCard 
            title="Profit Factor" 
            value={isFinite(metrics.profitFactor) ? metrics.profitFactor.toFixed(2) : "N/A"}
          />
          <MetricCard 
            title="Avg. Profit" 
            value={formatCurrency(metrics.averageProfit)} 
            colorClass="text-accent"
          />
           <MetricCard 
            title="Avg. Loss" 
            value={formatCurrency(metrics.averageLoss)} 
            colorClass="text-destructive"
          />
          <div className="col-span-2">
             <MetricCard 
                title="Max Drawdown" 
                value={formatCurrency(metrics.maxDrawdown)} 
                colorClass="text-destructive"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
