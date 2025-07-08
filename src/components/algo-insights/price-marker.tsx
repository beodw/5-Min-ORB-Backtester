
"use client";

import React from 'react';
import type { PriceMarker as PriceMarkerType } from '@/types';

interface PriceMarkerProps {
  marker: PriceMarkerType;
  onRemove: (id: string) => void;
  yScale: (price: number) => number;
  plot: { width: number; height: number; top: number; left: number };
}

export function PriceMarker({ marker, onRemove, yScale, plot }: PriceMarkerProps) {
  const yPosition = yScale(marker.price);

  if (isNaN(yPosition) || yPosition < plot.top || yPosition > plot.top + plot.height) {
    return null;
  }

  const isDeletable = marker.isDeletable !== false;
  const labelText = `${marker.label ? `${marker.label}: ` : ''}${marker.price.toFixed(2)}`;
  const labelWidth = labelText.length * 6.5 + 8; // A reasonable estimate for width

  const handleContextMenu = (e: React.MouseEvent) => {
    if (isDeletable) {
      e.preventDefault();
      e.stopPropagation();
      onRemove(marker.id);
    }
  };

  return (
    <g
      onContextMenu={handleContextMenu}
      style={{ cursor: isDeletable ? 'pointer' : 'default', pointerEvents: 'all' }}
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
      {/* Invisible hitbox for easier clicking */}
       <line
        x1={plot.left}
        y1={yPosition}
        x2={plot.left + plot.width}
        y2={yPosition}
        stroke="transparent"
        strokeWidth={10}
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
    </g>
  );
}
