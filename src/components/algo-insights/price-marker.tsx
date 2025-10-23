
"use client";

import React from 'react';
import type { PriceMarker as PriceMarkerType, ChartApi } from '@/types';

interface PriceMarkerProps {
  marker: PriceMarkerType;
  chart: ChartApi;
  onUpdate: (id: string, price: number) => void;
  onRemove: (id: string) => void;
}

// This component renders the UI for an individual price marker.
// It handles its own positioning, dragging, and removal.
// It's a placeholder until the logic is moved into the main chart component.
export function PriceMarker({ marker, chart, onUpdate, onRemove }: PriceMarkerProps) {
  return null;
}
