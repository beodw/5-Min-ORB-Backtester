
"use client";

import { useState, useEffect, useRef } from "react";
import { Download, ArrowUp, ArrowDown, Settings, Calendar as CalendarIcon, ChevronRight, ChevronsRight, Target, Trash2, FileUp, Lock, Unlock, Ruler, FileBarChart, Undo, Redo, GripVertical, BookOpen, ThumbsUp, ThumbsDown, FileDown, Forward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InteractiveChart, type ChartClickData } from "@/components/algo-insights/interactive-chart";
import { mockPriceData } from "@/lib/mock-data";
import type { RiskRewardTool as RRToolType, PriceMarker, MeasurementTool as MeasurementToolType, MeasurementPoint, PriceData, JournalTrade, OpeningRange } from "@/types";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";


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

type SessionState = {
    drawingState: DrawingState;
    selectedDate: string; // Stored as ISO string
    fileName: string;
    journalFileName: string;
    journalTrades: JournalTrade[];
    selectedPair: string;
};

type DayResult = 'win' | 'loss' | 'modified';

const formatDateForCsv = (date: Date | null): string => {
    if (!date) return '';
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0'); // Month is 0-indexed
    const year = date.getUTCFullYear();
    
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');

    return `${month}/${day}/${year} ${hours}:${minutes}:${seconds}`;
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
        pair: '',
        dateTaken: formatDateForCsv(dateTaken),
        dateClosed: formatDateForCsv(dateClosed),
        maxR: maxR.toFixed(2),
        stopLossPips,
        maxRTaken: formatDateForCsv(dateOfMaxR),
    };
};


const fillGapsInData = (data: PriceData[]): PriceData[] => {
    if (data.length < 2) {
        return data;
    }

    const processedData: PriceData[] = [data[0]];
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
    return processedData;
};

type ToolbarPositions = {
  main: { x: number, y: number };
  secondary: { x: number, y: number };
};

// Local storage keys
const APP_SETTINGS_KEY = 'algo-insights-settings';
const SESSION_KEY_PREFIX = 'algo-insights-session-'; 
const TOOLBAR_POS_KEY = 'algo-insights-toolbar-positions';

const JOURNAL_PAIRS = ["US30", "JPN225", "HKG40", "US100"];

export function ChartContainer({ tab }: { tab: 'backtester' | 'journal' }) {
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

  // Journal specific state
  const [allJournalTrades, setAllJournalTrades] = useState<JournalTrade[]>([]);
  const [journalTrades, setJournalTrades] = useState<JournalTrade[]>([]);
  const [selectedPair, setSelectedPair] = useState<string>("US30");
  const [journalFileName, setJournalFileName] = useState('');
  const [dayResults, setDayResults] = useState<Record<string, DayResult>>({});
  const journalFileInputRef = useRef<HTMLInputElement>(null);
  const [journalHeader, setJournalHeader] = useState<string[]>([]);
  const [openingRange, setOpeningRange] = useState<OpeningRange | null>(null);

  // Backtester stepping state
  const [backtestEndDate, setBacktestEndDate] = useState<Date | undefined>(undefined);


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
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [sessionStartTime, setSessionStartTime] = useState('09:30');
  const [isYAxisLocked, setIsYAxisLocked] = useState(true);
  const [pipValue, setPipValue] = useState(0.0001);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [sessionToRestore, setSessionToRestore] = useState<string | null>(null);
  
  const sessionKey = `${SESSION_KEY_PREFIX}${tab}`;

  useEffect(() => {
    if (!selectedDate || !isDataImported || !sessionStartTime) {
        setOpeningRange(null);
        return;
    }

    const [startHour, startMinute] = sessionStartTime.split(':').map(Number);
    
    const sessionStart = new Date(selectedDate);
    sessionStart.setUTCFullYear(selectedDate.getUTCFullYear(), selectedDate.getUTCMonth(), selectedDate.getUTCDate());
    sessionStart.setUTCHours(startHour, startMinute, 0, 0);
    
    const sessionEnd = new Date(sessionStart.getTime() + 5 * 60 * 1000);
    
    const rangeCandles = priceData.filter(p => 
        p.date.getTime() >= sessionStart.getTime() && p.date.getTime() <= sessionEnd.getTime()
    );

    if (rangeCandles.length > 0) {
        let high = -Infinity;
        let low = Infinity;
        rangeCandles.forEach(candle => {
            if (candle.high > high) high = candle.high;
            if (candle.low < low) low = candle.low;
        });
        setOpeningRange({ high, low });
    } else {
        setOpeningRange(null);
    }
  }, [selectedDate, priceData, sessionStartTime, isDataImported]);


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
    
    const savedSessionRaw = localStorage.getItem(sessionKey);
    if (savedSessionRaw) {
        try {
            const savedSession: SessionState = JSON.parse(savedSessionRaw);
            if (savedSession.fileName || (savedSession.journalTrades && savedSession.journalTrades.length > 0)) {
                setSessionToRestore(savedSession.fileName || savedSession.journalFileName);
                setShowRestoreDialog(true);
            }
        } catch (e) {
            console.error("Failed to parse session from localStorage", e);
            localStorage.removeItem(sessionKey);
        }
    }
    
    const savedToolbarPosRaw = localStorage.getItem(TOOLBAR_POS_KEY);
    if (savedToolbarPosRaw) {
        try {
            const savedPos: ToolbarPositions = JSON.parse(savedToolbarPosRaw);
            setToolbarPositions(savedPos);
        } catch (e) {
            console.error("Failed to parse toolbar positions from localStorage", e);
        }
    }

  }, [sessionKey]);

  useEffect(() => {
    const settings = { timeZone, sessionStartTime, pipValue };
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settings));
  }, [timeZone, sessionStartTime, pipValue]);

  useEffect(() => {
    const shouldSave = isDataImported || allJournalTrades.length > 0 || rrTools.length > 0 || priceMarkers.length > 0 || measurementTools.length > 0;
    if (!shouldSave) {
        const savedSessionRaw = localStorage.getItem(sessionKey);
        if(savedSessionRaw) {
           // localStorage.removeItem(sessionKey);
        }
        return;
    }
    
    const serializableDrawingState = {
        ...drawingState,
        rrTools: drawingState.rrTools.map(tool => ({
            ...tool,
            entryDate: tool.entryDate.toISOString()
        })),
    };

    const serializableJournalTrades = allJournalTrades.map(trade => ({
        ...trade,
        dateTaken: trade.dateTaken.toISOString(),
        dateClosed: trade.dateClosed.toISOString(),
    }));

    const sessionState: SessionState = {
        drawingState: serializableDrawingState as any,
        selectedDate: selectedDate ? selectedDate.toISOString() : new Date().toISOString(),
        fileName,
        journalFileName,
        journalTrades: serializableJournalTrades as any,
        selectedPair,
    };
    localStorage.setItem(sessionKey, JSON.stringify(sessionState));

  }, [drawingState, selectedDate, fileName, isDataImported, sessionKey, allJournalTrades, journalFileName, selectedPair]);
  
  useEffect(() => {
    const filtered = allJournalTrades.filter(t => t.pair === selectedPair);
    setJournalTrades(filtered);
  }, [allJournalTrades, selectedPair]);


  const handleRestoreSession = () => {
    setShowRestoreDialog(false);
    const savedSessionRaw = localStorage.getItem(sessionKey);
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

            const restoredJournalTrades = (savedSession.journalTrades || []).map(trade => ({
                ...trade,
                dateTaken: new Date(trade.dateTaken),
                dateClosed: new Date(trade.dateClosed),
            }));

            setDrawingState(restoredDrawingState);
            setAllJournalTrades(restoredJournalTrades);

            setSelectedDate(new Date(savedSession.selectedDate));
            setFileName(savedSession.fileName);
            setJournalFileName(savedSession.journalFileName || '');
            if (savedSession.selectedPair) setSelectedPair(savedSession.selectedPair);
            
            // This will trigger the filtering useEffect
            if (restoredJournalTrades.length > 0) {
                const filtered = restoredJournalTrades.filter(t => t.pair === (savedSession.selectedPair || JOURNAL_PAIRS[0]));
                setJournalTrades(filtered);
                processJournalTrades(filtered);
            }
            
            setPriceData(mockPriceData);
            setIsDataImported(false);

            toast({
                title: "Session Restored",
                description: `Drawings and settings loaded. Please re-import necessary files to see the chart data.`,
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
      localStorage.removeItem(sessionKey);
      setDrawingState({ rrTools: [], priceMarkers: [], measurementTools: [] });
      setHistory([]);
      setRedoStack([]);
      setFileName('');
      setJournalFileName('');
      setAllJournalTrades([]);
      setJournalTrades([]);
      setDayResults({});
      setIsDataImported(false);
      setPriceData(mockPriceData);
      setBacktestEndDate(undefined);
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
                const [hour, minute, second] = timePart.split(':').map(Number);
                
                if (isNaN(day) || isNaN(month) || isNaN(year) || isNaN(hour) || isNaN(minute) || isNaN(second || 0)) {
                    throw new Error(`Invalid date values on row ${index + 2}. Could not parse: '${localTime}'`);
                }
                const date = new Date(Date.UTC(year, month - 1, day, hour, minute, Math.floor(second || 0)));
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
                const processedData = fillGapsInData(parsedData);
                setPriceData(processedData);
                setIsDataImported(true);

                const savedSession = localStorage.getItem(sessionKey);
                if (!savedSession) {
                    setSelectedDate(processedData[processedData.length - 1].date);
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
        toast({ variant: "destructive", title: "File Read Error", description: "An error occurred while reading the file." });
        setIsDataImported(false);
    };

    reader.readAsText(file);
    if(fileInputRef.current) fileInputRef.current.value = "";
  };


  const handleExportCsv = () => {
    if (rrTools.length === 0 || !isDataImported) {
        toast({ variant: "destructive", title: "Cannot Export", description: "Please import data and place at least one trade tool to generate a report." });
        return;
    }
    const headers = ["Pair", "Date Taken", "Date Closed", "Max R", "Stop Loss In Pips", "Max R Timestamp"].join(',');
    const sortedTools = [...rrTools].sort((a, b) => a.entryDate.getTime() - b.entryDate.getTime());
    const rows = sortedTools.map(tool => {
        const reportRow = simulateTrade(tool, priceData, pipValue);
        if (!reportRow) return null;
        const pair = fileName ? fileName.split('-')[0].trim() : 'N/A';
        reportRow.pair = pair;
        const sanitize = (val: any) => `"${String(val).replace(/"/g, '""')}"`;
        return [reportRow.pair, reportRow.dateTaken, reportRow.dateClosed, reportRow.maxR, reportRow.stopLossPips, reportRow.maxRTaken].map(sanitize).join(',');
    }).filter(row => row !== null).join('\n');
    const csvContent = `${headers}\n${rows}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "strategy_report.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
    if (e.button !== 0) return;
    const targetElement = e.currentTarget as HTMLDivElement;
    const rect = targetElement.getBoundingClientRect();
    dragInfo.current = { target, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
    window.addEventListener('mousemove', handleToolbarMouseMove);
    window.addEventListener('mouseup', handleToolbarMouseUp);
  };

  const handleToolbarMouseMove = (e: MouseEvent) => {
    if (!dragInfo.current.target) return;
    const { target, offsetX, offsetY } = dragInfo.current;
    setToolbarPositions(prev => ({ ...prev, [target]: { x: e.clientX - offsetX, y: e.clientY - offsetY } }));
  };

  const handleToolbarMouseUp = () => {
    if (dragInfo.current.target) localStorage.setItem(TOOLBAR_POS_KEY, JSON.stringify(toolbarPositions));
    dragInfo.current.target = null;
    window.removeEventListener('mousemove', handleToolbarMouseMove);
    window.removeEventListener('mouseup', handleToolbarMouseUp);
  };

  // --- JOURNAL FUNCTIONS ---

  const handleImportJournalClick = () => {
    journalFileInputRef.current?.click();
  };

  const parseDateFromJournal = (dateString: string, rowNum: number): Date => {
    const cleanString = dateString.trim();
    // Expected format: MM/DD/YYYY
    const parts = cleanString.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!parts) {
        throw new Error(`Invalid date format on row ${rowNum}. Expected 'MM/DD/YYYY', found '${dateString}'.`);
    }
    const [, month, day, year] = parts.map(Number);
    // Month is 0-indexed in JavaScript Date
    const date = new Date(Date.UTC(year, month - 1, day));
    if (isNaN(date.getTime())) {
        throw new Error(`Invalid date values on row ${rowNum}. Could not parse: '${dateString}'`);
    }
    return date;
  };

  const parseCsvWithMultiline = (text: string): string[][] => {
      const rows: string[][] = [];
      let currentRow: string[] = [];
      let currentField = '';
      let inQuotedField = false;
      // Normalize line endings to \n
      const normalizedText = text.replace(/(\r\n|\r)/g, '\n');

      for (let i = 0; i < normalizedText.length; i++) {
          const char = normalizedText[i];
          
          if (inQuotedField) {
              if (char === '"') {
                  // Check for escaped double quote
                  if (i + 1 < normalizedText.length && normalizedText[i+1] === '"') {
                      currentField += '"';
                      i++; // Skip the next quote
                  } else {
                      inQuotedField = false;
                  }
              } else {
                  currentField += char;
              }
          } else {
              if (char === '"') {
                  inQuotedField = true;
              } else if (char === ',') {
                  currentRow.push(currentField);
                  currentField = '';
              } else if (char === '\n') {
                  currentRow.push(currentField);
                  rows.push(currentRow);
                  currentRow = [];
                  currentField = '';
              } else {
                  currentField += char;
              }
          }
      }

      // Add the last row if file doesn't end with a newline
      if (currentField || currentRow.length > 0) {
        currentRow.push(currentField);
        rows.push(currentRow);
      }
      
      // Filter out any completely empty rows that might result from trailing newlines
      return rows.filter(row => row.length > 1 || (row.length === 1 && row[0].trim() !== ''));
  };
  
  const handleJournalFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setJournalFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const text = e.target?.result as string;
            const allRows = parseCsvWithMultiline(text);

            if (allRows.length <= 1) throw new Error("Journal CSV is empty or has only a header.");
            
            const headerLine = allRows[0].map(h => h.trim());
            setJournalHeader(headerLine);
            
            const requiredHeaders = {
                pair: "Pair",
                dateTaken: "Date Taken (Timestamp)",
                dateClosed: "Date Closed (Timestamp)",
                maxR: "Maximum Favourable Excursion (R)",
                tradeOutcome: "Trade Outcome"
            };

            const headerIndices = {
                pair: headerLine.indexOf(requiredHeaders.pair),
                dateTaken: headerLine.indexOf(requiredHeaders.dateTaken),
                dateClosed: headerLine.indexOf(requiredHeaders.dateClosed),
                maxR: headerLine.indexOf(requiredHeaders.maxR),
                tradeOutcome: headerLine.indexOf(requiredHeaders.tradeOutcome)
            };
            
            if (headerIndices.pair === -1) {
                toast({
                    variant: "destructive",
                    title: "Journal Import Failed",
                    description: `The required column "${requiredHeaders.pair}" was not found in your CSV header.`,
                    duration: 9000
                });
                return;
            }
            
            for (const [key, index] of Object.entries(headerIndices)) {
                 if (index === -1 && key !== 'pair') {
                    throw new Error(`Missing required column: "${(requiredHeaders as any)[key]}"`);
                }
            }
            
            const dataRows = allRows.slice(1);
            const parsedTrades: JournalTrade[] = dataRows
                .map((columns, i) => {
                    const rowNum = i + 2;

                    if (columns.length < headerLine.length) {
                       console.warn(`Row ${rowNum} has incorrect number of columns. Expected ${headerLine.length}, got ${columns.length}. Skipping.`);
                       return null;
                    }
                    
                    const pairValue = columns[headerIndices.pair]?.trim();
                    console.log(`Row ${rowNum} Pair:`, pairValue);

                    if (pairValue !== "US30") {
                        return null;
                    }

                    const pair = columns[headerIndices.pair]?.trim();
                    const dateTaken = parseDateFromJournal(columns[headerIndices.dateTaken], rowNum);
                    const dateClosed = parseDateFromJournal(columns[headerIndices.dateClosed], rowNum);
                    
                    const maxRString = columns[headerIndices.maxR];
                    const maxR = parseFloat(maxRString);
                    if (isNaN(maxR)) {
                        throw new Error(`Invalid 'Maximum Favourable Excursion (R)' value on row ${rowNum}: '${maxRString}'. Must be a number.`);
                    }

                    const originalOutcome = columns[headerIndices.tradeOutcome]?.trim() as 'Win' | 'Loss' | undefined;
                    
                    return {
                        pair: pair,
                        dateTaken,
                        dateClosed,
                        maxR,
                        status: 'default',
                        originalRow: columns,
                        originalOutcome,
                        outcome: originalOutcome,
                    };
                })
                .filter((trade): trade is JournalTrade => trade !== null);

            if (parsedTrades.length === 0) {
              throw new Error("No valid trade rows could be parsed for the pair 'US30'. Check data and column headers.");
            }

            setAllJournalTrades(parsedTrades); 
            setSelectedPair("US30");
            toast({ title: "Journal Imported", description: `${parsedTrades.length} trades for US30 loaded.` });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Journal Import Failed", description: error.message, duration: 9000 });
        }
    };
    reader.readAsText(file);
    if(journalFileInputRef.current) journalFileInputRef.current.value = "";
  };

    const processJournalTrades = (trades: JournalTrade[]) => {
      const results: Record<string, DayResult> = {};
      const groupedByDay: Record<string, JournalTrade[]> = {};

      // Group trades by day
      trades.forEach(trade => {
          const dateKey = trade.dateTaken.toISOString().split('T')[0];
          if (!groupedByDay[dateKey]) {
              groupedByDay[dateKey] = [];
          }
          groupedByDay[dateKey].push(trade);
      });

      // Process each day
      for (const dateKey in groupedByDay) {
          const dayTrades = groupedByDay[dateKey];
          const isModified = dayTrades.some(t => t.outcome && t.outcome !== t.originalOutcome);
          
          if (isModified) {
              results[dateKey] = 'modified';
              continue; // Skip to next day once marked as modified
          }
      
          // If not modified, determine win/loss. A single win makes the day a 'win'.
          const hasWin = dayTrades.some(t => {
              const finalOutcome = t.outcome || (t.maxR >= 2 ? 'Win' : 'Loss');
              return finalOutcome === 'Win';
          });
          results[dateKey] = hasWin ? 'win' : 'loss';
      }
      setDayResults(results);
  };

  
  useEffect(() => {
    // Re-process when trades are updated (e.g. status change, pair change)
    if (journalTrades.length > 0) {
        processJournalTrades(journalTrades);
    } else {
        setDayResults({}); // Clear results if no trades for selected pair
    }
  }, [journalTrades]);

  const updateTradeStatus = (status: 'traded' | 'not traded') => {
    if (!selectedDate) {
        toast({ variant: "destructive", title: "No Date Selected", description: "Please select a date on the calendar first."});
        return;
    }
    const selectedDateKey = selectedDate.toISOString().split('T')[0];
    
    let tradeUpdated = false;
    const updatedAllTrades = allJournalTrades.map(trade => {
        const tradeDateKey = trade.dateTaken.toISOString().split('T')[0];
        if (tradeDateKey === selectedDateKey && trade.pair === selectedPair) {
            tradeUpdated = true;
            return { ...trade, status };
        }
        return trade;
    });

    if (tradeUpdated) {
        setAllJournalTrades(updatedAllTrades);
        toast({ title: "Trade Status Updated", description: `Trades on ${selectedDateKey} for ${selectedPair} marked as '${status}'.` });
    } else {
        toast({ variant: "destructive", title: "No Trade Found", description: `No trade found on ${selectedDateKey} for ${selectedPair}.` });
    }
  };

  const updateTradeOutcome = (outcome: 'Win' | 'Loss') => {
    if (!selectedDate) {
        toast({ variant: "destructive", title: "No Date Selected", description: "Please select a date on the calendar first." });
        return;
    }
    const selectedDateKey = selectedDate.toISOString().split('T')[0];

    let tradeUpdated = false;
    const updatedAllTrades = allJournalTrades.map(trade => {
        const tradeDateKey = trade.dateTaken.toISOString().split('T')[0];
        if (tradeDateKey === selectedDateKey && trade.pair === selectedPair) {
            tradeUpdated = true;
            return { ...trade, outcome };
        }
        return trade;
    });

    if (tradeUpdated) {
        setAllJournalTrades(updatedAllTrades);
        toast({ title: "Trade Outcome Updated", description: `Trades on ${selectedDateKey} for ${selectedPair} marked as '${outcome}'.` });
    } else {
        toast({ variant: "destructive", title: "No Trade Found", description: `No trade found on ${selectedDateKey} for ${selectedPair}.` });
    }
  };
  
  const handleDownloadJournal = () => {
    if (allJournalTrades.length === 0) {
        toast({ variant: "destructive", title: "No Journal Data", description: "Please import a journal file first." });
        return;
    }

    if (journalHeader.length === 0) {
        toast({variant: "destructive", title: "Download Failed", description: "Could not determine original CSV header. Please re-import the file."});
        return;
    }

    const outcomeIndex = 10; // Hardcoded to be the 11th column (0-indexed)
    let statusIndex = journalHeader.indexOf("Status");
    
    let finalHeader = [...journalHeader];
    // Add "Status" header only if it doesn't exist
    if (statusIndex === -1) {
        finalHeader.push("Status");
        statusIndex = finalHeader.length - 1;
    }

    const rows = allJournalTrades.map(trade => {
        let newColumns = [...trade.originalRow];

        // Ensure the array is long enough to hold all headers
        while (newColumns.length < finalHeader.length) {
            newColumns.push('');
        }

        // Determine the final outcome, defaulting to original, then calculated
        const finalOutcome = trade.outcome || trade.originalOutcome || (trade.maxR >= 2 ? 'Win' : 'Loss');
        newColumns[outcomeIndex] = finalOutcome;

        // --- Status Update Logic ---
        // If the status was modified by the user, use the new status.
        if (trade.status !== 'default') {
            newColumns[statusIndex] = trade.status;
        } else {
            // If the user didn't modify it, check if a status existed in the original file.
            // If the original row didn't have a status column (i.e. we added it), default to 'traded'.
            if (trade.originalRow.length <= statusIndex) {
                 newColumns[statusIndex] = 'traded';
            }
            // If it existed but was empty, also default to 'traded'
            else if (!newColumns[statusIndex]) {
                 newColumns[statusIndex] = 'traded';
            }
            // Otherwise, the original value (which might be 'traded', 'not traded', or something else) is preserved because it's already in newColumns.
        }
        
        return newColumns.map(field => {
            const fieldStr = String(field ?? '').trim();
            if (fieldStr.includes(',') || fieldStr.includes('"') || fieldStr.includes('\n')) {
                const sanitizedField = fieldStr.replace(/"/g, '""');
                return `"${sanitizedField}"`;
            }
            return fieldStr;
        }).join(',');
    }).join('\n');

    const csvContent = finalHeader.join(',') + '\n' + rows;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `updated_${journalFileName || 'journal'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
  
    const handleNextDay = () => {
        if (!isDataImported || !selectedDate) {
            toast({ variant: "destructive", title: "Cannot Proceed", description: "Please import data and select a date first." });
            return;
        }

        const uniqueDates = Array.from(new Set(priceData.map(p => p.date.toISOString().split('T')[0]))).sort();
        const currentDateStr = selectedDate.toISOString().split('T')[0];
        const currentIndex = uniqueDates.indexOf(currentDateStr);

        let nextDayIndex = currentIndex + 1;
        if (nextDayIndex >= uniqueDates.length) {
            toast({ title: "End of Data", description: "Reached the end of the price data. Looping back to start." });
            nextDayIndex = 0; // Loop back to the start
        }
        
        const nextDate = new Date(uniqueDates[nextDayIndex]);
        const userTimezoneOffset = nextDate.getTimezoneOffset() * 60000;
        const adjustedDate = new Date(nextDate.getTime() + userTimezoneOffset);
        
        setSelectedDate(adjustedDate);

        const [startHour, startMinute] = sessionStartTime.split(':').map(Number);
        const sessionStart = new Date(adjustedDate);
        sessionStart.setUTCFullYear(adjustedDate.getUTCFullYear(), adjustedDate.getUTCMonth(), adjustedDate.getUTCDate());
        sessionStart.setUTCHours(startHour, startMinute, 0, 0);

        // Set the end of the visible range to be 25 minutes after session start (5 for range + 20 for context)
        const initialVisibleEndDate = new Date(sessionStart.getTime() + 25 * 60 * 1000);
        setBacktestEndDate(initialVisibleEndDate);
    };

    const handleNextCandle = () => {
        if (!backtestEndDate) {
            toast({ variant: "destructive", title: "Cannot Proceed", description: "This feature is only available after selecting a day with the 'Next Day' button." });
            return;
        }

        const nextCandleDate = new Date(backtestEndDate.getTime() + 1 * 60 * 1000);

        // Simple check to prevent going too far into the future if there's no more data
        const lastDataPointDate = priceData[priceData.length - 1].date;
        if (nextCandleDate > lastDataPointDate) {
             toast({ title: "End of Data", description: "Reached the end of the available price data." });
             return;
        }

        setBacktestEndDate(nextCandleDate);
    }

  // --- END JOURNAL FUNCTIONS ---

  const isPlacingAnything = !!placingToolType || isPlacingPriceMarker || isPlacingMeasurement;
  
  const chartEndDate = backtestEndDate || selectedDate;


  const journalTradesOnChart = tab === 'journal' 
    ? journalTrades.map((t, i) => ({
        id: `journal-${i}`,
        entryDate: t.dateTaken,
        entryPrice: 0, // Placeholder, will be read from priceData
        type: t.maxR >= 2 ? 'win' : 'loss' as 'win' | 'loss'
    })) 
    : [];

  const renderToolbar = () => (
    <>
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
                    
                    {tab === 'journal' && (
                        <Select value={selectedPair} onValueChange={setSelectedPair}>
                            <SelectTrigger className="w-[120px]">
                                <SelectValue placeholder="Pair" />
                            </SelectTrigger>
                            <SelectContent>
                                {JOURNAL_PAIRS.map(pair => (
                                    <SelectItem key={pair} value={pair}>{pair}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}

                    <div className="h-6 border-l border-border/50"></div>
                
                    <TooltipProvider>
                        <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={handleImportClick}>
                            <FileUp className={cn("h-5 w-5", isDataImported ? "text-chart-3" : "text-muted-foreground")} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>{isDataImported ? "Price Data Loaded" : "Import Dukascopy CSV"}</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".csv" className="hidden" />

                    {tab === 'backtester' ? (
                         <Button variant="ghost" onClick={handleExportCsv} disabled={rrTools.length === 0 || !isDataImported} className="text-foreground">
                            <Download className="mr-2 h-4 w-4" />
                            Download Report
                        </Button>
                    ) : (
                        <>
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button variant="ghost" size="icon" onClick={handleImportJournalClick}>
                                            <BookOpen className={cn("h-5 w-5", allJournalTrades.length > 0 ? "text-chart-2" : "text-muted-foreground")} />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent><p>Import Journal CSV</p></TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                            <input type="file" ref={journalFileInputRef} onChange={handleJournalFileChange} accept=".csv" className="hidden" />
                        </>
                    )}
                </>
            </div>
            {fileName && (
                <div className="bg-card/70 backdrop-blur-sm rounded-md px-2 py-1 shadow-md ml-8">
                    <p className="text-xs text-muted-foreground/80">Price Data: <span className="font-medium text-foreground/90">{fileName}</span></p>
                </div>
            )}
            {tab === 'journal' && journalFileName && (
                 <div className="bg-card/70 backdrop-blur-sm rounded-md px-2 py-1 shadow-md ml-8">
                    <p className="text-xs text-muted-foreground/80">Journal: <span className="font-medium text-foreground/90">{journalFileName}</span></p>
                </div>
            )}
        </div>
        <div
            className="absolute z-10"
            style={{ top: `${toolbarPositions.secondary.y}px`, left: `${toolbarPositions.secondary.x}px` }}
        >
            <div className="flex items-center gap-2 bg-card/80 backdrop-blur-sm p-2 rounded-lg shadow-lg">
                <div onMouseDown={(e) => handleMouseDownOnToolbar(e, 'secondary')} className="cursor-grab active:cursor-grabbing p-1 -ml-1">
                    <GripVertical className="h-5 w-5 text-muted-foreground/50" />
                </div>
                <TooltipProvider>
                    <div className="flex justify-center gap-1">
                        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={handlePlaceLong} disabled={isPlacingAnything || !isDataImported}><ArrowUp className="w-5 h-5 text-accent"/></Button></TooltipTrigger><TooltipContent><p>Place Long Position</p></TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={handlePlaceShort} disabled={isPlacingAnything || !isDataImported}><ArrowDown className="w-5 h-5 text-destructive"/></Button></TooltipTrigger><TooltipContent><p>Place Short Position</p></TooltipContent></Tooltip>
                        
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={handleNextDay} disabled={!isDataImported}>
                                    <ChevronsRight className="w-5 h-5 text-foreground" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>Go to Next Trading Day</p></TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={handleNextCandle} disabled={!backtestEndDate}>
                                    <Forward className="w-5 h-5 text-foreground" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>Show Next Candle</p></TooltipContent>
                        </Tooltip>
                    </div>
                </TooltipProvider>
                
                <div className="h-6 border-l border-border/50"></div>

                <TooltipProvider>
                    <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={handlePlaceMarker} disabled={isPlacingAnything || !isDataImported}><Target className="w-5 h-5 text-foreground"/></Button></TooltipTrigger><TooltipContent><p>Place Price Marker</p></TooltipContent></Tooltip>
                    <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={() => setIsYAxisLocked(prev => !prev)}>{isYAxisLocked ? <Lock className="h-5 w-5" /> : <Unlock className="h-5 w-5" />}</Button></TooltipTrigger><TooltipContent><p>{isYAxisLocked ? "Unlock Y-Axis" : "Lock Y-Axis"}</p></TooltipContent></Tooltip>
                    <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={handlePlaceMeasurement} disabled={isPlacingAnything || !isDataImported}><Ruler className="w-5 h-5 text-foreground"/></Button></TooltipTrigger><TooltipContent><p>Measure Distance</p></TooltipContent></Tooltip>
                </TooltipProvider>

                {tab === 'journal' && (
                  <>
                    <div className="h-6 border-l border-border/50"></div>
                    <TooltipProvider>
                        <Tooltip><TooltipTrigger asChild><Button variant="ghost" onClick={() => updateTradeOutcome('Win')} disabled={!selectedDate || journalTrades.length === 0} className="text-accent">Win</Button></TooltipTrigger><TooltipContent><p>Mark Day as Win</p></TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild><Button variant="ghost" onClick={() => updateTradeOutcome('Loss')} disabled={!selectedDate || journalTrades.length === 0} className="text-destructive">Loss</Button></TooltipTrigger><TooltipContent><p>Mark Day as Loss</p></TooltipContent></Tooltip>
                    </TooltipProvider>
                    <div className="h-6 border-l border-border/50"></div>
                    <TooltipProvider>
                       <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={() => updateTradeStatus('traded')} disabled={!selectedDate || journalTrades.length === 0}><ThumbsUp className="w-5 h-5 text-accent"/></Button></TooltipTrigger><TooltipContent><p>Mark Day as Traded</p></TooltipContent></Tooltip>
                       <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={() => updateTradeStatus('not traded')} disabled={!selectedDate || journalTrades.length === 0}><ThumbsDown className="w-5 h-5 text-destructive"/></Button></TooltipTrigger><TooltipContent><p>Mark Day as Not Traded</p></TooltipContent></Tooltip>
                       <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={handleDownloadJournal} disabled={allJournalTrades.length === 0}><FileDown className="w-5 h-5 text-foreground"/></Button></TooltipTrigger><TooltipContent><p>Download Updated Journal</p></TooltipContent></Tooltip>
                    </TooltipProvider>
                  </>
                )}

                 <AlertDialog>
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className={cn((rrTools.length === 0 && priceMarkers.length === 0 && measurementTools.length === 0) && "pointer-events-none")}>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="destructive" size="icon" disabled={rrTools.length === 0 && priceMarkers.length === 0 && measurementTools.length === 0}><Trash2 className="h-5 w-5" /></Button>
                                    </AlertDialogTrigger>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent><p>Clear all drawings</p></TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                    <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone. This will permanently delete all placed tools and markers from the chart.</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleClearAllDrawings}>Continue</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </div>
    </>
  );

  return (
    <div className="w-full h-full relative">
       <AlertDialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Restore Previous Session?</AlertDialogTitle>
                    <AlertDialogDescription>
                        We found a saved session for <strong>{tab}</strong>.
                        Would you like to restore your drawings and settings? You will need to re-import your data files.
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
                trades={journalTradesOnChart}
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
                endDate={chartEndDate}
                isYAxisLocked={isYAxisLocked}
                openingRange={openingRange}
                tab={tab}
            />
        </div>
        <div 
          className="absolute z-20 flex items-center gap-4 top-4 right-4"
        >
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
                        <CalendarIcon className="h-5 w-5" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                    <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={(date) => {
                            if (date) {
                                setSelectedDate(date);
                                setBacktestEndDate(undefined); // Reset stepping when a new date is picked
                            }
                        }}
                        defaultMonth={selectedDate}
                        modifiers={{ 
                            win: (date) => dayResults[date.toISOString().split('T')[0]] === 'win',
                            loss: (date) => dayResults[date.toISOString().split('T')[0]] === 'loss',
                            modified: (date) => dayResults[date.toISOString().split('T')[0]] === 'modified',
                        }}
                        modifiersClassNames={{
                            win: 'bg-green-200 text-green-900 rounded-full font-bold',
                            loss: 'bg-red-200 text-red-900 rounded-full font-bold',
                            modified: 'bg-orange-200 text-orange-900 rounded-full font-bold',
                        }}
                    />
                </PopoverContent>
            </Popover>
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
                            <p className="text-sm text-muted-foreground">Adjust chart display options.</p>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="timezone">Timezone</Label>
                            <Select value={timeZone} onValueChange={setTimeZone} disabled={!timezones.length}>
                                <SelectTrigger id="timezone" className="w-full"><SelectValue placeholder="Select timezone" /></SelectTrigger>
                                <SelectContent><ScrollArea className="h-72">{timezones.map(tz => (<SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>))}</ScrollArea></SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="session-start">Session Start Time (UTC)</Label>
                            <Input id="session-start" type="time" value={sessionStartTime} onChange={(e) => setSessionStartTime(e.target.value)} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="pip-value">Pip / Point Value</Label>
                            <Input id="pip-value" type="number" step="0.0001" value={pipValue} onChange={(e) => setPipValue(parseFloat(e.target.value) || 0)} />
                        </div>
                    </div>
                </PopoverContent>
            </Popover>
        </div>
        
        {renderToolbar()}
    </div>
  );
}
