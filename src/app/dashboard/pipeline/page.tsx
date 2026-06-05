
'use client';

import { useState, useMemo } from 'react';
import { useFirestore, useUser, useCollection, useMemoFirebase, errorEmitter, FirestorePermissionError } from '@/firebase';
import { collection, query, where, doc, updateDoc, deleteDoc, serverTimestamp, addDoc } from 'firebase/firestore';
import { 
  LayoutGrid, 
  Loader2, 
  Search, 
  Filter, 
  TrendingUp, 
  HandCoins, 
  CheckCircle2, 
  XCircle,
  BarChart3,
  Rocket
} from 'lucide-react';
import { KanbanBoard } from '@/components/dashboard/pipeline/kanban-board';
import { NewDealDialog } from '@/components/dashboard/pipeline/new-deal-dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export default function PipelinePage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [search, setSearch] = useState('');

  const dealsQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'deals'), where('ownerUid', '==', user.uid));
  }, [firestore, user?.uid]);

  const { data: deals, isLoading: isDealsLoading } = useCollection(dealsQuery);

  const filteredDeals = useMemo(() => {
    if (!deals) return [];
    return deals.filter(d => 
      d.title.toLowerCase().includes(search.toLowerCase()) || 
      d.contactName.toLowerCase().includes(search.toLowerCase())
    );
  }, [deals, search]);

  const stats = useMemo(() => {
    if (!deals) return { total: 0, active: 0, won: 0, lost: 0, totalValue: 0, wonValue: 0 };
    return {
      total: deals.length,
      active: deals.filter(d => !['Won', 'Lost'].includes(d.stage)).length,
      won: deals.filter(d => d.stage === 'Won').length,
      lost: deals.filter(d => d.stage === 'Lost').length,
      totalValue: deals.reduce((acc, d) => acc + (d.value || 0), 0),
      wonValue: deals.filter(d => d.stage === 'Won').reduce((acc, d) => acc + (d.value || 0), 0)
    };
  }, [deals]);

  const handleMoveDeal = async (dealId: string, newStage: string) => {
    if (!firestore) return;
    const dealRef = doc(firestore, 'deals', dealId);
    
    // Get old stage for activity log
    const deal = deals?.find(d => d.id === dealId);
    const oldStage = deal?.stage;

    updateDoc(dealRef, { 
      stage: newStage, 
      updatedAt: serverTimestamp() 
    }).then(() => {
      // Log activity
      addDoc(collection(firestore, 'deals', dealId, 'activities'), {
        type: 'stage_change',
        details: `Stage changed from ${oldStage} to ${newStage}`,
        createdAt: serverTimestamp()
      });
    }).catch(err => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: dealRef.path,
        operation: 'update',
        requestResourceData: { stage: newStage }
      }));
    });
  };

  const handleDeleteDeal = async (id: string) => {
    if (!firestore || !confirm("Permanently delete this deal?")) return;
    const dealRef = doc(firestore, 'deals', id);
    deleteDoc(dealRef)
      .then(() => toast({ title: "Deal Removed" }))
      .catch(err => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: dealRef.path,
          operation: 'delete'
        }));
      });
  };

  if (isUserLoading || isDealsLoading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest animate-pulse">Syncing Pipeline...</p>
      </div>
    );
  }

  const formatValue = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="max-w-7xl mx-auto w-full space-y-8 animate-in fade-in duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
             <div className="h-1 w-8 bg-primary rounded-full" />
             <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Sales Engine</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900">Workspace Pipeline</h1>
          <p className="text-slate-500 font-medium">Track investment and sales opportunities in real-time.</p>
        </div>

        <NewDealDialog />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Active Pipeline', value: stats.active, icon: TrendingUp, color: 'text-primary', bg: 'bg-primary/10' },
          { label: 'Won Deals', value: stats.won, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Pipeline Value', value: formatValue(stats.totalValue), icon: BarChart3, color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Won Revenue', value: formatValue(stats.wonValue), icon: HandCoins, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ].map((stat, i) => (
          <Card key={i} className="border-none shadow-sm hover:shadow-md transition-shadow rounded-[2rem] overflow-hidden bg-background ring-1 ring-slate-100">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className={cn("p-2.5 rounded-xl", stat.bg)}>
                  <stat.icon className={cn("h-5 w-5", stat.color)} />
                </div>
                <div className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Platform Stat</div>
              </div>
              <p className="text-2xl font-black text-slate-900">{stat.value}</p>
              <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-tight">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="relative group max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input 
          placeholder="Filter deals by title or contact..." 
          className="pl-11 h-12 rounded-2xl border-none shadow-sm bg-background text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {!deals || deals.length === 0 ? (
        <Card className="border-2 border-dashed rounded-[3rem] bg-background/50 py-32 text-center border-slate-200">
          <CardContent className="space-y-6">
            <div className="p-6 bg-slate-50 rounded-full w-fit mx-auto">
              <Rocket className="h-16 w-16 text-slate-200" />
            </div>
            <div>
              <p className="text-xl font-black text-slate-900">Your pipeline is empty</p>
              <p className="text-slate-500 font-medium max-w-sm mx-auto">
                Start tracking opportunities by creating your first deal. Connect contacts to deals for better organization.
              </p>
            </div>
            <NewDealDialog />
          </CardContent>
        </Card>
      ) : (
        <KanbanBoard 
          deals={filteredDeals} 
          onMoveDeal={handleMoveDeal} 
          onDeleteDeal={handleDeleteDeal} 
        />
      )}
    </div>
  );
}
