
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import type { PriceMarker as PriceMarkerType, ChartApi } from '@/types';
import { X } from 'lucide-react';

interface PriceMarkerProps {
  marker: PriceMarkerType;
  chartApi: ChartApi;
  onUpdate: (id: string, price: number) => void;
  onRemove: (id: string) => void;
}

export function PriceMarker({ marker, chartApi, onUpdate, onRemove }: PriceMarkerProps) {
  const [position, setPosition] = useState<{ x: number, y: number | undefined }>({ x: 0, y: undefined });
  const [isDragging, setIsDragging] = useState(false);
  const dragInfo = useRef({ startY: 0, startPrice: 0 });

  const updatePosition = useCallback(() => {
    if (!chartApi.chart) return;
    const y = chartApi.priceToCoordinate?.(marker.price);
    const timeScale = chartApi.chart.timeScale();
    const x = timeScale.width() - 50; // Pin to the right side for now
    setPosition({ x, y });
  }, [chartApi, marker.price]);

  useEffect(() => {
    updatePosition();
    const chart = chartApi.chart;
    if (chart) {
      const timeScale = chart.timeScale();
      timeScale.subscribeVisibleTimeRangeChange(updatePosition);
      return () => timeScale.unsubscribeVisibleTimeRangeChange(updatePosition);
    }
  }, [chartApi, updatePosition]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!marker.isDeletable) return;
    setIsDragging(true);
    dragInfo.current = { startY: e.clientY, startPrice: marker.price };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || !chartApi.coordinateToPrice) return;
    const currentY = position.y;
    if(currentY === undefined) return;

    const dy = e.clientY - dragInfo.current.startY;
    const newPrice = chartApi.coordinateToPrice(currentY + dy);
    if(newPrice !== null) {
      onUpdate(marker.id, newPrice);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  };

  if (position.y === undefined) {
    return null;
  }
  
  return (
    <div
      className="absolute flex items-center h-px bg-yellow-500 border-t-2 border-dashed border-yellow-500"
      style={{
        top: position.y,
        left: 0,
        width: '100%',
      }}
    >
      <div 
        className="absolute bg-background p-1 rounded-md text-xs cursor-ns-resize"
        style={{ left: position.x }}
        onMouseDown={handleMouseDown}
      >
        <span>{marker.price.toFixed(5)}</span>
        {marker.isDeletable && (
          <button
            onClick={() => onRemove(marker.id)}
            className="ml-2 text-destructive"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
