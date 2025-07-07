
"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { RiskRewardTool as RRToolType, PriceData } from '@/types';
import { X } from 'lucide-react';

interface RiskRewardToolProps {
  tool: RRToolType;
  onUpdate: (updatedTool: RRToolType) => void;
  onRemove: (id: string) => void;
  data: PriceData[];
  chartContainer: HTMLDivElement;
}

const X_AXIS_MARGIN_LEFT = 60;
const X_AXIS_MARGIN_RIGHT = 20;
const Y_AXIS_MARGIN_TOP = 5;
const Y_AXIS_MARGIN_BOTTOM = 20;

export function RiskRewardTool({ tool, onUpdate, onRemove, data, chartContainer }: RiskRewardToolProps) {
  const [dragState, setDragState] = useState({
    active: false,
    type: 'none', // 'body', 'top', 'bottom', 'left', 'right'
    initialY: 0,
    initialX: 0,
    initialEntryPrice: 0,
    initialStopLoss: 0,
    initialTakeProfit: 0,
    initialWidthInPoints: 0,
    initialEntryIndex: 0,
  });

  const {
    containerWidth,
    containerHeight,
    plotWidth,
    plotHeight,
    maxPrice,
    priceRange,
    pointsCount,
  } = useMemo(() => {
    const { width, height } = chartContainer.getBoundingClientRect();
    const pWidth = width - X_AXIS_MARGIN_LEFT - X_AXIS_MARGIN_RIGHT;
    const pHeight = height - Y_AXIS_MARGIN_TOP - Y_AXIS_MARGIN_BOTTOM;
    const minP = Math.min(...data.map(d => d.low));
    const maxP = Math.max(...data.map(d => d.high));
    
    return {
      containerWidth: width,
      containerHeight: height,
      plotWidth: pWidth,
      plotHeight: pHeight,
      minPrice: minP,
      maxPrice: maxP,
      priceRange: maxP - minP,
      pointsCount: data.length,
    };
  }, [chartContainer, data]);

  const yToPrice = useCallback((y: number) => {
    return maxPrice - ((y - Y_AXIS_MARGIN_TOP) / plotHeight) * priceRange;
  }, [maxPrice, plotHeight, priceRange]);

  const priceToY = useCallback((price: number) => {
    if (priceRange === 0) return Y_AXIS_MARGIN_TOP + plotHeight / 2;
    return Y_AXIS_MARGIN_TOP + ((maxPrice - price) / priceRange) * plotHeight;
  }, [maxPrice, plotHeight, priceRange]);

  const indexToX = useCallback((index: number) => {
    return X_AXIS_MARGIN_LEFT + (index / (pointsCount - 1)) * plotWidth;
  }, [plotWidth, pointsCount]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragState.active) return;
      
      const chartRect = chartContainer.getBoundingClientRect();

      // Vertical drag logic
      const deltaY = e.clientY - dragState.initialY;
      const priceDelta = (deltaY / plotHeight) * priceRange * -1;
      
      // Horizontal drag logic
      const deltaX = e.clientX - dragState.initialX;
      const indexPerPixel = plotWidth > 0 ? (pointsCount - 1) / plotWidth : 0;
      const indexDelta = deltaX * indexPerPixel;

      switch (dragState.type) {
        case 'body':
          onUpdate({
            ...tool,
            entryPrice: dragState.initialEntryPrice + priceDelta,
            stopLoss: dragState.initialStopLoss + priceDelta,
            takeProfit: dragState.initialTakeProfit + priceDelta,
          });
          break;
        case 'top': {
          const newPrice = yToPrice(e.clientY - chartRect.top);
          if (tool.position === 'long') {
            onUpdate({ ...tool, takeProfit: Math.max(tool.entryPrice, newPrice) });
          } else { // short
            onUpdate({ ...tool, stopLoss: Math.max(tool.entryPrice, newPrice) });
          }
          break;
        }
        case 'bottom': {
          const newPrice = yToPrice(e.clientY - chartRect.top);
          if (tool.position === 'long') {
            onUpdate({ ...tool, stopLoss: Math.min(tool.entryPrice, newPrice) });
          } else { // short
            onUpdate({ ...tool, takeProfit: Math.min(tool.entryPrice, newPrice) });
          }
          break;
        }
        case 'right': {
            const newWidth = Math.max(1, Math.round(dragState.initialWidthInPoints + indexDelta));
            onUpdate({
                ...tool,
                widthInPoints: newWidth,
            });
            break;
        }
        case 'left': {
            const rightEdgeIndex = dragState.initialEntryIndex + dragState.initialWidthInPoints;
            let newEntryIndex = Math.round(dragState.initialEntryIndex + indexDelta);
            newEntryIndex = Math.min(newEntryIndex, rightEdgeIndex - 1);
            newEntryIndex = Math.max(0, newEntryIndex);
            
            const newWidth = rightEdgeIndex - newEntryIndex;

            onUpdate({
                ...tool,
                entryIndex: newEntryIndex,
                widthInPoints: newWidth,
            });
            break;
        }
      }
    };

    const handleMouseUp = () => {
      setDragState((prev) => ({ ...prev, active: false, type: 'none' }));
    };

    if (dragState.active) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, tool, onUpdate, yToPrice, plotHeight, priceRange, chartContainer, plotWidth, pointsCount]);


  const handleMouseDown = (e: React.MouseEvent, type: string) => {
    e.stopPropagation();
    setDragState({
      active: true,
      type: type,
      initialY: e.clientY,
      initialX: e.clientX,
      initialEntryPrice: tool.entryPrice,
      initialStopLoss: tool.stopLoss,
      initialTakeProfit: tool.takeProfit,
      initialWidthInPoints: tool.widthInPoints,
      initialEntryIndex: tool.entryIndex,
    });
  };

  const { entryY, topY, bottomY, leftX, widthX, topHandleY, bottomHandleY } = useMemo(() => {
    const entry = priceToY(tool.entryPrice);
    const stop = priceToY(tool.stopLoss);
    const profit = priceToY(tool.takeProfit);
    const left = indexToX(tool.entryIndex);
    const right = indexToX(Math.min(data.length - 1, tool.entryIndex + tool.widthInPoints));
    
    return { 
      entryY: entry, 
      topY: tool.position === 'long' ? profit : stop,
      bottomY: tool.position === 'long' ? stop : profit,
      leftX: left, 
      widthX: Math.max(0, right - left),
      topHandleY: Math.min(profit, stop),
      bottomHandleY: Math.max(profit, stop),
    };
  }, [tool, priceToY, indexToX, data.length]);

  const rrRatio = tool.entryPrice - tool.stopLoss !== 0 ? Math.abs((tool.takeProfit - tool.entryPrice) / (tool.entryPrice - tool.stopLoss)) : Infinity;

  const profitZoneY = tool.position === 'long' ? topY : entryY;
  const profitZoneHeight = tool.position === 'long' ? entryY - topY : bottomY - entryY;
  const lossZoneY = tool.position === 'long' ? entryY : topY;
  const lossZoneHeight = tool.position === 'long' ? bottomY - entryY : entryY - topY;

  return (
    <div
      className="absolute top-0 left-0 pointer-events-none"
      style={{ width: containerWidth, height: containerHeight }}
    >
      {/* Profit Zone */}
      <div
        onMouseDown={(e) => handleMouseDown(e, 'body')}
        className="absolute pointer-events-auto cursor-move"
        style={{
          transform: `translate(${leftX}px, ${profitZoneY}px)`,
          width: widthX,
          height: Math.max(0, profitZoneHeight),
          backgroundColor: 'hsla(120, 100%, 50%, 0.15)', // accent color
          border: '1px dashed hsla(120, 100%, 50%, 0.7)',
        }}
      />
      {/* Loss Zone */}
      <div
        onMouseDown={(e) => handleMouseDown(e, 'body')}
        className="absolute pointer-events-auto cursor-move"
        style={{
          transform: `translate(${leftX}px, ${lossZoneY}px)`,
          width: widthX,
          height: Math.max(0, lossZoneHeight),
          backgroundColor: 'hsla(0, 84.2%, 60.2%, 0.15)', // destructive color
          border: '1px dashed hsla(0, 84.2%, 60.2%, 0.7)',
        }}
      />
      
      {/* Top Handle */}
      <div
        onMouseDown={(e) => handleMouseDown(e, 'top')} 
        className="absolute w-full h-2 cursor-ns-resize pointer-events-auto"
        style={{ transform: `translate(0, ${topHandleY - 1}px)`}}
      />

      {/* Bottom Handle */}
      <div
        onMouseDown={(e) => handleMouseDown(e, 'bottom')} 
        className="absolute w-full h-2 cursor-ns-resize pointer-events-auto"
        style={{ transform: `translate(0, ${bottomHandleY - 1}px)`}}
      />

      {/* Left Handle */}
      <div
        onMouseDown={(e) => handleMouseDown(e, 'left')} 
        className="absolute h-full w-2 cursor-col-resize pointer-events-auto"
        style={{ 
          transform: `translate(${leftX - 1}px, ${topHandleY}px)`,
          height: Math.max(0, bottomHandleY - topHandleY)
        }}
      />
      
      {/* Right Handle */}
      <div
        onMouseDown={(e) => handleMouseDown(e, 'right')} 
        className="absolute h-full w-2 cursor-col-resize pointer-events-auto"
        style={{
          transform: `translate(${leftX + widthX - 1}px, ${topHandleY}px)`,
          height: Math.max(0, bottomHandleY - topHandleY)
        }}
      />
      
       <div
        onMouseDown={(e) => handleMouseDown(e, 'body')}
        className="absolute flex flex-col items-center justify-center text-xs text-white p-1 rounded bg-black/50 pointer-events-auto cursor-move group"
        style={{
          transform: `translate(${leftX + widthX / 2 - 35}px, ${entryY - 20}px)`,
          minWidth: '70px',
        }}
       >
        <div>RR: {isFinite(rrRatio) ? rrRatio.toFixed(2) : '∞'}</div>
        <div className="text-white/70 capitalize">{tool.position}</div>
         <button
            onClick={(e) => { e.stopPropagation(); onRemove(tool.id); }}
            className="absolute -top-2 -right-2 bg-card rounded-full p-0.5 text-foreground opacity-0 group-hover:opacity-100 pointer-events-auto z-10"
         >
           <X size={12}/>
         </button>
       </div>

    </div>
  );
}
