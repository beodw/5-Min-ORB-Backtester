
"use client";

import { useState, useEffect } from "react";
import { Download, ArrowUp, ArrowDown, Settings, Calendar as CalendarIcon, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InteractiveChart } from "@/components/algo-insights/interactive-chart";
import { mockPriceData } from "@/lib/mock-data";
import type { RiskRewardTool as RRToolType } from "@/types";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar } from "@/components/ui/calendar";

export default function AlgoInsightsPage() {
  const [rrTools, setRrTools] = useState<RRToolType[]>([]);
  const [placingToolType, setPlacingToolType] = useState<'long' | 'short' | null>(null);
  const [timeframe, setTimeframe] = useState('1D');
  const [timeZone, setTimeZone] = useState<string>('');
  const [timezones, setTimezones] = useState<{ value: string; label: string }[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();

  useEffect(() => {
    const getOffsetInMinutes = (timeZone: string): number => {
        try {
            const now = new Date();
            // Create dates in UTC and the target timezone to calculate the difference
            const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
            const tzDate = new Date(now.toLocaleString('en-US', { timeZone }));
            return (tzDate.getTime() - utcDate.getTime()) / 60000;
        } catch (e) {
            // Some obscure timezones might not be supported everywhere
            return NaN;
        }
    };

    const tzData = Intl.supportedValuesOf('timeZone')
        .map(tz => {
            const offset = getOffsetInMinutes(tz);
            if (isNaN(offset)) return null;

            const offsetHours = Math.floor(Math.abs(offset) / 60);
            const offsetMinutes = Math.abs(offset) % 60;
            const sign = offset >= 0 ? '+' : '-';
            const offsetString = `(UTC${sign}${String(offsetHours).padStart(2, '0')}:${String(offsetMinutes).padStart(2, '0')})`;
            
            return {
                value: tz,
                label: `${tz.replace(/_/g, ' ')} ${offsetString}`,
                offset,
            };
        })
        .filter((tz): tz is { value: string; label: string; offset: number; } => tz !== null)
        .sort((a, b) => a.offset - b.offset);

    setTimezones(tzData);

    const savedTimeZone = localStorage.getItem('algo-insights-timezone');
    // Ensure the saved timezone is a valid one before setting it
    if (savedTimeZone && Intl.supportedValuesOf('timeZone').includes(savedTimeZone)) {
        setTimeZone(savedTimeZone);
    } else {
        // Fallback to user's local timezone if nothing is saved or it's invalid
        setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    }
  }, []);

  useEffect(() => {
    // Persist the timezone to localStorage whenever it changes
    if (timeZone) {
        localStorage.setItem('algo-insights-timezone', timeZone);
    }
  }, [timeZone]);


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

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);
        setSelectedDate(endOfDay);
    } else {
        setSelectedDate(undefined);
    }
  };
  
  const handleNextCandle = () => {
    const getDuration = (tf: string): number => { // returns duration in milliseconds
      switch (tf) {
        case '1m': return 60 * 1000;
        case '30m': return 30 * 60 * 1000;
        case '1H': return 60 * 60 * 1000;
        case '4H': return 4 * 60 * 60 * 1000;
        case '1D': return 24 * 60 * 60 * 1000;
        default: return 24 * 60 * 60 * 1000; // Default to 1 Day
      }
    };

    setSelectedDate(currentDate => {
      // If no date is selected, start from the first data point.
      const startDate = currentDate || (mockPriceData.length > 0 ? mockPriceData[0].date : new Date());
      
      const newDate = new Date(startDate.getTime() + getDuration(timeframe));
      
      const lastAvailableDate = mockPriceData[mockPriceData.length - 1].date;

      // Ensure the new date does not exceed the last available data point.
      if (newDate > lastAvailableDate) {
        return lastAvailableDate;
      }
      
      return newDate;
    });
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
        <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:inline-block">{timeZone.replace(/_/g, ' ')}</span>
            <Popover>
                <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon">
                        <Settings className="h-5 w-5" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 mr-4">
                    <div className="grid gap-4">
                        <div className="space-y-2">
                            <h4 className="font-medium leading-none">Settings</h4>
                            <p className="text-sm text-muted-foreground">
                                Adjust chart display options.
                            </p>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="timezone">Timezone</Label>
                            <Select value={timeZone} onValueChange={setTimeZone} disabled={!timezones.length}>
                                <SelectTrigger id="timezone" className="w-full">
                                    <SelectValue placeholder="Select timezone" />
                                </SelectTrigger>
                                <SelectContent>
                                  <ScrollArea className="h-72">
                                    {timezones.map(tz => (
                                        <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                                    ))}
                                  </ScrollArea>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </PopoverContent>
            </Popover>
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
                timeframe={timeframe}
                timeZone={timeZone}
                endDate={selectedDate}
            />
        </div>

        <aside className="absolute top-4 left-4 z-10 flex flex-col items-start gap-2">
            <div className="flex items-center gap-2 bg-card/80 backdrop-blur-sm p-2 rounded-lg shadow-lg">
              <Select value={timeframe} onValueChange={setTimeframe}>
                  <SelectTrigger className="w-[120px]">
                      <SelectValue placeholder="Timeframe" />
                  </SelectTrigger>
                  <SelectContent>
                      <SelectItem value="1m">1 Minute</SelectItem>
                      <SelectItem value="30m">30 Minutes</SelectItem>
                      <SelectItem value="1H">1 Hour</SelectItem>
                      <SelectItem value="4H">4 Hours</SelectItem>
                      <SelectItem value="1D">1 Day</SelectItem>
                  </SelectContent>
              </Select>

              <Popover>
                  <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-muted-foreground">
                          <CalendarIcon className="h-5 w-5" />
                      </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                      <Calendar
                          mode="single"
                          selected={selectedDate}
                          onSelect={handleDateSelect}
                          initialFocus
                          disabled={(date) =>
                              date > new Date() || date < new Date("1900-01-01")
                            }
                      />
                  </PopoverContent>
              </Popover>

              <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={handleNextCandle} className="text-muted-foreground">
                            <ChevronRight className="h-5 w-5" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>Next Candle</p>
                    </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <div className="h-6 border-l border-border/50"></div>
              
              <TooltipProvider>
                <div className="flex justify-center gap-2">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => setPlacingToolType('long')} disabled={!!placingToolType}>
                                <ArrowUp className="w-5 h-5 text-accent"/>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>Place Long Position</p>
                        </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => setPlacingToolType('short')} disabled={!!placingToolType}>
                                <ArrowDown className="w-5 h-5 text-destructive"/>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>Place Short Position</p>
                        </TooltipContent>
                    </Tooltip>
                </div>
              </TooltipProvider>

              <div className="h-6 border-l border-border/50"></div>

              <Button
                  variant="ghost" 
                  onClick={handleExportCsv} 
                  disabled={rrTools.length === 0}
                  className="text-foreground"
              >
                  <Download className="mr-2 h-4 w-4" />
                  Download Report
              </Button>
            </div>
            {placingToolType && (
                <div className="bg-card/80 backdrop-blur-sm p-2 rounded-lg text-center text-xs text-primary animate-pulse">
                    Click on the chart to place.
                </div>
            )}
        </aside>
      </main>
    </div>
  );
}
