"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Bot, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { treasuryInsightAction } from "@/actions/treasury";
import type { TreasuryInsightOutput } from "@/ai/flows/treasury-insight-assistant";

const formSchema = z.object({
  transactionHistory: z.string().min(10, "Please provide more transaction history."),
  riskProfile: z.string().min(10, "Please provide more details on your risk profile."),
  accountDetails: z.string().min(10, "Please provide more details on your account."),
});

const defaultValues = {
  transactionHistory: `Last 30 days:
- 50 incoming payments, total $12,500. Average transaction size: $250.
- 5 refunds processed, total $500.
- 2 chargebacks, total $300.
- Payouts to bank: $10,000.`,
  riskProfile: `Business Type: E-commerce (selling digital goods).
Industry: Software.
Time in business: 2 years.
Credit Score: Good (720).
No history of fraud.`,
  accountDetails: `Account Type: Business.
Average Balance: $5,000.
Using invoicing and payment links.
Interested in expanding to offer services to US-based clients.`,
};

export default function TreasuryAIPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [insights, setInsights] = useState<TreasuryInsightOutput | null>(null);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    setInsights(null);
    try {
      const result = await treasuryInsightAction(values);
      setInsights(result);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error Generating Insights",
        description:
          "There was a problem getting insights from the AI. Please try again.",
      });
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot /> Treasury Insight Assistant
            </CardTitle>
            <CardDescription>
              Provide your financial data to get personalized AI-powered
              insights and suggestions for optimizing your account and card
              issuing strategies.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-6"
              >
                <FormField
                  control={form.control}
                  name="transactionHistory"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Transaction History</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Provide a summary of recent transactions..."
                          rows={6}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="riskProfile"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Risk Profile</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe your business, industry, credit score, etc..."
                          rows={6}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="accountDetails"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Details</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe your account type, balance, features used..."
                          rows={6}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Get Insights
                    </>
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
      <div className="lg:col-span-2">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>AI Generated Insights</CardTitle>
            <CardDescription>
              Recommendations from our AI to help you grow.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && (
              <div className="flex flex-col items-center justify-center h-96 gap-4">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="text-muted-foreground">
                  Analyzing your data...
                </p>
              </div>
            )}
            {!isLoading && !insights && (
              <div className="flex flex-col items-center justify-center h-96 gap-4 text-center border-2 border-dashed rounded-lg">
                <Bot className="h-12 w-12 text-muted-foreground" />
                <p className="text-muted-foreground">
                  Your personalized insights will appear here.
                  <br />
                  Fill out the form and click &quot;Get Insights&quot; to
                  start.
                </p>
              </div>
            )}
            {insights && (
              <div className="prose prose-sm max-w-none prose-p:text-foreground prose-headings:text-foreground">
                <p>{insights.insights}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
