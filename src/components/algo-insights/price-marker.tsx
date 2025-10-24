
"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { PriceMarker as PriceMarkerType, ChartApi } from '@/types';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PriceMarkerProps {
  marker: PriceMarkerType;
  chartApi: ChartApi;
  onUpdate: (id: string, price: number) => void;
  onRemove: (id:string) => void;
}

export function PriceMarker({ marker, chartApi, onUpdate, onRemove }: PriceMarkerProps) {
  const [position, setPosition] = useState<{ x: number | undefined, y: number | undefined }>({ x: undefined, y: undefined });
  const [isDragging, setIsDragging] = useState(false);
  const dragInfo = useRef({ startY: 0, startPrice: 0 });

  const updatePosition = useCallback(() => {
    if (!chartApi.chart) return;
    const y = chartApi.priceToCoordinate?.(marker.price);
    const timeScale = chartApi.chart.timeScale();
    const x = Math.max(0, timeScale.width() - 150); // Position the label handle, prevent negative values
    setPosition({ x, y });
  }, [chartApi, marker.price]);

  useEffect(() => {
    updatePosition();
    const chart = chartApi.chart;
    if (chart) {
      const timeScale = chart.timeScale();
      const priceScale = chart.priceScale('right');
      
      const subscriber = () => updatePosition();
      
      timeScale.subscribeVisibleLogicalRangeChange(subscriber);
      priceScale.subscribeOptionsChanged(subscriber);

      return () => {
        timeScale.unsubscribeVisibleLogicalRangeChange(subscriber);
        priceScale.unsubscribeOptionsChanged(subscriber);
      }
    }
  }, [chartApi, updatePosition]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!marker.isDeletable) return;
    e.stopPropagation();
    setIsDragging(true);
    dragInfo.current = { startY: e.clientY, startPrice: marker.price };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !chartApi.coordinateToPrice) return;
    
    const startY = chartApi.priceToCoordinate?.(dragInfo.current.startPrice);
    if (startY === undefined) return;

    const newY = startY + (e.clientY - dragInfo.current.startY);
    const newPrice = chartApi.coordinateToPrice(newY);

    if (newPrice !== null) {
      onUpdate(marker.id, newPrice);
    }
  }, [isDragging, chartApi, onUpdate, marker.id]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseMove]);
  
  useEffect(() => {
    return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    }
  }, [handleMouseMove, handleMouseUp]);


  if (position.y === undefined || position.x === undefined) {
    return null;
  }
  
  return (
    <div
      className="absolute flex items-center h-px bg-yellow-500/0 border-t border-dashed border-yellow-500 z-10"
      style={{
        top: position.y,
        left: 0,
        width: '100%',
        pointerEvents: 'none',
      }}
    >
      <div 
        className={cn(
            "absolute flex items-center bg-background/80 p-1 rounded-md text-xs border border-border/80",
            marker.isDeletable ? "cursor-ns-resize pointer-events-auto" : "pointer-events-none"
        )}
        style={{ left: position.x }}
        onMouseDown={handleMouseDown}
      >
        <span>{marker.price.toFixed(5)}</span>
        {marker.isDeletable && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(marker.id);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="ml-2 text-destructive pointer-events-auto cursor-pointer"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
