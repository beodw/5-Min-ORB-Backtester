"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { RiskRewardTool as RRToolType, PriceData } from '@/types';

interface RiskRewardToolProps {
  tool: RRToolType;
  setTool: (tool: RRToolType | null) => void;
  data: PriceData[];
  chartContainer: HTMLDivElement;
}

const X_AXIS_MARGIN_LEFT = 60;
const X_AXIS_MARGIN_RIGHT = 20;
const Y_AXIS_MARGIN_TOP = 5;
const Y_AXIS_MARGIN_BOTTOM = 20;

export function RiskRewardTool({ tool, setTool, data, chartContainer }: RiskRewardToolProps) {
  const [dragState, setDragState] = useState({
    active: false,
    type: 'none', // 'body', 'top', 'bottom'
    initialY: 0,
    initialEntryPrice: 0,
    initialStopLoss: 0,
    initialTakeProfit: 0,
  });

  const {
    containerWidth,
    containerHeight,
    plotWidth,
    plotHeight,
    minPrice,
    maxPrice,
    priceRange,
    pointsCount,
  } = useMemo(() => {
    const { width, height } = chartContainer.getBoundingClientRect();
    const pWidth = width - X_AXIS_MARGIN_LEFT - X_AXIS_MARGIN_RIGHT;
    const pHeight = height - Y_AXIS_MARGIN_TOP - Y_AXIS_MARGIN_BOTTOM;
    const prices = data.map(d => d.price);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    
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
      
      const deltaY = e.clientY - dragState.initialY;
      const priceDelta = (deltaY / plotHeight) * priceRange * -1;

      if (dragState.type === 'body') {
        setTool({
          ...tool,
          entryPrice: dragState.initialEntryPrice + priceDelta,
          stopLoss: dragState.initialStopLoss + priceDelta,
          takeProfit: dragState.initialTakeProfit + priceDelta,
        });
      } else if (dragState.type === 'top') {
        setTool({
          ...tool,
          takeProfit: Math.max(tool.entryPrice, yToPrice(e.clientY - chartContainer.getBoundingClientRect().top)),
        });
      } else if (dragState.type === 'bottom') {
        setTool({
          ...tool,
          stopLoss: Math.min(tool.entryPrice, yToPrice(e.clientY - chartContainer.getBoundingClientRect().top)),
        });
      }
    };

    const handleMouseUp = () => {
      setDragState({ ...dragState, active: false });
    };

    if (dragState.active) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, tool, setTool, yToPrice, plotHeight, priceRange, chartContainer]);


  const handleMouseDown = (e: React.MouseEvent, type: string) => {
    e.stopPropagation();
    setDragState({
      active: true,
      type: type,
      initialY: e.clientY,
      initialEntryPrice: tool.entryPrice,
      initialStopLoss: tool.stopLoss,
      initialTakeProfit: tool.takeProfit,
    });
  };

  const { entryY, topY, bottomY, leftX, widthX } = useMemo(() => {
    const entry = priceToY(tool.entryPrice);
    const top = priceToY(tool.takeProfit);
    const bottom = priceToY(tool.stopLoss);
    const left = indexToX(tool.entryIndex);
    const right = indexToX(tool.entryIndex + tool.widthInPoints);
    return { entryY: entry, topY: top, bottomY: bottom, leftX: left, widthX: right - left };
  }, [tool, priceToY, indexToX]);

  const rrRatio = (tool.takeProfit - tool.entryPrice) / (tool.entryPrice - tool.stopLoss);

  return (
    <div
      className="absolute top-0 left-0 pointer-events-none"
      style={{ width: containerWidth, height: containerHeight }}
    >
      <div 
        className="absolute"
        style={{
            transform: `translate(${leftX}px, ${topY}px)`,
            width: widthX,
            height: entryY - topY,
        }}
      >
        {/* Profit Zone */}
        <div 
            className="w-full h-full bg-green-500/20 border-t-2 border-x-2 border-dashed border-green-500/80"
        />
        <div
            onMouseDown={(e) => handleMouseDown(e, 'top')} 
            className="absolute -top-1 left-0 w-full h-2 cursor-ns-resize pointer-events-auto"
        />
      </div>

      <div
        className="absolute"
        style={{
            transform: `translate(${leftX}px, ${entryY}px)`,
            width: widthX,
            height: bottomY - entryY,
        }}
      >
        {/* Loss Zone */}
        <div
            className="w-full h-full bg-red-500/20 border-b-2 border-x-2 border-dashed border-red-500/80"
        />
         <div
            onMouseDown={(e) => handleMouseDown(e, 'bottom')} 
            className="absolute -bottom-1 left-0 w-full h-2 cursor-ns-resize pointer-events-auto"
        />
      </div>
      
       <div
        onMouseDown={(e) => handleMouseDown(e, 'body')}
        className="absolute flex flex-col items-center justify-center text-xs text-white p-1 rounded bg-black/50 pointer-events-auto cursor-move"
        style={{
          transform: `translate(${leftX + widthX / 2 - 25}px, ${entryY - 15}px)`,
          minWidth: '50px',
        }}
       >
        <div>{rrRatio.toFixed(2)}</div>
        <div className="text-white/70">Risk/Reward</div>
       </div>

    </div>
  );
}
