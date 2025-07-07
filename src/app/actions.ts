"use server";

import { generateStrategyReport } from "@/ai/flows/generate-strategy-report";
import type { GenerateStrategyReportInput } from "@/ai/flows/generate-strategy-report";

export async function generateReportAction(input: GenerateStrategyReportInput) {
  try {
    const result = await generateStrategyReport(input);
    return result;
  } catch (error) {
    console.error("Error generating report:", error);
    return { report: "An error occurred while generating the report." };
  }
}
