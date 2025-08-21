
"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { InteractiveChart } from "@/components/algo-insights/interactive-chart";
import { mockPriceData } from "@/lib/mock-data";
import { useToast } from "@/hooks/use-toast";
import type { PriceData, PriceMarker } from "@/types";
import { FileUp, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

type JournalTrade = {
  date: Date;
  result: 'win' | 'loss';
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

export function JournalReconstruction() {
  const [priceData, setPriceData] = useState<PriceData[]>(mockPriceData);
  const [journalTrades, setJournalTrades] = useState<JournalTrade[]>([]);
  const [priceMarkers, setPriceMarkers] = useState<PriceMarker[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

  const [isPriceDataImported, setIsPriceDataImported] = useState(false);
  const [isJournalImported, setIsJournalImported] = useState(false);
  const [loadedPriceDataInfo, setLoadedPriceDataInfo] = useState<string | null>(null);

  const priceDataInputRef = useRef<HTMLInputElement>(null);
  const journalInputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();

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
            setLoadedPriceDataInfo(file.name);
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
        const lines = text.split('\n').filter(line => line.trim() !== '');
        if (lines.length <= 1) throw new Error("Journal file is empty or has no data.");

        const header = lines[0].trim().split(',').map(h => h.trim());
        const dateIndex = header.findIndex(h => h === "Date Taken (Timestamp)");
        const rIndex = header.findIndex(h => h === "Maximum Favourable Excursion (R)");

        if (dateIndex === -1) {
          throw new Error("CSV header is missing the required column: 'Date Taken (Timestamp)'.");
        }
        if (rIndex === -1) {
            throw new Error("CSV header is missing the required column: 'Maximum Favourable Excursion (R)'.");
        }
        
        const dataRows = lines.slice(1);
        const newTrades: JournalTrade[] = [];

        for (let i = 0; i < dataRows.length; i++) {
          const line = dataRows[i];
          const rowNum = i + 2;
          const columns = line.split(',');

          const dateStr = columns[dateIndex]?.trim();
          const rValueStr = columns[rIndex]?.trim();
          
          if (!dateStr) {
             throw new Error(`Row ${rowNum}: 'Date Taken (Timestamp)' value is missing or empty.`);
          }
          if (!rValueStr) {
             throw new Error(`Row ${rowNum}: 'Maximum Favourable Excursion (R)' value is missing or empty.`);
          }

          const rValue = parseFloat(rValueStr);
          if (isNaN(rValue)) {
            throw new Error(`Row ${rowNum}: Invalid R-value. Expected a number, but got "${rValueStr}".`);
          }

          const dateParts = dateStr.split('/');
          if (dateParts.length !== 3) {
            throw new Error(`Row ${rowNum}: Invalid date format for "${dateStr}". Expected MM/DD/YYYY.`);
          }
          const [month, day, year] = dateParts.map(Number);
          if (isNaN(month) || isNaN(day) || isNaN(year) || month < 1 || month > 12 || day < 1 || day > 31) {
            throw new Error(`Row ${rowNum}: Invalid date values in "${dateStr}".`);
          }
          // Note: month is 0-indexed in JavaScript's Date object
          const date = new Date(Date.UTC(year, month - 1, day));
          if (isNaN(date.getTime())) {
            throw new Error(`Row ${rowNum}: Could not create a valid date from "${dateStr}".`);
          }

          newTrades.push({ date, result: rValue >= 2 ? 'win' : 'loss' });
        }


        if (newTrades.length === 0) {
            throw new Error("No valid trades could be parsed from the journal file.");
        }

        setJournalTrades(newTrades);
        setIsJournalImported(true);
        if (newTrades.length > 0) {
            setSelectedDate(newTrades[0].date);
        }
        toast({ title: "Journal Import Successful", description: `Loaded ${newTrades.length} trades.` });
      } catch (error: any) {
        toast({ variant: "destructive", title: "Journal Import Failed", description: `${error.message}`, duration: 9000 });
        setIsJournalImported(false);
      } finally {
         if (journalInputRef.current) journalInputRef.current.value = "";
      }
    };
    reader.readAsText(file);
  };

  const findSessionStartIndex = (targetDate: Date): number => {
    const sessionHour = 9;
    const sessionMinute = 30;

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
    
    const hasTradeOnDay = journalTrades.some(tradeDate => 
        tradeDate.date.getUTCDate() === date.getUTCDate() &&
        tradeDate.date.getUTCMonth() === date.getUTCMonth() &&
        tradeDate.date.getUTCFullYear() === date.getUTCFullYear()
    );

    if (!hasTradeOnDay) {
        toast({ variant: "destructive", title: "No Trade Data", description: "No trade found for this day in the journal." });
        setSelectedDate(date);
        setPriceMarkers([]);
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
        
        setPriceMarkers([highMarker, lowMarker]);
        
        const viewEndIndex = Math.min(startIndex + 60, priceData.length - 1);
        setSelectedDate(priceData[viewEndIndex].date);
    } else {
        toast({
            variant: "destructive",
            title: "Session Not Found",
            description: "Could not find the 9:30 AM UTC session start in the loaded price data for the selected day.",
            duration: 7000
        });
        setSelectedDate(date);
        setPriceMarkers([]);
    }
  };

  const dayResultModifiers = useMemo(() => {
    const modifiers: Record<string, Date[]> = {
      win: [],
      loss: [],
    };
    journalTrades.forEach(trade => {
        const key = trade.result === 'win' ? 'win' : 'loss';
        modifiers[key].push(trade.date);
    });
    return modifiers;
  }, [journalTrades]);

  const allTradeDates = journalTrades.map(t => t.date);

  return (
    <div className="flex h-full">
      <div className="w-[350px] p-4 border-r border-border flex flex-col gap-4">
        <h2 className="text-xl font-bold font-headline">Controls</h2>
        
        <div className="space-y-2">
            <h3 className="font-semibold text-lg">1. Import Price Data</h3>
            <Button onClick={() => priceDataInputRef.current?.click()} className="w-full">
              <FileUp className="mr-2 h-4 w-4" /> Import 1-Min Data
            </Button>
            <input type="file" ref={priceDataInputRef} onChange={handlePriceDataImport} accept=".csv" className="hidden" />
             {loadedPriceDataInfo && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-secondary p-2 rounded-md">
                   <Info className="h-4 w-4 text-primary" />
                   <p>Loaded: <span className="font-semibold">{loadedPriceDataInfo}</span></p>
                </div>
            )}
        </div>

        <div className="space-y-2">
            <h3 className="font-semibold text-lg">2. Import Journal</h3>
             <Button onClick={() => journalInputRef.current?.click()} className="w-full" disabled={!isPriceDataImported}>
              <FileUp className="mr-2 h-4 w-4" /> Import Journal CSV
            </Button>
            <input type="file" ref={journalInputRef} onChange={handleJournalImport} accept=".csv" className="hidden" />
        </div>
        
        <div>
            <h3 className="font-semibold text-lg mb-2">3. Select a Trade Day</h3>
             <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(day) => handleDateSelect(day)}
                month={selectedDate}
                onMonthChange={setSelectedDate}
                modifiers={dayResultModifiers}
                modifiersClassNames={{
                    win: 'rdp-day_win',
                    loss: 'rdp-day_loss',
                }}
                disabled={(date) => !allTradeDates.some(tradeDate => 
                    tradeDate.getUTCDate() === date.getUTCDate() &&
                    tradeDate.getUTCMonth() === date.getUTCMonth() &&
                    tradeDate.getUTCFullYear() === date.getUTCFullYear()
                )}
                className="rounded-md border"
             />
        </div>
        
      </div>
      <div className="flex-1 relative">
        <InteractiveChart
          data={priceData}
          trades={[]}
          onChartClick={() => {}}
          onChartMouseMove={() => {}}
          rrTools={[]}
          onUpdateTool={() => {}}
          onRemoveTool={() => {}}
          isPlacingRR={false}
          isPlacingPriceMarker={false}
          priceMarkers={priceMarkers}
          onRemovePriceMarker={(id) => setPriceMarkers(prev => prev.filter(m => m.id !== id))}
          onUpdatePriceMarker={(id, price) => setPriceMarkers(prev => prev.map(m => m.id === id ? {...m, price} : m))}
          measurementTools={[]}
          onRemoveMeasurementTool={() => {}}
          liveMeasurementTool={null}
          pipValue={0.0001}
          timeframe="1m"
          timeZone="UTC"
          endDate={selectedDate}
          isYAxisLocked={false}
        />
        {!isPriceDataImported && (
             <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center">
                <p className="text-muted-foreground text-lg">Please import price data to begin.</p>
            </div>
        )}
      </div>
    </div>
  );
}
