'use client';

import { useState, useEffect, useMemo } from 'react';
import { useFirestore, useUser, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, deleteDoc, doc, getDoc, getDocs, limit } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Loader2, 
  Rocket, 
  MapPin, 
  Trash2, 
  ArrowRight, 
  Star, 
  ShieldCheck, 
  HandCoins, 
  Globe, 
  Check,
  Eye,
  Heart
} from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export default function SavedStartupsPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [startupsData, setStartupsData] = useState<Record<string, any>>({});
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  // 1. Fetch Saved Records
  const savedQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
      collection(firestore, 'savedStartups'),
      where('investorUid', '==', user.uid),
      where('isWatchlist', '==', false)
    );
  }, [firestore, user?.uid]);

  const { data: savedItems, isLoading: isSavedLoading } = useCollection(savedQuery);

  // 2. Fetch User Relations (for status pills)
  const allSavesQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'savedStartups'), where('investorUid', '==', user.uid));
  }, [firestore, user?.uid]);
  const { data: userSaves } = useCollection(allSavesQuery);

  const connsQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'connections'), where('initiatorUid', '==', user.uid), where('type', '==', 'investor'));
  }, [firestore, user?.uid]);
  const { data: userConns } = useCollection(connsQuery);

  const relationsMap = useMemo(() => {
    const map: Record<string, { savedId?: string, watchedId?: string, interested?: boolean }> = {};
    userSaves?.forEach(s => {
      if (!map[s.startupId]) map[s.startupId] = {};
      if (s.isWatchlist) map[s.startupId].watchedId = s.id;
      else map[s.startupId].savedId = s.id;
    });
    userConns?.forEach(c => {
      if (!map[c.recipientUid]) map[c.recipientUid] = {};
      map[c.recipientUid].interested = true;
    });
    return map;
  }, [userSaves, userConns]);

  // 3. Hydrate Metadata
  useEffect(() => {
    async function hydrate() {
      if (!firestore || !savedItems || savedItems.length === 0) return;
      setIsDetailLoading(true);
      try {
        const newStartups = { ...startupsData };
        for (const item of savedItems) {
          if (!newStartups[item.startupId]) {
            const snap = await getDoc(doc(firestore, 'startups', item.startupId));
            if (snap.exists()) newStartups[item.startupId] = snap.data();
          }
        }
        setStartupsData(newStartups);
      } catch (e) {
        console.error(e);
      } finally {
        setIsDetailLoading(false);
      }
    }
    hydrate();
  }, [firestore, savedItems]);

  const handleUnsave = async (id: string) => {
    if (!firestore) return;
    try {
      await deleteDoc(doc(firestore, 'savedStartups', id));
      toast({ title: "Startup Removed", description: "Successfully removed from saved list." });
    } catch (e) {
      console.error(e);
    }
  };

  if (isSavedLoading) {
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
          <Heart className="h-8 w-8 fill-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Saved Startups</h1>
          <p className="text-sm font-medium text-slate-500">Your prioritized ventures library.</p>
        </div>
      </div>

      <div className="grid gap-8 grid-cols-1 md:grid-cols-2">
        {savedItems && savedItems.length > 0 ? (
          savedItems.map((item) => {
            const s = startupsData[item.startupId];
            const relations = relationsMap[item.startupId] || {};
            const startupIdentifier = s?.slug || item.startupId;

            return (
              <Card key={item.id} className="group border-none shadow-sm hover:shadow-xl transition-all duration-300 rounded-[2.5rem] overflow-hidden bg-background ring-1 ring-slate-100 flex flex-col h-full">
                <CardHeader className="p-8 pb-4">
                  <div className="flex justify-between items-start mb-6">
                    <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-black text-xl shadow-inner">
                      {item.startupName?.charAt(0)}
                    </div>
                    <div className="flex flex-wrap justify-end gap-1.5 max-w-[180px]">
                        {relations.interested && (
                          <Badge className="bg-green-100 text-green-700 border-none rounded-lg px-2 py-0.5 text-[8px] font-black uppercase tracking-widest">
                            Interest Sent ✓
                          </Badge>
                        )}
                        {relations.watchedId && (
                          <Badge className="bg-primary/10 text-primary border-none rounded-lg px-2 py-0.5 text-[8px] font-black uppercase tracking-widest">
                            Watching ✓
                          </Badge>
                        )}
                        <Badge className="bg-primary/20 text-primary border-none rounded-lg px-2 py-0.5 text-[8px] font-black uppercase tracking-widest">
                          Saved ✓
                        </Badge>
                    </div>
                  </div>
                  <CardTitle className="text-2xl font-black group-hover:text-primary transition-colors truncate">
                    {item.startupName}
                  </CardTitle>
                  
                  {/* Intelligent Priority Badges */}
                  <div className="flex flex-wrap gap-2 mt-4">
                    {s?.startupVerified && (
                      <Badge className="bg-blue-50 text-blue-700 border-blue-100 rounded-lg px-2.5 py-1 text-[9px] font-black uppercase flex items-center gap-1">
                        <ShieldCheck className="h-3 w-3" /> Verified
                      </Badge>
                    )}
                    {s?.fundingNeed && (
                      <Badge className="bg-green-50 text-green-700 border-green-100 rounded-lg px-2.5 py-1 text-[9px] font-black uppercase flex items-center gap-1">
                        <HandCoins className="h-3 w-3" /> Raising {s.fundingNeed}
                      </Badge>
                    )}
                    <Badge variant="secondary" className="rounded-lg px-2.5 py-1 text-[9px] font-black uppercase">
                      {s?.stage || 'Idea'}
                    </Badge>
                    <Badge variant="outline" className="border-slate-200 rounded-lg px-2.5 py-1 text-[9px] font-black uppercase text-slate-500">
                      {s?.industry || 'Venture'}
                    </Badge>
                    <Badge variant="outline" className="border-slate-200 rounded-lg px-2.5 py-1 text-[9px] font-black uppercase text-slate-500 flex items-center gap-1">
                      <Globe className="h-2.5 w-2.5" /> {s?.location || 'BD'}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="px-8 pb-8 pt-4 flex-1 flex flex-col justify-between space-y-6">
                  <p className="text-sm text-slate-500 font-medium line-clamp-2 italic leading-relaxed">
                    "{s?.shortDescription || 'A promising venture in the TabStartup ecosystem.'}"
                  </p>
                  
                  <div className="pt-6 border-t border-slate-50 flex items-center justify-between gap-3">
                    <Button className="flex-1 rounded-xl h-11 font-black gap-2 shadow-lg shadow-primary/20 group-hover:scale-[1.02] transition-transform" asChild>
                      <Link href={`/startups/${startupIdentifier}`}>
                        View Profile <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-11 w-11 rounded-xl text-slate-300 hover:text-destructive hover:bg-destructive/5" 
                      onClick={() => handleUnsave(item.id)}
                    >
                      <Trash2 className="h-5 w-5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })
        ) : (
          <Card className="col-span-full border-2 border-dashed rounded-[3rem] bg-background/50 py-32 text-center">
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
