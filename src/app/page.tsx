
"use client";

import { useState, useEffect, useRef } from "react";
import { Download, ArrowUp, ArrowDown, Settings, Calendar as CalendarIcon, ChevronRight, ChevronsRight, Target, Trash2, FileUp, Lock, Unlock, Ruler, FileBarChart, Undo, Redo, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InteractiveChart, type ChartClickData } from "@/components/algo-insights/interactive-chart";
import { mockPriceData } from "@/lib/mock-data";
import type { RiskRewardTool as RRToolType, PriceMarker, MeasurementTool as MeasurementToolType, MeasurementPoint, PriceData } from "@/types";
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
    tradeOutcome: string;
    pair: string;
    dateTaken: string;
    dateClosed: string;
    dayOfWeek: string;
    maxR: string;
    comments: string;
    stopLossPips: string;
    minDistanceToSLPips: string;
};

type DrawingState = {
    rrTools: RRToolType[];
    priceMarkers: PriceMarker[];
    measurementTools: MeasurementToolType[];
};

type SessionState = {
    drawingState: DrawingState;
    selectedDate: string; // Stored as ISO string
    fileName: string;
};

type ToolbarPositions = {
    main: { x: number; y: number };
    secondary: { x: number; y: number };
};

const simulateTrade = (
    tool: RRToolType,
    priceData: PriceData[],
    pipValue: number
): TradeReportRow | null => {
    const entryIndex = priceData.findIndex(p => p.date.getTime() >= tool.entryDate.getTime());
    
    if (entryIndex === -1) return null;

    // Check if there's at least one candle after the entry for simulation
    if (entryIndex + 1 >= priceData.length) return null;

    const dateTaken = priceData[entryIndex].date;
    const dayOfWeek = dateTaken.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
    const riskAmountPrice = Math.abs(tool.entryPrice - tool.stopLoss);
    const stopLossPips = pipValue > 0 ? (riskAmountPrice / pipValue).toFixed(2) : '0.00';

    let tradeOutcome = 'Incomplete';
    let dateClosed: Date | null = null;
    let minDistanceToSLPips = NaN;
    let maxR = 0;
    let comments = '';

    // Initialize with the first candle *after* entry.
    const firstCandleIndex = entryIndex + 1;
    if (firstCandleIndex >= priceData.length) return null; // No candles to simulate

    let highSinceEntry = priceData[firstCandleIndex].high;
    let lowSinceEntry = priceData[firstCandleIndex].low;

    let debug_lowPriceDate: Date = priceData[firstCandleIndex].date;
    let debug_highPriceDate: Date = priceData[firstCandleIndex].date;

    // Start loop from the second candle *after* entry
    for (let i = firstCandleIndex + 1; i < priceData.length; i++) {
        const candle = priceData[i];
        
        // Update the max/min price seen during the trade's lifetime FIRST
        if (candle.high > highSinceEntry) {
            highSinceEntry = candle.high;
            debug_highPriceDate = candle.date;
        }
        if (candle.low < lowSinceEntry) {
            lowSinceEntry = candle.low;
            debug_lowPriceDate = candle.date;
        }

        if (tool.position === 'long') {
             // Check for win condition first
            if (candle.high >= tool.takeProfit) {
                tradeOutcome = 'win';
                dateClosed = candle.date;
                const minSlDistPrice = lowSinceEntry - tool.stopLoss;
                minDistanceToSLPips = pipValue > 0 ? minSlDistPrice / pipValue : 0;
                comments = `Debug: Low used for calc: ${lowSinceEntry.toFixed(5)} at ${debug_lowPriceDate?.toLocaleString()}`;
                break; // Exit loop on win
            }
            // Then check for loss condition
            if (candle.low <= tool.stopLoss) {
                tradeOutcome = 'loss';
                dateClosed = candle.date;
                minDistanceToSLPips = 0;
                comments = 'Debug: SL was hit.';
                break; // Exit loop on loss
            }
        } else { // 'short'
            // Check for win condition first
            if (candle.low <= tool.takeProfit) {
                tradeOutcome = 'win';
                dateClosed = candle.date;
                const minSlDistPrice = tool.stopLoss - highSinceEntry;
                minDistanceToSLPips = pipValue > 0 ? minSlDistPrice / pipValue : 0;
                comments = `Debug: High used for calc: ${highSinceEntry.toFixed(5)} at ${debug_highPriceDate?.toLocaleString()}`;
                break; // Exit loop on win
            }
             // Then check for loss condition
            if (candle.high >= tool.stopLoss) {
                tradeOutcome = 'loss';
                dateClosed = candle.date;
                minDistanceToSLPips = 0;
                comments = 'Debug: SL was hit.';
                break; // Exit loop on loss
            }
        }
    }
    
    // Calculate Max R based on the entire (completed) trade duration
    if (riskAmountPrice > 0) {
        if (tradeOutcome === 'win') {
             // For wins, MaxR is just the RR ratio
             maxR = Math.abs((tool.takeProfit - tool.entryPrice) / (tool.entryPrice - tool.stopLoss));
        } else if (tradeOutcome === 'loss' || tradeOutcome === 'Incomplete') {
            // For losses or incomplete trades, calculate realized R
            if (tool.position === 'long') {
                const maxProfitPrice = highSinceEntry - tool.entryPrice;
                maxR = maxProfitPrice / riskAmountPrice;
            } else { // 'short'
                const maxProfitPrice = tool.entryPrice - lowSinceEntry;
                maxR = maxProfitPrice / riskAmountPrice;
            }
        }
    }
    
    return {
        tradeOutcome,
        pair: '', // Pair will be added later
        dateTaken: dateTaken.toLocaleString(),
        dateClosed: dateClosed ? dateClosed.toLocaleString() : '',
        dayOfWeek,
        maxR: maxR.toFixed(2),
        comments,
        stopLossPips,
        minDistanceToSLPips: !isNaN(minDistanceToSLPips) ? minDistanceToSLPips.toFixed(2) : ''
    };
};

// Local storage keys
const APP_SETTINGS_KEY = 'algo-insights-settings';
const SESSION_KEY = 'algo-insights-session';
const TOOLBAR_POS_KEY = 'algo-insights-toolbar-positions';

export default function AlgoInsightsPage() {
  const [priceData, setPriceData] = useState<PriceData[]>(mockPriceData);
  const [isDataImported, setIsDataImported] = useState(false);
  const [fileName, setFileName] = useState('');

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
  const [sessionToRestore, setSessionToRestore] = useState<string | null>(null);

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
            if (savedSession.fileName) {
                setSessionToRestore(savedSession.fileName);
                setShowRestoreDialog(true);
            }
        } catch (e) {
            console.error("Failed to parse session from localStorage", e);
            localStorage.removeItem(SESSION_KEY);
        }
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
    // Don't save if there's nothing to save or if we are prompting for restore
    if (!isDataImported && rrTools.length === 0 && priceMarkers.length === 0 && measurementTools.length === 0) {
        return;
    }
    
    // Convert rrTools dates to string to prevent serialization issues
    const serializableDrawingState = {
        ...drawingState,
        rrTools: drawingState.rrTools.map(tool => ({
            ...tool,
            entryDate: tool.entryDate.toISOString()
        })),
    };

    const sessionState: SessionState = {
        drawingState: serializableDrawingState as any, // Cast because of date string
        selectedDate: selectedDate.toISOString(),
        fileName,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionState));

  }, [drawingState, selectedDate, fileName, isDataImported]);

  const handleRestoreSession = () => {
    setShowRestoreDialog(false);
    const savedSessionRaw = localStorage.getItem(SESSION_KEY);
    if (savedSessionRaw) {
        try {
            const savedSession: SessionState = JSON.parse(savedSessionRaw);

            // Restore drawings by converting dates back
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
            setFileName(savedSession.fileName);
            // Don't set price data, wait for user to import
            setPriceData([]);
            setIsDataImported(false);

            toast({
                title: "Session Restored",
                description: `Drawings and settings loaded. Please re-import "${savedSession.fileName}" to see the chart data.`,
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
      setFileName('');
      setIsDataImported(false);
      setPriceData(mockPriceData); // Load mock data for a fresh start
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

  const handleRemoveMeasurementTool = (id: string) => {
    pushToHistory(drawingState);
    setMeasurementTools(prev => prev.filter(t => t.id !== id));
  };

  const handleUpdatePriceMarker = (id: string, price: number) => {
    pushToHistory(drawingState);
    setPriceMarkers(prevMarkers => 
      prevMarkers.map(m => 
        m.id === id ? { ...m, price } : m
      )
    );
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

    setFileName(file.name);
    const reader = new FileReader();

    reader.onload = (e) => {
        try {
            const text = e.target?.result;
            if (typeof text !== 'string') throw new Error("Could not read file contents.");

            const lines = text.split('\n').filter(line => line.trim() !== '');
            if (lines.length <= 1) throw new Error("CSV is empty or has only a header.");

            const dataRows = lines.slice(1);

            const parsedData: PriceData[] = dataRows.map((row, index) => {
                const columns = row.split(',');
                const [localTime, openStr, highStr, lowStr, closeStr] = columns;

                if (!localTime || !openStr || !highStr || !lowStr || !closeStr) {
                    throw new Error(`Row ${index + 2} has missing columns. Expected 5, found ${columns.length}.`);
                }

                const dateTimeString = localTime.trim().replace(' GMT', '');
                const [datePart, timePart] = dateTimeString.split(' ');
                
                if (!datePart || !timePart) {
                    throw new Error(`Invalid date format on row ${index + 2}. Expected 'DD.MM.YYYY HH:MM:SS', but found '${localTime}'.`);
                }
                
                const [day, month, year] = datePart.split('.').map(Number);
                const [hour, minute] = timePart.split(':').map(Number);
                const second = timePart.includes(':') && timePart.split(':')[2] ? Number(timePart.split(':')[2]) || 0 : 0;
                
                if (isNaN(day) || isNaN(month) || isNaN(year) || isNaN(hour) || isNaN(minute) || isNaN(second)) {
                    throw new Error(`Invalid date values on row ${index + 2}. Could not parse: '${localTime}'`);
                }
                const date = new Date(Date.UTC(year, month - 1, day, hour, minute, Math.floor(second)));
                if (isNaN(date.getTime())) throw new Error(`Invalid date on row ${index + 2}. Parsed to an invalid Date object from: '${localTime}'`);

                const open = parseFloat(openStr);
                const high = parseFloat(highStr);
                const low = parseFloat(lowStr);
                const close = parseFloat(closeStr);
                
                if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) {
                    throw new Error(`Invalid price data on row ${index + 2}. Check for non-numeric values.`);
                }

                return { date, open, high, low, close, wick: [low, high] };
            });

            if (parsedData.length > 0) {
                parsedData.sort((a, b) => a.date.getTime() - b.date.getTime());
                setPriceData(parsedData);
                setIsDataImported(true);
                // On first import, pan to end. On re-import for session restore, selectedDate is already set.
                const savedSession = localStorage.getItem(SESSION_KEY);
                if (!savedSession) {
                    setSelectedDate(parsedData[parsedData.length - 1].date);
                }
            } else {
                throw new Error("No valid data rows were parsed from the file.");
            }
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "CSV Import Failed",
                description: `Please check the file format. Error: ${error.message}`,
                duration: 9000,
            });
            setIsDataImported(false);
        }
    };

    reader.onerror = () => {
        toast({
            variant: "destructive",
            title: "File Read Error",
            description: "An error occurred while reading the file.",
        });
        setIsDataImported(false);
    };

    reader.readAsText(file);
    if(fileInputRef.current) {
        fileInputRef.current.value = "";
    }
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
        const reportRow = simulateTrade(tool, priceData, pipValue);
        if (!reportRow) return null;

        const pair = fileName ? fileName.split('-')[0].trim() : 'N/A';
        reportRow.pair = pair;

        const sanitize = (val: any) => {
            const str = String(val);
            if (str.includes(',')) return `"${str}"`;
            return str;
        };

        const rowData = [
            reportRow.tradeOutcome,
            reportRow.pair,
            reportRow.dateTaken,
            reportRow.dateClosed,
            reportRow.dayOfWeek,
            reportRow.maxR,
            reportRow.comments,
            reportRow.stopLossPips,
            reportRow.minDistanceToSLPips
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
      const lastAvailableDate = priceData[priceData.length - 1]?.date;

      if (lastAvailableDate && newDate > lastAvailableDate) {
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
            toast({
                variant: "destructive",
                title: "Not Enough Data",
                description: "Not enough data to draw the opening range.",
            });
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
        
        pushToHistory(drawingState);
        setPriceMarkers(prev => [...otherMarkers, highMarker, lowMarker]);

        // Pan the view to show the opening range and a few subsequent candles
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
    setMeasurementStartPoint(null); // Will be set on first click
    setLiveMeasurementTool(null);
    setIsPlacingMeasurement(true);
  };

  const handleMouseDownOnToolbar = (e: React.MouseEvent, target: 'main' | 'secondary') => {
    // Only drag with left mouse button
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

  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-body">
      <header className="flex items-center justify-between p-4 border-b border-border shadow-md">
        <div className="flex items-center gap-2">
           <div className="p-2 bg-primary rounded-lg">
             <FileBarChart className="w-6 h-6 text-primary-foreground" />
           </div>
          <h1 className="text-2xl font-bold font-headline text-foreground">
            5 Minute ORB Backtester
          </h1>
        </div>
        <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:inline-block">{timeZone.replace(/_/g, ' ')}</span>
            <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={handleUndo} disabled={history.length === 0}>
                    <Undo className="h-5 w-5" />
                </Button>
                <Button variant="ghost" size="icon" onClick={handleRedo} disabled={redoStack.length === 0}>
                    <Redo className="h-5 w-5" />
                </Button>
            </div>
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

      <main className="flex-1 relative overflow-hidden">
        <AlertDialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Restore Previous Session?</AlertDialogTitle>
                    <AlertDialogDescription>
                        We found saved drawings and settings for the file: <strong>{sessionToRestore}</strong>.
                        <br />
                        Would you like to restore this session? You will be prompted to re-import the file.
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
                endDate={selectedDate}
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
            </div>
            
            {fileName && (
                <div className="bg-card/70 backdrop-blur-sm rounded-md px-2 py-1 shadow-md ml-8">
                    <p className="text-xs text-muted-foreground/80">
                        Loaded: <span className="font-medium text-foreground/90">{fileName}</span>
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
      </main>
    </div>
  );
}

    