'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { collection, query, where, limit, getDocs, orderBy } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Search, Filter, Target, Briefcase, Zap, MapPin, ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react';
import { PublicHeader } from '@/components/public/header';
import { PublicFooter } from '@/components/public/footer';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const STAGE_FILTER_OPTIONS = ['All', 'Idea', 'Early', 'Growth', 'Scaling'] as const;

export default function InvestorsPage() {
  const [investors, setInvestors] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [focusFilter, setFocusFilter] = useState('all');
  const [stageFilter, setStageFilter] = useState<string>('All');
  const [sortBy, setSortBy] = useState('newest');
  
  const firestore = useFirestore();

  useEffect(() => {
    async function loadInvestors() {
      if (!firestore) return;
      setIsLoading(true);
      try {
        const multiRoleQuery = query(
          collection(firestore, 'users'), 
          where('roles', 'array-contains', 'investor'), 
          limit(100)
        );
        const legacyRoleQuery = query(
          collection(firestore, 'users'),
          where('role', '==', 'investor'),
          limit(100)
        );

        const [multiSnap, legacySnap] = await Promise.all([
          getDocs(multiRoleQuery),
          getDocs(legacyRoleQuery)
        ]);

        const userMap = new Map();
        multiSnap.docs.forEach(d => userMap.set(d.id, { id: d.id, ...d.data() }));
        legacySnap.docs.forEach(d => {
          if (!userMap.has(d.id)) {
            userMap.set(d.id, { id: d.id, ...d.data() });
          }
        });

        setInvestors(Array.from(userMap.values()));
      } catch (error) {
        console.error("Error loading investors:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadInvestors();
  }, [firestore]);

  const filteredInvestors = useMemo(() => {
    return investors.filter((inv) => {
      const name = (inv.fullName || '').toLowerCase();
      const headline = (inv.investorHeadline || inv.headline || '').toLowerCase();
      const searchTerm = search.toLowerCase();
      
      const matchesSearch = name.includes(searchTerm) || headline.includes(searchTerm);
      
      const matchesStage = stageFilter === 'All' 
        ? true 
        : Array.isArray(inv.preferredStage) 
          ? inv.preferredStage.some((s: string) => s.toLowerCase() === stageFilter.toLowerCase())
          : (inv.preferredStage || '').toLowerCase().includes(stageFilter.toLowerCase());

      const matchesFocus = focusFilter === 'all' 
        ? true 
        : Array.isArray(inv.investmentFocus)
          ? inv.investmentFocus.some((f: string) => f.toLowerCase() === focusFilter.toLowerCase())
          : (inv.investmentFocus || '').toLowerCase().includes(focusFilter.toLowerCase());

      return matchesSearch && matchesStage && matchesFocus;
    }).sort((a, b) => {
      if (sortBy === 'newest') return (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0);
      if (sortBy === 'verified') return (b.isVerified ? 1 : 0) - (a.isVerified ? 1 : 0);
      return 0;
    });
  }, [investors, search, stageFilter, focusFilter, sortBy]);

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <PublicHeader />
      <main className="flex-1 container mx-auto px-4 py-12 md:py-20">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="space-y-4 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-3">
              <div className="p-3 bg-primary/10 rounded-2xl">
                <ShieldCheck className="h-8 w-8 text-primary" />
              </div>
              <h1 className="text-4xl font-black tracking-tight text-slate-900">Capital Network</h1>
            </div>
            <p className="text-xl text-muted-foreground max-w-2xl font-medium">
              Connect with strategic investors and capital partners backing the next generation of global ventures.
            </p>
          </div>

          <Card className="border-none shadow-xl rounded-[2.5rem] bg-background p-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Name or firm..."
                    className="pl-10 rounded-xl"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Preferred Stage</Label>
                <Select value={stageFilter} onValueChange={setStageFilter}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGE_FILTER_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt === 'All' ? 'All Stages' : opt}</SelectItem>
                    ))}
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
                    <SelectItem value="newest">Recently Joined</SelectItem>
                    <SelectItem value="verified">Verified First</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end">
                 <Button variant="ghost" onClick={() => {setSearch(''); setStageFilter('All'); setFocusFilter('all');}} className="w-full rounded-xl font-bold text-slate-400">
                    Reset Filters
                 </Button>
              </div>
            </div>
          </Card>

          {isLoading ? (
            <div className="flex py-24 items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" /></div>
          ) : filteredInvestors.length === 0 ? (
            <Card className="border-2 border-dashed rounded-[3rem] bg-background/50 py-32 text-center">
              <CardContent className="space-y-6">
                <div className="p-6 bg-muted/50 rounded-full w-fit mx-auto"><Search className="h-12 w-12 text-slate-300" /></div>
                <h3 className="text-xl font-bold">No capital partners found</h3>
                <p className="text-slate-500">Try adjusting your filters or search terms.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredInvestors.map((inv) => (
                <InvestorCard key={inv.id} investor={inv} />
              ))}
            </div>
          )}
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}

function InvestorCard({ investor }: { investor: any }) {
  const name = investor.fullName || 'Anonymous Investor';
  const headline = investor.investorHeadline || investor.headline || 'Capital Partner';
  const initials = name.split(' ').map((n: any) => n[0]).join('').toUpperCase();
  const avatarUrl = investor.imageUrl || `https://picsum.photos/seed/${investor.id}/200/200`;

  return (
    <Card className="flex flex-col h-full hover:shadow-2xl transition-all border-none bg-background shadow-xl rounded-[2.5rem] overflow-hidden group">
      <CardHeader className="pb-4 pt-8 px-8 flex flex-row gap-4 items-start">
        <Avatar className="h-16 w-16 border-4 border-primary/5 rounded-2xl shadow-lg">
          <AvatarImage src={avatarUrl} alt={name} className="object-cover" />
          <AvatarFallback className="rounded-2xl text-xl font-bold">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 mb-1">
            <CardTitle className="text-xl truncate group-hover:text-primary transition-colors">{name}</CardTitle>
            {investor.isVerified && <Zap className="h-4 w-4 text-primary fill-primary" />}
          </div>
          <CardDescription className="line-clamp-2 font-medium text-primary/80">
            {headline}
          </CardDescription>
        </div>
      </CardHeader>
      
      <CardContent className="flex flex-col flex-1 px-8 pb-8 space-y-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-bold uppercase tracking-tight">
          <MapPin className="h-3 w-3" /> {investor.location || 'Global'}
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Investment Focus</p>
            <div className="flex flex-wrap gap-1.5">
              {Array.isArray(investor.investmentFocus) && investor.investmentFocus.length > 0 ? (
                investor.investmentFocus.slice(0, 3).map((f: string) => (
                  <Badge key={f} variant="secondary" className="rounded-lg text-[9px] bg-primary/5 text-primary border-none font-bold uppercase">
                    {f}
                  </Badge>
                ))
              ) : (
                <span className="text-[10px] text-slate-400 font-bold uppercase italic">Sector Agnostic</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 py-4 border-y border-slate-50">
            <div className="space-y-1">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Avg Ticket</p>
              <p className="text-sm font-black text-slate-900">{investor.ticketSize || 'N/A'}</p>
            </div>
            <div className="space-y-1 text-right">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Status</p>
              <div className="flex justify-end">
                {investor.isOpenToPitches ? (
                  <Badge className="bg-green-100 text-green-700 border-none text-[8px] font-black uppercase h-5">Open to Pitches</Badge>
                ) : (
                  <Badge variant="secondary" className="text-[8px] font-black uppercase h-5">Reviewing</Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        <Button className="w-full rounded-2xl h-12 gap-2 mt-auto group-hover:bg-primary group-hover:text-primary-foreground transition-all" variant="outline" asChild>
          <Link href={`/investors/${investor.id}`}>
            Review Portfolio <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
