
"use client";

import { useState, useEffect, startTransition } from "react";
import { Bot, LineChart as LineChartIcon, History, Target, X, Play, ArrowUp, ArrowDown } from "lucide-react";
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
  const [rrTools, setRrTools] = useState<RRToolType[]>([]);
  const [placingToolType, setPlacingToolType] = useState<'long' | 'short' | null>(null);

  useEffect(() => {
    const newMetrics = calculatePerformanceMetrics(trades);
    setMetrics(newMetrics);
  }, [trades]);

  const handleChartClick = (chartData: { price: number; date: Date, dataIndex: number }) => {
    if (placingToolType) {
      const entryPrice = chartData.price;
      const stopLoss = placingToolType === 'long' ? entryPrice * 0.98 : entryPrice * 1.02; // Default 2%
      const takeProfit = placingToolType === 'long' ? entryPrice * 1.04 : entryPrice * 0.96; // Default 4% (1:2 RR)
      
      const newTool: RRToolType = {
        id: `rr-${Date.now()}`,
        entryPrice: entryPrice,
        stopLoss: stopLoss,
        takeProfit: takeProfit,
        entryIndex: chartData.dataIndex,
        widthInPoints: 100, // Visual width, doesn't affect simulation logic
        position: placingToolType,
      };
      
      setRrTools(prevTools => [...prevTools, newTool]);
      setPlacingToolType(null);
    }
  };
  
  const handleUpdateTool = (updatedTool: RRToolType) => {
    setRrTools(prevTools => prevTools.map(t => t.id === updatedTool.id ? updatedTool : t));
  };

  const handleRemoveTool = (id: string) => {
    setRrTools(prevTools => prevTools.filter(t => t.id !== id));
  };

  const handleClearTools = () => {
    setRrTools([]);
  };

  const handleClearTrades = () => {
    setTrades([]);
    setAiReport("");
    handleClearTools();
  };

  const handleSimulateAll = () => {
    if (rrTools.length === 0) return;
    
    const newTrades = rrTools.map(tool => 
      simulateTrade(
        tool.entryIndex,
        mockPriceData,
        tool.takeProfit,
        tool.stopLoss,
        tool.position
      )
    ).filter((trade): trade is Trade => trade !== null);

    if (newTrades.length > 0) {
      setTrades((prevTrades) => [...prevTrades, ...newTrades].sort((a,b) => a.entryDate.getTime() - b.entryDate.getTime()));
    }
    setRrTools([]); // Clear tools after simulating
  }

  const handleGenerateReport = async () => {
    setIsReportLoading(true);
    setAiReport("");

    const tradeHistoryString = JSON.stringify(
      trades.map((t) => ({
        entryDate: t.entryDate.toISOString(),
        exitDate: t.exitDate.toISOString(),
        profit: t.profit,
        position: t.position,
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
                {placingToolType ? `Click on the chart to place a ${placingToolType} position.` : "Use the tools to define and simulate trades."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 -mt-4">
              <InteractiveChart
                data={mockPriceData}
                trades={trades}
                onChartClick={handleChartClick}
                rrTools={rrTools}
                onUpdateTool={handleUpdateTool}
                onRemoveTool={handleRemoveTool}
                isPlacingRR={!!placingToolType}
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
                <CardContent>
                    <div className="grid grid-cols-2 gap-2">
                        <Button onClick={() => setPlacingToolType('long')} disabled={!!placingToolType}>
                            <ArrowUp className="mr-2 text-accent"/> Place Long
                        </Button>
                        <Button onClick={() => setPlacingToolType('short')} disabled={!!placingToolType}>
                            <ArrowDown className="mr-2 text-destructive"/> Place Short
                        </Button>
                    </div>

                    {placingToolType && (
                        <div className="text-center text-sm text-primary mt-2 animate-pulse">
                            Placing {placingToolType} tool... Click on the chart.
                        </div>
                    )}
                    
                    {rrTools.length > 0 && (
                        <div className="border-t border-border pt-4 mt-4 space-y-2">
                           <p className="text-sm text-center text-muted-foreground">{rrTools.length} tool(s) placed.</p>
                            <div className="grid grid-cols-2 gap-2 pt-2">
                                <Button variant="outline" onClick={handleClearTools}>
                                    <X className="mr-2"/> Clear Tools
                                </Button>
                                <Button onClick={handleSimulateAll}>
                                    <Play className="mr-2"/> Simulate All
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
