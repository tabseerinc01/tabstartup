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
  User as UserIcon
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

export default function WatchlistPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [sortBy, setSortBy] = useState('recently_added');
  const [startupsData, setStartupsData] = useState<Record<string, any>>({});
  const [foundersData, setFoundersData] = useState<Record<string, any>>({});
  const [activityData, setActivityData] = useState<Record<string, any>>({});
  const [interestsData, setInterestsData] = useState<Record<string, boolean>>({});
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

  // 2. Hydrate Watchlist with Startup and Founder details
  useEffect(() => {
    async function hydrateWatchlist() {
      if (!firestore || !watchlistItems || watchlistItems.length === 0) return;
      
      setIsDetailLoading(true);
      try {
        const newStartups: Record<string, any> = { ...startupsData };
        const newFounders: Record<string, any> = { ...foundersData };
        const newActivities: Record<string, any> = { ...activityData };
        const newInterests: Record<string, boolean> = { ...interestsData };

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

              if (user?.uid) {
                const interestSnap = await getDoc(doc(firestore, 'startups', sData.ownerUid, 'interests', user.uid));
                newInterests[startupId] = interestSnap.exists();
              }
            }
          }
        }

        setStartupsData(newStartups);
        setFoundersData(newFounders);
        setActivityData(newActivities);
        setInterestsData(newInterests);
      } catch (e) {
        console.error("Hydration Error:", e);
      } finally {
        setIsDetailLoading(false);
      }
    }
    hydrateWatchlist();
  }, [firestore, watchlistItems, user?.uid]);

  const handleRemove = async (id: string) => {
    if (!firestore) return;
    try {
      await deleteDoc(doc(firestore, 'savedStartups', id));
      toast({ title: "Removed from Watchlist" });
    } catch (e) {
      console.error(e);
      toast({ title: "Error removing item", variant: "destructive" });
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

      <div className="grid gap-6">
        {sortedItems.length > 0 ? (
          sortedItems.map((item) => {
            const startup = startupsData[item.startupId];
            const founder = startup ? foundersData[startup.ownerUid] : null;
            const activity = activityData[item.startupId];
            const isInterestSent = interestsData[item.startupId];

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
                          <div>
                            <h3 className="text-2xl font-black text-slate-900 group-hover:text-primary transition-colors">{item.startupName}</h3>
                            <div className="flex flex-wrap items-center gap-3 mt-1">
                              <span className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                                <UserIcon className="h-3.5 w-3.5 text-primary/50" /> {founder?.fullName || "Leader"}
                              </span>
                              <Badge variant="secondary" className="bg-primary/5 text-primary border-none rounded-md px-2 h-5 font-bold uppercase text-[9px] tracking-widest">
                                {startup?.industry || "Venture"}
                              </Badge>
                              <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase">
                                <MapPin className="h-3 w-3" /> {startup?.location || "Global"}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <Badge variant="outline" className="rounded-full border-slate-200 font-black text-[9px] h-6 px-3 uppercase tracking-tighter">
                            {startup?.stage || "Idea"}
                          </Badge>
                          <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mt-2">
                             Watching since {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString() : 'Recently'}
                          </p>
                        </div>
                      </div>

                      <div className="bg-slate-50/50 p-5 rounded-[2rem] border border-slate-100 relative group/activity">
                        <div className="flex items-center gap-2 mb-2">
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
                          <p className="text-xs text-slate-400 italic font-medium">No recent updates found for this venture.</p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-4 pt-4">
                        <Button className="rounded-xl h-11 px-8 font-black gap-2 shadow-lg shadow-primary/20" asChild>
                          <Link href={`/startups/${startup?.slug || item.startupId}`}>
                            Analyze Profile <ArrowRight className="h-4 w-4" />
                          </Link>
                        </Button>
                        
                        {isInterestSent ? (
                          <Badge className="h-11 px-6 rounded-xl bg-green-50 text-green-600 border border-green-100 font-black text-xs gap-2">
                            <CheckCircle2 className="h-4 w-4" /> Interest Sent
                          </Badge>
                        ) : (
                          <Button variant="outline" className="rounded-xl h-11 px-6 font-bold border-slate-200 text-slate-600 hover:bg-primary hover:text-white hover:border-primary transition-all group/btn" asChild>
                             <Link href={`/startups/${startup?.slug || item.startupId}?action=pitch`}>
                                <Rocket className="h-4 w-4 mr-2 text-primary group-hover/btn:text-white" /> Express Interest
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
                          <Trash2 className="h-4 w-4" /> Stop Watching
                        </Button>
                      </div>
                    </div>

                    <div className="hidden lg:flex w-64 bg-slate-900 text-white p-8 flex-col justify-between border-l border-slate-800">
                       <div className="space-y-6">
                          <div className="space-y-1">
                             <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Target Funding</p>
                             <p className="text-2xl font-black text-primary">{startup?.fundingNeed || 'TBD'}</p>
                          </div>
                          <div className="space-y-4">
                             <div className="flex items-center gap-2">
                                <ShieldCheck className="h-4 w-4 text-primary" />
                                <span className="text-[10px] font-bold text-slate-400 uppercase">Verification Level</span>
                             </div>
                             <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                                <div className="bg-primary h-full transition-all" style={{ width: startup?.startupVerified ? '100%' : '30%' }} />
                             </div>
                          </div>
                       </div>
                       <Button variant="outline" className="w-full justify-start h-10 rounded-xl bg-white/5 border-none hover:bg-white/10 text-white text-xs font-bold gap-2" asChild>
                          <Link href={`/dashboard/messages?startWith=${startup?.ownerUid}`}>
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

      <section className="bg-primary rounded-[2.5rem] p-10 text-white relative overflow-hidden group">
         <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div className="space-y-4">
               <h2 className="text-3xl font-black tracking-tight">Private Intelligence</h2>
               <p className="text-white/80 font-medium leading-relaxed">
                  Watching a startup is completely private. Founders are never notified when you add them to your watchlist, allowing you to monitor traction discreetly before initiating a pitch.
               </p>
            </div>
            <div className="flex justify-end">
               <div className="p-6 bg-white/10 backdrop-blur-xl rounded-[2rem] border border-white/10 text-center space-y-2">
                  <p className="text-4xl font-black">100%</p>
                  <p className="text-[10px] font-black uppercase tracking-widest text-primary">Confidentiality Guarantee</p>
               </div>
            </div>
         </div>
         <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -mr-32 -mt-32" />
      </section>
    </div>
  );
}