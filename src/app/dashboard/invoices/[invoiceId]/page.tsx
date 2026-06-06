
'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useFirestore, useUser, useDoc, useMemoFirebase, errorEmitter, FirestorePermissionError } from '@/firebase';
import { doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { 
  ArrowLeft, 
  Loader2, 
  Calendar, 
  Pencil, 
  Trash2, 
  CheckCircle2, 
  XCircle,
  FileText,
  ChevronRight,
  Printer,
  Smartphone,
  Package,
  ShieldCheck,
  Building2,
  User,
  Gavel,
  Banknote,
  Download,
  Share2
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { NewInvoiceDialog } from '@/components/dashboard/invoices/new-invoice-dialog';
import { ShareInvoiceDialog } from '@/components/dashboard/invoices/share-invoice-dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import Link from 'next/link';

export default function InvoiceDetailsPage() {
  const { invoiceId } = useParams();
  const { user } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const [isDeleting, setIsDeleting] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  const invoiceRef = useMemoFirebase(() => {
    if (!firestore || !invoiceId) return null;
    return doc(firestore, 'invoices', invoiceId as string);
  }, [firestore, invoiceId]);
  
  const { data: invoice, isLoading } = useDoc(invoiceRef);

  const handleUpdateStatus = async (status: string) => {
    if (!firestore || !invoiceId) return;
    updateDoc(doc(firestore, 'invoices', invoiceId as string), {
      status,
      updatedAt: serverTimestamp()
    }).then(() => {
      toast({ title: `Invoice marked as ${status}` });
    }).catch(err => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: `invoices/${invoiceId}`,
        operation: 'update',
        requestResourceData: { status }
      }));
    });
  };

  const handleDelete = async () => {
    if (!firestore || !invoiceId || isDeleting) return;
    if (!confirm("Permanently delete this invoice?")) return;

    setIsDeleting(true);
    deleteDoc(doc(firestore, 'invoices', invoiceId as string))
      .then(() => {
        toast({ title: "Invoice Deleted" });
        router.push('/dashboard/invoices');
      })
      .catch(err => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: `invoice/${invoiceId}`,
          operation: 'delete'
        }));
        setIsDeleting(false);
      });
  };

  const handlePrint = () => {
    if (!invoice) return;
    
    setIsPrinting(true);
    
    // Set dynamic document title for a professional filename when saving as PDF
    const originalTitle = document.title;
    const sanitizedContact = (invoice.contactName || 'Client').replace(/[^a-z0-9]/gi, '_');
    const newTitle = `Invoice_${invoice.invoiceNumber || invoice.id.slice(0,8)}_${sanitizedContact}`;
    
    document.title = newTitle;
    
    // Direct trigger for modern browsers
    setTimeout(() => {
      window.print();
      document.title = originalTitle;
      setIsPrinting(false);
    }, 50);
  };

  if (isLoading || !invoice) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest animate-pulse">Retrieving Document...</p>
      </div>
    );
  }

  if (invoice.ownerUid !== user?.uid) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <XCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-2xl font-black">Access Restricted</h2>
        <p className="text-slate-500 mb-6">This document is private to its owner.</p>
        <Button onClick={() => router.push('/dashboard/invoices')}>Back to Invoices</Button>
      </div>
    );
  }

  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: invoice.currency || 'USD', maximumFractionDigits: 0
  }).format(invoice.amount || 0);

  const senderName = invoice.billFromName || user?.displayName || 'TabStartup Member';
  const senderType = invoice.billFromType || 'Personal';

  return (
    <div className="max-w-6xl mx-auto w-full space-y-8 animate-in fade-in duration-700 pb-20 print:bg-white print:p-0 print:m-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 print:hidden">
        <div className="space-y-1">
          <nav className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
            <Link href="/dashboard" className="hover:text-primary">Workspace</Link>
            <ChevronRight className="h-3 w-3" />
            <Link href="/dashboard/invoices" className="hover:text-primary">Invoices</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-slate-600">#{invoice.invoiceNumber}</span>
          </nav>
          <h1 className="text-4xl font-black tracking-tight text-slate-900">Invoice Review</h1>
        </div>

        <div className="flex flex-wrap gap-2">
          <ShareInvoiceDialog invoice={invoice} />
          <Button 
            variant="default" 
            className="rounded-xl h-11 gap-2 font-bold shadow-lg shadow-primary/20" 
            onClick={handlePrint}
            disabled={isPrinting}
          >
            {isPrinting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download PDF
          </Button>
          <NewInvoiceDialog 
            editingInvoice={invoice} 
            trigger={
              <Button variant="outline" className="rounded-xl h-11 gap-2 font-bold border-slate-200">
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            } 
          />
          {invoice.status !== 'Paid' && (
            <Button 
              variant="outline" 
              className="rounded-xl h-11 gap-2 font-bold border-green-200 text-green-700 hover:bg-green-50"
              onClick={() => handleUpdateStatus('Paid')}
            >
              <CheckCircle2 className="h-4 w-4" /> Mark Paid
            </Button>
          )}
          <Button 
            variant="outline" 
            className="rounded-xl h-11 gap-2 font-bold text-destructive hover:bg-destructive/5"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>
      </div>

      <Card className="border-none shadow-2xl rounded-[3rem] overflow-hidden bg-background ring-1 ring-slate-100 print:shadow-none print:ring-0 print:rounded-none">
        <CardContent className="p-0">
           <div className="bg-slate-900 text-white p-12 flex flex-col md:flex-row justify-between items-start gap-8 print:bg-white print:text-slate-900 print:border-b print:p-8">
              <div className="space-y-4">
                 <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-2xl bg-primary flex items-center justify-center text-white shadow-lg print:border">
                       <FileText className="h-6 w-6" />
                    </div>
                    <span className="text-3xl font-black tracking-tighter">TabStartup</span>
                 </div>
                 <p className="text-slate-400 font-medium max-w-xs print:text-slate-500">Professional Invoicing for Emerging Ecosystems.</p>
                 <Badge variant="outline" className="bg-white/10 text-white border-white/20 rounded-lg px-3 py-1 flex items-center gap-2 w-fit">
                    {invoice.productType === 'Digital' ? <Smartphone className="h-3 w-3" /> : <Package className="h-3 w-3" />}
                    <span className="text-[10px] font-black uppercase tracking-widest">{invoice.productType} Delivery</span>
                 </Badge>
              </div>
              <div className="text-right space-y-1">
                 <h2 className="text-5xl font-black uppercase tracking-tighter opacity-10 print:opacity-100 print:text-3xl">Invoice</h2>
                 <p className="text-xl font-bold text-primary">#{invoice.invoiceNumber}</p>
                 <Badge className="bg-primary/20 text-primary border-none rounded-lg px-3 py-1 font-black text-xs uppercase tracking-widest mt-2">{invoice.status}</Badge>
              </div>
           </div>

           <div className="p-12 space-y-16 print:p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
                 <div className="space-y-4">
                    <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Bill From</Label>
                    <div className="space-y-1">
                       <p className="text-lg font-black text-slate-900 flex items-center gap-2">
                         {senderType === 'Startup' ? <Building2 className="h-4 w-4 text-primary" /> : <User className="h-4 w-4 text-primary" />}
                         {senderName}
                       </p>
                       <p className="text-sm font-medium text-slate-500">{user?.email}</p>
                       <Badge variant="secondary" className="text-[8px] h-4 px-1.5 font-bold bg-slate-100 text-slate-500 border-none uppercase mt-1">
                         {senderType} Entity
                       </Badge>
                    </div>
                 </div>
                 <div className="space-y-4">
                    <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Bill To</Label>
                    <div className="space-y-1">
                       <p className="text-lg font-black text-slate-900">{invoice.contactName}</p>
                       <Link href={`/dashboard/contacts/${invoice.contactId}`} className="text-xs font-bold text-primary hover:underline print:hidden flex items-center gap-1">
                          View Contact Profile <ChevronRight className="h-3 w-3" />
                       </Link>
                    </div>
                 </div>
                 <div className="space-y-4">
                    <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Document Dates</Label>
                    <div className="grid grid-cols-2 gap-4">
                       <div className="space-y-1">
                          <p className="text-[9px] font-bold text-slate-400 uppercase">Issued</p>
                          <p className="text-sm font-bold text-slate-700">{invoice.issueDate ? format(new Date(invoice.issueDate), 'MMM d, yyyy') : 'N/A'}</p>
                       </div>
                       <div className="space-y-1">
                          <p className="text-[9px] font-bold text-slate-400 uppercase">Due Date</p>
                          <p className="text-sm font-bold text-slate-700">{invoice.dueDate ? format(new Date(invoice.dueDate), 'MMM d, yyyy') : 'N/A'}</p>
                       </div>
                    </div>
                 </div>
              </div>

              <div className="space-y-6">
                 <div className="flex items-center justify-between px-4 pb-4 border-b-2 border-slate-900/5">
                    <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 flex-[3]">Description</h3>
                    <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 flex-1 text-center">Qty</h3>
                    <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 flex-1 text-right">Price</h3>
                    <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 flex-1 text-right">Total</h3>
                 </div>
                 <div className="space-y-3">
                   {invoice.items && invoice.items.length > 0 ? (
                     invoice.items.map((item: any, i: number) => (
                       <div key={i} className="px-4 py-6 rounded-2xl bg-slate-50 ring-1 ring-slate-100 flex items-center justify-between group">
                          <div className="flex-[3] pr-4">
                             <p className="font-bold text-slate-900">{item.description || 'Generic Item'}</p>
                          </div>
                          <div className="flex-1 text-center font-bold text-slate-600">
                             {item.quantity || 1}
                          </div>
                          <div className="flex-1 text-right font-bold text-slate-600">
                             {new Intl.NumberFormat('en-US', { style: 'currency', currency: invoice.currency || 'USD' }).format(item.unitPrice || 0)}
                          </div>
                          <div className="flex-1 text-right font-black text-slate-900">
                             {new Intl.NumberFormat('en-US', { style: 'currency', currency: invoice.currency || 'USD' }).format(item.total || 0)}
                          </div>
                       </div>
                     ))
                   ) : (
                     <div className="px-4 py-8 rounded-[2rem] bg-slate-50 ring-1 ring-slate-100 flex items-center justify-between">
                        <p className="text-lg font-black text-slate-900">Service Charges</p>
                        <p className="text-2xl font-black text-slate-900">{formattedAmount}</p>
                     </div>
                   )}
                 </div>
              </div>

              <div className="flex justify-end pt-8">
                 <div className="w-full max-w-sm space-y-4">
                    <div className="flex justify-between items-center px-4">
                       <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">Subtotal</span>
                       <span className="text-lg font-bold text-slate-700">{formattedAmount}</span>
                    </div>
                    <div className="flex justify-between items-center px-4 py-6 rounded-2xl bg-primary text-white shadow-xl shadow-primary/20 print:bg-white print:text-slate-900 print:border print:shadow-none">
                       <span className="text-lg font-black uppercase tracking-tighter">Total Amount</span>
                       <span className="text-3xl font-black">{formattedAmount}</span>
                    </div>
                 </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-12 pt-16 border-t border-slate-50">
                 <div className="space-y-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                       <Banknote className="h-3 w-3" /> Payment Instructions
                    </p>
                    <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 min-h-[100px]">
                       <p className="text-sm text-slate-600 leading-relaxed font-medium whitespace-pre-wrap">
                          {invoice.paymentInstructions ? invoice.paymentInstructions : `Please reference invoice #${invoice.invoiceNumber} when making payment. Thank you for your business.`}
                       </p>
                    </div>
                 </div>
                 <div className="space-y-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                       <Gavel className="h-3 w-3" /> Terms & Conditions
                    </p>
                    <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 min-h-[100px]">
                       <p className="text-sm text-slate-600 leading-relaxed font-medium whitespace-pre-wrap">
                          {invoice.termsAndConditions ? invoice.termsAndConditions : "Standard 30-day payment terms apply unless otherwise agreed in writing."}
                       </p>
                    </div>
                 </div>
              </div>

              {invoice.status === 'Paid' && (
                 <div className="flex items-center gap-2 text-green-600 font-bold text-sm bg-green-50 w-fit px-4 py-2 rounded-full mx-auto">
                    <ShieldCheck className="h-4 w-4" /> FULLY SETTLED
                 </div>
              )}
           </div>
        </CardContent>
      </Card>
    </div>
  );
}
