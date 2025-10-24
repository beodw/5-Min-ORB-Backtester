
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { MeasurementTool as MeasurementToolType, ChartApi } from '@/types';
import { X } from 'lucide-react';
import { formatDistance, format } from 'date-fns';

interface MeasurementToolProps {
  tool: MeasurementToolType;
  chartApi: ChartApi;
  onRemove: (id: string) => void;
  pipValue: number;
  isLive?: boolean;
}

export function MeasurementTool({ tool, chartApi, onRemove, pipValue, isLive = false }: MeasurementToolProps) {
  const [startPos, setStartPos] = useState<{ x: number | undefined, y: number | undefined }>({ x: undefined, y: undefined });
  const [endPos, setEndPos] = useState<{ x: number | undefined, y: number | undefined }>({ x: undefined, y: undefined });
  
  const updatePositions = useCallback(() => {
    if (!chartApi.data || chartApi.data.length === 0) return;
    
    const startIndex = tool.startPoint.index;
    const endIndex = tool.endPoint.index;

    if (startIndex < 0 || startIndex >= chartApi.data.length || endIndex < 0 || endIndex >= chartApi.data.length) return;

    const startX = chartApi.timeToCoordinate?.(Math.floor(chartApi.data[startIndex].date.getTime() / 1000) as any);
    const startY = chartApi.priceToCoordinate?.(tool.startPoint.price);
    
    const endX = chartApi.timeToCoordinate?.(Math.floor(chartApi.data[endIndex].date.getTime() / 1000) as any);
    const endY = chartApi.priceToCoordinate?.(tool.endPoint.price);

    setStartPos({ x: startX, y: startY });
    setEndPos({ x: endX, y: endY });

  }, [chartApi, tool]);
  
  useEffect(() => {
    updatePositions();
    const chart = chartApi.chart;
    if (chart) {
      const timeScale = chart.timeScale();
      timeScale.subscribeVisibleTimeRangeChange(updatePositions);
      return () => timeScale.unsubscribeVisibleTimeRangeChange(updatePositions);
    }
  }, [chartApi, updatePositions]);


  if (startPos.x === undefined || startPos.y === undefined || endPos.x === undefined || endPos.y === undefined) {
    return null;
  }
  
  const dx = endPos.x - startPos.x;
  const dy = endPos.y - startPos.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);
  
  const priceChange = tool.endPoint.price - tool.startPoint.price;
  const pips = (Math.abs(priceChange) / pipValue).toFixed(1);
  const percentageChange = ((priceChange / tool.startPoint.price) * 100).toFixed(2);

  const startIndex = Math.min(tool.startPoint.index, tool.endPoint.index);
  const endIndex = Math.max(tool.startPoint.index, tool.endPoint.index);
  const bars = endIndex - startIndex;

  if (startIndex < 0 || endIndex >= chartApi.data.length) return null;
  
  const timeDiffMs = chartApi.data[endIndex].date.getTime() - chartApi.data[startIndex].date.getTime();
  const timeFormatted = formatDistance(0, timeDiffMs, { includeSeconds: true });


  return (
    <div className="absolute top-0 left-0 pointer-events-none w-full h-full">
      {/* Line */}
      <div
        className="absolute bg-blue-500 origin-top-left"
        style={{
          left: `${startPos.x}px`,
          top: `${startPos.y}px`,
          width: `${distance}px`,
          height: '1px',
          transform: `rotate(${angle}rad)`,
        }}
      />
      {/* Start and End Circles */}
      <div className="absolute w-2 h-2 -translate-x-1 -translate-y-1 rounded-full bg-blue-500" style={{ left: `${startPos.x}px`, top: `${startPos.y}px` }} />
      <div className="absolute w-2 h-2 -translate-x-1 -translate-y-1 rounded-full bg-blue-500" style={{ left: `${endPos.x}px`, top: `${endPos.y}px` }} />
      
      {/* Info Box */}
      <div 
        className="absolute bg-background/70 backdrop-blur-sm border border-border rounded p-2 text-xs"
        style={{
          left: `${(startPos.x + endPos.x) / 2}px`,
          top: `${(startPos.y + endPos.y) / 2}px`,
          transform: 'translate(-50%, -50%)',
        }}
      >
        <p>{priceChange.toFixed(5)} ({percentageChange}%) {pips} pips</p>
        <p>{bars} bars, {timeFormatted}</p>
      </div>

       {/* Remove Button */}
       {!isLive && (
            <button
                onClick={() => onRemove(tool.id)}
                className="absolute pointer-events-auto bg-destructive text-destructive-foreground rounded-full p-0.5"
                style={{
                    left: `${endPos.x + 8}px`,
                    top: `${endPos.y - 8}px`,
                }}
            >
                <X className="h-3 w-3" />
            </button>
        )}
    </div>
  );
}
