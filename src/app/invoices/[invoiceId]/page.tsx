
'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { 
  Loader2, 
  FileText, 
  Smartphone, 
  Package, 
  ShieldCheck, 
  Building2, 
  User, 
  Gavel, 
  Banknote,
  Download,
  CheckCircle2,
  XCircle,
  Clock
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { PublicHeader } from '@/components/public/header';
import { PublicFooter } from '@/components/public/footer';
import { format } from 'date-fns';

export default function PublicInvoicePage() {
  const { invoiceId } = useParams();
  const firestore = useFirestore();

  const [isPrinting, setIsPrinting] = useState(false);

  const invoiceRef = useMemoFirebase(() => {
    if (!firestore || !invoiceId) return null;
    return doc(firestore, 'invoices', invoiceId as string);
  }, [firestore, invoiceId]);
  
  const { data: invoice, isLoading, error } = useDoc(invoiceRef);

  const handlePrint = () => {
    if (!invoice) return;
    setIsPrinting(true);
    const originalTitle = document.title;
    document.title = `Invoice_${invoice.invoiceNumber}_${invoice.billFromName}`;
    setTimeout(() => {
      window.print();
      document.title = originalTitle;
      setIsPrinting(false);
    }, 50);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-muted/20">
        <PublicHeader />
        <main className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest animate-pulse">Retrieving Secure Document...</p>
          </div>
        </main>
        <PublicFooter />
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="flex min-h-screen flex-col bg-muted/20">
        <PublicHeader />
        <main className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="p-6 bg-red-50 rounded-full mb-6 border border-red-100">
            <XCircle className="h-12 w-12 text-red-500" />
          </div>
          <h1 className="text-3xl font-black text-slate-900 mb-2">Invoice Not Found</h1>
          <p className="text-slate-500 max-w-md mx-auto leading-relaxed">
            We couldn't retrieve the invoice you're looking for. Please ensure the link is correct or contact the issuer.
          </p>
        </main>
        <PublicFooter />
      </div>
    );
  }

  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: invoice.currency || 'USD', maximumFractionDigits: 0
  }).format(invoice.amount || 0);

  return (
    <div className="flex min-h-screen flex-col bg-muted/10">
      <PublicHeader />
      
      <div className="bg-primary/5 border-b border-primary/10 py-3 print:hidden">
        <div className="container mx-auto px-4 flex items-center justify-center gap-2">
           <ShieldCheck className="h-4 w-4 text-primary" />
           <p className="text-[10px] font-black uppercase tracking-widest text-primary">Secure Official Document Index</p>
        </div>
      </div>

      <main className="flex-1 container mx-auto px-4 py-12 md:py-20">
        <div className="max-w-5xl mx-auto space-y-8 print:m-0 print:max-w-none">
          <div className="flex justify-between items-center print:hidden">
            <Badge variant="outline" className="rounded-full bg-white border-slate-200 px-4 py-1 font-bold text-slate-500">
               Official Invoice View
            </Badge>
            <Button onClick={handlePrint} className="rounded-xl h-11 gap-2 font-bold shadow-xl shadow-primary/20">
               {isPrinting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
               Save as PDF
            </Button>
          </div>

          <Card className="border-none shadow-3xl rounded-[3rem] overflow-hidden bg-background ring-1 ring-slate-100 print:shadow-none print:ring-0 print:rounded-none">
            <CardContent className="p-0">
               {/* Invoice Header */}
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
                  {/* Parties & Dates */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
                     <div className="space-y-4">
                        <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Bill From</Label>
                        <div className="space-y-1">
                           <p className="text-lg font-black text-slate-900 flex items-center gap-2">
                             {invoice.billFromType === 'Startup' ? <Building2 className="h-4 w-4 text-primary" /> : <User className="h-4 w-4 text-primary" />}
                             {invoice.billFromName}
                           </p>
                           <p className="text-xs font-medium text-slate-400 uppercase tracking-tighter">{invoice.billFromType} Entity</p>
                        </div>
                     </div>
                     <div className="space-y-4">
                        <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Bill To</Label>
                        <div className="space-y-1">
                           <p className="text-lg font-black text-slate-900">{invoice.contactName}</p>
                           <p className="text-xs font-medium text-slate-400">Client Partner</p>
                        </div>
                     </div>
                     <div className="space-y-4">
                        <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Timeline</Label>
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

                  {/* Items Table */}
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
                            <p className="text-lg font-black text-slate-900">Professional Services</p>
                            <p className="text-2xl font-black text-slate-900">{formattedAmount}</p>
                         </div>
                       )}
                     </div>
                  </div>

                  {/* Totals */}
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

                  {/* Footer Notes */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-12 pt-16 border-t border-slate-50">
                     <div className="space-y-4">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                           <Banknote className="h-3 w-3" /> Payment Instructions
                        </p>
                        <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 min-h-[100px]">
                           <p className="text-sm text-slate-600 leading-relaxed font-medium whitespace-pre-wrap">
                              {invoice.paymentInstructions ? invoice.paymentInstructions : `Please reference invoice #${invoice.invoiceNumber} when making payment.`}
                           </p>
                        </div>
                     </div>
                     <div className="space-y-4">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                           <Gavel className="h-3 w-3" /> Terms & Conditions
                        </p>
                        <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 min-h-[100px]">
                           <p className="text-sm text-slate-600 leading-relaxed font-medium whitespace-pre-wrap">
                              {invoice.termsAndConditions ? invoice.termsAndConditions : "Standard payment terms apply. Thank you for your business."}
                           </p>
                        </div>
                     </div>
                  </div>

                  {invoice.status === 'Paid' && (
                     <div className="flex items-center gap-2 text-green-600 font-bold text-sm bg-green-50 w-fit px-4 py-2 rounded-full mx-auto border border-green-100">
                        <CheckCircle2 className="h-4 w-4" /> SECURELY PAID & SETTLED
                     </div>
                  )}

                  <div className="pt-20 text-center space-y-4 print:hidden">
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">Built with TabStartup Ecosystem</p>
                  </div>
               </div>
            </CardContent>
          </Card>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
