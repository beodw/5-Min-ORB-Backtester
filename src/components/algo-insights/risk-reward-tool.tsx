
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
  onUpdateWithHistory: (tool: RRToolType) => void;
  onRemove: (id: string) => void;
  pipValue: number;
}

export function RiskRewardTool({ tool, chartApi, onUpdate, onUpdateWithHistory, onRemove, pipValue }: RiskRewardToolProps) {
  const [isDragging, setIsDragging] = useState<null | 'entry' | 'stop' | 'profit' | 'body' | 'left-edge' | 'right-edge'>(null);
  const dragInfo = useRef({ startX: 0, startY: 0, startTool: tool });
  const [positions, setPositions] = useState<{
    entryX?: number; entryY?: number;
    stopY?: number; profitY?: number;
    endX?: number;
  }>({});

  const updatePositions = useCallback(() => {
    if (!chartApi.timeToCoordinate || !chartApi.priceToCoordinate || !chartApi.data || chartApi.data.length === 0) return;
    
    const entryX = chartApi.timeToCoordinate(Math.floor(tool.entryDate.getTime() / 1000) as any);

    const entryIndex = findClosestIndex(chartApi.data, tool.entryDate.getTime());
    const endIndex = Math.min(chartApi.data.length - 1, entryIndex + tool.widthInCandles);
    const endDate = chartApi.data[endIndex]?.date;
    if (!endDate) return;

    const endX = chartApi.timeToCoordinate(Math.floor(endDate.getTime() / 1000) as any);

    setPositions({
        entryX: entryX ?? undefined,
        endX: endX ?? undefined,
        entryY: chartApi.priceToCoordinate(tool.entryPrice) ?? undefined,
        stopY: chartApi.priceToCoordinate(tool.stopLoss) ?? undefined,
        profitY: chartApi.priceToCoordinate(tool.takeProfit) ?? undefined,
    });
  }, [tool, chartApi]);


  useEffect(() => {
    updatePositions();
    const chart = chartApi.chart;
    if (chart) {
      const timeScale = chart.timeScale();
      timeScale.subscribeVisibleTimeRangeChange(updatePositions);
      const priceScale = chart.priceScale('right');
      
      const priceScaleUpdateHandler = () => updatePositions();
      priceScale.subscribeOptionsChange(priceScaleUpdateHandler);
      
      return () => {
        timeScale.unsubscribeVisibleTimeRangeChange(updatePositions);
        priceScale.unsubscribeOptionsChange(priceScaleUpdateHandler);
      };
    }
  }, [chartApi, updatePositions]);
  
  const handleMouseDown = (e: React.MouseEvent, part: 'entry' | 'stop' | 'profit' | 'body' | 'left-edge' | 'right-edge') => {
    e.stopPropagation();
    setIsDragging(part);
    dragInfo.current = { startX: e.clientX, startY: e.clientY, startTool: { ...tool } };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !chartApi.coordinateToPrice || !chartApi.coordinateToTime || !chartApi.data) return;

    const dx = e.clientX - dragInfo.current.startX;
    const dy = e.clientY - dragInfo.current.startY;
    
    let newTool = { ...tool };

    if (isDragging === 'body') {
        const startEntryY = positions.entryY;
        const startEntryX = positions.entryX;
        if(startEntryY === undefined || startEntryX === undefined) return;
        
        const newEntryPrice = chartApi.coordinateToPrice(startEntryY + dy);
        const newTime = chartApi.coordinateToTime(startEntryX + dx);
        
        if (newEntryPrice === null || newTime === null) return;
        
        const priceDiff = dragInfo.current.startTool.entryPrice - newEntryPrice;
        newTool.entryPrice = newEntryPrice;
        newTool.stopLoss = dragInfo.current.startTool.stopLoss - priceDiff;
        newTool.takeProfit = dragInfo.current.startTool.takeProfit - priceDiff;

        const closestIndex = findClosestIndex(chartApi.data, newTime * 1000);
        if (chartApi.data[closestIndex]) {
          newTool.entryDate = chartApi.data[closestIndex].date;
        }

    } else if (isDragging === 'entry' || isDragging === 'stop' || isDragging === 'profit') {
        const startPrice = dragInfo.current.startTool[isDragging === 'entry' ? 'entryPrice' : isDragging === 'stop' ? 'stopLoss' : 'takeProfit'];
        const startY = chartApi.priceToCoordinate?.(startPrice);
        if(startY === undefined) return;
        const newPrice = chartApi.coordinateToPrice(startY + dy);
        if (newPrice !== null) {
            if(isDragging === 'entry') newTool.entryPrice = newPrice;
            else if(isDragging === 'stop') newTool.stopLoss = newPrice;
            else newTool.takeProfit = newPrice;
        }
    } else if (isDragging === 'left-edge') {
        const startEntryX = positions.entryX;
        if (startEntryX === undefined) return;
        const newTime = chartApi.coordinateToTime(startEntryX + dx);
        if (newTime === null) return;

        const newEntryIndex = findClosestIndex(chartApi.data, newTime * 1000);
        const originalEntryIndex = findClosestIndex(chartApi.data, dragInfo.current.startTool.entryDate.getTime());
        
        const candleDiff = originalEntryIndex - newEntryIndex;
        newTool.widthInCandles = Math.max(1, dragInfo.current.startTool.widthInCandles + candleDiff);
        newTool.entryDate = chartApi.data[newEntryIndex].date;

    } else if (isDragging === 'right-edge') {
         const startEntryX = positions.entryX;
         if(startEntryX === undefined) return;

         const entryIndex = findClosestIndex(chartApi.data, dragInfo.current.startTool.entryDate.getTime());
         
         const rightEdgeDate = chartApi.data[Math.min(chartApi.data.length - 1, entryIndex + dragInfo.current.startTool.widthInCandles)]?.date;
         if (!rightEdgeDate) return;

         const startRightEdgeX = chartApi.timeToCoordinate?.(Math.floor(rightEdgeDate.getTime()/1000) as any);
         if (startRightEdgeX === undefined) return;

         const newRightEdgeX = startRightEdgeX + dx;
         const timeAtRightEdge = chartApi.coordinateToTime(newRightEdgeX);
         if(timeAtRightEdge === null) return;
         
         const newRightIndex = findClosestIndex(chartApi.data, timeAtRightEdge * 1000);
         
         newTool.widthInCandles = Math.max(1, newRightIndex - entryIndex);
    }
    
    onUpdate(newTool);
  }, [isDragging, chartApi, onUpdate, positions]);

  const handleMouseUp = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(null);
    onUpdateWithHistory(tool);
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  }, [isDragging, onUpdateWithHistory, handleMouseMove, tool]);

  const { entryX, entryY, stopY, profitY, endX } = positions;

  if (entryX === undefined || entryY === undefined || stopY === undefined || profitY === undefined || endX === undefined) return null;

  const isLong = tool.position === 'long';
  const profitColor = isLong ? 'rgba(0, 255, 0, 0.2)' : 'rgba(255, 0, 0, 0.2)';
  const stopColor = isLong ? 'rgba(255, 0, 0, 0.2)' : 'rgba(0, 255, 0, 0.2)';
  
  const boxWidth = endX - entryX;

  const profitTop = Math.min(entryY, profitY);
  const profitHeight = Math.abs(entryY - profitY);

  const stopTop = Math.min(entryY, stopY);
  const stopHeight = Math.abs(entryY - stopY);

  const riskInPrice = Math.abs(tool.entryPrice - tool.stopLoss);
  const rewardInPrice = Math.abs(tool.takeProfit - tool.entryPrice);
  const riskRewardRatio = riskInPrice > 0 ? (rewardInPrice / riskInPrice).toFixed(2) : '∞';


  const handleSize = 8;
  const halfHandleSize = handleSize / 2;

  return (
    <div className="absolute top-0 left-0 pointer-events-none w-full h-full z-10">
       {/* Profit Box */}
       <div
            className="absolute pointer-events-auto cursor-grab active:cursor-grabbing z-10"
            style={{
                left: entryX,
                top: profitTop,
                width: boxWidth,
                height: profitHeight,
                backgroundColor: profitColor
            }}
            onMouseDown={(e) => handleMouseDown(e, 'body')}
        />
        {/* Stop Box */}
       <div
            className="absolute pointer-events-auto cursor-grab active:cursor-grabbing z-10"
            style={{
                left: entryX,
                top: stopTop,
                width: boxWidth,
                height: stopHeight,
                backgroundColor: stopColor
            }}
            onMouseDown={(e) => handleMouseDown(e, 'body')}
        />
      
       {/* Edge and corner handles */}
        <div
            className="absolute pointer-events-auto cursor-ew-resize z-20"
            style={{ left: entryX - halfHandleSize, top: Math.min(profitY, stopY), width: handleSize, height: Math.abs(profitY - stopY) }}
            onMouseDown={(e) => handleMouseDown(e, 'left-edge')}
        />
        <div
            className="absolute pointer-events-auto cursor-ew-resize z-20"
            style={{ left: endX - halfHandleSize, top: Math.min(profitY, stopY), width: handleSize, height: Math.abs(profitY - stopY) }}
            onMouseDown={(e) => handleMouseDown(e, 'right-edge')}
        />
        <div
            className="absolute pointer-events-auto cursor-ns-resize z-20 rounded-full border bg-background"
            style={{ left: entryX + boxWidth / 2 - halfHandleSize, top: entryY - halfHandleSize, width: handleSize, height: handleSize }}
            onMouseDown={(e) => handleMouseDown(e, 'entry')}
        />
        <div
            className="absolute pointer-events-auto cursor-ns-resize z-20 rounded-full border bg-background"
            style={{ left: entryX + boxWidth / 2 - halfHandleSize, top: stopY - halfHandleSize, width: handleSize, height: handleSize }}
            onMouseDown={(e) => handleMouseDown(e, 'stop')}
        />
        <div
            className="absolute pointer-events-auto cursor-ns-resize z-20 rounded-full border bg-background"
            style={{ left: entryX + boxWidth / 2 - halfHandleSize, top: profitY - halfHandleSize, width: handleSize, height: handleSize }}
            onMouseDown={(e) => handleMouseDown(e, 'profit')}
        />


      {/* Remove button */}
       <button
            onClick={() => onRemove(tool.id)}
            onMouseDown={(e) => e.stopPropagation()}
            className="absolute pointer-events-auto bg-destructive text-destructive-foreground rounded-full p-0.5 z-30 cursor-pointer"
            style={{
                left: endX + 5,
                top: entryY - 8,
            }}
        >
            <X className="h-3 w-3" />
        </button>

        {/* Info Box */}
        <div className="absolute pointer-events-none text-xs bg-background/70 p-1 rounded"
             style={{ left: entryX + 5, top: isLong ? profitTop + 5 : stopTop + 5 }}
        >
          <div>Risk/Reward Ratio: {riskRewardRatio}</div>
        </div>
    </div>
  );
}

    