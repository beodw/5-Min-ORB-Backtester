
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Backtester } from "@/components/algo-insights/backtester";
import { JournalReconstruction } from "@/components/algo-insights/journal-reconstruction";
import { FileBarChart } from "lucide-react";

export default function AlgoInsightsPage() {
  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-body">
        <header className="flex items-center justify-between p-4 border-b border-border shadow-md">
            <div className="flex items-center gap-4">
                <FileBarChart className="w-8 h-8 text-foreground" />
                <h1 className="text-2xl font-bold font-headline text-foreground">
                    Algo Insights
                </h1>
            </div>
        </header>

        <main className="flex-1 relative overflow-hidden">
             <Tabs defaultValue="backtester" className="h-full flex flex-col">
                <div className="flex justify-center border-b">
                    <TabsList className="mt-2">
                        <TabsTrigger value="backtester">Backtester</TabsTrigger>
                        <TabsTrigger value="reconstruction">Journal Reconstruction</TabsTrigger>
                    </TabsList>
                </div>
                <TabsContent value="backtester" className="flex-1 relative">
                    <Backtester />
                </TabsContent>
                <TabsContent value="reconstruction" className="flex-1 relative">
                    <JournalReconstruction />
                </TabsContent>
            </Tabs>
        </main>
    </div>
  );
}
