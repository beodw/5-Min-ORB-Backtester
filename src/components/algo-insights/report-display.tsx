"use client";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Loader2 } from "lucide-react";

interface ReportDisplayProps {
  onGenerate: () => void;
  report: string;
  isLoading: boolean;
  hasTrades: boolean;
}

export function ReportDisplay({ onGenerate, report, isLoading, hasTrades }: ReportDisplayProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex flex-col items-center justify-center p-4 border border-dashed rounded-lg bg-secondary/30">
        {isLoading ? (
          <div className="flex flex-col items-center gap-2 text-muted-foreground animate-pulse">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p>Generating AI Report...</p>
          </div>
        ) : report ? (
          <ScrollArea className="w-full h-[200px]">
            <p className="whitespace-pre-wrap text-sm text-foreground">{report}</p>
          </ScrollArea>
        ) : (
          <div className="text-center text-muted-foreground">
            <Bot className="h-10 w-10 mx-auto mb-2" />
            <h3 className="font-headline text-lg">AI Performance Report</h3>
            <p className="text-sm">
              {hasTrades
                ? "Click the button below to generate an AI-powered analysis of your strategy."
                : "Add some trades to the chart to generate a report."}
            </p>
          </div>
        )}
      </div>
      <Button onClick={onGenerate} disabled={isLoading || !hasTrades} className="mt-4 w-full">
        {isLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Bot className="mr-2 h-4 w-4" />
        )}
        Generate Report
      </Button>
    </div>
  );
}
