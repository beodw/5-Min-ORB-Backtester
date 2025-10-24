
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
  const [position, setPosition] = useState<{ y: number | undefined }>({ y: undefined });
  const [isDragging, setIsDragging] = useState(false);
  const dragInfo = useRef({ startY: 0, startPrice: 0 });

  const updatePosition = useCallback(() => {
    if (!chartApi.chart) return;
    const y = chartApi.priceToCoordinate?.(marker.price);
    setPosition({ y });
  }, [chartApi, marker.price]);

  useEffect(() => {
    updatePosition();
    const chart = chartApi.chart;
    if (chart) {
      const priceScale = chart.priceScale('right');
      const timeScale = chart.timeScale();
      
      const subscriber = () => updatePosition();
      
      priceScale.subscribeOptionsChanged(subscriber);
      timeScale.subscribeVisibleLogicalRangeChange(subscriber);
      timeScale.subscribeSizeChange(subscriber);

      return () => {
        priceScale.unsubscribeOptionsChanged(subscriber);
        timeScale.unsubscribeVisibleLogicalRangeChange(subscriber);
        timeScale.unsubscribeSizeChange(subscriber);
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
    const { coordinateToPrice, priceToCoordinate } = chartApi;
    if (!isDragging || !coordinateToPrice || !priceToCoordinate) return;
    
    const startY = priceToCoordinate(dragInfo.current.startPrice);
    if (startY === undefined || startY === null) return;

    const newY = startY + (e.clientY - dragInfo.current.startY);
    const newPrice = coordinateToPrice(newY);

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


  if (position.y === undefined) {
    return null;
  }
  
  return (
    <div
      className="absolute top-0 left-0 w-full h-px border-t border-dashed border-yellow-500 z-10 pointer-events-none"
      style={{
        transform: `translateY(${position.y}px)`,
      }}
    >
      <div 
        className={cn(
            "absolute right-0 flex items-center bg-background/80 p-1 rounded-md text-xs border border-border/80 mr-16 pointer-events-auto",
            marker.isDeletable && "cursor-ns-resize"
        )}
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
            className="ml-2 text-destructive"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
