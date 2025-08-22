
"use client";

import { useState, useRef, useMemo, useEffect, ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { Calendar, type CalendarProps } from "@/components/ui/calendar";
import { InteractiveChart, type ChartClickData } from "@/components/algo-insights/interactive-chart";
import { mockPriceData } from "@/lib/mock-data";
import { useToast } from "@/hooks/use-toast";
import type { PriceData, PriceMarker, RiskRewardTool as RRToolType, MeasurementTool as MeasurementToolType, DrawingState, ToolbarPositions, MeasurementPoint } from "@/types";
import { FileUp, Info, ArrowUp, ArrowDown, Settings, ChevronsRight, Target, Trash2, Lock, Unlock, Ruler, Undo, Redo, GripVertical, ChevronLeft, ChevronRight, RotateCcw, CheckCircle, XCircle, FileX2, Download } from "lucide-react";
import { cn } from "@/lib/utils";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

type JournalTrade = {
  date: string; // Stored as ISO string for serialization
  result: 'win' | 'loss';
  originalRow: string;
};

type TradeDecision = 'Traded' | 'Not Traded';

type SessionInfo = {
    priceDataFileName: string | null;
    journalFileName: string | null;
};

type SessionState = {
    drawingState: DrawingState;
    tradeDecisions: Record<string, TradeDecision>;
    journalTrades: JournalTrade[];
    sessionInfo: SessionInfo;
};


const fillGapsInData = (data: PriceData[]): PriceData[] => {
    if (data.length < 2) return data;
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
                    date: gapDate, open: fillPrice, high: fillPrice,
                    low: fillPrice, close: fillPrice, wick: [fillPrice, fillPrice],
                });
            }
        }
        processedData.push(currentPoint);
    }
    return processedData;
};

// Local storage keys
const TOOLBAR_POS_KEY_JOURNAL = 'algo-insights-toolbar-positions-journal';
const JOURNAL_SESSION_KEY = 'algo-insights-journal-session';

const formatDateToISO = (date: Date): string => {
    return date.toISOString().split('T')[0];
};

export function JournalReconstruction() {
  const [priceData, setPriceData] = useState<PriceData[]>(mockPriceData);
  const [journalTrades, setJournalTrades] = useState<JournalTrade[]>([]);
  const [journalHeader, setJournalHeader] = useState<string>('');
  
  const [drawingState, setDrawingState] = useState<DrawingState>({
    rrTools: [],
    priceMarkers: [],
    measurementTools: []
  });

  const [tradeDecisions, setTradeDecisions] = useState<Record<string, TradeDecision>>({});

  const [history, setHistory] = useState<DrawingState[]>([]);
  const [redoStack, setRedoStack] = useState<DrawingState[]>([]);

  const [toolbarPositions, setToolbarPositions] = useState<ToolbarPositions>({
    main: { x: 400, y: 16 },
    secondary: { x: 400, y: 88 }
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
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [sessionStartTime, setSessionStartTime] = useState('09:30');
  const [isYAxisLocked, setIsYAxisLocked] = useState(true);
  const [pipValue, setPipValue] = useState(0.0001);

  const [sessionInfo, setSessionInfo] = useState<SessionInfo>({ priceDataFileName: null, journalFileName: null });
  const [isPriceDataImported, setIsPriceDataImported] = useState(false);
  const [isJournalImported, setIsJournalImported] = useState(false);

  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [sessionToRestore, setSessionToRestore] = useState<SessionInfo | null>(null);

  const priceDataInputRef = useRef<HTMLInputElement>(null);
  const journalInputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();

   // Effect for loading toolbar positions and checking for saved session
  useEffect(() => {
    const savedToolbarPosRaw = localStorage.getItem(TOOLBAR_POS_KEY_JOURNAL);
    if (savedToolbarPosRaw) {
        try {
            const savedPos: ToolbarPositions = JSON.parse(savedToolbarPosRaw);
            setToolbarPositions(savedPos);
        } catch (e) {
            console.error("Failed to parse journal toolbar positions from localStorage", e);
        }
    }

    const savedSessionRaw = localStorage.getItem(JOURNAL_SESSION_KEY);
    if (savedSessionRaw) {
        try {
            const savedSession: SessionState = JSON.parse(savedSessionRaw);
            if (savedSession.sessionInfo.priceDataFileName || savedSession.sessionInfo.journalFileName) {
                setSessionToRestore(savedSession.sessionInfo);
                setShowRestoreDialog(true);
            }
        } catch (e) {
            console.error("Failed to parse journal session from localStorage", e);
            localStorage.removeItem(JOURNAL_SESSION_KEY);
        }
    }
  }, []);

  // Effect for saving session state
  useEffect(() => {
    // Don't save if nothing is loaded
    if (!isPriceDataImported && !isJournalImported) {
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
        tradeDecisions,
        journalTrades,
        sessionInfo,
    };
    localStorage.setItem(JOURNAL_SESSION_KEY, JSON.stringify(sessionState));

  }, [drawingState, tradeDecisions, journalTrades, sessionInfo, isPriceDataImported, isJournalImported]);


  const handleRestoreSession = () => {
    setShowRestoreDialog(false);
    const savedSessionRaw = localStorage.getItem(JOURNAL_SESSION_KEY);
    if (savedSessionRaw) {
        try {
            const savedSession: SessionState = JSON.parse(savedSessionRaw);

            const restoredRrTools = savedSession.drawingState.rrTools.map(tool => ({
                ...tool,
                entryDate: new Date(tool.entryDate),
            }));

            setDrawingState({ ...savedSession.drawingState, rrTools: restoredRrTools });
            setTradeDecisions(savedSession.tradeDecisions || {});
            setJournalTrades(savedSession.journalTrades || []);
            setSessionInfo(savedSession.sessionInfo);

            if (savedSession.journalTrades?.length > 0) {
              setIsJournalImported(true);
              setSelectedDate(new Date(savedSession.journalTrades[0].date));
            }
            if(savedSession.sessionInfo.priceDataFileName){
              setIsPriceDataImported(false); // It's not *really* imported yet
              setPriceData([]); // Clear mock/old data
            }

            toast({
                title: "Session Restored",
                description: `Drawings and decisions loaded. Please re-import your files.`,
                duration: 9000
            });
        } catch (e) {
            console.error("Failed to restore session", e);
            toast({ variant: "destructive", title: "Restore Failed", description: "Could not restore session from storage." });
            handleDeclineRestore();
        }
    }
  };

  const startNewSession = () => {
      localStorage.removeItem(JOURNAL_SESSION_KEY);
      setDrawingState({ rrTools: [], priceMarkers: [], measurementTools: [] });
      setHistory([]);
      setRedoStack([]);
      setSessionInfo({ priceDataFileName: null, journalFileName: null });
      setIsPriceDataImported(false);
      setIsJournalImported(false);
      setJournalTrades([]);
      setTradeDecisions({});
      setPriceData(mockPriceData);
      setSelectedDate(undefined);
      toast({ title: "New Session Started", description: "All previous journal data has been cleared." });
  };

  const handleDeclineRestore = () => {
      setShowRestoreDialog(false);
      startNewSession();
  };

  const handlePriceDataImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const text = e.target?.result as string;
            const lines = text.split('\n').filter(line => line.trim() !== '');
            const header = lines[0].trim().split(',');
            if (header[0].trim() !== 'Time (UTC)' || header[1].trim() !== 'Open') {
                throw new Error("Invalid CSV header. Expected 'Time (UTC),Open,...'");
            }
            if (lines.length <= 1) throw new Error("CSV file contains no data rows.");
            
            const dataRows = lines.slice(1);
            const parsedData: PriceData[] = dataRows.map((row, index) => {
                const columns = row.split(',');
                const [timeStr, openStr, highStr, lowStr, closeStr] = columns;
                if (!timeStr || !openStr || !highStr || !lowStr || !closeStr) throw new Error(`Row ${index + 2}: Missing columns.`);
                
                const dateTimeString = timeStr.trim().replace(' GMT', '');
                const [datePart, timePart] = dateTimeString.split(' ');
                if (!datePart || !timePart) throw new Error(`Row ${index + 2}: Invalid date format.`);
                
                const [day, month, year] = datePart.split('.').map(Number);
                const [hour, minute, second] = timePart.split(':').map(Number);
                if (isNaN(day) || isNaN(month) || isNaN(year) || isNaN(hour) || isNaN(minute)) throw new Error(`Row ${index + 2}: Invalid date values.`);
                
                const date = new Date(Date.UTC(year, month - 1, day, hour, minute, Math.floor(second || 0)));
                if (isNaN(date.getTime())) throw new Error(`Row ${index + 2}: Invalid Date object.`);
                
                return { date, open: parseFloat(openStr), high: parseFloat(highStr), low: parseFloat(lowStr), close: parseFloat(closeStr), wick: [parseFloat(lowStr), parseFloat(highStr)] };
            }).filter(d => !isNaN(d.open));

            if (parsedData.length === 0) throw new Error("No valid data rows were parsed.");

            parsedData.sort((a, b) => a.date.getTime() - b.date.getTime());
            const processedData = fillGapsInData(parsedData);
            
            setPriceData(processedData);
            setIsPriceDataImported(true);
            setSessionInfo(prev => ({ ...prev, priceDataFileName: file.name }));
            toast({ title: "Import Successful", description: `Loaded ${file.name}` });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Price Data Import Failed", description: `Error: ${error.message}`, duration: 9000 });
            setIsPriceDataImported(false);
        } finally {
            if(priceDataInputRef.current) priceDataInputRef.current.value = "";
        }
    };
    reader.readAsText(file);
  };
  
  const handleJournalImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        
        const delimiter = text.includes('\r\n') ? '\r\n' : '\n';
        
        const lines = text.split(delimiter).filter(line => line.trim() !== '');
        if (lines.length <= 1) throw new Error("Journal file is empty or has no data.");

        const headerLine = lines[0].trim();
        const header = headerLine.split(',').map(h => h.trim());
        const dateIndex = header.findIndex(h => h === "Date Taken (Timestamp)");
        const rIndex = header.findIndex(h => h === "Maximum Favourable Excursion (R)");

        if (dateIndex === -1) throw new Error("CSV header is missing the required column: 'Date Taken (Timestamp)'.");
        if (rIndex === -1) throw new Error("CSV header is missing the required column: 'Maximum Favourable Excursion (R)'.");
        
        setJournalHeader(headerLine);
        const dataRows = lines.slice(1);
        const newTrades: JournalTrade[] = [];

        for (let i = 0; i < dataRows.length; i++) {
          const line = dataRows[i];
          if (!line || line.trim() === '') continue;
          
          const rowNum = i + 2;
          const columns = line.split(',');

          if (columns.length <= Math.max(dateIndex, rIndex)) {
              console.warn(`Skipping malformed row ${rowNum}. Incorrect number of columns.`);
              continue;
          }

          const dateStr = columns[dateIndex]?.trim();
          const rValueStr = columns[rIndex]?.trim();
          
          if (!dateStr) throw new Error(`Row ${rowNum}: 'Date Taken (Timestamp)' value is missing or empty.`);
          if (!rValueStr) throw new Error(`Row ${rowNum}: 'Maximum Favourable Excursion (R)' value is missing or empty.`);

          const rValue = parseFloat(rValueStr);
          if (isNaN(rValue)) throw new Error(`Row ${rowNum}: Invalid R-value. Expected a number, but got "${rValueStr}".`);

          const dateParts = dateStr.split('/');
          if (dateParts.length !== 3) throw new Error(`Row ${rowNum}: Invalid date format for "${dateStr}". Expected MM/DD/YYYY.`);
          
          const [month, day, year] = dateParts.map(Number);
          if (isNaN(month) || isNaN(day) || isNaN(year) || month < 1 || month > 12 || day < 1 || day > 31) {
            throw new Error(`Row ${rowNum}: Invalid date values in "${dateStr}".`);
          }
          
          const date = new Date(Date.UTC(year, month - 1, day));
          if (isNaN(date.getTime())) throw new Error(`Row ${rowNum}: Could not create a valid date from "${dateStr}".`);

          newTrades.push({ date: date.toISOString(), result: rValue >= 2 ? 'win' : 'loss', originalRow: line });
        }


        if (newTrades.length === 0) throw new Error("No valid trades could be parsed from the journal file.");

        setJournalTrades(newTrades);
        setIsJournalImported(true);
        setSessionInfo(prev => ({ ...prev, journalFileName: file.name }));
        if (newTrades.length > 0) setSelectedDate(new Date(newTrades[0].date));
        toast({ title: "Journal Loaded", description: `${newTrades.length} trades were successfully imported.`, duration: 5000 });
        
      } catch (error: any) {
        toast({ variant: "destructive", title: "Journal Import Failed", description: `${error.message}`, duration: 30000 });
        setIsJournalImported(false);
      } finally {
         if (journalInputRef.current) journalInputRef.current.value = "";
      }
    };
    reader.readAsText(file);
  };

  const handleExportDecisions = () => {
    if (!isJournalImported) {
        toast({ variant: 'destructive', title: 'Export Failed', description: 'Please import a journal file first.' });
        return;
    }

    const header = `${journalHeader},"Trade Decision"`;

    const rows = journalTrades.map(trade => {
        const dateKey = new Date(trade.date).toISOString().split('T')[0];
        // Default to "Traded" if no decision has been explicitly made for that day.
        const decision = tradeDecisions[dateKey] || 'Traded';
        return `${trade.originalRow},"${decision}"`;
    }).join('\n');

    const csvContent = `${header}\n${rows}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.href) {
        URL.revokeObjectURL(link.href);
    }
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'journal_with_decisions.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const findSessionStartIndex = (targetDate: Date): number => {
    const [sessionHour, sessionMinute] = sessionStartTime.split(':').map(Number);

    const targetDayStart = new Date(targetDate);
    targetDayStart.setUTCHours(0,0,0,0);

    for (let i = 0; i < priceData.length; i++) {
        const pointDate = priceData[i].date;
        const pointDay = new Date(pointDate);
        pointDay.setUTCHours(0,0,0,0);

        if (pointDay.getTime() === targetDayStart.getTime()) {
             if (pointDate.getUTCHours() > sessionHour || (pointDate.getUTCHours() === sessionHour && pointDate.getUTCMinutes() >= sessionMinute)) {
                return i;
            }
        }
    }
    return -1;
  };
  
  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    
    if (!isPriceDataImported) {
         toast({ variant: "destructive", title: "Price Data Missing", description: "Please import 1-minute price data first." });
        return;
    }

    const hasTradeOnDay = journalTrades.some(trade => {
        const tradeDate = new Date(trade.date);
        return tradeDate.getUTCFullYear() === date.getUTCFullYear() &&
               tradeDate.getUTCMonth() === date.getUTCMonth() &&
               tradeDate.getUTCDate() === date.getUTCDate()
    });

    if (!hasTradeOnDay) {
        toast({ variant: "destructive", title: "No Trade Data", description: "No trade found for this day in the journal." });
        setPriceMarkers(prev => []);
        return;
    }

    const startIndex = findSessionStartIndex(date);

    if (startIndex !== -1) {
        const endIndex = startIndex + 5;
        if (endIndex > priceData.length) {
            toast({ variant: "destructive", title: "Not Enough Data", description: "Not enough data to draw the opening range." });
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
        
        const highMarker: PriceMarker = { id: `or-high-${startIndex}`, price: openingRangeHigh, label: 'High', isDeletable: true };
        const lowMarker: PriceMarker = { id: `or-low-${startIndex}`, price: openingRangeLow, label: 'Low', isDeletable: true };
        
        pushToHistory(drawingState);
        setPriceMarkers(prev => [highMarker, lowMarker]);
        
        const viewEndIndex = Math.min(startIndex + 60, priceData.length - 1);
        setSelectedDate(priceData[viewEndIndex].date);
    } else {
        toast({
            variant: "destructive",
            title: "Session Not Found",
            description: `Could not find the ${sessionStartTime} UTC session start in the loaded price data for the selected day.`,
            duration: 7000
        });
        pushToHistory(drawingState);
        setPriceMarkers(() => []);
    }
  };

  const handleChartClick = (chartData: ChartClickData) => {
    if (placingToolType) {
      const entryPrice = chartData.closePrice;
      const visiblePriceRange = chartData.yDomain[1] - chartData.yDomain[0];
      const stopLossOffset = visiblePriceRange * 0.05;
      const takeProfitOffset = visiblePriceRange * 0.10;
      const stopLoss = placingToolType === 'long' ? entryPrice - stopLossOffset : entryPrice + takeProfitOffset;
      const takeProfit = placingToolType === 'long' ? entryPrice + takeProfitOffset : entryPrice - takeProfitOffset;
      const visibleIndexRange = chartData.xDomain[1] - chartData.xDomain[0];
      const widthInPoints = Math.round(visibleIndexRange * 0.25);
      const pairName = sessionInfo.priceDataFileName?.split('_')[0] || 'N/A';
      const newTool: RRToolType = {
        id: `rr-${Date.now()}`, entryPrice, stopLoss, takeProfit,
        entryDate: chartData.date, widthInPoints, position: placingToolType, pair: pairName,
      };
      setRrTools(prevTools => [...prevTools, newTool]);
      setPlacingToolType(null);
    } else if (isPlacingPriceMarker) {
      const newMarker: PriceMarker = { id: `pm-${Date.now()}`, price: chartData.price, isDeletable: true };
      setPriceMarkers(prev => [...prev, newMarker]);
      setIsPlacingPriceMarker(false);
    } else if (isPlacingMeasurement) {
        const { price, dataIndex, candle } = chartData;
        const bodyTop = Math.max(candle.open, candle.close);
        const bodyBottom = Math.min(candle.open, candle.close);
        const snappedPrice = (price >= bodyBottom && price <= bodyTop) ? candle.open : price;
        const currentPoint = { index: dataIndex, price: snappedPrice };
        if (!measurementStartPoint) {
            setMeasurementStartPoint(currentPoint);
            setLiveMeasurementTool({ id: 'live-measure', startPoint: currentPoint, endPoint: currentPoint });
        } else {
            const newTool: MeasurementToolType = { id: `measure-${Date.now()}`, startPoint: measurementStartPoint, endPoint: currentPoint };
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
        const currentPoint = { index: dataIndex, price: snappedPrice };
        setLiveMeasurementTool({ id: 'live-measure', startPoint: measurementStartPoint, endPoint: currentPoint });
    }
  };

  const handleClearAllDrawings = () => {
    pushToHistory(drawingState);
    setDrawingState({ rrTools: [], priceMarkers: [], measurementTools: [] });
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
      if (!currentDate) return new Date();
      const newDate = new Date(currentDate.getTime() + getDuration(timeframe));
      const lastAvailableDate = priceData[priceData.length - 1]?.date;
      if (lastAvailableDate && newDate > lastAvailableDate) return lastAvailableDate;
      return newDate;
    });
  };

  const findNextSessionStartIndex = (currentDate: Date): number => {
    if (!currentDate) return -1;
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
    if (!sessionStartTime || !priceData.length || !selectedDate) return;

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
    setIsPlacingPriceMarker(false); setIsPlacingMeasurement(false);
    setMeasurementStartPoint(null); setLiveMeasurementTool(null);
    setPlacingToolType('long');
  };

  const handlePlaceShort = () => {
    setIsPlacingPriceMarker(false); setIsPlacingMeasurement(false);
    setMeasurementStartPoint(null); setLiveMeasurementTool(null);
    setPlacingToolType('short');
  };

  const handlePlaceMarker = () => {
    setPlacingToolType(null); setIsPlacingMeasurement(false);
    setMeasurementStartPoint(null); setLiveMeasurementTool(null);
    setIsPlacingPriceMarker(true);
  };

  const handlePlaceMeasurement = () => {
    setPlacingToolType(null); setIsPlacingPriceMarker(false);
    setMeasurementStartPoint(null); setLiveMeasurementTool(null);
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
    if (dragInfo.current.target) localStorage.setItem(TOOLBAR_POS_KEY_JOURNAL, JSON.stringify(toolbarPositions));
    dragInfo.current.target = null;
    window.removeEventListener('mousemove', handleToolbarMouseMove);
    window.removeEventListener('mouseup', handleToolbarMouseUp);
  };

  const handleSetTradeDecision = (decision: TradeDecision) => {
    if (selectedDate) {
        const dateKey = formatDateToISO(selectedDate);
        setTradeDecisions(prev => ({...prev, [dateKey]: decision}));
    }
  };

  const handleResetDecisions = () => {
    setTradeDecisions({});
    toast({ title: "Decisions Reset", description: "All manual trade decisions have been cleared." });
  };
  
  const isPlacingAnything = !!placingToolType || isPlacingPriceMarker || isPlacingMeasurement;
  
  const dayResultModifiers = useMemo(() => {
    const modifiers: Record<string, Date[]> = { win: [], loss: [], modified: [] };
    const modifiedDates = Object.keys(tradeDecisions);

    journalTrades.forEach(trade => {
        const tradeDate = new Date(trade.date);
        const dateKey = formatDateToISO(tradeDate);
        if (modifiedDates.includes(dateKey)) {
            modifiers.modified.push(tradeDate);
        } else {
            const key = trade.result === 'win' ? 'win' : 'loss';
            modifiers[key].push(tradeDate);
        }
    });

    return modifiers;
  }, [journalTrades, tradeDecisions]);

  const allTradeDates = useMemo(() => journalTrades.map(t => new Date(t.date)), [journalTrades]);

  const restoreMessage = sessionToRestore 
    ? `Restore session with ${sessionToRestore.priceDataFileName || 'N/A'} and ${sessionToRestore.journalFileName || 'N/A'}?`
    : 'An unknown previous session was found. Restore?';

  return (
    <div className="flex h-full">
       <AlertDialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Restore Previous Session?</AlertDialogTitle>
                    <AlertDialogDescription>
                        {restoreMessage} You will need to re-import the files.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={handleDeclineRestore}>Start New Session</AlertDialogCancel>
                    <AlertDialogAction onClick={handleRestoreSession}>Restore</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        
      <div className="w-[350px] p-4 border-r border-border flex flex-col gap-4 overflow-y-auto">
        <h2 className="text-xl font-bold font-headline">Controls</h2>
        
        <div className="space-y-2">
            <h3 className="font-semibold text-lg">1. Import Files</h3>
            <Button onClick={() => priceDataInputRef.current?.click()} className="w-full">
              <FileUp className="mr-2 h-4 w-4" /> Import 1-Min Data
            </Button>
            <input type="file" ref={priceDataInputRef} onChange={handlePriceDataImport} accept=".csv" className="hidden" />
             {sessionInfo.priceDataFileName && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-secondary p-2 rounded-md">
                   <Info className="h-4 w-4 text-primary" />
                   <p>Loaded: <span className="font-semibold">{sessionInfo.priceDataFileName}</span></p>
                </div>
            )}
             <Button onClick={() => journalInputRef.current?.click()} className="w-full mt-2" disabled={!isPriceDataImported}>
              <FileUp className="mr-2 h-4 w-4" /> Import Journal CSV
            </Button>
            <input type="file" ref={journalInputRef} onChange={handleJournalImport} accept=".csv" className="hidden" />
             {sessionInfo.journalFileName && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-secondary p-2 rounded-md">
                   <Info className="h-4 w-4 text-primary" />
                   <p>Loaded: <span className="font-semibold">{sessionInfo.journalFileName}</span></p>
                </div>
            )}
        </div>
        
        <div>
            <h3 className="font-semibold text-lg mb-2">2. Select a Trade Day</h3>
             <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => {
                  setSelectedDate(d);
                  handleDateSelect(d);
                }}
                disabled={(date) => !allTradeDates.some(tradeDate => 
                    tradeDate.getUTCFullYear() === date.getUTCFullYear() &&
                    tradeDate.getUTCMonth() === date.getUTCMonth() &&
                    tradeDate.getUTCDate() === date.getUTCDate()
                )}
                modifiers={dayResultModifiers}
                modifiersClassNames={{
                    win: 'rdp-day_win',
                    loss: 'rdp-day_loss',
                    modified: 'rdp-day_modified',
                }}
                month={selectedDate}
                onMonthChange={setSelectedDate}
                captionLayout="dropdown-buttons"
                fromYear={new Date().getFullYear() - 10}
                toYear={new Date().getFullYear() + 10}
                className="rounded-md border"
             />
        </div>

        <div className="space-y-2">
            <h3 className="font-semibold text-lg">3. Session & Export</h3>
            <Button
                onClick={handleResetDecisions}
                variant="outline"
                className="w-full"
                disabled={Object.keys(tradeDecisions).length === 0}
            >
                <RotateCcw className="mr-2 h-4 w-4"/> Reset All Decisions
            </Button>
             <AlertDialog>
                <AlertDialogTrigger asChild>
                     <Button
                        variant="destructive"
                        className="w-full"
                        disabled={!isPriceDataImported && !isJournalImported}
                    >
                        <FileX2 className="mr-2 h-4 w-4"/> Start New Session
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will clear all imported data, drawings, and decisions from this tab. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={startNewSession}>Continue</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
      </div>

      <div className="flex-1 relative">
        <InteractiveChart
          data={priceData}
          trades={[]}
          onChartClick={handleChartClick}
          onChartMouseMove={handleChartMouseMove}
          rrTools={rrTools}
          onUpdateTool={(tool) => { pushToHistory(drawingState); setRrTools(prev => prev.map(t => t.id === tool.id ? tool : t)); }}
          onRemoveTool={(id) => { pushToHistory(drawingState); setRrTools(prev => prev.filter(t => t.id !== id)); }}
          isPlacingRR={!!placingToolType}
          isPlacingPriceMarker={isPlacingPriceMarker}
          priceMarkers={priceMarkers}
          onRemovePriceMarker={(id) => { pushToHistory(drawingState); setPriceMarkers(prev => prev.filter(m => m.id !== id)); }}
          onUpdatePriceMarker={(id, price) => { pushToHistory(drawingState); setPriceMarkers(prev => prev.map(m => m.id === id ? {...m, price} : m)); }}
          measurementTools={measurementTools}
          onRemoveMeasurementTool={(id) => { pushToHistory(drawingState); setMeasurementTools(prev => prev.filter(t => t.id !== id)); }}
          liveMeasurementTool={liveMeasurementTool}
          pipValue={pipValue}
          timeframe={timeframe}
          timeZone="UTC"
          endDate={selectedDate}
          isYAxisLocked={isYAxisLocked}
        />
        {!isPriceDataImported && !sessionInfo.priceDataFileName && (
             <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center">
                <p className="text-muted-foreground text-lg">Please import price data to begin.</p>
            </div>
        )}
        
        <div 
          className="absolute z-10 flex flex-col items-start gap-2"
          style={{ top: `${toolbarPositions.main.y}px`, left: `${toolbarPositions.main.x}px` }}
        >
            <div className="flex items-center gap-2 bg-card/80 backdrop-blur-sm p-2 rounded-lg shadow-lg">
              <div onMouseDown={(e) => handleMouseDownOnToolbar(e, 'main')} className="cursor-grab active:cursor-grabbing p-1 -ml-1">
                  <GripVertical className="h-5 w-5 text-muted-foreground/50" />
              </div>
                <Select value={timeframe} onValueChange={setTimeframe}>
                    <SelectTrigger className="w-[120px]"><SelectValue placeholder="Timeframe" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="1m">1 Minute</SelectItem>
                        <SelectItem value="30m">30 Minutes</SelectItem>
                        <SelectItem value="1H">1 Hour</SelectItem>
                        <SelectItem value="4H">4 Hours</SelectItem>
                        <SelectItem value="1D">1 Day</SelectItem>
                    </SelectContent>
                </Select>
                <div className="flex items-center gap-1">
                    <TooltipProvider>
                      <Tooltip>
                          <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={handleNextCandle} className="text-muted-foreground" disabled={priceData.length === 0}>
                                  <ChevronRight className="h-5 w-5" />
                              </Button>
                          </TooltipTrigger>
                          <TooltipContent><p>Next Candle</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                      <Tooltip>
                          <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={handleNextSession} className="text-muted-foreground" disabled={priceData.length === 0}>
                                  <ChevronsRight className="h-5 w-5" />
                              </Button>
                          </TooltipTrigger>
                          <TooltipContent><p>Next Session Open</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                </div>
                <div className="h-6 border-l border-border/50 mx-2"></div>
                <Popover>
                    <PopoverTrigger asChild><Button variant="ghost" size="icon"><Settings className="h-5 w-5" /></Button></PopoverTrigger>
                    <PopoverContent className="w-80 mr-4">
                        <div className="grid gap-4">
                            <div className="space-y-2"><h4 className="font-medium leading-none">Settings</h4><p className="text-sm text-muted-foreground">Adjust chart display options.</p></div>
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
        </div>
        <div className="absolute z-10" style={{ top: `${toolbarPositions.secondary.y}px`, left: `${toolbarPositions.secondary.x}px` }}>
            <div className="flex items-center gap-2 bg-card/80 backdrop-blur-sm p-2 rounded-lg shadow-lg">
                <div onMouseDown={(e) => handleMouseDownOnToolbar(e, 'secondary')} className="cursor-grab active:cursor-grabbing p-1 -ml-1">
                    <GripVertical className="h-5 w-5 text-muted-foreground/50" />
                </div>
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={handleUndo} disabled={history.length === 0}><Undo className="h-5 w-5" /></Button>
                    <Button variant="ghost" size="icon" onClick={handleRedo} disabled={redoStack.length === 0}><Redo className="h-5 w-5" /></Button>
                </div>
                <div className="h-6 border-l border-border/50"></div>
                <TooltipProvider>
                    <div className="flex justify-center gap-1">
                        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={handlePlaceLong} disabled={isPlacingAnything || priceData.length === 0}><ArrowUp className="w-5 h-5 text-accent"/></Button></TooltipTrigger><TooltipContent><p>Place Long Position</p></TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={handlePlaceShort} disabled={isPlacingAnything || priceData.length === 0}><ArrowDown className="w-5 h-5 text-destructive"/></Button></TooltipTrigger><TooltipContent><p>Place Short Position</p></TooltipContent></Tooltip>
                    </div>
                </TooltipProvider>
                <div className="h-6 border-l border-border/50"></div>
                <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={handlePlaceMarker} disabled={isPlacingAnything || priceData.length === 0}><Target className="w-5 h-5 text-foreground"/></Button></TooltipTrigger><TooltipContent><p>Place Price Marker</p></TooltipContent></Tooltip></TooltipProvider>
                <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={() => setIsYAxisLocked(prev => !prev)}>{isYAxisLocked ? <Lock className="h-5 w-5" /> : <Unlock className="h-5 w-5" />}</Button></TooltipTrigger><TooltipContent><p>{isYAxisLocked ? "Unlock Y-Axis" : "Lock Y-Axis"}</p></TooltipContent></Tooltip></TooltipProvider>
                <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={handlePlaceMeasurement} disabled={isPlacingAnything || priceData.length === 0}><Ruler className="w-5 h-5 text-foreground"/></Button></TooltipTrigger><TooltipContent><p>Measure Distance</p></TooltipContent></Tooltip></TooltipProvider>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={handleExportDecisions} disabled={!isJournalImported}>
                          <Download className="w-5 h-5 text-foreground"/>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>Export Decisions Report</p></TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <div className="h-6 border-l border-border/50"></div>
                 <TooltipProvider>
                    <div className="flex justify-center gap-1">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={() => handleSetTradeDecision('Traded')} 
                                    disabled={!selectedDate || !isJournalImported}
                                >
                                    <CheckCircle className="w-5 h-5 text-accent"/>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>Mark day as "Traded"</p></TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={() => handleSetTradeDecision('Not Traded')} 
                                    disabled={!selectedDate || !isJournalImported}
                                >
                                    <XCircle className="w-5 h-5 text-destructive"/>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>Mark day as "Not Traded"</p></TooltipContent>
                        </Tooltip>
                    </div>
                </TooltipProvider>
                <div className="h-6 border-l border-border/50"></div>
                 <AlertDialog>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                         <div className={cn((rrTools.length === 0 && priceMarkers.length === 0 && measurementTools.length === 0) && "pointer-events-none")}>
                            <AlertDialogTrigger asChild><Button variant="destructive" size="icon" disabled={rrTools.length === 0 && priceMarkers.length === 0 && measurementTools.length === 0}><Trash2 className="h-5 w-5" /></Button></AlertDialogTrigger>
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

      </div>
    </div>
  );
}
