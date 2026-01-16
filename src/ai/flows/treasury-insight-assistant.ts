'use server';

/**
 * @fileOverview An AI assistant that analyzes transaction history and risk profile within the Stripe Treasury service.
 *
 * - getTreasuryInsights - A function that provides personalized insights and suggestions for optimizing account and card issuing strategies.
 * - TreasuryInsightInput - The input type for the getTreasuryInsights function.
 * - TreasuryInsightOutput - The return type for the getTreasuryInsights function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const TreasuryInsightInputSchema = z.object({
  transactionHistory: z
    .string()
    .describe(
      'A detailed record of all transactions, including dates, amounts, types, and descriptions.'
    ),
  riskProfile: z
    .string()
    .describe(
      'Information about the user’s risk profile, including credit score, business type, and other relevant factors.'
    ),
  accountDetails: z
    .string()
    .describe(
      'Details about the user account, including the account type (personal or business), balance, and settings.'
    ),
});
export type TreasuryInsightInput = z.infer<typeof TreasuryInsightInputSchema>;

const TreasuryInsightOutputSchema = z.object({
  insights: z
    .string()
    .describe(
      'Personalized insights and suggestions for optimizing the account and card issuing strategies, without exposing Stripe branding.'
    ),
});
export type TreasuryInsightOutput = z.infer<typeof TreasuryInsightOutputSchema>;

export async function getTreasuryInsights(
  input: TreasuryInsightInput
): Promise<TreasuryInsightOutput> {
  return treasuryInsightFlow(input);
}

const prompt = ai.definePrompt({
  name: 'treasuryInsightPrompt',
  input: {schema: TreasuryInsightInputSchema},
  output: {schema: TreasuryInsightOutputSchema},
  prompt: `You are an AI assistant specializing in analyzing financial data and providing insights for account optimization.

  Analyze the provided transaction history, risk profile, and account details to provide personalized insights and suggestions for optimizing the user's account and card issuing strategies. Do not mention Stripe.

  Transaction History: {{{transactionHistory}}}
  Risk Profile: {{{riskProfile}}}
  Account Details: {{{accountDetails}}}`,
});

const treasuryInsightFlow = ai.defineFlow(
  {
    name: 'treasuryInsightFlow',
    inputSchema: TreasuryInsightInputSchema,
    outputSchema: TreasuryInsightOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
