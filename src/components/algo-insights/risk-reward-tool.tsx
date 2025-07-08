
"use client";

import React, { useState } from 'react';
import type { RiskRewardTool as RRToolType, PriceData } from '@/types';

interface RiskRewardToolProps {
  tool: RRToolType;
  onUpdateTool: (tool: RRToolType) => void;
  onRemove: (id: string) => void;
  data: PriceData[];
  xScale: ((date: number) => number) & { invert?: (x: number) => number };
  yScale: ((price: number) => number) & { invert?: (y: number) => number };
  plot: { width: number; height: number; top: number; left: number };
  svgBounds: DOMRect;
}

const findClosestIndex = (data: PriceData[], timestamp: number) => {
    if (!data || data.length === 0) return 0;
    return data.reduce((prev, curr, index) => {
        const prevDiff = Math.abs(data[prev].date.getTime() - timestamp);
        const currDiff = Math.abs(curr.date.getTime() - timestamp);
        return currDiff < prevDiff ? index : prev;
    }, 0);
};

export function RiskRewardTool({ tool, onUpdateTool, onRemove, data, xScale, yScale, plot, svgBounds }: RiskRewardToolProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState<null | 'entry' | 'stop' | 'profit' | 'width'>(null);

  const handleMouseDown = (e: React.MouseEvent, part: 'entry' | 'stop' | 'profit' | 'width') => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(part);

    const startToolState = { ...tool };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();

      if (!yScale.invert || !xScale.invert) return;

      let newTool = { ...tool };

      if (part === 'entry') {
        const mouseXInSvg = moveEvent.clientX - svgBounds.left;
        const mouseYInSvg = moveEvent.clientY - svgBounds.top;
        const mouseXInPlot = mouseXInSvg - plot.left;
        const mouseYInPlot = mouseYInSvg - plot.top;
        
        const newEntryPrice = yScale.invert(mouseYInPlot);
        const newTimestamp = xScale.invert(mouseXInPlot);
        
        if (newEntryPrice === undefined || newTimestamp === undefined) return;

        const stopOffset = startToolState.entryPrice - startToolState.stopLoss;
        const profitOffset = startToolState.takeProfit - startToolState.entryPrice;
        
        newTool.entryPrice = newEntryPrice;
        newTool.stopLoss = newEntryPrice - stopOffset;
        newTool.takeProfit = newEntryPrice + profitOffset;
        newTool.entryIndex = findClosestIndex(data, newTimestamp);

      } else if (part === 'stop') {
        const mouseYInSvg = moveEvent.clientY - svgBounds.top;
        const newPrice = yScale.invert(mouseYInSvg);
        if (newPrice !== undefined) newTool.stopLoss = newPrice;
      
      } else if (part === 'profit') {
        const mouseYInSvg = moveEvent.clientY - svgBounds.top;
        const newPrice = yScale.invert(mouseYInSvg);
        if (newPrice !== undefined) newTool.takeProfit = newPrice;
      
      } else if (part === 'width') {
        const mouseXInSvg = moveEvent.clientX - svgBounds.left;
        const mouseXInPlot = mouseXInSvg - plot.left;
        const newTimestamp = xScale.invert(mouseXInPlot);
        
        if (newTimestamp !== undefined) {
          const entryTimestamp = data[tool.entryIndex]?.date.getTime();
          if (entryTimestamp) {
              const candleInterval = data.length > 1 ? data[1].date.getTime() - data[0].date.getTime() : 60000;
              const newWidthInPoints = Math.round((newTimestamp - entryTimestamp) / candleInterval);

              if (newWidthInPoints >= 5) {
                newTool.widthInPoints = newWidthInPoints;
              }
          }
        }
      }
      
      onUpdateTool(newTool);
    };

    const handleMouseUp = () => {
      setIsDragging(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const entryDate = data[tool.entryIndex]?.date.getTime();

  if (!entryDate || !data || data.length === 0) {
    return null;
  }
  
  const interval = data.length > 1 ? data[1].date.getTime() - data[0].date.getTime() : 60000;
  const endDate = entryDate + tool.widthInPoints * interval;


  const leftX = xScale(entryDate);
  const rightX = xScale(endDate);
  const width = rightX - leftX;

  const entryY = yScale(tool.entryPrice);
  const profitY = yScale(tool.takeProfit);
  const stopY = yScale(tool.stopLoss);
  
  if (isNaN(leftX) || isNaN(rightX) || isNaN(entryY) || isNaN(profitY) || isNaN(stopY)) {
      return null;
  }

  const profitZoneY = tool.position === 'long' ? profitY : entryY;
  const profitZoneHeight = Math.abs(entryY - profitY);
  const lossZoneY = tool.position === 'long' ? entryY : stopY;
  const lossZoneHeight = Math.abs(stopY - entryY);
  
  const rrRatio = tool.entryPrice - tool.stopLoss !== 0 ? Math.abs((tool.takeProfit - tool.entryPrice) / (tool.entryPrice - tool.stopLoss)) : Infinity;

  const getCursor = () => {
    if (isDragging === 'stop' || isDragging === 'profit') return 'ns-resize';
    if (isDragging === 'width') return 'ew-resize';
    if (isDragging === 'entry') return 'move';
    if (isHovered) return 'pointer';
    return 'default';
  };

  return (
    <g 
      onMouseEnter={() => setIsHovered(true)} 
      onMouseLeave={() => setIsHovered(false)}
      style={{ cursor: getCursor(), pointerEvents: 'all' }}
    >
      {/* Profit Zone */}
      <rect
        x={leftX}
        y={profitZoneY}
        width={width}
        height={profitZoneHeight}
        fill="hsla(120, 100%, 50%, 0.15)"
        stroke="hsla(120, 100%, 50%, 0.7)"
        strokeDasharray="3 3"
        style={{ pointerEvents: 'none' }}
      />
      {/* Loss Zone */}
      <rect
        x={leftX}
        y={lossZoneY}
        width={width}
        height={lossZoneHeight}
        fill="hsla(0, 84.2%, 60.2%, 0.15)"
        stroke="hsla(0, 84.2%, 60.2%, 0.7)"
        strokeDasharray="3 3"
        style={{ pointerEvents: 'none' }}
      />
      
      {/* Label Group */}
      <g transform={`translate(${leftX + width / 2}, ${entryY})`}>
          <rect x={-40} y={-15} width={80} height={30} fill="hsla(0, 0%, 10%, 0.6)" rx="3" />
          <text textAnchor="middle" x="0" y="-3" fill="white" fontSize="10">RR: {isFinite(rrRatio) ? rrRatio.toFixed(2) : '∞'}</text>
          <text textAnchor="middle" x="0" y="10" fill="white" fontSize="10" style={{textTransform: 'capitalize'}}>{tool.position}</text>
      </g>
      
      {/* Interactive Hitboxes */}
      {/* Entry Drag Hitbox */}
      <rect
          x={leftX}
          y={entryY - 5}
          width={width}
          height={10}
          fill="transparent"
          style={{ cursor: 'move' }}
          onMouseDown={(e) => handleMouseDown(e, 'entry')}
      />
      {/* Stop Drag Hitbox */}
      <rect
          x={leftX}
          y={stopY - 5}
          width={width}
          height={10}
          fill="transparent"
          style={{ cursor: 'ns-resize' }}
          onMouseDown={(e) => handleMouseDown(e, 'stop')}
      />
      {/* Profit Drag Hitbox */}
      <rect
          x={leftX}
          y={profitY - 5}
          width={width}
          height={10}
          fill="transparent"
          style={{ cursor: 'ns-resize' }}
          onMouseDown={(e) => handleMouseDown(e, 'profit')}
      />
      {/* Width Drag Hitbox */}
       <rect
          x={rightX - 5}
          y={Math.min(profitY, stopY)}
          width={10}
          height={Math.abs(profitY - stopY)}
          fill="transparent"
          style={{ cursor: 'ew-resize' }}
          onMouseDown={(e) => handleMouseDown(e, 'width')}
      />


      {/* Delete Button */}
      {isHovered && !isDragging && (
        <g 
            transform={`translate(${leftX + width / 2}, ${entryY - 25})`}
            onClick={() => onRemove(tool.id)}
            style={{ cursor: 'pointer' }}
        >
          <circle r={8} fill="hsl(var(--card))" stroke="hsl(var(--border))" />
          <line x1={-3} y1={-3} x2={3} y2={3} stroke="hsl(var(--muted-foreground))" strokeWidth="1.5"/>
          <line x1={-3} y1={3} x2={3} y2={-3} stroke="hsl(var(--muted-foreground))" strokeWidth="1.5"/>
        </g>
      )}
    </g>
  );
}
