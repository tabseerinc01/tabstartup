
'use client';

import { useState, useEffect } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';
import { PlusCircle, MoreHorizontal, Copy, CircleOff, Loader2 } from 'lucide-react';
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
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/components/ui/select';
import type { PaymentLink, UserAccount } from '@/lib/types';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';

export default function PaymentLinksPage() {
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
  
    const paymentLinksQuery = useMemoFirebase(() => {
      if (!user || !selectedAccountId) return null;
      return collection(firestore, `users/${user.uid}/accounts/${selectedAccountId}/paymentLinks`);
    }, [firestore, user, selectedAccountId]);
    const { data: paymentLinksData, isLoading: isLoadingPaymentLinks } =
      useCollection<PaymentLink>(paymentLinksQuery);

  const formatCurrency = (amount: number, currency: string = 'USD') => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(amount);
  };
  
  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'active':
        return 'default';
      case 'inactive':
        return 'secondary';
      case 'paid':
        return 'outline';
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
      
      if (isLoadingPaymentLinks) {
         return (
          <div className="flex items-center justify-center h-full py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        );
      }
  
      if (!paymentLinksData || paymentLinksData.length === 0) {
          return (
              <div className="text-center p-8 text-muted-foreground">
                  <p>No payment links found for this account.</p>
              </div>
          )
      }

      return (
        <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Link</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created Date</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paymentLinksData.map((link) => (
                <TableRow key={link.id}>
                  <TableCell className="font-medium">{link.link}</TableCell>
                  <TableCell>{formatCurrency(link.amount, link.currency)}</TableCell>
                  <TableCell>
                    <Badge variant={getStatusBadgeVariant(link.status)}>
                        {link.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {format(new Date(link.createdDate), "PPP")}
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
                        <DropdownMenuItem>
                          <Copy className="mr-2 h-4 w-4" />
                          Copy Link
                        </DropdownMenuItem>
                        <DropdownMenuItem>Edit</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">
                          Deactivate
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
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Payment Links</h1>
          <p className="text-muted-foreground">Create and manage your payment links.</p>
        </div>
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
        <Button size="sm" className="h-8 gap-1">
          <PlusCircle className="h-3.5 w-3.5" />
          <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
            Create Link
          </span>
        </Button>
        </div>
      </div>
      <Card>
        <CardContent className="pt-6">
          {renderContent()}
        </CardContent>
        {paymentLinksData && paymentLinksData.length > 0 && (
            <CardFooter>
            <div className="text-xs text-muted-foreground">
                Showing <strong>1-{paymentLinksData.length}</strong> of <strong>{paymentLinksData.length}</strong> links
            </div>
            </CardFooter>
        )}
      </Card>
    </div>
  );
}
