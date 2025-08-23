
"use client";

import { useState, useEffect, useRef } from "react";
import { Download, ArrowUp, ArrowDown, Settings, Calendar as CalendarIcon, ChevronRight, ChevronsRight, Target, Trash2, FileUp, Lock, Unlock, Ruler, FileBarChart, Undo, Redo, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InteractiveChart, type ChartClickData } from "@/components/algo-insights/interactive-chart";
import { mockPriceData } from "@/lib/mock-data";
import type { RiskRewardTool as RRToolType, PriceMarker, MeasurementTool as MeasurementToolType, MeasurementPoint, PriceData, ToolbarPositions } from "@/types";
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

type TradeReportRow = {
    pair: string;
    dateTaken: string;
    dateClosed: string;
    maxR: string;
    stopLossPips: string;
    maxRTaken: string;
};

type DrawingState = {
    rrTools: RRToolType[];
    priceMarkers: PriceMarker[];
    measurementTools: MeasurementToolType[];
};

type SessionInfo = {
    fileName: string;
};

type SessionState = {
    drawingState: DrawingState;
    selectedDate: string; // Stored as ISO string
    sessionInfo: SessionInfo | null;
};

const formatDateForCsv = (date: Date | null): string => {
    if (!date) return '';
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0'); // Month is 0-indexed
    const year = date.getUTCFullYear();

    return `${month}/${day}/${year}`;
};

const simulateTrade = (
    tool: RRToolType,
    priceData: PriceData[],
    pipValue: number
): TradeReportRow | null => {
    const entryIndex = priceData.findIndex(p => p.date.getTime() >= tool.entryDate.getTime());

    if (entryIndex === -1) return null;

    const dateTaken = priceData[entryIndex].date;
    const riskAmountPrice = Math.abs(tool.entryPrice - tool.stopLoss);
    if (riskAmountPrice <= 0) return null;

    const stopLossPips = pipValue > 0 ? (riskAmountPrice / pipValue).toFixed(2) : '0.00';
    
    let dateClosed: Date | null = null;
    let highSinceEntry = tool.entryPrice;
    let lowSinceEntry = tool.entryPrice;
    let dateOfHigh: Date = dateTaken;
    let dateOfLow: Date = dateTaken;
    
    for (let i = entryIndex + 1; i < priceData.length; i++) {
        const candle = priceData[i];

        if (candle.high > highSinceEntry) {
            highSinceEntry = candle.high;
            dateOfHigh = candle.date;
        }
        if (candle.low < lowSinceEntry) {
            lowSinceEntry = candle.low;
            dateOfLow = candle.date;
        }

        if ((tool.position === 'long' && candle.low <= tool.stopLoss) || (tool.position === 'short' && candle.high >= tool.stopLoss)) {
            dateClosed = candle.date;
            break; 
        }
    }
    
    if (!dateClosed) {
        dateClosed = priceData[priceData.length - 1].date;
    }
    
    let maxProfitPrice = 0;
    let dateOfMaxR: Date;
    if (tool.position === 'long') {
        maxProfitPrice = highSinceEntry - tool.entryPrice;
        dateOfMaxR = dateOfHigh;
    } else {
        maxProfitPrice = tool.entryPrice - lowSinceEntry;
        dateOfMaxR = dateOfLow;
    }
    let maxR = riskAmountPrice > 0 ? maxProfitPrice / riskAmountPrice : 0;
    
    return {
        pair: tool.pair,
        dateTaken: formatDateForCsv(dateTaken),
        dateClosed: formatDateForCsv(dateClosed),
        maxR: maxR.toFixed(2),
        stopLossPips,
        maxRTaken: formatDateForCsv(dateOfMaxR),
    };
};


const parseDate = (dateStr: string, timeStr: string): Date | null => {
    const timeParts = timeStr.split(':').map(Number);
    if (timeParts.length !== 3) return null;

    // Try MM/DD/YYYY
    let dateParts = dateStr.split('/').map(Number);
    if (dateParts.length === 3) {
        const [month, day, year] = dateParts;
        if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
            return new Date(Date.UTC(year, month - 1, day, timeParts[0], timeParts[1], timeParts[2]));
        }
    }

    // Try DD.MM.YYYY
    dateParts = dateStr.split('.').map(Number);
    if (dateParts.length === 3) {
        const [day, month, year] = dateParts;
        if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
            return new Date(Date.UTC(year, month - 1, day, timeParts[0], timeParts[1], timeParts[2]));
        }
    }
    
    // Try YYYY-MM-DD
    dateParts = dateStr.split('-').map(Number);
    if (dateParts.length === 3) {
        const [year, month, day] = dateParts;
         if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
            return new Date(Date.UTC(year, month - 1, day, timeParts[0], timeParts[1], timeParts[2]));
        }
    }
    
    return null;
}

const fillGapsInData = (data: Omit<PriceData, 'index'>[]): PriceData[] => {
    if (data.length < 2) {
        return data.map((d, i) => ({...d, index: i}));
    }

    const processedData: Omit<PriceData, 'index'>[] = [data[0]];
    const oneMinute = 60 * 1000;

    for (let i = 1; i < data.length; i++) {
        const prevPoint = processedData[processedData.length - 1];
        const currentPoint = data[i];

        const timeDiff = currentPoint.date.getTime() - prevPoint.date.getTime();

        if (timeDiff > oneMinute) {
            const gapsToFill = Math.floor(timeDiff / oneMinute) - 1;
            const fillPrice = prevPoint.close;

            for (let j = 1; j <= gapsToFill; j++) {
                const gapDate = new Date(prevPoint.date.getTime() + j * oneMinute);
                processedData.push({
                    date: gapDate,
                    open: fillPrice,
                    high: fillPrice,
                    low: fillPrice,
                    close: fillPrice,
                    wick: [fillPrice, fillPrice],
                });
            }
        }
        processedData.push(currentPoint);
    }
    return processedData.map((d, i) => ({...d, index: i}));
};


// Local storage keys
const APP_SETTINGS_KEY = 'algo-insights-settings';
const SESSION_KEY = 'algo-insights-session';
const TOOLBAR_POS_KEY = 'algo-insights-toolbar-positions';

export function Backtester() {
  const [priceData, setPriceData] = useState<PriceData[]>([]);
  const [isDataImported, setIsDataImported] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  
  const [drawingState, setDrawingState] = useState<DrawingState>({
    rrTools: [],
    priceMarkers: [],
    measurementTools: []
  });

  const [history, setHistory] = useState<DrawingState[]>([]);
  const [redoStack, setRedoStack] = useState<DrawingState[]>([]);
  
  const [toolbarPositions, setToolbarPositions] = useState<ToolbarPositions>({
    main: { x: 16, y: 16 },
    secondary: { x: 16, y: 88 }
  });
  const dragInfo = useRef<{
    target: 'main' | 'secondary' | null;
    offsetX: number;
    offsetY: number;
  }>({ target: null, offsetX: 0, offsetY: 0 });

  const { rrTools, priceMarkers, measurementTools } = drawingState;

  const pushToHistory = (currentState: DrawingState) => {
    setHistory(prev => [...prev, currentState]);
    setRedoStack([]); // Clear redo stack on new action
  };

  const setRrTools = (updater: (prev: RRToolType[]) => RRToolType[]) => {
    pushToHistory(drawingState);
    setDrawingState(prev => ({ ...prev, rrTools: updater(prev.rrTools) }));
  };

  const setPriceMarkers = (updater: (prev: PriceMarker[]) => PriceMarker[]) => {
    pushToHistory(drawingState);
    setDrawingState(prev => ({ ...prev, priceMarkers: updater(prev.priceMarkers) }));
  };
  
  const setMeasurementTools = (updater: (prev: MeasurementToolType[]) => MeasurementToolType[]) => {
    pushToHistory(drawingState);
    setDrawingState(prev => ({ ...prev, measurementTools: updater(prev.measurementTools) }));
  };
  
  const handleUndo = () => {
    if (history.length === 0) return;
    const lastState = history[history.length - 1];
    setRedoStack(prev => [drawingState, ...prev]);
    setHistory(prev => prev.slice(0, prev.length - 1));
    setDrawingState(lastState);
  };
  
  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const nextState = redoStack[0];
    setHistory(prev => [...prev, drawingState]);
    setRedoStack(prev => prev.slice(1));
    setDrawingState(nextState);
  };

  const [placingToolType, setPlacingToolType] = useState<'long' | 'short' | null>(null);
  const [isPlacingPriceMarker, setIsPlacingPriceMarker] = useState(false);
  const [isPlacingMeasurement, setIsPlacingMeasurement] = useState(false);
  const [measurementStartPoint, setMeasurementStartPoint] = useState<MeasurementPoint | null>(null);
  const [liveMeasurementTool, setLiveMeasurementTool] = useState<MeasurementToolType | null>(null);

  const [timeframe, setTimeframe] = useState('1m');
  const [timeZone, setTimeZone] = useState<string>('');
  const [timezones, setTimezones] = useState<{ value: string; label: string }[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [sessionStartTime, setSessionStartTime] = useState('09:30');
  const [isYAxisLocked, setIsYAxisLocked] = useState(true);
  const [pipValue, setPipValue] = useState(0.0001);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [sessionToRestore, setSessionToRestore] = useState<SessionInfo | null>(null);

  // Effect for loading settings and checking for saved session on initial load
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
            return { value: tz, label: `${tz.replace(/_/g, ' ')} ${offsetString}`, offset };
        })
        .filter((tz): tz is { value: string; label: string; offset: number; } => tz !== null)
        .sort((a, b) => a.offset - b.offset);
    setTimezones(tzData);

    const savedSettingsRaw = localStorage.getItem(APP_SETTINGS_KEY);
    if (savedSettingsRaw) {
        try {
            const savedSettings = JSON.parse(savedSettingsRaw);
            if (savedSettings.timeZone) setTimeZone(savedSettings.timeZone);
            if (savedSettings.sessionStartTime) setSessionStartTime(savedSettings.sessionStartTime);
            if (savedSettings.pipValue) setPipValue(savedSettings.pipValue);
        } catch (e) {
            console.error("Failed to parse app settings from localStorage", e);
            setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
        }
    } else {
        setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    }
    
    // Check for a saved session
    const savedSessionRaw = localStorage.getItem(SESSION_KEY);
    if (savedSessionRaw) {
        try {
            const savedSession: SessionState = JSON.parse(savedSessionRaw);
            if (savedSession.sessionInfo) {
                setSessionToRestore(savedSession.sessionInfo);
                setShowRestoreDialog(true);
            }
        } catch (e) {
            console.error("Failed to parse session from localStorage", e);
            localStorage.removeItem(SESSION_KEY);
        }
    } else {
        setPriceData(mockPriceData.map((d, i) => ({...d, index: i})));
    }
    
    // Load toolbar positions
    const savedToolbarPosRaw = localStorage.getItem(TOOLBAR_POS_KEY);
    if (savedToolbarPosRaw) {
        try {
            const savedPos: ToolbarPositions = JSON.parse(savedToolbarPosRaw);
            setToolbarPositions(savedPos);
        } catch (e) {
            console.error("Failed to parse toolbar positions from localStorage", e);
        }
    }

  }, []);

  // Effect for saving app settings
  useEffect(() => {
    const settings = { timeZone, sessionStartTime, pipValue };
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settings));
  }, [timeZone, sessionStartTime, pipValue]);

  // Effect for saving session state
  useEffect(() => {
    // Don't save if nothing to save
    if (!isDataImported && rrTools.length === 0 && priceMarkers.length === 0 && measurementTools.length === 0) {
        return;
    }
    
    const serializableDrawingState = {
        ...drawingState,
        rrTools: drawingState.rrTools.map(tool => ({
            ...tool,
            entryDate: tool.entryDate.toISOString()
        })),
    };

    const sessionState: SessionState = {
        drawingState: serializableDrawingState as any,
        selectedDate: selectedDate.toISOString(),
        sessionInfo,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionState));

  }, [drawingState, selectedDate, sessionInfo, isDataImported]);

  const handleRestoreSession = () => {
    setShowRestoreDialog(false);
    const savedSessionRaw = localStorage.getItem(SESSION_KEY);
    if (savedSessionRaw) {
        try {
            const savedSession: SessionState = JSON.parse(savedSessionRaw);

            const restoredRrTools = savedSession.drawingState.rrTools.map(tool => ({
                ...tool,
                entryDate: new Date(tool.entryDate),
            }));

            const restoredDrawingState = {
                ...savedSession.drawingState,
                rrTools: restoredRrTools,
            };

            setDrawingState(restoredDrawingState);
            setSelectedDate(new Date(savedSession.selectedDate));
            setSessionInfo(savedSession.sessionInfo);
            setPriceData([]);
            setIsDataImported(false);

            toast({
                title: "Session Restored",
                description: `Drawings and settings loaded. Please re-import the file: ${sessionToRestore?.fileName}.`,
                duration: 9000
            });
        } catch (e) {
            console.error("Failed to restore session", e);
            toast({ variant: "destructive", title: "Restore Failed", description: "Could not restore session from storage." });
            handleDeclineRestore();
        }
    }
  };

  const handleDeclineRestore = () => {
      setShowRestoreDialog(false);
      localStorage.removeItem(SESSION_KEY);
      setDrawingState({ rrTools: [], priceMarkers: [], measurementTools: [] });
      setHistory([]);
      setRedoStack([]);
      setSessionInfo(null);
      setIsDataImported(false);
      setPriceData(mockPriceData.map((d, i) => ({...d, index: i})));
  };


  const handleChartClick = (chartData: ChartClickData) => {
    if (placingToolType) {
      const entryPrice = chartData.closePrice;
      
      const visiblePriceRange = chartData.yDomain[1] - chartData.yDomain[0];
      const stopLossOffset = visiblePriceRange * 0.05; // 5% of visible height for stop
      const takeProfitOffset = visiblePriceRange * 0.10; // 10% of visible height for profit (1:2 RR)

      const stopLoss = placingToolType === 'long' ? entryPrice - stopLossOffset : entryPrice + stopLossOffset;
      const takeProfit = placingToolType === 'long' ? entryPrice + takeProfitOffset : entryPrice - takeProfitOffset;
      
      const visibleIndexRange = chartData.xDomain[1] - chartData.xDomain[0];
      const widthInPoints = Math.round(visibleIndexRange * 0.25);

      const pairName = sessionInfo?.fileName.split('_')[0] || 'N/A';

      const newTool: RRToolType = {
        id: `rr-${Date.now()}`,
        entryPrice: entryPrice,
        stopLoss: stopLoss,
        takeProfit: takeProfit,
        entryDate: chartData.date,
        widthInPoints: widthInPoints,
        position: placingToolType,
        pair: pairName,
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
        const { price, dataIndex, candle } = chartData;

        // Snapping logic
        const bodyTop = Math.max(candle.open, candle.close);
        const bodyBottom = Math.min(candle.open, candle.close);
        const snappedPrice = (price >= bodyBottom && price <= bodyTop) ? candle.open : price;

        const currentPoint = {
            index: dataIndex,
            price: snappedPrice,
        };

        if (!measurementStartPoint) {
            setMeasurementStartPoint(currentPoint);
            // Also set live tool so the starting dot appears immediately
            setLiveMeasurementTool({
                id: 'live-measure',
                startPoint: currentPoint,
                endPoint: currentPoint,
            });
        } else {
            const newTool: MeasurementToolType = {
                id: `measure-${Date.now()}`,
                startPoint: measurementStartPoint,
                endPoint: currentPoint,
            };
            setMeasurementTools(prev => [...prev, newTool]);
            setMeasurementStartPoint(null);
            setIsPlacingMeasurement(false);
            setLiveMeasurementTool(null);
        }
    }
  };

    const handleChartMouseMove = (chartData: ChartClickData) => {
        if (isPlacingMeasurement && measurementStartPoint) {
            const { price, dataIndex, candle } = chartData;
            
            // Snapping logic for the live endpoint
            const bodyTop = Math.max(candle.open, candle.close);
            const bodyBottom = Math.min(candle.open, candle.close);
            const snappedPrice = (price >= bodyBottom && price <= bodyTop) ? candle.open : price;

            const currentPoint = {
                index: dataIndex,
                price: snappedPrice,
            };
            
            setLiveMeasurementTool({
                id: 'live-measure',
                startPoint: measurementStartPoint,
                endPoint: currentPoint,
            });
        }
    };
  
  const handleUpdateTool = (updatedTool: RRToolType) => {
    pushToHistory(drawingState);
    setRrTools(prevTools => prevTools.map(t => t.id === updatedTool.id ? updatedTool : t));
  };

  const handleRemoveTool = (id: string) => {
    pushToHistory(drawingState);
    setRrTools(prevTools => prevTools.filter(t => t.id !== id));
  };

  const handleRemovePriceMarker = (id: string) => {
    pushToHistory(drawingState);
    setPriceMarkers(prevMarkers => prevMarkers.filter(m => m.id !== id));
  };

  const handleUpdatePriceMarker = (id: string, price: number) => {
    pushToHistory(drawingState);
    setPriceMarkers(prevMarkers => 
      prevMarkers.map(m => 
        m.id === id ? { ...m, price } : m
      )
    );
  };

  const handleRemoveMeasurementTool = (id: string) => {
    pushToHistory(drawingState);
    setMeasurementTools(prev => prev.filter(t => t.id !== id));
  };

  const handleClearAllDrawings = () => {
    pushToHistory(drawingState);
    setDrawingState({
        rrTools: [],
        priceMarkers: [],
        measurementTools: []
    });
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const text = e.target?.result as string;
            const lines = text.split('\n').filter(line => line.trim() !== '');
            if (lines.length <= 1) {
                toast({ variant: "destructive", title: "CSV Error", description: "CSV file contains no data rows." });
                return;
            }
            const header = lines[0].trim().split(',');
            if (header.length < 5) {
                toast({ variant: "destructive", title: "CSV Error", description: "CSV file has fewer than 5 columns." });
                return;
            }
            if (header[0].trim() !== 'Time (UTC)' || header[1].trim() !== 'Open') {
                toast({ variant: "destructive", title: "CSV Error", description: "Invalid CSV header. Expected 'Time (UTC),Open,...'" });
                return;
            }
            
            const dataRows = lines.slice(1);
            const parsedData = dataRows.map((row, index) => {
                const columns = row.split(',');
                if (columns.length < 5) {
                    console.warn(`Skipping malformed row ${index + 2}: Not enough columns.`);
                    return null;
                }
                const [datePart, timePart] = columns[0].split(' ');
                const date = parseDate(datePart, timePart);

                if (!date) {
                    console.warn(`Skipping row ${index + 2} due to invalid date: ${columns[0]}`);
                    return null;
                }

                const open = parseFloat(columns[1]);
                const high = parseFloat(columns[2]);
                const low = parseFloat(columns[3]);
                const close = parseFloat(columns[4]);
                
                if ([open, high, low, close].some(isNaN)) {
                     console.warn(`Skipping row ${index + 2} due to invalid number format.`);
                     return null;
                }

                return { date, open, high, low, close, wick: [low, high] as [number, number] };
            }).filter((item): item is Exclude<typeof item, null> => item !== null);

            if (parsedData.length === 0) {
                 toast({ variant: "destructive", title: "Parsing Error", description: "No valid data rows could be parsed." });
                 return;
            }

            setPriceData(parsedData.map((d, i) => ({...d, index: i})));
            toast({
                title: "Debug: Step 2 Complete",
                description: `Successfully stored ${parsedData.length} rows in state.`,
                duration: 9000,
            });
            return;

        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "CSV Import Failed",
                description: `Error: ${error.message}`,
                duration: 9000,
            });
            setIsDataImported(false);
        } finally {
            if(fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };
    reader.onerror = () => {
        toast({
            variant: "destructive",
            title: "File Read Error",
            description: "Could not read the selected file.",
        });
    };
    reader.readAsText(file);
  };


  const handleExportCsv = () => {
    if (rrTools.length === 0 || !isDataImported) {
        toast({
          variant: "destructive",
          title: "Cannot Export",
          description: "Please import data and place at least one trade tool to generate a report.",
        });
        return;
    }

    const headers = [
        "Pair", 
        "Date Taken", 
        "Date Closed", 
        "Max R", 
        "Stop Loss In Pips",
        "Max R Timestamp"
    ].join(',');

    const sortedTools = [...rrTools].sort((a, b) => a.entryDate.getTime() - b.entryDate.getTime());

    const rows = sortedTools.map(tool => {
        const reportRow = simulateTrade(tool, priceData, pipValue);
        if (!reportRow) return null;
        
        const sanitize = (val: any) => {
            const str = String(val);
            if (str.includes(',')) return `"${str}"`;
            return str;
        };

        const rowData = [
            reportRow.pair,
            reportRow.dateTaken,
            reportRow.dateClosed,
            reportRow.maxR,
            reportRow.stopLossPips,
            reportRow.maxRTaken
        ];
        
        return rowData.map(sanitize).join(',');

    }).filter(row => row !== null).join('\n');

    const csvContent = `${headers}\n${rows}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf--8;' });
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
      const lastAvailableDate = priceData[priceData.length - 1]?.date;

      if (lastAvailableDate && newDate > lastAvailableDate) {
        return lastAvailableDate;
      }
      
      return newDate;
    });
  };

  const findNextSessionStartIndex = (currentDate: Date): number => {
    const [sessionHour, sessionMinute] = sessionStartTime.split(':').map(Number);
    
    const searchStartIndex = priceData.findIndex(p => p.date > currentDate);
    if (searchStartIndex === -1) return -1;

    let lastDay = new Date(currentDate);
    lastDay.setUTCHours(0, 0, 0, 0);

    for (let i = searchStartIndex; i < priceData.length; i++) {
        const pointDate = priceData[i].date;
        
        const pointDay = new Date(pointDate);
        pointDay.setUTCHours(0, 0, 0, 0);

        if (pointDay.getTime() > lastDay.getTime()) {
            if (pointDate.getUTCHours() > sessionHour || (pointDate.getUTCHours() === sessionHour && pointDate.getUTCMinutes() >= sessionMinute)) {
                return i;
            }
        }
    }

    return -1;
  };
  
  
  const handleNextSession = () => {
    if (!sessionStartTime || !priceData.length) return;

    const startIndex = findNextSessionStartIndex(selectedDate);

    if (startIndex !== -1) {
        const endIndex = startIndex + 5;
        if (endIndex > priceData.length) {
            toast({
                variant: "destructive",
                title: "Not Enough Data",
                description: "Not enough data to draw the opening range.",
            });
            setSelectedDate(priceData[startIndex].date);
            return;
        }
        const openingRangeCandles = priceData.slice(startIndex, endIndex);

        let openingRangeHigh = openingRangeCandles[0].high;
        let openingRangeLow = openingRangeCandles[0].low;

        for (const candle of openingRangeCandles) {
            openingRangeHigh = Math.max(openingRangeHigh, candle.high);
            openingRangeLow = Math.min(openingRangeLow, candle.low);
        }

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
        
        pushToHistory(drawingState);
        setPriceMarkers(prev => [...otherMarkers, highMarker, lowMarker]);

        const viewEndIndex = Math.min(startIndex + 15, priceData.length - 1);
        setSelectedDate(priceData[viewEndIndex].date);
        
        return;
    }
    
    toast({
      variant: "destructive",
      title: "Session Not Found",
      description: "Could not find the start of the next session in the available data.",
    });
  };

  const handlePlaceLong = () => {
    setIsPlacingPriceMarker(false);
    setIsPlacingMeasurement(false);
    setMeasurementStartPoint(null);
    setLiveMeasurementTool(null);
    setPlacingToolType('long');
  };

  const handlePlaceShort = () => {
    setIsPlacingPriceMarker(false);
    setIsPlacingMeasurement(false);
    setMeasurementStartPoint(null);
    setLiveMeasurementTool(null);
    setPlacingToolType('short');
  };

  const handlePlaceMarker = () => {
    setPlacingToolType(null);
    setIsPlacingMeasurement(false);
    setMeasurementStartPoint(null);
    setLiveMeasurementTool(null);
    setIsPlacingPriceMarker(true);
  };

  const handlePlaceMeasurement = () => {
    setPlacingToolType(null);
    setIsPlacingPriceMarker(false);
    setMeasurementStartPoint(null);
    setLiveMeasurementTool(null);
    setIsPlacingMeasurement(true);
  };

  const handleMouseDownOnToolbar = (e: React.MouseEvent, target: 'main' | 'secondary') => {
    if (e.button !== 0) return;
    
    const targetElement = e.currentTarget as HTMLDivElement;
    const rect = targetElement.getBoundingClientRect();
    
    dragInfo.current = {
      target,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    };
    
    window.addEventListener('mousemove', handleToolbarMouseMove);
    window.addEventListener('mouseup', handleToolbarMouseUp);
  };

  const handleToolbarMouseMove = (e: MouseEvent) => {
    if (!dragInfo.current.target) return;
    
    const { target, offsetX, offsetY } = dragInfo.current;
    
    setToolbarPositions(prev => ({
      ...prev,
      [target]: {
        x: e.clientX - offsetX,
        y: e.clientY - offsetY
      }
    }));
  };

  const handleToolbarMouseUp = () => {
    if (dragInfo.current.target) {
        localStorage.setItem(TOOLBAR_POS_KEY, JSON.stringify(toolbarPositions));
    }
    dragInfo.current.target = null;
    window.removeEventListener('mousemove', handleToolbarMouseMove);
    window.removeEventListener('mouseup', handleToolbarMouseUp);
  };

  const isPlacingAnything = !!placingToolType || isPlacingPriceMarker || isPlacingMeasurement;
  
  const restoreMessage = sessionToRestore 
        ? `We found saved drawings and settings for the file "${sessionToRestore.fileName}". Would you like to restore this session? You will be prompted to re-import the file.`
        : 'An unknown previous session was found. Restore?';

  return (
    <div className="w-full h-full relative">
        <AlertDialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Restore Previous Session?</AlertDialogTitle>
                    <AlertDialogDescription>
                        {restoreMessage}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={handleDeclineRestore}>Start New Session</AlertDialogCancel>
                    <AlertDialogAction onClick={handleRestoreSession}>Restore</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        <div className="absolute inset-0">
            <InteractiveChart
                data={priceData}
                trades={[]}
                onChartClick={handleChartClick}
                onChartMouseMove={handleChartMouseMove}
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
                liveMeasurementTool={liveMeasurementTool}
                pipValue={pipValue}
                timeframe={timeframe}
                timeZone={timeZone}
                isYAxisLocked={isYAxisLocked}
            />
        </div>

        <div 
          className="absolute z-10 flex flex-col items-start gap-2"
          style={{ top: `${toolbarPositions.main.y}px`, left: `${toolbarPositions.main.x}px` }}
        >
            <div
                className="flex items-center gap-2 bg-card/80 backdrop-blur-sm p-2 rounded-lg shadow-lg"
            >
              <div
                  onMouseDown={(e) => handleMouseDownOnToolbar(e, 'main')}
                  className="cursor-grab active:cursor-grabbing p-1 -ml-1"
              >
                  <GripVertical className="h-5 w-5 text-muted-foreground/50" />
              </div>
                <>
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
                    
                    <div className="flex items-center gap-1">
                        <TooltipProvider>
                          <Tooltip>
                              <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" onClick={handleNextCandle} className="text-muted-foreground" disabled={priceData.length === 0}>
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
                                  <Button variant="ghost" size="icon" onClick={handleNextSession} className="text-muted-foreground" disabled={priceData.length === 0}>
                                      <ChevronsRight className="h-5 w-5" />
                                  </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                  <p>Next Session Open</p>
                              </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                    </div>

                    <div className="h-6 border-l border-border/50 mx-2"></div>
                    
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
                        disabled={rrTools.length === 0 || !isDataImported}
                        className="text-foreground"
                    >
                        <Download className="mr-2 h-4 w-4" />
                        Download Report
                    </Button>
                </>
            </div>
            
            {sessionInfo && (
                <div className="bg-card/70 backdrop-blur-sm rounded-md px-2 py-1 shadow-md ml-8">
                    <p className="text-xs text-muted-foreground/80">
                        Loaded: <span className="font-medium text-foreground/90">{sessionInfo.fileName}</span>
                    </p>
                </div>
            )}
        </div>
        <div
            className="absolute z-10"
            style={{ top: `${toolbarPositions.secondary.y}px`, left: `${toolbarPositions.secondary.x}px` }}
        >
            <div className="flex items-center gap-2 bg-card/80 backdrop-blur-sm p-2 rounded-lg shadow-lg">
                <div
                    onMouseDown={(e) => handleMouseDownOnToolbar(e, 'secondary')}
                    className="cursor-grab active:cursor-grabbing p-1 -ml-1"
                >
                    <GripVertical className="h-5 w-5 text-muted-foreground/50" />
                </div>
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={handleUndo} disabled={history.length === 0}>
                        <Undo className="h-5 w-5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={handleRedo} disabled={redoStack.length === 0}>
                        <Redo className="h-5 w-5" />
                    </Button>
                </div>

                <div className="h-6 border-l border-border/50"></div>

                <TooltipProvider>
                    <div className="flex justify-center gap-1">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={handlePlaceLong} disabled={isPlacingAnything || priceData.length === 0}>
                                    <ArrowUp className="w-5 h-5 text-accent"/>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Place Long Position</p>
                            </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={handlePlaceShort} disabled={isPlacingAnything || priceData.length === 0}>
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
                            <Button variant="ghost" size="icon" onClick={handlePlaceMarker} disabled={isPlacingAnything || priceData.length === 0}>
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
                            <Button variant="ghost" size="icon" onClick={handlePlaceMeasurement} disabled={isPlacingAnything || priceData.length === 0}>
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
                                <div // Wrapping button in div to prevent Tooltip error with AlertDialogTrigger
                                    className={cn(
                                        (rrTools.length === 0 && priceMarkers.length === 0 && measurementTools.length === 0) && "pointer-events-none"
                                    )}
                                >
                                    <AlertDialogTrigger asChild>
                                        <Button variant="destructive" size="icon" disabled={rrTools.length === 0 && priceMarkers.length === 0 && measurementTools.length === 0}>
                                            <Trash2 className="h-5 w-5" />
                                        </Button>
                                    </AlertDialogTrigger>
                                </div>
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
        </div>
    </div>
  );
}
