
"use client";

import React, { useState, useMemo, useCallback } from 'react';
import type { PriceMarker as PriceMarkerType } from '@/types';
import { X } from 'lucide-react';

interface PriceMarkerProps {
  marker: PriceMarkerType;
  onRemove: (id: string) => void;
  chartContainer: HTMLDivElement;
  yDomain: [number, number];
}

const Y_AXIS_MARGIN_TOP = 10;
const Y_AXIS_MARGIN_BOTTOM = 20;
const X_AXIS_MARGIN_LEFT = 0;
const X_AXIS_MARGIN_RIGHT = 60; // Space for the Y-axis and labels

export function PriceMarker({ marker, onRemove, chartContainer, yDomain }: PriceMarkerProps) {
  const [isHovered, setIsHovered] = useState(false);

  const {
    containerHeight,
    plotHeight,
    plotWidth,
  } = useMemo(() => {
    if (!chartContainer) return { containerHeight: 0, plotHeight: 0, plotWidth: 0 };
    const { height, width } = chartContainer.getBoundingClientRect();
    const pHeight = height - Y_AXIS_MARGIN_TOP - Y_AXIS_MARGIN_BOTTOM;
    const pWidth = width - X_AXIS_MARGIN_LEFT - X_AXIS_MARGIN_RIGHT;
    return { containerHeight: height, plotHeight: pHeight, plotWidth: pWidth };
  }, [chartContainer]);

  const [minPrice, maxPrice] = yDomain;
  const priceRange = maxPrice - minPrice;

  const priceToY = useCallback((price: number) => {
    if (priceRange <= 0) return Y_AXIS_MARGIN_TOP + plotHeight / 2;
    return Y_AXIS_MARGIN_TOP + ((maxPrice - price) / priceRange) * plotHeight;
  }, [maxPrice, plotHeight, priceRange]);

  if (plotHeight <= 0 || priceRange <= 0) {
    return null;
  }
  
  const yPosition = priceToY(marker.price);
  
  if (yPosition < 0 || yPosition > containerHeight) {
    return null;
  }

  return (
    <div
      className="absolute left-0 w-full group"
      style={{ top: yPosition - 8, height: '16px', pointerEvents: 'auto' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div 
        className="h-px border-t border-dashed border-ring absolute top-1/2 -translate-y-1/2" 
        style={{ left: X_AXIS_MARGIN_LEFT, width: plotWidth }}
      />
      <div 
        className="absolute top-1/2 -translate-y-1/2 bg-card px-1.5 py-0.5 rounded text-xs text-ring pointer-events-none"
        style={{ left: plotWidth + 8 }}
      >
        {marker.price.toFixed(2)}
      </div>
      {isHovered && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(marker.id); }}
          className="absolute top-1/2 -translate-y-1/2 bg-card rounded-full p-0.5 text-foreground z-10"
          style={{ left: plotWidth + 48 }}
        >
          <X size={12}/>
        </button>
      )}
    </div>
  );
}
