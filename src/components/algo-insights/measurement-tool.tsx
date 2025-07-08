
"use client";

import React from 'react';
import type { MeasurementTool as MeasurementToolType, PriceData } from '@/types';

interface MeasurementToolProps {
  tool: MeasurementToolType;
  onRemove: (id: string) => void;
  data: PriceData[];
  xScale: ((date: number) => number);
  yScale: ((price: number) => number);
  plot: { width: number; height: number; top: number; left: number };
  pipValue: number;
}

export function MeasurementTool({ tool, onRemove, data, xScale, yScale, plot, pipValue }: MeasurementToolProps) {
  
  const startDate = data[tool.startPoint.index]?.date;
  const endDate = data[tool.endPoint.index]?.date;

  if (!startDate || !endDate) return null;

  const startX = xScale(startDate.getTime());
  const startY = yScale(tool.startPoint.price);
  const endX = xScale(endDate.getTime());
  const endY = yScale(tool.endPoint.price);
  
  if (isNaN(startX) || isNaN(startY) || isNaN(endX) || isNaN(endY)) {
      return null;
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onRemove(tool.id);
  };
  
  const priceDiff = Math.abs(tool.endPoint.price - tool.startPoint.price);
  const pips = pipValue > 0 ? (priceDiff / pipValue).toFixed(1) : 0;
  const barDiff = Math.abs(tool.endPoint.index - tool.startPoint.index);

  const labelText = `${pips} pips, ${barDiff} bars`;
  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;

  return (
    <g onContextMenu={handleContextMenu}>
       {/* Invisible hitbox for easier interaction */}
       <line
        x1={startX}
        y1={startY}
        x2={endX}
        y2={endY}
        stroke="transparent"
        strokeWidth={10}
        style={{ cursor: 'pointer' }}
      />
      <line
        x1={startX}
        y1={startY}
        x2={endX}
        y2={endY}
        stroke="hsl(var(--foreground))"
        strokeWidth={1.5}
        strokeDasharray="4 4"
        style={{ pointerEvents: 'none' }}
      />
      <g transform={`translate(${midX}, ${midY - 10})`}>
        <text 
            textAnchor="middle" 
            alignmentBaseline="middle"
            fill="hsl(var(--foreground))"
            fontSize="12"
            style={{ 
                paintOrder: 'stroke',
                stroke: 'hsl(var(--background))',
                strokeWidth: '3px',
                strokeLinecap: 'butt',
                strokeLinejoin: 'miter'
            }}
        >
            {labelText}
        </text>
      </g>
    </g>
  );
}
