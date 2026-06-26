'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useFirestore } from '@/firebase';
import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
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
  LayoutGrid
} from 'lucide-react';
import { cn } from '@/lib/utils';

const STAGES = ["Idea", "Early", "Growth", "Scaling"];
const INDUSTRIES = ["Fintech", "AgriTech", "SaaS", "E-commerce", "AI", "Healthcare", "EdTech"];

export default function StartupsDirectoryPage() {
  const firestore = useFirestore();
  const [startups, setStartups] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filters
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [industryFilter, setIndustryFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');

  useEffect(() => {
    async function loadStartups() {
      if (!firestore) return;
      setIsLoading(true);
      try {
        const q = query(
          collection(firestore, 'startups'),
          where('status', '==', 'active'),
          limit(50)
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
              {filtered.map((s) => (
                <Link key={s.id} href={`/startups/${s.slug || s.id}`}>
                  <Card className="group border-none shadow-lg hover:shadow-2xl transition-all duration-500 bg-background rounded-[2.5rem] overflow-hidden flex flex-col h-full">
                    <CardHeader className="p-8 pb-4">
                      <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-primary/5 rounded-2xl text-primary group-hover:bg-primary group-hover:text-white transition-all">
                          <Rocket className="h-6 w-6" />
                        </div>
                        <div className="flex gap-2">
                          {s.featured && <Badge className="bg-amber-500 border-none text-[8px] font-black uppercase">Featured</Badge>}
                          <Badge variant="outline" className="text-[8px] font-black uppercase">{s.stage}</Badge>
                        </div>
                      </div>
                      <CardTitle className="text-2xl font-black group-hover:text-primary transition-colors">{s.name}</CardTitle>
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">
                        <MapPin className="h-3 w-3" /> {s.location || 'Remote'}
                      </div>
                    </CardHeader>
                    <CardContent className="p-8 pt-0 flex-1 space-y-6">
                      <p className="text-slate-500 leading-relaxed font-medium line-clamp-3 italic">
                        "{s.shortDescription || 'A visionary startup building for the next generation.'}"
                      </p>
                      <div className="pt-6 border-t border-slate-50 flex items-center justify-between">
                         <div className="flex items-center gap-2">
                           <Badge variant="secondary" className="bg-primary/5 text-primary border-none rounded-lg px-2 h-5 text-[9px] font-black">{s.industry}</Badge>
                         </div>
                         <div className="flex items-center text-xs font-bold text-primary opacity-0 group-hover:opacity-100 transition-all translate-x-[-10px] group-hover:translate-x-0">
                           View Profile <ArrowRight className="ml-1 h-3 w-3" />
                         </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
