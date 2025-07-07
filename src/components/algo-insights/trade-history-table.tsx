"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import type { Trade } from "@/types";
import { cn } from "@/lib/utils";

interface TradeHistoryTableProps {
  trades: Trade[];
}

export function TradeHistoryTable({ trades }: TradeHistoryTableProps) {
  const formatDate = (date: Date) => date.toLocaleDateString();
  const formatCurrency = (value: number) => {
    return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  };
  
  if (trades.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>No trades to display.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[250px]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Entry</TableHead>
            <TableHead>Exit</TableHead>
            <TableHead className="text-right">P/L</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...trades].reverse().map((trade) => (
            <TableRow key={trade.id}>
              <TableCell>
                <Badge variant={trade.type === 'win' ? 'default' : 'destructive'} className={cn(trade.type === 'win' && 'bg-accent text-accent-foreground', 'capitalize')}>
                  {trade.type}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span>{formatDate(trade.entryDate)}</span>
                  <span className="text-xs text-muted-foreground">{formatCurrency(trade.entryPrice)}</span>
                </div>
              </TableCell>
              <TableCell>
                 <div className="flex flex-col">
                  <span>{formatDate(trade.exitDate)}</span>
                  <span className="text-xs text-muted-foreground">{formatCurrency(trade.exitPrice)}</span>
                </div>
              </TableCell>
              <TableCell className={cn("text-right font-mono", trade.profit >= 0 ? "text-accent" : "text-destructive")}>
                {formatCurrency(trade.profit)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}
