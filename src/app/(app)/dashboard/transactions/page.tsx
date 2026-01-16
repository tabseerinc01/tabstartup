
'use client';

import { useState, useEffect } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { File, ListFilter, CircleOff, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/components/ui/select';
import type { Transaction, UserAccount } from '@/lib/types';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function TransactionsPage() {
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  
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
  
    const transactionsQuery = useMemoFirebase(() => {
      if (!user || !selectedAccountId) return null;
      return query(
        collection(firestore, `users/${user.uid}/accounts/${selectedAccountId}/transactions`),
        orderBy('transactionDate', 'desc')
        );
    }, [firestore, user, selectedAccountId]);
    const { data: transactionsData, isLoading: isLoadingTransactions } =
      useCollection<Transaction>(transactionsQuery);

  const formatCurrency = (amount: number, currency: string = 'USD') =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);

  const renderContent = () => {
    if (isUserLoading || isLoadingAccounts) {
        return (
          <div className="flex items-center justify-center h-full py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        );
      }
  
      if (!accountsData || accountsData.length === 0) {
        return (
          <div className="flex flex-col items-center justify-center h-full py-8 text-center">
            <CircleOff className="h-12 w-12 text-muted-foreground" />
            <h2 className="mt-4 text-xl font-semibold">No accounts found</h2>
            <p className="mt-2 text-muted-foreground">
              Get started by creating a new account.
            </p>
          </div>
        );
      }
      
      if (isLoadingTransactions) {
         return (
          <div className="flex items-center justify-center h-full py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        );
      }
  
      if (!transactionsData || transactionsData.length === 0) {
          return (
              <div className="text-center p-8 text-muted-foreground">
                  <p>No transactions found for this account.</p>
              </div>
          )
      }

      return (
        <Table>
            <TableHeader>
            <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
            </TableRow>
            </TableHeader>
            <TableBody>
            {transactionsData.map((transaction) => (
                <TableRow key={transaction.id}>
                <TableCell>
                    {format(new Date(transaction.transactionDate), "PPP")}
                </TableCell>
                <TableCell className="font-medium">
                    {transaction.description}
                </TableCell>
                <TableCell>
                    <Badge variant={transaction.status === 'completed' ? 'default' : 'destructive'}>
                    {transaction.status}
                    </Badge>
                </TableCell>
                <TableCell>
                    <Badge variant={transaction.type === 'credit' ? 'secondary' : 'outline'}>
                    {transaction.type}
                    </Badge>
                </TableCell>
                <TableCell className={cn("text-right font-semibold", transaction.type === 'credit' ? 'text-green-600' : 'text-red-600')}>
                    {transaction.type === 'credit' ? '+' : '-'}
                    {formatCurrency(transaction.amount, transaction.currency)}
                </TableCell>
                </TableRow>
            ))}
            </TableBody>
        </Table>
      );
  }

  return (
    <Tabs defaultValue="all">
      <div className="flex items-center">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="credit">Credit</TabsTrigger>
          <TabsTrigger value="debit">Debit</TabsTrigger>
        </TabsList>
        <div className="ml-auto flex items-center gap-2">
        {accountsData && accountsData.length > 0 && selectedAccountId && (
              <Select
                value={selectedAccountId}
                onValueChange={(value) => setSelectedAccountId(value)}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select an account" />
                </SelectTrigger>
                <SelectContent>
                  {accountsData.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.accountName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1">
                <ListFilter className="h-3.5 w-3.5" />
                <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                  Filter
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked>
                Completed
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem>Pending</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem>Failed</DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" variant="outline" className="h-8 gap-1">
            <File className="h-3.5 w-3.5" />
            <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
              Export
            </span>
          </Button>
        </div>
      </div>
      <TabsContent value="all">
        <Card>
          <CardHeader>
            <CardTitle>Transactions</CardTitle>
            <CardDescription>
              A complete history of your account activity.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {renderContent()}
          </CardContent>
          {transactionsData && transactionsData.length > 0 && (
          <CardFooter>
            <div className="text-xs text-muted-foreground">
              Showing <strong>1-{transactionsData.length}</strong> of <strong>{transactionsData.length}</strong> transactions
            </div>
          </CardFooter>
          )}
        </Card>
      </TabsContent>
    </Tabs>
  );
}
