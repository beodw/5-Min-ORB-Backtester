
"use client";

import { useState, useEffect } from "react";
import { Download, ArrowUp, ArrowDown, Settings, Calendar as CalendarIcon, ChevronRight, ChevronsRight, Target, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InteractiveChart } from "@/components/algo-insights/interactive-chart";
import { mockPriceData } from "@/lib/mock-data";
import type { RiskRewardTool as RRToolType, PriceMarker, OpeningRange } from "@/types";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function AlgoInsightsPage() {
  const [rrTools, setRrTools] = useState<RRToolType[]>([]);
  const [placingToolType, setPlacingToolType] = useState<'long' | 'short' | null>(null);
  const [priceMarkers, setPriceMarkers] = useState<PriceMarker[]>([]);
  const [isPlacingPriceMarker, setIsPlacingPriceMarker] = useState(false);
  const [timeframe, setTimeframe] = useState('1m');
  const [timeZone, setTimeZone] = useState<string>('');
  const [timezones, setTimezones] = useState<{ value: string; label: string }[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [sessionStartTime, setSessionStartTime] = useState('09:30');

  
  useEffect(() => {
    const getOffsetInMinutes = (timeZone: string): number => {
        try {
            const now = new Date();
            const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
            const tzDate = new Date(now.toLocaleString('en-US', { timeZone }));
            return (tzDate.getTime() - utcDate.getTime()) / 60000;
        } catch (e) {
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
    if (savedTimeZone && Intl.supportedValuesOf('timeZone').includes(savedTimeZone)) {
        setTimeZone(savedTimeZone);
    } else {
        setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    }

    const savedSessionStart = localStorage.getItem('algo-insights-session-start');
    if (savedSessionStart) {
        setSessionStartTime(savedSessionStart);
    }
  }, []);

  useEffect(() => {
    if (timeZone) {
        localStorage.setItem('algo-insights-timezone', timeZone);
    }
  }, [timeZone]);

  useEffect(() => {
    if (sessionStartTime) {
        localStorage.setItem('algo-insights-session-start', sessionStartTime);
    }
  }, [sessionStartTime]);


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
        widthInPoints: 100,
        position: placingToolType,
      };
      
      setRrTools(prevTools => [...prevTools, newTool]);
      setPlacingToolType(null);
    } else if (isPlacingPriceMarker) {
      const newMarker: PriceMarker = {
        id: `pm-${Date.now()}`,
        price: chartData.close,
        isDeletable: true,
      };
      setPriceMarkers(prev => [...prev, newMarker]);
      setIsPlacingPriceMarker(false);
    }
  };
  
  const handleUpdateTool = (updatedTool: RRToolType) => {
    setRrTools(prevTools => prevTools.map(t => t.id === updatedTool.id ? updatedTool : t));
  };

  const handleRemoveTool = (id: string) => {
    setRrTools(prevTools => prevTools.filter(t => t.id !== id));
  };

  const handleRemovePriceMarker = (id: string) => {
    setPriceMarkers(prevMarkers => prevMarkers.filter(m => m.id !== id));
  };

  const handleClearAllDrawings = () => {
    setRrTools([]);
    setPriceMarkers([]);
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
    setSelectedDate(date);
  };
  
  const handleNextCandle = () => {
    const getDuration = (tf: string): number => {
      switch (tf) {
        case '1m': return 60 * 1000;
        case '30m': return 30 * 60 * 1000;
        case '1H': return 60 * 60 * 1000;
        case '4H': return 4 * 60 * 60 * 1000;
        case '1D': return 24 * 60 * 60 * 1000;
        default: return 24 * 60 * 60 * 1000;
      }
    };

    setSelectedDate(currentDate => {
      const startDate = currentDate || (mockPriceData.length > 0 ? mockPriceData[0].date : new Date());
      const newDate = new Date(startDate.getTime() + getDuration(timeframe));
      const lastAvailableDate = mockPriceData[mockPriceData.length - 1].date;

      if (newDate > lastAvailableDate) {
        return lastAvailableDate;
      }
      
      return newDate;
    });
  };

  const handleNextSession = () => {
    if (!timeZone || !sessionStartTime || !mockPriceData.length) return;

    const startDate = selectedDate || mockPriceData[0].date;
    const startIndex = mockPriceData.findIndex(p => p.date > startDate);
    if (startIndex === -1) return;

    const [sessionHour, sessionMinute] = sessionStartTime.split(':').map(Number);
    const options = { hour: 'numeric', minute: 'numeric', hour12: false, timeZone };
    const formatter = new Intl.DateTimeFormat('en-US', options);

    for (let i = startIndex; i < mockPriceData.length; i++) {
      const pointDate = mockPriceData[i].date;
      const parts = formatter.formatToParts(pointDate);
      const hourPart = parts.find(p => p.type === 'hour');
      const minutePart = parts.find(p => p.type === 'minute');

      if (hourPart && minutePart) {
        const pointHour = parseInt(hourPart.value, 10);
        const pointMinute = parseInt(minutePart.value, 10);

        if (pointHour === sessionHour && pointMinute === sessionMinute) {
          // Check if we have enough data for the 5-min range and the candle after
          if (i + 5 < mockPriceData.length) {
            
            // Define the 5-minute opening range (first 5 candles)
            const rangeSlice = mockPriceData.slice(i, i + 5);
            
            let high = -Infinity;
            let low = Infinity;

            // Loop through the slice to find the highest high and lowest low
            for (const candle of rangeSlice) {
              high = Math.max(high, candle.high);
              low = Math.min(low, candle.low);
            }
            
            // Create the marker components to be drawn on the chart
            const highMarker: PriceMarker = { id: 'or-high', price: high, label: 'OR High', isDeletable: true };
            const lowMarker: PriceMarker = { id: 'or-low', price: low, label: 'OR Low', isDeletable: true };

            // Update the state to render the markers, removing old ones first
            setPriceMarkers(prev => {
              const filtered = prev.filter(m => m.id !== 'or-high' && m.id !== 'or-low');
              return [...filtered, highMarker, lowMarker];
            });

            // Set the view to show the opening range and the next candle (up to 9:35)
            const endDateToShow = mockPriceData[i + 5].date;
            setSelectedDate(endDateToShow);

          } else {
            // Not enough data, just go to the session start
            setSelectedDate(pointDate);
          }
          return; 
        }
      }
    }
  };
  
  const handlePlaceLong = () => {
    setIsPlacingPriceMarker(false);
    setPlacingToolType('long');
  };

  const handlePlaceShort = () => {
    setIsPlacingPriceMarker(false);
    setPlacingToolType('short');
  };

  const handlePlaceMarker = () => {
    setPlacingToolType(null);
    setIsPlacingPriceMarker(true);
  };

  const isPlacingAnything = !!placingToolType || isPlacingPriceMarker;

  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-body">
      <header className="flex items-center justify-between p-4 border-b border-border shadow-md">
        <div className="flex items-center gap-2">
           <div className="p-2 bg-primary rounded-lg">
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-primary-foreground">
                <path d="M4 8h16"/>
                <path d="M4 12h16"/>
                <path d="M12 4v16l4-4"/>
              </svg>
           </div>
          <h1 className="text-2xl font-bold font-headline text-foreground">
            5 Minute ORB Backtester
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
                        <div className="grid gap-2">
                            <Label htmlFor="session-start">Session Start Time</Label>
                            <Input
                                id="session-start"
                                type="time"
                                value={sessionStartTime}
                                onChange={(e) => setSessionStartTime(e.target.value)}
                            />
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
                isPlacingPriceMarker={isPlacingPriceMarker}
                priceMarkers={priceMarkers}
                onRemovePriceMarker={handleRemovePriceMarker}
                timeframe={timeframe}
                timeZone={timeZone}
                endDate={selectedDate}
            />
        </div>

        <aside className="absolute top-4 left-4 z-10 flex items-start gap-2">
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

              <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={handleNextSession} className="text-muted-foreground">
                            <ChevronsRight className="h-5 w-5" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>Next Session Open</p>
                    </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <div className="h-6 border-l border-border/50"></div>
              
              <TooltipProvider>
                <div className="flex justify-center gap-2">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={handlePlaceLong} disabled={isPlacingAnything}>
                                <ArrowUp className="w-5 h-5 text-accent"/>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>Place Long Position</p>
                        </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={handlePlaceShort} disabled={isPlacingAnything}>
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

            <div className="flex flex-col items-center gap-2 bg-card/80 backdrop-blur-sm p-2 rounded-lg shadow-lg">
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={handlePlaceMarker} disabled={isPlacingAnything}>
                                <Target className="w-5 h-5 text-foreground"/>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                            <p>Place Price Marker</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
                <AlertDialog>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="icon" disabled={rrTools.length === 0 && priceMarkers.length === 0}>
                            <Trash2 className="h-5 w-5" />
                          </Button>
                        </AlertDialogTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <p>Clear all drawings</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete all placed tools and markers from the chart.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleClearAllDrawings}>
                        Continue
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
            </div>

            {isPlacingAnything && (
                <div className="bg-card/80 backdrop-blur-sm p-2 rounded-lg text-center text-xs text-primary animate-pulse">
                    Click on the chart to place.
                </div>
            )}
        </aside>
      </main>
    </div>
  );
}
