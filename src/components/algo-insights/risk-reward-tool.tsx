
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { RiskRewardTool as RRToolType, ChartApi } from '@/types';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { findClosestIndex } from '@/lib/chart-utils';

interface RiskRewardToolProps {
  tool: RRToolType;
  chartApi: ChartApi;
  onUpdate: (tool: RRToolType) => void;
  onRemove: (id: string) => void;
  pipValue: number;
}

export function RiskRewardTool({ tool, chartApi, onUpdate, onRemove, pipValue }: RiskRewardToolProps) {
  const [positions, setPositions] = useState({ entry: { x: 0, y: 0 }, stop: { x: 0, y: 0 }, profit: { x: 0, y: 0 } });
  const [isDragging, setIsDragging] = useState<null | 'entry' | 'stop' | 'profit' | 'body' | 'left-edge' | 'right-edge'>(null);
  const dragInfo = useRef({ startX: 0, startY: 0, startTool: tool });

  const getX = useCallback((date: Date) => {
    if (!date) return undefined;
    const time = Math.floor(date.getTime() / 1000) as any;
    return chartApi.timeToCoordinate?.(time);
  }, [chartApi]);

  const getY = useCallback((price: number) => {
    return chartApi.priceToCoordinate?.(price);
  }, [chartApi]);

  const updatePositions = useCallback(() => {
    const entryX = getX(tool.entryDate);
    const entryY = getY(tool.entryPrice);
    const stopY = getY(tool.stopLoss);
    const profitY = getY(tool.takeProfit);

    if (entryX !== undefined && entryY !== undefined && stopY !== undefined && profitY !== undefined) {
      setPositions({
        entry: { x: entryX, y: entryY },
        stop: { x: entryX, y: stopY },
        profit: { x: entryX, y: profitY }
      });
    }
  }, [tool, getX, getY]);
  
  useEffect(() => {
    updatePositions();
    const chart = chartApi.chart;
    if (chart) {
      const timeScale = chart.timeScale();
      timeScale.subscribeVisibleTimeRangeChange(updatePositions);
      return () => timeScale.unsubscribeVisibleTimeRangeChange(updatePositions);
    }
  }, [chartApi, updatePositions]);
  
  const handleMouseDown = (e: React.MouseEvent, part: 'entry' | 'stop' | 'profit' | 'body' | 'left-edge' | 'right-edge') => {
    e.stopPropagation();
    setIsDragging(part);
    dragInfo.current = { startX: e.clientX, startY: e.clientY, startTool: { ...tool } };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || !chartApi.coordinateToPrice || !chartApi.coordinateToTime) return;

    const dx = e.clientX - dragInfo.current.startX;
    const dy = e.clientY - dragInfo.current.startY;

    let newTool = { ...dragInfo.current.startTool };

    if (isDragging === 'body') {
        const startEntryY = getY(dragInfo.current.startTool.entryPrice);
        if(startEntryY === undefined) return;
        
        const newEntryPrice = chartApi.coordinateToPrice(startEntryY + dy);
        if (newEntryPrice === null) return;
        
        const priceDiff = newTool.entryPrice - newEntryPrice;
        newTool.entryPrice -= priceDiff;
        newTool.stopLoss -= priceDiff;
        newTool.takeProfit -= priceDiff;

    } else if (isDragging === 'entry') {
        const startY = getY(dragInfo.current.startTool.entryPrice);
        if(startY === undefined) return;
        const newPrice = chartApi.coordinateToPrice(startY + dy);
        if (newPrice !== null) newTool.entryPrice = newPrice;
    } else if (isDragging === 'stop') {
        const startY = getY(dragInfo.current.startTool.stopLoss);
        if(startY === undefined) return;
        const newPrice = chartApi.coordinateToPrice(startY + dy);
        if (newPrice !== null) newTool.stopLoss = newPrice;
    } else if (isDragging === 'profit') {
        const startY = getY(dragInfo.current.startTool.takeProfit);
        if(startY === undefined) return;
        const newPrice = chartApi.coordinateToPrice(startY + dy);
        if (newPrice !== null) newTool.takeProfit = newPrice;
    } else if (isDragging === 'left-edge') {
        const startEntryX = getX(dragInfo.current.startTool.entryDate);
        if(startEntryX === undefined) return;
        
        const newTime = chartApi.coordinateToTime(startEntryX + dx);

        if (newTime !== null && newTime !== undefined && chartApi.data) {
             const closestIndex = findClosestIndex(chartApi.data, newTime * 1000);
            if (chartApi.data[closestIndex]) {
                const originalEntryX = getX(dragInfo.current.startTool.entryDate);
                const newEntryX = getX(chartApi.data[closestIndex].date);
                
                if (originalEntryX !== undefined && newEntryX !== undefined) {
                    const widthChangeInPixels = originalEntryX - newEntryX;
                    newTool.widthInPoints = Math.max(20, dragInfo.current.startTool.widthInPoints + widthChangeInPixels);
                    newTool.entryDate = chartApi.data[closestIndex].date;
                }
            }
        }
    } else if (isDragging === 'right-edge') {
        newTool.widthInPoints = Math.max(20, dragInfo.current.startTool.widthInPoints + dx);
    }
    
     const startX = getX(dragInfo.current.startTool.entryDate);
     if (startX === undefined) return;
     
     const timeAtOrigin = chartApi.coordinateToTime(startX + dx);

     if ((isDragging === 'body' || isDragging === 'entry') && timeAtOrigin !== null && timeAtOrigin !== undefined && chartApi.data) {
        const closestIndex = findClosestIndex(chartApi.data, timeAtOrigin * 1000);
        if (chartApi.data[closestIndex]) {
          const newDate = chartApi.data[closestIndex].date;
          newTool.entryDate = newDate;
        }
     }

    onUpdate(newTool);
  };

  const handleMouseUp = () => {
    setIsDragging(null);
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  };
  
  if (!positions.entry.y || !positions.stop.y || !positions.profit.y || !positions.entry.x) return null;

  const risk = Math.abs(tool.entryPrice - tool.stopLoss);
  const reward = Math.abs(tool.takeProfit - tool.entryPrice);
  const rrRatio = risk > 0 ? (reward / risk).toFixed(2) : '∞';

  const riskPips = (risk / pipValue).toFixed(1);
  const rewardPips = (reward / pipValue).toFixed(1);

  const isLong = tool.position === 'long';
  const stopBoxHeight = Math.abs(positions.entry.y - positions.stop.y);
  const profitBoxHeight = Math.abs(positions.entry.y - positions.profit.y);
  const boxWidth = tool.widthInPoints;

  const stopBoxTop = isLong ? positions.entry.y : positions.stop.y;
  const profitBoxTop = isLong ? positions.profit.y : positions.entry.y;
  
  return (
    <div className="absolute top-0 left-0 pointer-events-none w-full h-full">
      {/* Stop Loss Box (Red) */}
      <div
        className={cn(
          'absolute pointer-events-auto cursor-grab active:cursor-grabbing',
          'bg-destructive/30'
        )}
        style={{
          left: positions.entry.x,
          top: stopBoxTop,
          width: boxWidth,
          height: stopBoxHeight,
        }}
        onMouseDown={(e) => handleMouseDown(e, 'body')}
      >
        <div className="relative w-full h-full flex items-center justify-center">
          <div className="text-white text-xs text-center p-1">
            <p>Stop</p>
            <p className="font-bold">{riskPips} pips</p>
          </div>
        </div>
      </div>
      
      {/* Take Profit Box (Green) */}
      <div
        className={cn(
          'absolute pointer-events-auto cursor-grab active:cursor-grabbing',
          'bg-accent/30'
        )}
        style={{
          left: positions.entry.x,
          top: profitBoxTop,
          width: boxWidth,
          height: profitBoxHeight,
        }}
        onMouseDown={(e) => handleMouseDown(e, 'body')}
      >
        <div className="relative w-full h-full flex items-center justify-center">
          <div className="text-white text-xs text-center p-1">
            <p>Target</p>
            <p className="font-bold">{rrRatio} R</p>
            <p>{rewardPips} pips</p>
          </div>
        </div>
      </div>
      
      {/* Lines */}
      <div className="absolute w-full h-full top-0 left-0 -z-10">
        <div className="absolute bg-foreground/50" style={{ left: positions.entry.x, top: positions.entry.y, width: boxWidth, height: 1 }} />
        <div className="absolute bg-destructive" style={{ left: positions.entry.x, top: positions.stop.y, width: boxWidth, height: 1 }} />
        <div className="absolute bg-accent" style={{ left: positions.entry.x, top: positions.profit.y, width: boxWidth, height: 1 }} />
      </div>

       {/* Drag Handles */}
        <div
            className="absolute h-full w-4 -ml-2 pointer-events-auto cursor-ew-resize z-10"
            style={{ left: positions.entry.x, top: Math.min(positions.profit.y, positions.stop.y), height: profitBoxHeight + stopBoxHeight }}
            onMouseDown={(e) => handleMouseDown(e, 'left-edge')}
        />
        <div
            className="absolute h-full w-4 -mr-2 pointer-events-auto cursor-ew-resize z-10"
            style={{ left: positions.entry.x + boxWidth, top: Math.min(positions.profit.y, positions.stop.y), height: profitBoxHeight + stopBoxHeight }}
            onMouseDown={(e) => handleMouseDown(e, 'right-edge')}
        />
        <div
            className="absolute w-4 h-4 -translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-ns-resize z-10"
            style={{ left: positions.entry.x + boxWidth / 2, top: positions.entry.y }}
            onMouseDown={(e) => handleMouseDown(e, 'entry')}
        />
        <div
            className="absolute w-4 h-4 -translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-ns-resize z-10"
            style={{ left: positions.entry.x + boxWidth / 2, top: positions.stop.y }}
            onMouseDown={(e) => handleMouseDown(e, 'stop')}
        />
        <div
            className="absolute w-4 h-4 -translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-ns-resize z-10"
            style={{ left: positions.entry.x + boxWidth / 2, top: positions.profit.y }}
            onMouseDown={(e) => handleMouseDown(e, 'profit')}
        />


      {/* Remove button */}
       <button
            onClick={() => onRemove(tool.id)}
            onMouseDown={(e) => e.stopPropagation()}
            className="absolute pointer-events-auto bg-destructive text-destructive-foreground rounded-full p-0.5 z-10 cursor-pointer"
            style={{
                left: positions.entry.x + boxWidth + 5,
                top: positions.entry.y - 8,
            }}
        >
            <X className="h-3 w-3" />
        </button>
    </div>
  );
}
