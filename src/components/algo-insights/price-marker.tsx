
"use client";

import React, { useState } from 'react';
import type { PriceMarker as PriceMarkerType } from '@/types';

interface PriceMarkerProps {
  marker: PriceMarkerType;
  onRemove: (id: string) => void;
  yScale: (price: number) => number;
  plot: { width: number; height: number; top: number; left: number };
}

export function PriceMarker({ marker, onRemove, yScale, plot }: PriceMarkerProps) {
  const [isHovered, setIsHovered] = useState(false);
  const yPosition = yScale(marker.price);

  if (isNaN(yPosition) || yPosition < plot.top || yPosition > plot.top + plot.height) {
    return null;
  }

  const isDeletable = marker.isDeletable !== false;
  const labelText = `${marker.label ? `${marker.label}: ` : ''}${marker.price.toFixed(2)}`;
  const labelWidth = labelText.length * 6.5 + 8; // A reasonable estimate for width

  return (
    <g
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ pointerEvents: 'all' }}
    >
      <line
        x1={plot.left}
        y1={yPosition}
        x2={plot.left + plot.width}
        y2={yPosition}
        stroke="hsl(var(--primary))"
        strokeWidth={1}
        strokeDasharray="4 4"
        style={{ pointerEvents: 'none' }}
      />
      <g transform={`translate(${plot.left + plot.width + 4}, ${yPosition})`}>
        <rect
          x={0}
          y={-9}
          width={labelWidth}
          height={18}
          fill="hsl(var(--card))"
          stroke="hsl(var(--border))"
          rx="3"
        />
        <text
          x={4}
          y={0}
          alignmentBaseline="middle"
          fontSize="12"
          fill="hsl(var(--primary))"
          style={{ pointerEvents: 'none' }}
        >
          {labelText}
        </text>
      </g>
      {isHovered && isDeletable && (
        <g 
            transform={`translate(${plot.left + plot.width + 4 + labelWidth + 12}, ${yPosition})`}
            onClick={() => onRemove(marker.id)}
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
