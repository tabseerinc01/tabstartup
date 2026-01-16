"use server";

import {
  getTreasuryInsights,
  type TreasuryInsightInput,
  type TreasuryInsightOutput,
} from "@/ai/flows/treasury-insight-assistant";

export async function treasuryInsightAction(
  input: TreasuryInsightInput
): Promise<TreasuryInsightOutput> {
  try {
    const insights = await getTreasuryInsights(input);
    return insights;
  } catch (error) {
    console.error("Error in treasuryInsightAction:", error);
    throw new Error("Failed to get treasury insights.");
  }
}
