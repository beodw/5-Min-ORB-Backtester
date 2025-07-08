
"use client";

import React, { useState } from 'react';
import type { RiskRewardTool as RRToolType, PriceData } from '@/types';

interface RiskRewardToolProps {
  tool: RRToolType;
  onRemove: (id: string) => void;
  data: PriceData[];
  xScale: (date: number) => number;
  yScale: (price: number) => number;
}

export function RiskRewardTool({ tool, onRemove, data, xScale, yScale }: RiskRewardToolProps) {
  const [isHovered, setIsHovered] = useState(false);

  const entryDate = data[tool.entryIndex]?.date.getTime();
  const endDate = data[Math.min(data.length - 1, tool.entryIndex + tool.widthInPoints)]?.date.getTime();

  if (!entryDate || !endDate) {
    return null;
  }

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
  const profitZoneHeight = tool.position === 'long' ? Math.abs(entryY - profitY) : Math.abs(stopY - entryY);
  const lossZoneY = tool.position === 'long' ? entryY : stopY;
  const lossZoneHeight = tool.position === 'long' ? Math.abs(stopY - entryY) : Math.abs(entryY - profitY);
  
  const rrRatio = tool.entryPrice - tool.stopLoss !== 0 ? Math.abs((tool.takeProfit - tool.entryPrice) / (tool.entryPrice - tool.stopLoss)) : Infinity;

  return (
    <g 
      onMouseEnter={() => setIsHovered(true)} 
      onMouseLeave={() => setIsHovered(false)}
      style={{ pointerEvents: 'all' }}
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
      
      {/* Delete Button */}
      {isHovered && (
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
