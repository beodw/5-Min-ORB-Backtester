"use client";

import { useState } from "react";
import { Download, Target, ArrowUp, ArrowDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InteractiveChart } from "@/components/algo-insights/interactive-chart";
import { mockPriceData } from "@/lib/mock-data";
import type { RiskRewardTool as RRToolType } from "@/types";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export default function AlgoInsightsPage() {
  const [rrTools, setRrTools] = useState<RRToolType[]>([]);
  const [placingToolType, setPlacingToolType] = useState<'long' | 'short' | null>(null);

  const handleChartClick = (chartData: { close: number; date: Date, dataIndex: number }) => {
    if (placingToolType) {
      const entryPrice = chartData.close;
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

  const handleExportCsv = () => {
    if (rrTools.length === 0) return;

    const headers = "Position,Entry Price,Stop Loss,Take Profit,Stop Loss Distance\n";
    const rows = rrTools.map(tool => {
      const stopLossDistance = Math.abs(tool.entryPrice - tool.stopLoss).toFixed(4);
      return [
        tool.position,
        tool.entryPrice.toFixed(4),
        tool.stopLoss.toFixed(4),
        tool.takeProfit.toFixed(4),
        stopLossDistance
      ].join(',');
    }).join('\n');

    const csvContent = headers + rows;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.href) {
      URL.revokeObjectURL(link.href);
    }
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "strategy_report.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-body">
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

      <main className="flex-1 relative">
        <div className="absolute inset-0">
            <InteractiveChart
                data={mockPriceData}
                trades={[]}
                onChartClick={handleChartClick}
                rrTools={rrTools}
                onUpdateTool={handleUpdateTool}
                onRemoveTool={handleRemoveTool}
                isPlacingRR={!!placingToolType}
            />
        </div>

        <aside className="absolute top-4 left-4 z-10 flex flex-col items-start gap-4">
            <div className="flex flex-col items-start gap-2">
                <TooltipProvider>
                  <div className="flex justify-center gap-2">
                      <Tooltip>
                          <TooltipTrigger asChild>
                              <Button variant="outline" size="icon" onClick={() => setPlacingToolType('long')} disabled={!!placingToolType}>
                                  <ArrowUp className="w-5 h-5 text-accent"/>
                              </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                              <p>Place Long Position</p>
                          </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                          <TooltipTrigger asChild>
                              <Button variant="outline" size="icon" onClick={() => setPlacingToolType('short')} disabled={!!placingToolType}>
                                  <ArrowDown className="w-5 h-5 text-destructive"/>
                              </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                              <p>Place Short Position</p>
                          </TooltipContent>
                      </Tooltip>
                  </div>
                </TooltipProvider>
                {placingToolType && (
                    <div className="text-center text-xs text-primary mt-2 animate-pulse">
                        Click on the chart to place.
                    </div>
                )}
            </div>
            <Button
                variant="ghost" 
                onClick={handleExportCsv} 
                disabled={rrTools.length === 0}
                className="bg-card/80 backdrop-blur-sm text-foreground hover:bg-card/90"
            >
                <Download className="mr-2 h-4 w-4" />
                Download Report
            </Button>
        </aside>
      </main>
    </div>
  );
}
