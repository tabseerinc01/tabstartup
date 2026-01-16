
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  useUser,
  useFirestore,
  useCollection,
  useMemoFirebase,
  errorEmitter,
  FirestorePermissionError,
} from "@/firebase";
import {
  collection,
  query,
  orderBy,
  limit,
  doc,
  updateDoc,
  increment,
  setDoc,
} from "firebase/firestore";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowUpRight,
  DollarSign,
  Landmark,
  Wallet,
  Activity,
  FileText,
  Link2,
  CircleOff,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  UserAccount,
  Wallet as WalletType,
  Invoice,
  PaymentLink,
  Transaction,
} from "@/lib/types";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

export default function DashboardPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    null
  );
  const { toast } = useToast();

  const accountsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return collection(firestore, `users/${user.uid}/accounts`);
  }, [firestore, user]);
  const { data: accountsData, isLoading: isLoadingAccounts } =
    useCollection<UserAccount>(accountsQuery);

  useEffect(() => {
    if (accountsData && accountsData.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accountsData[0].id);
    }
  }, [accountsData, selectedAccountId]);

  const walletQuery = useMemoFirebase(() => {
    if (!user || !selectedAccountId) return null;
    return collection(
      firestore,
      `users/${user.uid}/accounts/${selectedAccountId}/wallet`
    );
  }, [firestore, user, selectedAccountId]);
  const { data: walletData, isLoading: isLoadingWallet } =
    useCollection<WalletType>(walletQuery);
  const wallet = walletData?.[0];

  const invoicesQuery = useMemoFirebase(() => {
    if (!user || !selectedAccountId) return null;
    return collection(
      firestore,
      `users/${user.uid}/accounts/${selectedAccountId}/invoices`
    );
  }, [firestore, user, selectedAccountId]);
  const { data: invoicesData, isLoading: isLoadingInvoices } =
    useCollection<Invoice>(invoicesQuery);

  const paymentLinksQuery = useMemoFirebase(() => {
    if (!user || !selectedAccountId) return null;
    return collection(
      firestore,
      `users/${user.uid}/accounts/${selectedAccountId}/paymentLinks`
    );
  }, [firestore, user, selectedAccountId]);
  const { data: paymentLinksData, isLoading: isLoadingPaymentLinks } =
    useCollection<PaymentLink>(paymentLinksQuery);

  const transactionsQuery = useMemoFirebase(() => {
    if (!user || !selectedAccountId) return null;
    return query(
      collection(
        firestore,
        `users/${user.uid}/accounts/${selectedAccountId}/transactions`
      ),
      orderBy("transactionDate", "desc"),
      limit(5)
    );
  }, [firestore, user, selectedAccountId]);
  const { data: transactionsData, isLoading: isLoadingTransactions } =
    useCollection<Transaction>(transactionsQuery);

  const formatCurrency = (amount: number, currency: string = "USD") =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(amount / 100);

  const handleAddTestMoney = () => {
    if (!user || !selectedAccountId || !wallet || !firestore) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please select an account first.",
      });
      return;
    }

    const walletRef = doc(
      firestore,
      `users/${user.uid}/accounts/${selectedAccountId}/wallet/${wallet.id}`
    );
    updateDoc(walletRef, {
      balanceTotal: increment(1000),
      balanceAvailable: increment(1000),
    }).catch((error) => {
      const permissionError = new FirestorePermissionError({
        path: walletRef.path,
        operation: "update",
        requestResourceData: {
          balanceTotal: "increment(1000)",
          balanceAvailable: "increment(1000)",
        },
      });
      errorEmitter.emit("permission-error", permissionError);
      toast({
        variant: "destructive",
        title: "Uh oh! Something went wrong.",
        description: "Could not update wallet.",
      });
    });

    const txCollectionRef = collection(
      firestore,
      `users/${user.uid}/accounts/${selectedAccountId}/transactions`
    );
    const newTxRef = doc(txCollectionRef);
    const txData = {
      id: newTxRef.id,
      userAccountId: selectedAccountId,
      transactionDate: new Date().toISOString(),
      amount: 1000,
      type: "credit" as const,
      status: "completed" as const,
      description: "Test Credit",
      currency: wallet.currency,
    };
    setDoc(newTxRef, txData).catch((error) => {
      const permissionError = new FirestorePermissionError({
        path: newTxRef.path,
        operation: "create",
        requestResourceData: txData,
      });
      errorEmitter.emit("permission-error", permissionError);
      toast({
        variant: "destructive",
        title: "Uh oh! Something went wrong.",
        description: "Could not create transaction.",
      });
    });

    toast({
      title: "Success",
      description: "Added $10 test money.",
    });
  };

  if (isUserLoading || isLoadingAccounts) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!accountsData || accountsData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <CircleOff className="h-12 w-12 text-muted-foreground" />
        <h2 className="mt-4 text-xl font-semibold">No accounts found</h2>
        <p className="mt-2 text-muted-foreground">
          Get started by creating a new account.
        </p>
        {/* TODO: Add a link/button to create an account */}
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Overview</h1>
        <div className="flex items-center gap-2">
          {selectedAccountId && (
            <Select
              value={selectedAccountId}
              onValueChange={setSelectedAccountId}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select an account" />
              </SelectTrigger>
              <SelectContent>
                {accountsData.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.accountName} ({account.accountType})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {process.env.NODE_ENV !== "production" && (
            <Button onClick={handleAddTestMoney} size="sm">
              Add Test $10
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Balance</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingWallet ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : wallet ? (
              <>
                <div className="text-2xl font-bold">
                  {formatCurrency(wallet.balanceTotal, wallet.currency)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Total money ever received
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No wallet data.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Available Balance
            </CardTitle>
            <Landmark className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingWallet ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : wallet ? (
              <>
                <div className="text-2xl font-bold">
                  {formatCurrency(wallet.balanceAvailable, wallet.currency)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Ready for withdrawal
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No wallet data.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Pending Balance
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingWallet ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : wallet ? (
              <>
                <div className="text-2xl font-bold">
                  {formatCurrency(wallet.balancePending, wallet.currency)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Processing / on hold
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No wallet data.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <div className="grid gap-4 lg:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Total Invoices
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingInvoices ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <div className="text-2xl font-bold">
                  {invoicesData?.length ?? 0}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Payment Links
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingPaymentLinks ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <div className="text-2xl font-bold">
                  {paymentLinksData?.length ?? 0}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="lg:col-span-5">
          <CardHeader className="flex flex-row items-center">
            <div className="grid gap-2">
              <CardTitle>Recent Transactions</CardTitle>
              <CardDescription>
                Your last 5 transactions for this account.
              </CardDescription>
            </div>
            <Button asChild size="sm" className="ml-auto gap-1">
              <Link href="/dashboard/transactions">
                View All
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {isLoadingTransactions ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : transactionsData && transactionsData.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactionsData.map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell>
                        <div className="font-medium">
                          {transaction.description}
                        </div>
                      </TableCell>
                      <TableCell>
                        {format(new Date(transaction.transactionDate), "PPP")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            transaction.status === "completed"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {transaction.status}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right",
                          transaction.type === "credit"
                            ? "text-green-600"
                            : "text-red-600"
                        )}
                      >
                        {transaction.type === "credit" ? "+" : "-"}
                        {formatCurrency(
                          transaction.amount,
                          transaction.currency
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center p-8 text-muted-foreground">
                <p>No transactions found for this account.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
