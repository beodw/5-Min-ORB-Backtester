'use server';

/**
 * @fileOverview An AI agent for generating a strategy performance report.
 *
 * - generateStrategyReport - A function that generates the strategy report.
 * - GenerateStrategyReportInput - The input type for the generateStrategyReport function.
 * - GenerateStrategyReportOutput - The return type for the generateStrategyReport function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateStrategyReportInputSchema = z.object({
  profitLoss: z.number().describe('The total profit or loss of the strategy.'),
  winRate: z.number().describe('The win rate of the strategy (0-1).'),
  drawdown: z.number().describe('The maximum drawdown of the strategy.'),
  tradeHistory: z.string().describe('Trade history as a JSON string of trade records in array format. Each trade record should contain open date, close date, profit/loss for the trade'),
});
export type GenerateStrategyReportInput = z.infer<typeof GenerateStrategyReportInputSchema>;

const GenerateStrategyReportOutputSchema = z.object({
  report: z.string().describe('A comprehensive report of the strategy performance.'),
});
export type GenerateStrategyReportOutput = z.infer<typeof GenerateStrategyReportOutputSchema>;

export async function generateStrategyReport(input: GenerateStrategyReportInput): Promise<GenerateStrategyReportOutput> {
  return generateStrategyReportFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateStrategyReportPrompt',
  input: {schema: GenerateStrategyReportInputSchema},
  output: {schema: GenerateStrategyReportOutputSchema},
  prompt: `You are an expert trading strategy analyst. You will analyze the backtesting results of a trading strategy and generate a comprehensive performance report.

  The report should include an overview of the strategy's performance, including key metrics such as profit/loss, win rate, and drawdown, as well as insights into the strategy's strengths and weaknesses.

  Profit/Loss: {{{profitLoss}}}
  Win Rate: {{{winRate}}}
  Drawdown: {{{drawdown}}}
  Trade History: {{{tradeHistory}}}
  `,
});

const generateStrategyReportFlow = ai.defineFlow(
  {
    name: 'generateStrategyReportFlow',
    inputSchema: GenerateStrategyReportInputSchema,
    outputSchema: GenerateStrategyReportOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
