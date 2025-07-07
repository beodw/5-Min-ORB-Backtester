"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import * as React from "react";
import { Settings2 } from "lucide-react";

interface StrategySettingsProps {
  riskRewardRatio: number;
  stopLossPercentage: number;
  onSettingsChange: (settings: { riskRewardRatio: number; stopLossPercentage: number; }) => void;
}

export function StrategySettings({ 
    riskRewardRatio, 
    stopLossPercentage,
    onSettingsChange
}: StrategySettingsProps) {
  const [currentRR, setCurrentRR] = React.useState(riskRewardRatio);
  const [currentSL, setCurrentSL] = React.useState(stopLossPercentage);
  
  React.useEffect(() => {
    setCurrentRR(riskRewardRatio);
    setCurrentSL(stopLossPercentage);
  }, [riskRewardRatio, stopLossPercentage]);

  const hasChanges = currentRR !== riskRewardRatio || currentSL !== stopLossPercentage;

  const handleApply = () => {
      onSettingsChange({ riskRewardRatio: currentRR, stopLossPercentage: currentSL });
  }
  
  const handleReset = () => {
      setCurrentRR(riskRewardRatio);
      setCurrentSL(stopLossPercentage);
  }

  return (
    <Card className="bg-card/80 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="font-headline text-xl flex items-center gap-2">
            <Settings2 className="w-5 h-5"/>
            Strategy Parameters
        </CardTitle>
         <CardDescription>Applying new parameters will clear existing trades.</CardDescription>
      </CardHeader>
      <CardContent className="pt-2 space-y-6">
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <Label htmlFor="risk-reward" className="text-sm">Risk/Reward Ratio</Label>
            <Badge variant="secondary">1 : {currentRR.toFixed(1)}</Badge>
          </div>
          <Slider
            id="risk-reward"
            min={0.5}
            max={5}
            step={0.1}
            value={[currentRR]}
            onValueChange={(value) => setCurrentRR(value[0])}
          />
        </div>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <Label htmlFor="stop-loss" className="text-sm">Stop Loss</Label>
             <Badge variant="secondary">{(currentSL * 100).toFixed(1)}%</Badge>
          </div>
          <Slider
            id="stop-loss"
            min={0.5}
            max={10}
            step={0.1}
            value={[currentSL * 100]}
            onValueChange={(value) => setCurrentSL(value[0] / 100)}
          />
        </div>
        {hasChanges && (
            <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={handleReset}>Reset</Button>
                <Button onClick={handleApply}>Apply Changes</Button>
            </div>
        )}
      </CardContent>
    </Card>
  );
}
