"use client";

import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

interface ReportDisplayProps {
  onExport: () => void;
  hasTools: boolean;
}

export function ReportDisplay({ onExport, hasTools }: ReportDisplayProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex flex-col items-center justify-center p-4 border border-dashed rounded-lg bg-secondary/30">
        <div className="text-center text-muted-foreground">
          <Download className="h-10 w-10 mx-auto mb-2" />
          <h3 className="font-headline text-lg">Export Trade Setups</h3>
          <p className="text-sm">
            {hasTools
              ? "Click the button below to export the placed tool(s) data as a CSV file."
              : "Place one or more Risk/Reward tools on the chart to enable export."}
          </p>
        </div>
      </div>
      <Button onClick={onExport} disabled={!hasTools} className="mt-4 w-full">
        <Download className="mr-2 h-4 w-4" />
        Export to CSV
      </Button>
    </div>
  );
}
