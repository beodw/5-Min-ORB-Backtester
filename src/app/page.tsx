"use client";

import { useState, useEffect, startTransition } from "react";
import { Bot, LineChart as LineChartIcon, History, Target, X, Play } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { InteractiveChart } from "@/components/algo-insights/interactive-chart";
import { PerformanceMetrics } from "@/components/algo-insights/performance-metrics";
import { EquityCurveChart } from "@/components/algo-insights/equity-curve-chart";
import { TradeHistoryTable } from "@/components/algo-insights/trade-history-table";
import { ReportDisplay } from "@/components/algo-insights/report-display";
import { mockPriceData } from "@/lib/mock-data";
import { simulateTrade, calculatePerformanceMetrics } from "@/lib/backtesting";
import { generateReportAction } from "@/app/actions";
import type { Trade, PerformanceMetrics as PerformanceMetricsType, RiskRewardTool as RRToolType } from "@/types";

export default function AlgoInsightsPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [metrics, setMetrics] = useState<PerformanceMetricsType>({
    totalProfitLoss: 0,
    winRate: 0,
    maxDrawdown: 0,
    totalTrades: 0,
    averageProfit: 0,
    averageLoss: 0,
    profitFactor: 0,
  });
  const [aiReport, setAiReport] = useState<string>("");
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [rrTool, setRrTool] = useState<RRToolType | null>(null);
  const [isPlacingRR, setIsPlacingRR] = useState(false);

  useEffect(() => {
    const newMetrics = calculatePerformanceMetrics(trades);
    setMetrics(newMetrics);
  }, [trades]);

  const handleChartClick = (chartData: { price: number; date: Date, dataIndex: number }) => {
    if (isPlacingRR) {
      const entryPrice = chartData.price;
      const stopLoss = entryPrice * 0.98; // Default 2%
      const takeProfit = entryPrice * 1.04; // Default 4% (1:2 RR)
      
      setRrTool({
        id: `rr-${Date.now()}`,
        entryPrice: entryPrice,
        stopLoss: stopLoss,
        takeProfit: takeProfit,
        entryIndex: chartData.dataIndex,
        widthInPoints: 100, // Visual width, doesn't affect simulation logic
      });
      setIsPlacingRR(false);
    }
  };

  const handleClearTrades = () => {
    setTrades([]);
    setAiReport("");
    setRrTool(null);
  };

  const handleSimulateFromTool = () => {
    if (!rrTool) return;
    
    const newTrade = simulateTrade(
      rrTool.entryIndex,
      mockPriceData,
      rrTool.takeProfit,
      rrTool.stopLoss,
    );

    if (newTrade) {
      setTrades((prevTrades) => [...prevTrades, newTrade].sort((a,b) => a.entryDate.getTime() - b.entryDate.getTime()));
    }
    setRrTool(null); // Clear tool after simulating
  }

  const handleGenerateReport = async () => {
    setIsReportLoading(true);
    setAiReport("");

    const tradeHistoryString = JSON.stringify(
      trades.map((t) => ({
        entryDate: t.entryDate.toISOString(),
        exitDate: t.exitDate.toISOString(),
        profit: t.profit,
      }))
    );
    
    startTransition(async () => {
      const result = await generateReportAction({
        profitLoss: metrics.totalProfitLoss,
        winRate: metrics.winRate / 100,
        drawdown: metrics.maxDrawdown,
        tradeHistory: tradeHistoryString,
      });

      if (result.report) {
        setAiReport(result.report);
      } else {
        setAiReport("Failed to generate report. Please try again.");
      }
      setIsReportLoading(false);
    });
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground font-body">
      <header className="flex items-center justify-between p-4 border-b border-border shadow-md">
        <div className="flex items-center gap-2">
           <div className="p-2 bg-primary rounded-lg">
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-primary-foreground">
                <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm-1.14 15.31L12 11.22l1.14 6.09h-2.28zm1.14-9.31a1.5 1.5 0 1 1-1.5 1.5 1.5 1.5 0 0 1 1.5-1.5z" />
                <path d="M7.5 11.5h-1a1.5 1.5 0 0 0 0 3h1a1.5 1.5 0 0 0 0-3zm10 0h-1a1.5 1.5 0 0 0 0 3h1a1.5 1.5 0 0 0 0-3z" />
              </svg>
           </div>
          <h1 className="text-2xl font-bold font-headline text-foreground">
            Algo Insights
          </h1>
        </div>
      </header>

      <main className="flex-1 w-full max-w-screen-2xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-4 xl:gap-6 p-4 xl:p-6">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <Card className="flex-1 flex flex-col bg-card/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="font-headline text-xl">Interactive Chart</CardTitle>
              <CardDescription>
                {isPlacingRR ? "Click on the chart to place the Risk/Reward tool." : "Use the Risk/Reward tool to define and simulate a trade."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 -mt-4">
              <InteractiveChart
                data={mockPriceData}
                trades={trades}
                onChartClick={handleChartClick}
                rrTool={rrTool}
                setRrTool={setRrTool}
                isPlacingRR={isPlacingRR}
              />
            </CardContent>
          </Card>
        </div>

        <aside className="lg:col-span-1 flex flex-col gap-6">
            <Card className="bg-card/80 backdrop-blur-sm">
                <CardHeader>
                    <CardTitle className="font-headline text-xl flex items-center gap-2">
                        <Target className="w-5 h-5"/>
                        Trading Tools
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Button onClick={() => setIsPlacingRR(true)} disabled={isPlacingRR || !!rrTool} className="w-full">
                        <Target className="mr-2"/> Place Risk/Reward
                    </Button>
                    {rrTool && (
                        <div className="border-t border-border pt-4 space-y-2">
                           <div className="flex justify-between items-center text-sm p-2 bg-secondary/30 rounded-md">
                               <span className="text-muted-foreground">Entry:</span>
                               <span className="font-mono">${rrTool.entryPrice.toFixed(2)}</span>
                           </div>
                           <div className="flex justify-between items-center text-sm p-2 bg-secondary/30 rounded-md">
                               <span className="text-muted-foreground">Take Profit:</span>
                               <span className="font-mono text-accent">${rrTool.takeProfit.toFixed(2)}</span>
                           </div>
                            <div className="flex justify-between items-center text-sm p-2 bg-secondary/30 rounded-md">
                               <span className="text-muted-foreground">Stop Loss:</span>
                               <span className="font-mono text-destructive">${rrTool.stopLoss.toFixed(2)}</span>
                           </div>
                            <div className="grid grid-cols-2 gap-2 pt-2">
                                <Button variant="outline" onClick={() => setRrTool(null)}>
                                    <X className="mr-2"/> Clear
                                </Button>
                                <Button onClick={handleSimulateFromTool}>
                                    <Play className="mr-2"/> Simulate
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
           <PerformanceMetrics metrics={metrics} onClearTrades={handleClearTrades} />
          <Card className="flex-1 flex flex-col bg-card/80 backdrop-blur-sm">
             <CardContent className="p-4 flex-1 flex flex-col">
              <Tabs defaultValue="equity" className="flex-1 flex flex-col">
                <TabsList className="grid w-full grid-cols-3 bg-secondary/30">
                  <TabsTrigger value="equity"><LineChartIcon className="w-4 h-4 mr-2"/>Equity</TabsTrigger>
                  <TabsTrigger value="history"><History className="w-4 h-4 mr-2"/>History</TabsTrigger>
                  <TabsTrigger value="report"><Bot className="w-4 h-4 mr-2"/>AI Report</TabsTrigger>
                </TabsList>
                <TabsContent value="equity" className="flex-1 mt-4">
                    <EquityCurveChart trades={trades} />
                </TabsContent>
                <TabsContent value="history" className="flex-1 mt-4 overflow-hidden">
                    <TradeHistoryTable trades={trades} />
                </TabsContent>
                <TabsContent value="report" className="flex-1 mt-4 flex flex-col">
                    <ReportDisplay
                      onGenerate={handleGenerateReport}
                      report={aiReport}
                      isLoading={isReportLoading}
                      hasTrades={trades.length > 0}
                    />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </aside>
      </main>
    </div>
  );
}
