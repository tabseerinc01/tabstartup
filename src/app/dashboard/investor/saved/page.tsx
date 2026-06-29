
'use client';

import { useState, useEffect } from 'react';
import { useFirestore, useUser, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, deleteDoc, doc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Rocket, MapPin, Trash2, ArrowRight, Star } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';

export default function SavedStartupsPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const savedQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
      collection(firestore, 'savedStartups'),
      where('investorUid', '==', user.uid),
      where('isWatchlist', '==', false)
    );
  }, [firestore, user?.uid]);

  const { data: savedItems, isLoading } = useCollection(savedQuery);

  const handleUnsave = async (id: string) => {
    if (!firestore) return;
    try {
      await deleteDoc(doc(firestore, 'savedStartups', id));
      toast({ title: "Startup Removed", description: "Successfully removed from saved list." });
    } catch (e) {
      console.error(e);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary opacity-20" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto w-full space-y-8 animate-in fade-in duration-700">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-primary/10 rounded-2xl text-primary">
          <Star className="h-8 w-8 fill-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Saved Startups</h1>
          <p className="text-sm font-medium text-slate-500">Your bookmarked ventures for future review.</p>
        </div>
      </div>

      <div className="grid gap-6">
        {savedItems && savedItems.length > 0 ? (
          savedItems.map((item) => (
            <Card key={item.id} className="group border-none shadow-sm hover:shadow-xl transition-all rounded-[2rem] overflow-hidden bg-background ring-1 ring-slate-100">
              <CardContent className="p-8">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="flex items-center gap-5 flex-1">
                    <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-black text-2xl">
                      {item.startupName?.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-slate-900 group-hover:text-primary transition-colors">{item.startupName}</h3>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Saved on {new Date(item.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button variant="outline" className="rounded-xl h-11 font-bold border-slate-200" asChild>
                      <Link href={`/startups/${item.startupId}`}>
                        View Profile <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                    <Button variant="ghost" size="icon" className="h-11 w-11 rounded-xl text-slate-300 hover:text-destructive" onClick={() => handleUnsave(item.id)}>
                      <Trash2 className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card className="border-2 border-dashed rounded-[3rem] bg-background/50 py-32 text-center">
            <CardContent className="space-y-6">
              <div className="p-6 bg-slate-50 rounded-full w-fit mx-auto">
                <Star className="h-16 w-16 text-slate-200" />
              </div>
              <div className="space-y-2">
                <p className="text-xl font-black text-slate-900">Your saved list is empty</p>
                <p className="text-slate-500 font-medium max-w-xs mx-auto">Bookmark startups from the directory to review them later.</p>
              </div>
              <Button asChild className="rounded-full px-8 h-12 font-bold shadow-lg shadow-primary/20">
                <Link href="/startups">Explore Startups</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
