
'use client';

import { useState, useMemo } from 'react';
import { useFirestore, useUser, useCollection, useMemoFirebase, errorEmitter, FirestorePermissionError } from '@/firebase';
import { collection, query, where, doc, deleteDoc } from 'firebase/firestore';
import { 
  FileText, 
  Loader2, 
  Search, 
  Filter, 
  Plus, 
  ArrowUpRight, 
  ChevronRight,
  MoreVertical,
  Trash2,
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  Banknote,
  HandCoins,
  History
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { NewInvoiceDialog } from '@/components/dashboard/invoices/new-invoice-dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import Link from 'next/link';

export default function InvoicesListPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const invoicesQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'invoices'), where('ownerUid', '==', user.uid));
  }, [firestore, user?.uid]);

  const { data: rawInvoices, isLoading } = useCollection(invoicesQuery);

  const invoices = useMemo(() => {
    if (!rawInvoices) return [];
    return rawInvoices
      .filter(inv => {
        const matchesSearch = 
          inv.title.toLowerCase().includes(search.toLowerCase()) || 
          inv.contactName.toLowerCase().includes(search.toLowerCase()) ||
          inv.invoiceNumber.toLowerCase().includes(search.toLowerCase());
        
        const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        const tA = a.createdAt?.toMillis?.() || 0;
        const tB = b.createdAt?.toMillis?.() || 0;
        return tB - tA;
      });
  }, [rawInvoices, search, statusFilter]);

  const stats = useMemo(() => {
    if (!rawInvoices) return { total: 0, paid: 0, outstanding: 0, totalRevenue: 0 };
    const paid = rawInvoices.filter(i => i.status === 'Paid');
    const outstanding = rawInvoices.filter(i => !['Paid', 'Cancelled', 'Draft'].includes(i.status));
    
    return {
      total: rawInvoices.length,
      paidCount: paid.length,
      outstandingCount: outstanding.length,
      totalRevenue: paid.reduce((acc, i) => acc + (i.amount || 0), 0),
      outstandingRevenue: outstanding.reduce((acc, i) => acc + (i.amount || 0), 0)
    };
  }, [rawInvoices]);

  const handleDelete = async (id: string) => {
    if (!firestore || !confirm("Permanently delete this invoice?")) return;
    deleteDoc(doc(firestore, 'invoices', id))
      .then(() => toast({ title: "Invoice Deleted" }))
      .catch(err => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: `invoices/${id}`,
          operation: 'delete'
        }));
      });
  };

  if (isUserLoading || isLoading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest animate-pulse">Synchronizing Ledger...</p>
      </div>
    );
  }

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="max-w-7xl mx-auto w-full space-y-8 animate-in fade-in duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
             <div className="h-1 w-8 bg-primary rounded-full" />
             <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Financial Records</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900">Invoices</h1>
          <p className="text-slate-500 font-medium">Manage your billing, payments, and client revenue.</p>
        </div>
        <NewInvoiceDialog />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Paid Invoices', value: stats.paidCount, sub: formatCurrency(stats.totalRevenue), icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Outstanding', value: stats.outstandingCount, sub: formatCurrency(stats.outstandingRevenue), icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Total Revenue', value: formatCurrency(stats.totalRevenue), sub: 'Received', icon: TrendingUp, color: 'text-primary', bg: 'bg-primary/10' },
          { label: 'Total Issued', value: stats.total, sub: 'All records', icon: FileText, color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map((stat, i) => (
          <Card key={i} className="border-none shadow-sm hover:shadow-md transition-shadow rounded-[2rem] overflow-hidden bg-background ring-1 ring-slate-100">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className={cn("p-2.5 rounded-xl", stat.bg)}>
                  <stat.icon className={cn("h-5 w-5", stat.color)} />
                </div>
                <div className="text-[9px] font-black text-slate-300 uppercase tracking-widest">{stat.sub}</div>
              </div>
              <p className="text-2xl font-black text-slate-900">{stat.value}</p>
              <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-tight">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-[2rem] shadow-sm ring-1 ring-slate-100">
        <div className="relative group w-full md:max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input 
            placeholder="Search by client or #invoice..." 
            className="pl-11 h-12 rounded-2xl border-none shadow-none bg-slate-50 focus-visible:ring-1 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          {["all", "Draft", "Sent", "Paid", "Overdue"].map(s => (
            <Button 
              key={s}
              variant="ghost" 
              size="sm" 
              className={cn(
                "rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest",
                statusFilter === s ? "bg-primary text-white hover:bg-primary" : "text-slate-400 hover:bg-slate-50"
              )}
              onClick={() => setStatusFilter(s)}
            >
              {s}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4">
        {invoices.length > 0 ? (
          invoices.map((inv) => (
            <Link key={inv.id} href={`/dashboard/invoices/${inv.id}`}>
              <Card className="group border-none shadow-sm hover:shadow-xl transition-all duration-300 rounded-[2.5rem] overflow-hidden bg-background ring-1 ring-slate-100">
                <CardContent className="p-0">
                  <div className="flex flex-col md:flex-row md:items-center">
                    <div className="flex-1 p-6 sm:p-8 flex items-center gap-6">
                       <div className={cn(
                         "h-14 w-14 rounded-2xl flex items-center justify-center shrink-0 shadow-lg",
                         inv.status === 'Paid' ? "bg-green-500 text-white" : 
                         inv.status === 'Overdue' ? "bg-red-500 text-white" : "bg-primary text-white"
                       )}>
                          <FileText className="h-7 w-7" />
                       </div>
                       <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-3 mb-1">
                             <span className="text-[10px] font-black text-primary uppercase tracking-widest">#{inv.invoiceNumber}</span>
                             <Badge variant="secondary" className={cn(
                               "rounded-lg px-2 py-0.5 text-[8px] font-black uppercase tracking-widest border-none",
                               inv.status === 'Paid' ? "bg-green-100 text-green-700" :
                               inv.status === 'Overdue' ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-400"
                             )}>
                               {inv.status}
                             </Badge>
                          </div>
                          <h3 className="text-xl font-black text-slate-900 group-hover:text-primary transition-colors truncate">{inv.title}</h3>
                          <div className="flex items-center gap-2 mt-1 text-sm font-bold text-slate-500">
                             <span className="truncate">{inv.contactName}</span>
                          </div>
                       </div>
                    </div>

                    <div className="hidden md:flex flex-col items-center justify-center px-12 border-l border-slate-50">
                       <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">Total Amount</p>
                       <p className="text-2xl font-black text-slate-900">{formatCurrency(inv.amount)}</p>
                    </div>

                    <div className="flex items-center justify-between p-6 md:p-8 border-t md:border-t-0 md:border-l border-slate-50 bg-slate-50/50">
                       <div className="space-y-1">
                          <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Due Date</p>
                          <p className="text-sm font-bold text-slate-600">{inv.dueDate ? format(new Date(inv.dueDate), 'MMM d, yyyy') : 'No date'}</p>
                       </div>
                       <div className="md:ml-8 flex items-center gap-1 text-[10px] font-black text-primary uppercase tracking-[0.2em] opacity-0 group-hover:opacity-100 transition-all translate-x-[-10px] group-hover:translate-x-0">
                          Review <ChevronRight className="h-3 w-3" />
                       </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))
        ) : (
          <Card className="border-2 border-dashed rounded-[3rem] bg-background/50 py-32 text-center border-slate-200">
            <CardContent className="space-y-6">
              <div className="p-6 bg-slate-50 rounded-full w-fit mx-auto">
                <FileText className="h-16 w-16 text-slate-200" />
              </div>
              <div>
                <p className="text-xl font-black text-slate-900">Your ledger is empty</p>
                <p className="text-slate-500 font-medium max-w-sm mx-auto">
                  Start billing clients or generating invoices from won deals to track your revenue.
                </p>
              </div>
              <NewInvoiceDialog />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
