
'use client';

import { useState, useEffect } from 'react';
import { useFirestore, useUser, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, deleteDoc, doc } from 'firebase/firestore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Eye, Trash2, ArrowRight, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';

export default function WatchlistPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const watchlistQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
      collection(firestore, 'savedStartups'),
      where('investorUid', '==', user.uid),
      where('isWatchlist', '==', true)
    );
  }, [firestore, user?.uid]);

  const { data: watchlistItems, isLoading } = useCollection(watchlistQuery);

  const handleRemove = async (id: string) => {
    if (!firestore) return;
    try {
      await deleteDoc(doc(firestore, 'savedStartups', id));
      toast({ title: "Removed from Watchlist" });
    } catch (e) {
      console.error(e);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto w-full space-y-8 animate-in fade-in duration-700">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-primary/10 rounded-2xl text-primary">
          <Eye className="h-8 w-8" />
        </div>
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Investor Watchlist</h1>
          <p className="text-sm font-medium text-slate-500">Actively monitoring these ventures for performance and traction.</p>
        </div>
      </div>

      <div className="grid gap-4">
        {watchlistItems && watchlistItems.length > 0 ? (
          watchlistItems.map((item) => (
            <Card key={item.id} className="group border-none shadow-sm hover:shadow-xl transition-all rounded-3xl overflow-hidden bg-background ring-1 ring-slate-100">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-slate-50 rounded-xl">
                      <TrendingUp className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-900">{item.startupName}</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Added {new Date(item.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" className="rounded-xl h-10 font-bold text-xs" asChild>
                      <Link href={`/startups/${item.startupId}`}>Analyze Profile</Link>
                    </Button>
                    <Button variant="ghost" size="icon" className="h-10 w-10 text-slate-300 hover:text-destructive" onClick={() => handleRemove(item.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="py-32 text-center space-y-6 bg-white rounded-[3rem] border-2 border-dashed border-slate-100">
             <div className="p-6 bg-slate-50 rounded-full w-fit mx-auto">
                <Eye className="h-12 w-12 text-slate-200" />
             </div>
             <p className="text-slate-400 font-bold uppercase text-xs tracking-[0.2em]">Watchlist is empty</p>
             <Button asChild variant="outline" className="rounded-full px-8 h-12 font-bold border-slate-200">
                <Link href="/startups">Explore Active Ventures</Link>
             </Button>
          </div>
        )}
      </div>
    </div>
  );
}
