
'use client';

import { useParams, useSearchParams, notFound } from 'next/navigation';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import {
  Card,
  CardContent,
  CardHeader,
  CardFooter,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Logo } from '@/components/logo';
import type { Invoice, Client } from '@/lib/types';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';

export default function InvoiceDetailsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { user } = useUser();
  const firestore = useFirestore();
  
  const invoiceId = params.id as string;
  const accountId = searchParams.get('accountId');

  const invoiceRef = useMemoFirebase(() => {
    if (!user || !accountId || !invoiceId) return null;
    return doc(firestore, `users/${user.uid}/accounts/${accountId}/invoices/${invoiceId}`);
  }, [firestore, user, accountId, invoiceId]);
  const { data: invoice, isLoading: isLoadingInvoice } = useDoc<Invoice>(invoiceRef);

  const clientRef = useMemoFirebase(() => {
    if (!user || !accountId || !invoice?.clientId) return null;
    return doc(firestore, `users/${user.uid}/accounts/${accountId}/clients/${invoice.clientId}`);
  }, [firestore, user, accountId, invoice?.clientId]);
  const { data: client, isLoading: isLoadingClient } = useDoc<Client>(clientRef);

  if (isLoadingInvoice) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-16 w-16 animate-spin" />
      </div>
    );
  }

  if (!invoice) {
    if (!isLoadingInvoice) notFound();
    return null;
  }
  
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

  return (
    <div className="container mx-auto max-w-4xl py-12">
    <Card className="p-4 sm:p-8 md:p-12">
      <CardHeader className="p-0">
        <div className="flex flex-col md:flex-row justify-between gap-4">
          <div>
            <Logo />
            <p className="text-muted-foreground mt-2 text-sm">From TabEdge User</p>
          </div>
          <div className="text-left md:text-right">
            <h1 className="text-3xl font-bold text-foreground">Invoice</h1>
            <p className="text-muted-foreground">{invoice.invoiceNumber}</p>
            <div className="mt-2">
                <Badge variant={getStatusBadgeVariant(invoice.status)} className="text-lg py-1 px-3">
                {invoice.status}
                </Badge>
            </div>
          </div>
        </div>
        <Separator className="my-8" />
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <h3 className="font-semibold mb-2">Bill To:</h3>
            {isLoadingClient ? <Loader2 className='h-4 w-4 animate-spin' /> : (
              <>
                <p className="font-bold">{client?.name || invoice.clientName}</p>
                <p className="text-muted-foreground">{client?.email || invoice.clientEmail}</p>
              </>
            )}
          </div>
          <div className="text-left md:text-right">
            <p>
              <strong className="text-muted-foreground">Issue Date:</strong>{" "}
              {format(new Date(invoice.issueDate), "PPP")}
            </p>
            <p>
              <strong className="text-muted-foreground">Due Date:</strong>{" "}
              {format(new Date(invoice.dueDate), "PPP")}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 mt-8">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50%]">Description</TableHead>
              <TableHead className="text-center">Quantity</TableHead>
              <TableHead className="text-right">Unit Price</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoice.lineItems.map((item, index) => (
              <TableRow key={index}>
                <TableCell className="font-medium">{item.description}</TableCell>
                <TableCell className="text-center">{item.quantity}</TableCell>
                <TableCell className="text-right">{formatCurrency(item.unitPrice, invoice.currency)}</TableCell>
                <TableCell className="text-right">
                  {formatCurrency(item.unitPrice * item.quantity, invoice.currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Separator className="my-8" />
        <div className="flex justify-end">
          <div className="w-full md:w-1/2 lg:w-1/3 space-y-2">
            <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(invoice.subtotalCents, invoice.currency)}</span>
            </div>
            <div className="flex justify-between">
                <span className="text-muted-foreground">Tax (0%)</span>
                <span>{formatCurrency(0, invoice.currency)}</span>
            </div>
            <Separator />
             <div className="flex justify-between font-bold text-lg">
                <span>Total</span>
                <span>{formatCurrency(invoice.totalCents, invoice.currency)}</span>
            </div>
          </div>
        </div>
        {invoice.notes && (
          <>
            <Separator className="my-8" />
            <div>
              <h3 className="font-semibold mb-2">Notes</h3>
              <p className="text-muted-foreground text-sm">{invoice.notes}</p>
            </div>
          </>
        )}
      </CardContent>
      <CardFooter className="p-0 mt-8 flex-col gap-4 items-start">
         <p className="text-sm text-muted-foreground">Thank you for your business!</p>
         {invoice.status !== "paid" && (
            <Button size="lg" className="w-full md:w-auto">
                Pay Now - {formatCurrency(invoice.totalCents, invoice.currency)}
            </Button>
         )}
      </CardFooter>
    </Card>
  </div>
  );
}
