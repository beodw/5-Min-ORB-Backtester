
"use client";

import { useState, useRef, useCallback, useEffect } from 'react';
import type { PriceData } from '@/types';
import { useToast } from './use-toast';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';
type PolygonMessage = {
    ev: string;
    status?: string;
    message?: string;
    sym?: string;
    o?: number;
    h?: number;
    l?: number;
    c?: number;
    s?: number;
};

const WS_URL = 'wss://socket.polygon.io/stocks';
const MAX_DATA_POINTS = 500; // Keep only the latest 500 candles

export function usePolygonWebSocket() {
    const [data, setData] = useState<PriceData[]>([]);
    const [status, setStatus] = useState<ConnectionStatus>('disconnected');
    const ws = useRef<WebSocket | null>(null);
    const lastMessageTimestamp = useRef<number>(0);
    const healthCheckTimer = useRef<NodeJS.Timeout | null>(null);
    const { toast } = useToast();

    const disconnect = useCallback((notify = true) => {
        if (healthCheckTimer.current) {
            clearInterval(healthCheckTimer.current);
            healthCheckTimer.current = null;
        }
        if (ws.current) {
            ws.current.close();
            ws.current = null;
        }
        setStatus('disconnected');
        setData([]); // Clear data on disconnect
        if (notify) {
            toast({ title: 'Live Feed', description: 'Disconnected from Polygon.io.' });
        }
    }, [toast]);

    const handleHealthCheck = useCallback(() => {
        const now = Date.now();
        // If no message received in the last 15 seconds, try to reconnect
        if (now - lastMessageTimestamp.current > 15000) {
            console.warn('WebSocket health check failed. Reconnecting...');
            toast({
                variant: 'destructive',
                title: 'Connection Issue',
                description: 'Reconnecting to live feed...'
            });
            disconnect(false);
            // Reconnect logic will be handled by UI or effect dependencies
        }
    }, [disconnect, toast]);


    const connect = useCallback((subscriptionParams: string) => {
        if (status !== 'disconnected' || !process.env.NEXT_PUBLIC_POLYGON_API_KEY) {
            return;
        }
        
        setStatus('connecting');
        toast({ title: 'Live Feed', description: 'Connecting to Polygon.io...' });
        
        const socket = new WebSocket(WS_URL);
        ws.current = socket;
        
        socket.onopen = () => {
            console.log('WebSocket connected');
            // Authenticate
            socket.send(JSON.stringify({
                action: 'auth',
                params: process.env.NEXT_PUBLIC_POLYGON_API_KEY
            }));
        };

        socket.onmessage = (event) => {
            lastMessageTimestamp.current = Date.now();
            const messages: PolygonMessage[] = JSON.parse(event.data);

            for (const msg of messages) {
                if (msg.ev === 'status') {
                    if (msg.status === 'auth_success') {
                        setStatus('connected');
                        toast({ title: 'Live Feed', description: 'Authenticated and connected successfully!' });
                        // Subscribe to streams
                        socket.send(JSON.stringify({
                            action: 'subscribe',
                            params: subscriptionParams
                        }));
                        // Start health check
                        if (healthCheckTimer.current) clearInterval(healthCheckTimer.current);
                        healthCheckTimer.current = setInterval(handleHealthCheck, 10000);
                    } else if (msg.status === 'auth_failed') {
                        toast({ variant: 'destructive', title: 'Authentication Failed', description: msg.message });
                        disconnect(false);
                    }
                } else if (msg.ev === 'AM' && msg.sym) { // Aggregate Minute data
                    const newCandle: PriceData = {
                        date: new Date(msg.s!),
                        open: msg.o!,
                        high: msg.h!,
                        low: msg.l!,
                        close: msg.c!,
                        wick: [msg.l!, msg.h!],
                    };

                    setData(prevData => {
                        const existingIndex = prevData.findIndex(d => d.date.getTime() === newCandle.date.getTime());
                        let newData;
                        if (existingIndex !== -1) {
                            // Update existing candle
                            newData = [...prevData];
                            newData[existingIndex] = newCandle;
                        } else {
                            // Add new candle
                            newData = [...prevData, newCandle];
                        }
                        // Sort and slice to maintain order and limit
                        return newData
                            .sort((a, b) => a.date.getTime() - b.date.getTime())
                            .slice(-MAX_DATA_POINTS);
                    });
                }
            }
        };

        socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            toast({ variant: 'destructive', title: 'WebSocket Error', description: 'An error occurred with the live feed.' });
            disconnect(false);
        };

        socket.onclose = () => {
            console.log('WebSocket disconnected');
            if (status !== 'disconnected') { // Avoid redundant notifications if disconnect was manual
                setStatus('disconnected');
            }
        };

    }, [status, toast, handleHealthCheck, disconnect]);
    
    // Cleanup on unmount
    useEffect(() => {
        return () => {
            disconnect(false);
        };
    }, [disconnect]);

    return { data, status, connect, disconnect };
}
