'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useFirestore, useUser, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, getDocs, limit, doc, addDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { PublicHeader } from '@/components/public/header';
import { PublicFooter } from '@/components/public/footer';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  Rocket, 
  Search, 
  Filter, 
  Loader2, 
  MapPin, 
  TrendingUp, 
  Briefcase, 
  Star, 
  ArrowRight,
  LayoutGrid,
  Heart,
  Eye,
  Zap,
  Check,
  ShieldCheck,
  HandCoins,
  Globe
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const STAGES = ["Idea", "Early", "Growth", "Scaling"];
const INDUSTRIES = ["Fintech", "AgriTech", "SaaS", "E-commerce", "AI", "Healthcare", "EdTech"];

export default function StartupsDirectoryPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [startups, setStartups] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionProcessing, setIsActionProcessing] = useState<string | null>(null);
  
  // Filters
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [industryFilter, setIndustryFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');

  // 1. Fetch Startups
  useEffect(() => {
    async function loadStartups() {
      if (!firestore) return;
      setIsLoading(true);
      try {
        const q = query(
          collection(firestore, 'startups'),
          where('status', '==', 'active'),
          limit(100)
        );
        const snap = await getDocs(q);
        setStartups(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Error loading startups:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadStartups();
  }, [firestore]);

  // 2. Fetch User Relations (Saved/Watched/Interests)
  const savedQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'savedStartups'), where('investorUid', '==', user.uid));
  }, [firestore, user?.uid]);
  const { data: userSaves } = useCollection(savedQuery);

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

  const filtered = useMemo(() => {
    return startups
      .filter(s => {
        const matchesSearch = s.name?.toLowerCase().includes(search.toLowerCase()) || 
                             s.shortDescription?.toLowerCase().includes(search.toLowerCase());
        const matchesStage = stageFilter === 'all' || s.stage === stageFilter;
        const matchesIndustry = industryFilter === 'all' || s.industry === industryFilter;
        return matchesSearch && matchesStage && matchesIndustry;
      })
      .sort((a, b) => {
        if (sortBy === 'newest') return (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0);
        if (sortBy === 'featured') return (b.featured ? 1 : 0) - (a.featured ? 1 : 0);
        return 0;
      });
  }, [startups, search, stageFilter, industryFilter, sortBy]);

  const handleToggleSave = async (startup: any, isWatchlist: boolean) => {
    if (!user || !firestore) { toast({ title: "Login Required" }); return; }
    if (user.uid === startup.ownerUid) return;

    const key = isWatchlist ? 'watchedId' : 'savedId';
    const existingId = relationsMap[startup.ownerUid]?.[key];
    
    setIsActionProcessing(`${startup.id}-${key}`);
    try {
      if (existingId) {
        await deleteDoc(doc(firestore, 'savedStartups', existingId));
        toast({ title: isWatchlist ? "Removed from Watchlist" : "Removed from Saved" });
      } else {
        await addDoc(collection(firestore, 'savedStartups'), {
          investorUid: user.uid,
          startupId: startup.ownerUid,
          startupName: startup.name,
          isWatchlist,
          createdAt: serverTimestamp()
        });
        toast({ title: isWatchlist ? "Added to Watchlist" : "Startup Saved" });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsActionProcessing(null);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <PublicHeader />
      <main className="flex-1 container mx-auto px-4 py-12 md:py-20">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/10 rounded-2xl">
                <Rocket className="h-8 w-8 text-primary" />
              </div>
              <h1 className="text-4xl font-black tracking-tight text-slate-900">Venture Directory</h1>
            </div>
            <p className="text-xl text-muted-foreground max-w-2xl font-medium">
              Discover high-potential startups and disruptive ventures from the TabStartup network.
            </p>
          </div>

          <Card className="border-none shadow-xl rounded-[2.5rem] bg-background p-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="md:col-span-1 space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input 
                    placeholder="Startup name..." 
                    className="pl-10 rounded-xl"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Stage</Label>
                <Select value={stageFilter} onValueChange={setStageFilter}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="All Stages" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Stages</SelectItem>
                    {STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Vertical</Label>
                <Select value={industryFilter} onValueChange={setIndustryFilter}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="All Industries" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Industries</SelectItem>
                    {INDUSTRIES.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Sort By</Label>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Recently Added</SelectItem>
                    <SelectItem value="featured">Featured First</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          {isLoading ? (
            <div className="flex py-20 justify-center"><Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" /></div>
          ) : filtered.length === 0 ? (
            <Card className="border-2 border-dashed rounded-[3rem] bg-background/50 py-32 text-center">
              <CardContent className="space-y-4">
                <div className="p-6 bg-muted/50 rounded-full w-fit mx-auto"><Rocket className="h-12 w-12 text-slate-300" /></div>
                <h3 className="text-xl font-bold">No ventures found</h3>
                <Button variant="outline" onClick={() => {setSearch(''); setStageFilter('all'); setIndustryFilter('all');}} className="rounded-full">Clear Filters</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {filtered.map((s) => {
                const relations = relationsMap[s.ownerUid] || {};
                const startupId = s.slug || s.id;
                const isOwn = user?.uid === s.ownerUid;

                return (
                  <Card key={s.id} className="group border-none shadow-lg hover:shadow-2xl transition-all duration-500 bg-background rounded-[2.5rem] overflow-hidden flex flex-col h-full ring-1 ring-slate-100">
                    <CardHeader className="p-8 pb-4">
                      <div className="flex justify-between items-start mb-6">
                        <Link href={`/startups/${startupId}`}>
                          <div className="p-3 bg-primary/5 rounded-2xl text-primary group-hover:bg-primary group-hover:text-white transition-all">
                            <Rocket className="h-6 w-6" />
                          </div>
                        </Link>
                        <div className="flex flex-wrap justify-end gap-1.5 max-w-[200px]">
                           {/* Status Pills */}
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
                           {relations.savedId && (
                             <Badge className="bg-primary/10 text-primary border-none rounded-lg px-2 py-0.5 text-[8px] font-black uppercase tracking-widest">
                               Saved ✓
                             </Badge>
                           )}
                        </div>
                      </div>
                      <Link href={`/startups/${startupId}`}>
                        <CardTitle className="text-2xl font-black group-hover:text-primary transition-colors">{s.name}</CardTitle>
                      </Link>
                      
                      {/* Priority Badges */}
                      <div className="flex flex-wrap gap-2 mt-4">
                        {s.startupVerified && (
                          <Badge className="bg-blue-50 text-blue-700 border-blue-100 rounded-lg px-2.5 py-1 text-[9px] font-black uppercase flex items-center gap-1">
                            <ShieldCheck className="h-3 w-3" /> Verified
                          </Badge>
                        )}
                        {s.fundingNeed && (
                          <Badge className="bg-green-50 text-green-700 border-green-100 rounded-lg px-2.5 py-1 text-[9px] font-black uppercase flex items-center gap-1">
                            <HandCoins className="h-3 w-3" /> Raising {s.fundingNeed}
                          </Badge>
                        )}
                        <Badge variant="secondary" className="rounded-lg px-2.5 py-1 text-[9px] font-black uppercase">
                          {s.stage}
                        </Badge>
                        <Badge variant="outline" className="border-slate-200 rounded-lg px-2.5 py-1 text-[9px] font-black uppercase text-slate-500">
                          {s.industry}
                        </Badge>
                        <Badge variant="outline" className="border-slate-200 rounded-lg px-2.5 py-1 text-[9px] font-black uppercase text-slate-500 flex items-center gap-1">
                          <Globe className="h-2.5 w-2.5" /> {s.location || 'Global'}
                        </Badge>
                      </div>
                    </CardHeader>
                    
                    <CardContent className="p-8 pt-0 flex-1 space-y-6">
                      <p className="text-slate-500 leading-relaxed font-medium line-clamp-3 italic text-sm">
                        "{s.shortDescription || 'A visionary startup building for the next generation.'}"
                      </p>
                      
                      <div className="pt-6 border-t border-slate-50 space-y-6">
                         {/* Quick Actions Bar for Directory */}
                         {!isOwn && (
                           <div className="flex items-center gap-2 pt-2">
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => handleToggleSave(s, false)}
                                disabled={isActionProcessing === `${s.id}-savedId`}
                                className={cn(
                                  "rounded-xl h-9 px-3 gap-1.5 text-[10px] font-black uppercase transition-all",
                                  relations.savedId ? "bg-primary/10 text-primary border-primary/20" : "text-slate-400 hover:text-primary"
                                )}
                              >
                                {isActionProcessing === `${s.id}-savedId` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Heart className={cn("h-3 w-3", relations.savedId && "fill-primary")} />}
                                {relations.savedId ? "Saved" : "Save"}
                              </Button>
                              
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => handleToggleSave(s, true)}
                                disabled={isActionProcessing === `${s.id}-watchedId`}
                                className={cn(
                                  "rounded-xl h-9 px-3 gap-1.5 text-[10px] font-black uppercase transition-all",
                                  relations.watchedId ? "bg-primary/10 text-primary border-primary/20" : "text-slate-400 hover:text-primary"
                                )}
                              >
                                {isActionProcessing === `${s.id}-watchedId` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className={cn("h-3 w-3", relations.watchedId && "fill-primary")} />}
                                {relations.watchedId ? "Watching" : "Watch"}
                              </Button>

                              <Button 
                                variant={relations.interested ? "secondary" : "default"}
                                size="sm" 
                                asChild
                                className={cn(
                                  "rounded-xl h-9 px-4 gap-1.5 text-[10px] font-black uppercase ml-auto shadow-sm",
                                  relations.interested && "bg-green-50 text-green-600 hover:bg-green-50 pointer-events-none border-none"
                                )}
                              >
                                <Link href={`/startups/${startupId}${relations.interested ? '' : '?action=pitch'}`}>
                                   {relations.interested ? <Check className="h-3 w-3" /> : <Rocket className="h-3 w-3" />}
                                   {relations.interested ? "Interest Sent" : "Express Interest"}
                                </Link>
                              </Button>
                           </div>
                         )}

                         {!isOwn && (
                           <Button className="w-full rounded-xl font-bold h-11 group-hover:bg-primary group-hover:text-white transition-all" variant="ghost" asChild>
                              <Link href={`/startups/${startupId}`}>View Full Profile <ArrowRight className="ml-2 h-4 w-4" /></Link>
                           </Button>
                         )}

                         {isOwn && (
                           <Button className="w-full rounded-xl font-bold h-11 border-dashed" variant="outline" asChild>
                              <Link href="/dashboard/startup">Manage My Venture <Rocket className="ml-2 h-4 w-4" /></Link>
                           </Button>
                         )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
