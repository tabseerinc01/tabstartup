'use client';

import { useState, useEffect, useMemo } from 'react';
import { useFirestore, useUser, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, deleteDoc, doc, getDocs, limit, orderBy, getDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Loader2, 
  Eye, 
  Trash2, 
  ArrowRight, 
  TrendingUp, 
  Clock, 
  MapPin, 
  Rocket, 
  MessageSquare,
  Zap,
  CheckCircle2,
  Filter,
  Calendar,
  User as UserIcon,
  ShieldCheck,
  HandCoins,
  Globe,
  Check
} from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export default function WatchlistPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [sortBy, setSortBy] = useState('recently_added');
  const [startupsData, setStartupsData] = useState<Record<string, any>>({});
  const [foundersData, setFoundersData] = useState<Record<string, any>>({});
  const [activityData, setActivityData] = useState<Record<string, any>>({});
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  // 1. Fetch Watchlist Records
  const watchlistQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
      collection(firestore, 'savedStartups'),
      where('investorUid', '==', user.uid),
      where('isWatchlist', '==', true)
    );
  }, [firestore, user?.uid]);

  const { data: watchlistItems, isLoading: isWatchlistLoading } = useCollection(watchlistQuery);

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

  // 3. Hydrate Details
  useEffect(() => {
    async function hydrateWatchlist() {
      if (!firestore || !watchlistItems || watchlistItems.length === 0) return;
      
      setIsDetailLoading(true);
      try {
        const newStartups: Record<string, any> = { ...startupsData };
        const newFounders: Record<string, any> = { ...foundersData };
        const newActivities: Record<string, any> = { ...activityData };

        for (const item of watchlistItems) {
          const startupId = item.startupId;
          
          if (!newStartups[startupId]) {
            const sSnap = await getDoc(doc(firestore, 'startups', startupId));
            if (sSnap.exists()) {
              const sData = sSnap.data();
              newStartups[startupId] = sData;

              if (sData.ownerUid && !newFounders[sData.ownerUid]) {
                const fSnap = await getDoc(doc(firestore, 'users', sData.ownerUid));
                if (fSnap.exists()) newFounders[sData.ownerUid] = fSnap.data();
              }

              // Load latest community activity
              const activityQ = query(
                collection(firestore, 'communityPosts'),
                where('authorUid', '==', sData.ownerUid),
                where('status', '==', 'active'),
                orderBy('createdAt', 'desc'),
                limit(1)
              );
              const aSnap = await getDocs(activityQ);
              if (!aSnap.empty) {
                newActivities[startupId] = aSnap.docs[0].data();
              }
            }
          }
        }

        setStartupsData(newStartups);
        setFoundersData(newFounders);
        setActivityData(newActivities);
      } catch (e) {
        console.error("Hydration Error:", e);
      } finally {
        setIsDetailLoading(false);
      }
    }
    hydrateWatchlist();
  }, [firestore, watchlistItems]);

  const handleRemove = async (id: string) => {
    if (!firestore) return;
    try {
      await deleteDoc(doc(firestore, 'savedStartups', id));
      toast({ title: "Removed from Watchlist" });
    } catch (e) {
      console.error(e);
    }
  };

  const sortedItems = useMemo(() => {
    if (!watchlistItems) return [];
    const items = [...watchlistItems];
    
    return items.sort((a, b) => {
      if (sortBy === 'name') {
        return (a.startupName || '').localeCompare(b.startupName || '');
      }
      if (sortBy === 'recently_added') {
        const timeA = a.createdAt?.toMillis?.() || 0;
        const timeB = b.createdAt?.toMillis?.() || 0;
        return timeB - timeA;
      }
      if (sortBy === 'recently_updated') {
        const startupA = startupsData[a.startupId];
        const startupB = startupsData[b.startupId];
        const timeA = startupA?.updatedAt?.toMillis?.() || 0;
        const timeB = startupB?.updatedAt?.toMillis?.() || 0;
        return timeB - timeA;
      }
      return 0;
    });
  }, [watchlistItems, sortBy, startupsData]);

  if (isWatchlistLoading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest animate-pulse">Loading Watchlist...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto w-full space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 rounded-2xl text-primary">
            <Eye className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900">Investor Watchlist</h1>
            <p className="text-sm font-medium text-slate-500">Tracking high-potential ventures for progress and milestones.</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400" />
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[180px] h-10 rounded-xl bg-white border-slate-200 font-bold text-xs">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recently_updated">Recently Updated</SelectItem>
                <SelectItem value="recently_added">Recently Added</SelectItem>
                <SelectItem value="name">Startup Name</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="grid gap-8">
        {sortedItems.length > 0 ? (
          sortedItems.map((item) => {
            const s = startupsData[item.startupId];
            const founder = s ? foundersData[s.ownerUid] : null;
            const activity = activityData[item.startupId];
            const relations = relationsMap[item.startupId] || {};
            const startupIdentifier = s?.slug || item.startupId;

            return (
              <Card key={item.id} className="group border-none shadow-sm hover:shadow-xl transition-all duration-500 rounded-[2.5rem] overflow-hidden bg-background ring-1 ring-slate-100">
                <CardContent className="p-0">
                  <div className="flex flex-col lg:flex-row">
                    <div className="flex-1 p-8 space-y-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-5">
                          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-black text-2xl shadow-inner border border-primary/5">
                            {item.startupName?.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-3 mb-1 flex-wrap">
                               <h3 className="text-2xl font-black text-slate-900 group-hover:text-primary transition-colors">{item.startupName}</h3>
                               {relations.interested && (
                                 <Badge className="bg-green-100 text-green-700 border-none rounded-lg px-2 py-0.5 text-[8px] font-black uppercase tracking-widest">
                                   Interest Sent ✓
                                 </Badge>
                               )}
                               {relations.savedId && (
                                 <Badge className="bg-primary/10 text-primary border-none rounded-lg px-2 py-0.5 text-[8px] font-black uppercase tracking-widest">
                                   Saved ✓
                                 </Badge>
                               )}
                               <Badge className="bg-primary/20 text-primary border-none rounded-lg px-2 py-0.5 text-[8px] font-black uppercase tracking-widest">
                                 Watching ✓
                               </Badge>
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                              <span className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                                <UserIcon className="h-3.5 w-3.5 text-primary/50" /> {founder?.fullName || "Founder"}
                              </span>
                              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                                Watching since {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString() : 'Recently'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Intelligent Priority Badges */}
                      <div className="flex flex-wrap gap-2">
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
                          <Globe className="h-2.5 w-2.5" /> {s?.location || 'Global'}
                        </Badge>
                      </div>

                      <div className="bg-slate-50/50 p-6 rounded-[2rem] border border-slate-100 relative group/activity">
                        <div className="flex items-center gap-2 mb-3">
                           <TrendingUp className="h-3.5 w-3.5 text-primary" />
                           <span className="text-[10px] font-black uppercase tracking-widest text-primary">Latest Activity</span>
                        </div>
                        {activity ? (
                          <div className="space-y-1">
                            <p className="text-sm text-slate-600 font-medium line-clamp-1 italic">
                              "{activity.content}"
                            </p>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">
                              Shared {formatDistanceToNow(activity.createdAt?.toDate(), { addSuffix: true })}
                            </p>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 italic font-medium">No recent updates shared by the founder.</p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-4 pt-4">
                        <Button className="rounded-xl h-11 px-8 font-black gap-2 shadow-lg shadow-primary/20 group-hover:scale-[1.02] transition-transform" asChild>
                          <Link href={`/startups/${startupIdentifier}`}>
                            Analyze Profile <ArrowRight className="h-4 w-4" />
                          </Link>
                        </Button>
                        
                        {!relations.interested && (
                          <Button variant="outline" className="rounded-xl h-11 px-6 font-bold border-slate-200 text-slate-600 hover:bg-primary hover:text-white hover:border-primary transition-all" asChild>
                             <Link href={`/startups/${startupIdentifier}?action=pitch`}>
                                <Rocket className="h-4 w-4 mr-2" /> Express Interest
                             </Link>
                          </Button>
                        )}

                        <div className="flex-1" />

                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleRemove(item.id)}
                          className="rounded-xl h-10 px-4 text-slate-400 hover:text-destructive hover:bg-destructive/5 font-bold gap-2"
                        >
                          <Trash2 className="h-4 w-4" /> Remove
                        </Button>
                      </div>
                    </div>

                    <div className="hidden lg:flex w-64 bg-slate-900 text-white p-8 flex-col justify-between border-l border-slate-800">
                       <div className="space-y-6">
                          <div className="space-y-1">
                             <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Target Funding</p>
                             <p className="text-2xl font-black text-primary">{s?.fundingNeed || 'TBD'}</p>
                          </div>
                          <div className="space-y-4">
                             <div className="flex items-center gap-2">
                                <ShieldCheck className="h-4 w-4 text-primary" />
                                <span className="text-[10px] font-bold text-slate-400 uppercase">Verification</span>
                             </div>
                             <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                                <div className="bg-primary h-full transition-all" style={{ width: s?.startupVerified ? '100%' : '30%' }} />
                             </div>
                          </div>
                       </div>
                       <Button variant="outline" className="w-full justify-start h-10 rounded-xl bg-white/5 border-none hover:bg-white/10 text-white text-xs font-bold gap-2" asChild>
                          <Link href={`/dashboard/messages?startWith=${s?.ownerUid}`}>
                             <MessageSquare className="h-3.5 w-3.5" /> Direct Inquiry
                          </Link>
                       </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <div className="py-32 text-center space-y-6 bg-white rounded-[3rem] border-2 border-dashed border-slate-100 animate-in zoom-in-95 duration-500">
             <div className="p-8 bg-slate-50 rounded-full w-fit mx-auto relative group">
                <Eye className="h-16 w-16 text-slate-200 group-hover:scale-110 transition-transform" />
                <div className="absolute top-0 right-0 p-2 bg-primary rounded-full shadow-lg">
                   <Rocket className="h-4 w-4 text-white" />
                </div>
             </div>
             <div className="space-y-2">
                <h3 className="text-2xl font-black text-slate-900">Your Watchlist is Empty</h3>
                <p className="text-slate-500 font-medium max-w-sm mx-auto">
                   Start following high-potential ventures to monitor their growth and ecosystem activity privately.
                </p>
             </div>
             <Button asChild className="rounded-full px-10 h-14 font-black text-base shadow-xl shadow-primary/20">
                <Link href="/startups">Discover Active Ventures</Link>
             </Button>
          </div>
        )}
      </div>
    </div>
  );
}
