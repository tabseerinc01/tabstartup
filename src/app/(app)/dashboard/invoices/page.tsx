
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';
import {
  PlusCircle,
  File,
  ListFilter,
  MoreHorizontal,
  Download,
  Share2,
  CircleOff,
  Loader2,
} from 'lucide-react';
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
  DropdownMenuItem,
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
import type { Invoice, UserAccount } from '@/lib/types';
import { format } from 'date-fns';

export default function InvoicesPage() {
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

  const invoicesQuery = useMemoFirebase(() => {
    if (!user || !selectedAccountId) return null;
    return collection(firestore, `users/${user.uid}/accounts/${selectedAccountId}/invoices`);
  }, [firestore, user, selectedAccountId]);
  const { data: invoicesData, isLoading: isLoadingInvoices } =
    useCollection<Invoice>(invoicesQuery);

  const formatCurrency = (amount: number, currency: string = 'USD') =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount / 100);

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'paid':
        return 'default';
      case 'unpaid':
        return 'secondary';
      case 'sent':
          return 'outline';
      case 'draft':
            return 'destructive';
      default:
        return 'outline';
    }
  };
  
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
    
    if (isLoadingInvoices) {
       return (
        <div className="flex items-center justify-center h-full py-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      );
    }

    if (!invoicesData || invoicesData.length === 0) {
        return (
            <div className="text-center p-8 text-muted-foreground">
                <p>No invoices found for this account.</p>
            </div>
        )
    }

    return (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice #</TableHead>
              <TableHead>Client ID</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoicesData.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                <TableCell>{invoice.clientId}</TableCell>
                <TableCell>
                  <Badge variant={getStatusBadgeVariant(invoice.status)}>
                    {invoice.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(invoice.amount, invoice.currency)}
                </TableCell>
                <TableCell>
                  {format(new Date(invoice.dueDate), 'PPP')}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        aria-haspopup="true"
                        size="icon"
                        variant="ghost"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Toggle menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuItem asChild>
                        <Link href={`/dashboard/invoices/${invoice.id}?accountId=${selectedAccountId}`} target="_blank">View</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Share2 className="mr-2 h-4 w-4" />
                        Share
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Download className="mr-2 h-4 w-4" />
                        Download PDF
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive">
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
          <TabsTrigger value="paid">Paid</TabsTrigger>
          <TabsTrigger value="unpaid">Unpaid</TabsTrigger>
          <TabsTrigger value="sent">Sent</TabsTrigger>
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
              <DropdownMenuLabel>Filter by</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked>
                Paid
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem>Unpaid</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem>Sent</DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" variant="outline" className="h-8 gap-1">
            <File className="h-3.5 w-3.5" />
            <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
              Export
            </span>
          </Button>
          <Button size="sm" className="h-8 gap-1">
            <PlusCircle className="h-3.5 w-3.5" />
            <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
              Create Invoice
            </span>
          </Button>
        </div>
      </div>
      <TabsContent value="all">
        <Card>
          <CardHeader>
            <CardTitle>Invoices</CardTitle>
            <CardDescription>
              Manage your invoices and track their payment status.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {renderContent()}
          </CardContent>
          {invoicesData && invoicesData.length > 0 && (
            <CardFooter>
              <div className="text-xs text-muted-foreground">
                Showing <strong>1-{invoicesData.length}</strong> of <strong>{invoicesData.length}</strong> invoices
              </div>
            </CardFooter>
          )}
        </Card>
      </TabsContent>
    </Tabs>
  );
}
