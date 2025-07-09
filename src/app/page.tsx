
"use client";

import { useState, useEffect, useRef } from "react";
import { Download, ArrowUp, ArrowDown, Settings, Calendar as CalendarIcon, ChevronRight, ChevronsRight, Target, Trash2, FileUp, Lock, Unlock, Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InteractiveChart } from "@/components/algo-insights/interactive-chart";
import { mockPriceData } from "@/lib/mock-data";
import type { RiskRewardTool as RRToolType, PriceMarker, OpeningRange, PriceData, MeasurementTool as MeasurementToolType, MeasurementPoint } from "@/types";
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
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";


export default function AlgoInsightsPage() {
  const [priceData, setPriceData] = useState<PriceData[]>(mockPriceData);
  const [isDataImported, setIsDataImported] = useState(false);
  const [fileName, setFileName] = useState('');
  const [rrTools, setRrTools] = useState<RRToolType[]>([]);
  const [placingToolType, setPlacingToolType] = useState<'long' | 'short' | null>(null);
  const [priceMarkers, setPriceMarkers] = useState<PriceMarker[]>([]);
  const [isPlacingPriceMarker, setIsPlacingPriceMarker] = useState(false);
  const [measurementTools, setMeasurementTools] = useState<MeasurementToolType[]>([]);
  const [isPlacingMeasurement, setIsPlacingMeasurement] = useState(false);
  const [measurementStartPoint, setMeasurementStartPoint] = useState<MeasurementPoint | null>(null);
  const [timeframe, setTimeframe] = useState('1m');
  const [timeZone, setTimeZone] = useState<string>('');
  const [timezones, setTimezones] = useState<{ value: string; label: string }[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [sessionStartTime, setSessionStartTime] = useState('09:30');
  const [isYAxisLocked, setIsYAxisLocked] = useState(true);
  const [pipValue, setPipValue] = useState(0.0001);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  
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

    const savedPipValue = localStorage.getItem('algo-insights-pip-value');
    if (savedPipValue) {
        setPipValue(parseFloat(savedPipValue));
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

  useEffect(() => {
      localStorage.setItem('algo-insights-pip-value', String(pipValue));
  }, [pipValue]);


  const handleChartClick = (chartData: { price: number; date: Date, dataIndex: number, closePrice: number, yDomain: [number, number], xDomain: [number, number] }) => {
    if (placingToolType) {
      const entryPrice = chartData.closePrice;
      
      const visiblePriceRange = chartData.yDomain[1] - chartData.yDomain[0];
      const stopLossOffset = visiblePriceRange * 0.05; // 5% of visible height for stop
      const takeProfitOffset = visiblePriceRange * 0.10; // 10% of visible height for profit (1:2 RR)

      const stopLoss = placingToolType === 'long' ? entryPrice - stopLossOffset : entryPrice + stopLossOffset;
      const takeProfit = placingToolType === 'long' ? entryPrice + takeProfitOffset : entryPrice - takeProfitOffset;
      
      const visibleIndexRange = chartData.xDomain[1] - chartData.xDomain[0];
      const widthInPoints = Math.round(visibleIndexRange * 0.25); // 25% of visible width

      const newTool: RRToolType = {
        id: `rr-${Date.now()}`,
        entryPrice: entryPrice,
        stopLoss: stopLoss,
        takeProfit: takeProfit,
        entryDate: chartData.date,
        widthInPoints: widthInPoints,
        position: placingToolType,
      };
      
      setRrTools(prevTools => [...prevTools, newTool]);
      setPlacingToolType(null);
    } else if (isPlacingPriceMarker) {
      const newMarker: PriceMarker = {
        id: `pm-${Date.now()}`,
        price: chartData.price,
        isDeletable: true,
      };
      setPriceMarkers(prev => [...prev, newMarker]);
      setIsPlacingPriceMarker(false);
    } else if (isPlacingMeasurement) {
        const currentPoint = {
            index: chartData.dataIndex,
            price: chartData.price
        };
        if (!measurementStartPoint) {
            setMeasurementStartPoint(currentPoint);
        } else {
            const newTool: MeasurementToolType = {
                id: `measure-${Date.now()}`,
                startPoint: measurementStartPoint,
                endPoint: currentPoint,
            };
            setMeasurementTools(prev => [...prev, newTool]);
            setMeasurementStartPoint(null);
            setIsPlacingMeasurement(false);
        }
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

  const handleRemoveMeasurementTool = (id: string) => {
    setMeasurementTools(prev => prev.filter(t => t.id !== id));
  };

  const handleUpdatePriceMarker = (id: string, price: number) => {
    setPriceMarkers(prevMarkers => 
      prevMarkers.map(m => 
        m.id === id ? { ...m, price } : m
      )
    );
  };

  const handleClearAllDrawings = () => {
    setRrTools([]);
    setPriceMarkers([]);
    setMeasurementTools([]);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();

    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text !== 'string') return;

      const lines = text.split('\n').filter(line => line.trim() !== '');
      if (lines.length <= 1) return; // Empty or header only

      const dataRows = lines.slice(1);

      const parsedData: PriceData[] = dataRows.map((row, index) => {
        try {
            const [localTime, openStr, highStr, lowStr, closeStr] = row.split(',');
            
            if (!localTime || !openStr || !highStr || !lowStr || !closeStr) {
                console.warn(`Skipping incomplete row ${index + 2}`);
                return null;
            }

            const dateTimeString = localTime.trim().replace(' GMT', '');
            const [datePart, timePart] = dateTimeString.split(' ');
            if (!datePart || !timePart) throw new Error(`Invalid date/time format: ${localTime}`);

            const [day, month, year] = datePart.split('.').map(Number);
            const [hour, minute, second] = timePart.split(':').map(Number);
            
            const date = new Date(Date.UTC(year, month - 1, day, hour, minute, Math.floor(second)));
            if (isNaN(date.getTime())) throw new Error(`Could not create a valid date`);

            const open = parseFloat(openStr);
            const high = parseFloat(highStr);
            const low = parseFloat(lowStr);
            const close = parseFloat(closeStr);
            
            if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) {
                throw new Error(`Invalid price data`);
            }

            return { date, open, high, low, close, wick: [low, high] };
        } catch (error: any) {
            console.warn(`Error parsing row ${index + 2}: ${error.message}`, row);
            return null;
        }
      }).filter((p): p is PriceData => p !== null);

      if (parsedData.length > 0) {
        parsedData.sort((a, b) => a.date.getTime() - b.date.getTime());
        setPriceData(parsedData);
        setIsDataImported(true);
        setSelectedDate(parsedData[parsedData.length - 1].date);
      } else {
        console.error("Failed to parse any valid data from the CSV file.");
        setIsDataImported(false);
      }
    };

    reader.onerror = (e) => {
        console.error("Error reading file:", e);
        setIsDataImported(false);
    };

    reader.readAsText(file);
    // Reset file input to allow re-uploading the same file
    if(fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  };


  const handleExportCsv = () => {
    if (rrTools.length === 0 || !isDataImported) {
        alert("Please place at least one trade tool on imported data to generate a report.");
        return;
    }

    const headers = [
        "Trade Outcome", 
        "Pair", 
        "Date Taken", 
        "Date Closed", 
        "Day of the week", 
        "Max R", 
        "Comments", 
        "Stop Loss In Pips", 
        "Minimum Distance To SL (pips)"
    ].join(',');

    const sortedTools = [...rrTools].sort((a, b) => a.entryDate.getTime() - b.entryDate.getTime());

    const rows = sortedTools.map(tool => {
        const pair = fileName ? fileName.split('-')[0].trim() : 'N/A';
        const entryIndex = priceData.findIndex(p => p.date.getTime() >= tool.entryDate.getTime());
        
        if (entryIndex === -1) return null;

        const dateTaken = priceData[entryIndex].date;
        const dayOfWeek = dateTaken.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
        
        const riskAmountPrice = Math.abs(tool.entryPrice - tool.stopLoss);
        const stopLossPips = pipValue > 0 ? (riskAmountPrice / pipValue).toFixed(2) : '0.00';

        let tradeOutcome = 'Incomplete';
        let dateClosed: Date | null = null;
        let minDistanceToSLPips = NaN;
        let maxR = 0;

        let highSinceEntry = priceData[entryIndex].high;
        let lowSinceEntry = priceData[entryIndex].low;

        for (let i = entryIndex; i < priceData.length; i++) {
            const candle = priceData[i];
            highSinceEntry = Math.max(highSinceEntry, candle.high);
            lowSinceEntry = Math.min(lowSinceEntry, candle.low);

            if (tool.position === 'long') {
                if (candle.low <= tool.stopLoss) {
                    tradeOutcome = 'loss';
                    dateClosed = candle.date;
                    minDistanceToSLPips = 0; // Hit the SL
                    break;
                }
                if (candle.high >= tool.takeProfit) {
                    tradeOutcome = 'win';
                    dateClosed = candle.date;
                    const minSlDistPrice = lowSinceEntry - tool.stopLoss;
                    minDistanceToSLPips = pipValue > 0 ? minSlDistPrice / pipValue : 0;
                    break;
                }
            } else { // 'short'
                if (candle.high >= tool.stopLoss) {
                    tradeOutcome = 'loss';
                    dateClosed = candle.date;
                    minDistanceToSLPips = 0; // Hit the SL
                    break;
                }
                if (candle.low <= tool.takeProfit) {
                    tradeOutcome = 'win';
                    dateClosed = candle.date;
                    const minSlDistPrice = tool.stopLoss - highSinceEntry;
                    minDistanceToSLPips = pipValue > 0 ? minSlDistPrice / pipValue : 0;
                    break;
                }
            }
        }
        
        if (riskAmountPrice > 0) {
            if (tool.position === 'long') {
                const maxProfitPrice = highSinceEntry - tool.entryPrice;
                maxR = maxProfitPrice / riskAmountPrice;
            } else { // 'short'
                const maxProfitPrice = tool.entryPrice - lowSinceEntry;
                maxR = maxProfitPrice / riskAmountPrice;
            }
        }
        
        const sanitize = (val: any) => {
            const str = String(val);
            if (str.includes(',')) return `"${str}"`;
            return str;
        };

        const rowData = [
            tradeOutcome,
            pair,
            dateTaken.toLocaleString(),
            dateClosed ? dateClosed.toLocaleString() : '',
            dayOfWeek,
            maxR.toFixed(2),
            '', // Comments
            stopLossPips,
            !isNaN(minDistanceToSLPips) ? minDistanceToSLPips.toFixed(2) : ''
        ];
        
        return rowData.map(sanitize).join(',');

    }).filter(row => row !== null).join('\n');

    const csvContent = `${headers}\n${rows}`;
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
        setSelectedDate(new Date());
    }
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
      const newDate = new Date(currentDate.getTime() + getDuration(timeframe));
      const lastAvailableDate = priceData[priceData.length - 1].date;

      if (newDate > lastAvailableDate) {
        return lastAvailableDate;
      }
      
      return newDate;
    });
  };

  const findNextSessionStartIndex = (currentDate: Date): number => {
    const [sessionHour, sessionMinute] = sessionStartTime.split(':').map(Number);
    
    // Start searching from the candle immediately after the current one.
    const searchStartIndex = priceData.findIndex(p => p.date > currentDate);
    if (searchStartIndex === -1) return -1;

    // Get the day of the candle we are currently on, ignoring time.
    let lastDay = new Date(currentDate);
    lastDay.setUTCHours(0, 0, 0, 0);

    for (let i = searchStartIndex; i < priceData.length; i++) {
        const pointDate = priceData[i].date;
        
        const pointDay = new Date(pointDate);
        pointDay.setUTCHours(0, 0, 0, 0);

        // Check 1: Is this candle on a day AFTER the last known day?
        if (pointDay.getTime() > lastDay.getTime()) {
            
            // Check 2: If it's a new day, is this the session start time? (in UTC)
            if (pointDate.getUTCHours() === sessionHour && pointDate.getUTCMinutes() === sessionMinute) {
                return i; // Found the start of the next session.
            }
        }
    }

    return -1; // Not found
  };
  
  const handleNextSession = () => {
    if (!sessionStartTime || !priceData.length) return;

    const startIndex = findNextSessionStartIndex(selectedDate);

    if (startIndex !== -1) {
        if (startIndex + 4 >= priceData.length) {
            alert("Not enough data to draw the opening range.");
            setSelectedDate(priceData[startIndex].date);
            return;
        }
        
        const openingRangeCandles = priceData.slice(startIndex, startIndex + 5);

        let openingRangeHigh = openingRangeCandles[0].high;
        let openingRangeLow = openingRangeCandles[0].low;

        for (const candle of openingRangeCandles) {
            openingRangeHigh = Math.max(openingRangeHigh, candle.high);
            openingRangeLow = Math.min(openingRangeLow, candle.low);
        }

        // Remove any previous Opening Range markers before adding new ones
        const otherMarkers = priceMarkers.filter(
            m => m.label !== "High" && m.label !== "Low"
        );
        
        const highMarker: PriceMarker = {
            id: `or-high-${startIndex}`,
            price: openingRangeHigh,
            label: 'High',
            isDeletable: true,
        };
        const lowMarker: PriceMarker = {
            id: `or-low-${startIndex}`,
            price: openingRangeLow,
            label: 'Low',
            isDeletable: true,
        };

        setPriceMarkers([...otherMarkers, highMarker, lowMarker]);

        // Pan the view to show the opening range and a few subsequent candles
        const viewEndIndex = Math.min(startIndex + 15, priceData.length - 1);
        setSelectedDate(priceData[viewEndIndex].date);
        
        return;
    }
    
    alert("Could not find the start of the next session in the available data.");
  };

  const handlePlaceLong = () => {
    setIsPlacingPriceMarker(false);
    setIsPlacingMeasurement(false);
    setMeasurementStartPoint(null);
    setPlacingToolType('long');
  };

  const handlePlaceShort = () => {
    setIsPlacingPriceMarker(false);
    setIsPlacingMeasurement(false);
    setMeasurementStartPoint(null);
    setPlacingToolType('short');
  };

  const handlePlaceMarker = () => {
    setPlacingToolType(null);
    setIsPlacingMeasurement(false);
    setMeasurementStartPoint(null);
    setIsPlacingPriceMarker(true);
  };

  const handlePlaceMeasurement = () => {
    setPlacingToolType(null);
    setIsPlacingPriceMarker(false);
    setMeasurementStartPoint(null);
    setIsPlacingMeasurement(true);
  };

  const isPlacingAnything = !!placingToolType || isPlacingPriceMarker || isPlacingMeasurement;

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
                            <Label htmlFor="session-start">Session Start Time (UTC)</Label>
                            <Input
                                id="session-start"
                                type="time"
                                value={sessionStartTime}
                                onChange={(e) => setSessionStartTime(e.target.value)}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="pip-value">Pip / Point Value</Label>
                            <Input
                                id="pip-value"
                                type="number"
                                step="0.0001"
                                value={pipValue}
                                onChange={(e) => setPipValue(parseFloat(e.target.value) || 0)}
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
                data={priceData}
                trades={[]}
                onChartClick={handleChartClick}
                rrTools={rrTools}
                onUpdateTool={handleUpdateTool}
                onRemoveTool={handleRemoveTool}
                isPlacingRR={!!placingToolType}
                isPlacingPriceMarker={isPlacingPriceMarker}
                priceMarkers={priceMarkers}
                onRemovePriceMarker={handleRemovePriceMarker}
                onUpdatePriceMarker={handleUpdatePriceMarker}
                measurementTools={measurementTools}
                onRemoveMeasurementTool={handleRemoveMeasurementTool}
                pipValue={pipValue}
                timeframe={timeframe}
                timeZone={timeZone}
                endDate={selectedDate}
                isYAxisLocked={isYAxisLocked}
            />
        </div>

        <div className="absolute top-4 left-4 z-10 flex flex-col items-start gap-2">
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
                          defaultMonth={selectedDate}
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

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleImportClick}
                    >
                      <FileUp className={cn(
                        "h-5 w-5",
                        isDataImported ? "text-chart-3" : "text-muted-foreground"
                      )} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{isDataImported ? "CSV Data Loaded" : "Import Dukascopy CSV"}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".csv"
                className="hidden"
              />

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
            
            <div className="flex items-center gap-2 bg-card/80 backdrop-blur-sm p-2 rounded-lg shadow-lg">
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={handlePlaceMarker} disabled={isPlacingAnything}>
                                <Target className="w-5 h-5 text-foreground"/>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>Place Price Marker</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                  <Tooltip>
                      <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={() => setIsYAxisLocked(prev => !prev)}>
                              {isYAxisLocked ? <Lock className="h-5 w-5" /> : <Unlock className="h-5 w-5" />}
                          </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                          <p>{isYAxisLocked ? "Unlock Y-Axis" : "Lock Y-Axis"}</p>
                      </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={handlePlaceMeasurement} disabled={isPlacingAnything}>
                                <Ruler className="w-5 h-5 text-foreground"/>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>Measure Distance</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
                <AlertDialog>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="icon" disabled={rrTools.length === 0 && priceMarkers.length === 0 && measurementTools.length === 0}>
                            <Trash2 className="h-5 w-5" />
                          </Button>
                        </AlertDialogTrigger>
                      </TooltipTrigger>
                      <TooltipContent>
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
                      <AlertDialogAction onClick={handleClearAllDrawings}>Continue</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
            </div>

            {fileName && (
                <div className="bg-card/70 backdrop-blur-sm rounded-md px-2 py-1 shadow-md">
                    <p className="text-xs text-muted-foreground/80">
                        Loaded: <span className="font-medium text-foreground/90">{fileName}</span>
                    </p>
                </div>
            )}
        </div>
      </main>
    </div>
  );
}
