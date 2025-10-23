
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { RiskRewardTool as RRToolType, ChartApi } from '@/types';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

interface RiskRewardToolProps {
  tool: RRToolType;
  chart: ChartApi;
  onUpdate: (tool: RRToolType) => void;
  onRemove: (id: string) => void;
  pipValue: number;
}

export function RiskRewardTool({ tool, chart, onUpdate, onRemove, pipValue }: RiskRewardToolProps) {
  const [positions, setPositions] = useState({ entry: { x: 0, y: 0 }, stop: { x: 0, y: 0 }, profit: { x: 0, y: 0 } });
  const [isDragging, setIsDragging] = useState<null | 'entry' | 'stop' | 'profit' | 'body'>(null);
  const dragInfo = useRef({ startX: 0, startY: 0, startTool: tool });

  const getX = useCallback((date: Date) => {
    const time = Math.floor(date.getTime() / 1000) as any;
    return chart.timeToCoordinate?.(time);
  }, [chart]);

  const getY = useCallback((price: number) => {
    return chart.priceToCoordinate?.(price);
  }, [chart]);

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
    const interval = setInterval(updatePositions, 50); // High-frequency updates
    return () => clearInterval(interval);
  }, [updatePositions]);
  

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>, part: 'entry' | 'stop' | 'profit' | 'body') => {
    e.stopPropagation();
    setIsDragging(part);
    dragInfo.current = { startX: e.clientX, startY: e.clientY, startTool: { ...tool } };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || !chart.coordinateToPrice) return;

    const dx = e.clientX - dragInfo.current.startX;
    const dy = e.clientY - dragInfo.current.startY;

    let newTool = { ...dragInfo.current.startTool };

    if (isDragging === 'body') {
      const newPrice = chart.coordinateToPrice(dragInfo.current.startY + dy);
      if (newPrice === null) return;
      const priceDiff = newTool.entryPrice - newPrice;
      newTool.entryPrice -= priceDiff;
      newTool.stopLoss -= priceDiff;
      newTool.takeProfit -= priceDiff;
    } else if (isDragging === 'entry') {
        const newPrice = chart.coordinateToPrice(dragInfo.current.startY + dy);
        if (newPrice !== null) newTool.entryPrice = newPrice;
    } else if (isDragging === 'stop') {
        const newPrice = chart.coordinateToPrice(dragInfo.current.startY + dy);
        if (newPrice !== null) newTool.stopLoss = newPrice;
    } else if (isDragging === 'profit') {
        const newPrice = chart.coordinateToPrice(dragInfo.current.startY + dy);
        if (newPrice !== null) newTool.takeProfit = newPrice;
    }
    
     const timeAtOrigin = chart.coordinateToTime?.(dragInfo.current.startX + dx);
     if (timeAtOrigin !== null && timeAtOrigin !== undefined) {
        const closestIndex = findClosestIndex(chart.data, timeAtOrigin * 1000);
        const newDate = chart.data[closestIndex].date;
        newTool.entryDate = newDate;
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
  const boxWidth = 150; // Use a fixed pixel width for simplicity for now

  return (
    <div className="absolute top-0 left-0 pointer-events-none">
      {/* Stop Loss Box */}
      <div
        className={cn("absolute pointer-events-auto cursor-grab active:cursor-grabbing", isLong ? "bg-destructive/20" : "bg-accent/20")}
        style={{
          left: positions.entry.x,
          top: isLong ? positions.entry.y : positions.profit.y,
          width: boxWidth,
          height: isLong ? stopBoxHeight : profitBoxHeight,
        }}
        onMouseDown={(e) => handleMouseDown(e, 'body')}
      >
        <div className="relative w-full h-full">
           <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white text-xs text-center">
            <p>Target</p>
            <p className="font-bold">{rrRatio} R</p>
            <p>{rewardPips} pips</p>
          </div>
        </div>
      </div>
      
      {/* Take Profit Box */}
      <div
        className={cn("absolute pointer-events-auto cursor-grab active:cursor-grabbing", isLong ? "bg-accent/20" : "bg-destructive/20")}
        style={{
          left: positions.entry.x,
          top: isLong ? positions.profit.y : positions.entry.y,
          width: boxWidth,
          height: isLong ? profitBoxHeight : stopBoxHeight,
        }}
        onMouseDown={(e) => handleMouseDown(e, 'body')}
      >
        <div className="relative w-full h-full">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white text-xs text-center">
                <p>Stop</p>
                <p className="font-bold">{riskPips} pips</p>
            </div>
        </div>
      </div>
      
      {/* Lines */}
      <div className="absolute w-full h-full top-0 left-0">
        {/* Entry Line */}
        <div className="absolute bg-foreground/50" style={{ left: positions.entry.x, top: positions.entry.y, width: boxWidth, height: 1 }} />
        {/* Stop Line */}
        <div className="absolute bg-destructive" style={{ left: positions.entry.x, top: positions.stop.y, width: boxWidth, height: 1 }} />
        {/* Profit Line */}
        <div className="absolute bg-accent" style={{ left: positions.entry.x, top: positions.profit.y, width: boxWidth, height: 1 }} />
      </div>

       {/* Drag Handles */}
      <div
        className="absolute w-4 h-4 -translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-ns-resize bg-background border border-foreground rounded-full"
        style={{ left: positions.entry.x + boxWidth / 2, top: positions.entry.y }}
        onMouseDown={(e) => handleMouseDown(e, 'entry')}
      />
      <div
        className="absolute w-4 h-4 -translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-ns-resize bg-background border border-destructive rounded-full"
        style={{ left: positions.entry.x + boxWidth / 2, top: positions.stop.y }}
        onMouseDown={(e) => handleMouseDown(e, 'stop')}
      />
      <div
        className="absolute w-4 h-4 -translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-ns-resize bg-background border border-accent rounded-full"
        style={{ left: positions.entry.x + boxWidth / 2, top: positions.profit.y }}
        onMouseDown={(e) => handleMouseDown(e, 'profit')}
      />

      {/* Remove button */}
       <button
            onClick={() => onRemove(tool.id)}
            className="absolute pointer-events-auto bg-destructive text-destructive-foreground rounded-full p-0.5"
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

    