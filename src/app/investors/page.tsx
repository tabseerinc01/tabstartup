'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { collection, query, where, limit, getDocs } from 'firebase/firestore';
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
import { Loader2, Search, Filter, Target, Briefcase, Zap, MapPin, ArrowRight, CheckCircle2 } from 'lucide-react';
import { PublicHeader } from '@/components/public/header';
import { PublicFooter } from '@/components/public/footer';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const STAGE_FILTER_OPTIONS = ['All', 'Idea', 'Early', 'Growth', 'Scaling'] as const;

export default function InvestorsPage() {
  const [investors, setInvestors] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [focusSearch, setFocusSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('All');
  const firestore = useFirestore();

  useEffect(() => {
    async function loadInvestors() {
      if (!firestore) return;
      setIsLoading(true);
      try {
        // 1. Query by new multi-role array
        const multiRoleQuery = query(
          collection(firestore, 'users'), 
          where('roles', 'array-contains', 'investor'), 
          limit(100)
        );

        // 2. Query by legacy single role string for migration compatibility
        const legacyRoleQuery = query(
          collection(firestore, 'users'),
          where('role', '==', 'investor'),
          limit(100)
        );

        const [multiSnap, legacySnap] = await Promise.all([
          getDocs(multiRoleQuery),
          getDocs(legacyRoleQuery)
        ]);

        // Merge results and deduplicate by ID
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

      const matchesFocus = focusSearch === '' 
        ? true 
        : Array.isArray(inv.investmentFocus)
          ? inv.investmentFocus.some((f: string) => f.toLowerCase().includes(focusSearch.toLowerCase()))
          : (inv.investmentFocus || '').toLowerCase().includes(focusSearch.toLowerCase());

      return matchesSearch && matchesStage && matchesFocus;
    });
  }, [investors, search, stageFilter, focusSearch]);

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <PublicHeader />
      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="mb-12">
          <h1 className="text-4xl font-extrabold tracking-tight mb-4">Meet Investors</h1>
          <p className="text-muted-foreground text-lg max-w-2xl">
            Discover capital partners and mentors interested in backing the next generation of global startups.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-12 mb-12">
          <div className="md:col-span-5 space-y-2">
            <Label htmlFor="search" className="font-bold">Search Investors</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="search"
                placeholder="Search by name or firm..."
                className="pl-10 h-12 rounded-xl border-none shadow-sm bg-background"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="md:col-span-4 space-y-2">
            <Label htmlFor="focus" className="font-bold">Investment Focus</Label>
            <div className="relative">
              <Target className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="focus"
                placeholder="e.g. Fintech, AI, SaaS..."
                className="pl-10 h-12 rounded-xl border-none shadow-sm bg-background"
                value={focusSearch}
                onChange={(e) => setFocusSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="md:col-span-3 space-y-2">
            <Label className="font-bold">Preferred Stage</Label>
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="h-12 rounded-xl border-none shadow-sm bg-background">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="All Stages" />
                </div>
              </SelectTrigger>
              <SelectContent>
                {STAGE_FILTER_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt === 'All' ? 'All Stages' : opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="flex py-24 items-center justify-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          </div>
        ) : filteredInvestors.length === 0 ? (
          <div className="text-center py-32 border-2 border-dashed rounded-[3rem] bg-background/50">
            <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-20" />
            <h3 className="text-xl font-bold mb-2">No investors found</h3>
            <p className="text-muted-foreground">Try adjusting your filters or search terms.</p>
            <Button 
              variant="link" 
              className="mt-4" 
              onClick={() => {
                setSearch('');
                setFocusSearch('');
                setStageFilter('All');
              }}
            >
              Clear all filters
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredInvestors.map((inv) => (
              <InvestorCard key={inv.id} investor={inv} />
            ))}
          </div>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}

function InvestorCard({ investor }: { investor: any }) {
  const name = investor.fullName || 'Anonymous Investor';
  const headline = investor.investorHeadline || investor.headline || 'TabStartup Investor';
  const initials = name.split(' ').map((n: any) => n[0]).join('').toUpperCase();
  const avatarUrl = investor.imageUrl || `https://picsum.photos/seed/${investor.id}/200/200`;

  const isProfileVerified = 
    !!(investor.investorBio || investor.bio) && 
    !!investor.ticketSize && 
    !!(investor.linkedinUrl || investor.socialLinks?.linkedin);

  return (
    <Card className="flex flex-col h-full hover:shadow-2xl transition-all border-none bg-background shadow-xl rounded-[2.5rem] overflow-hidden group relative">
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
          {isProfileVerified && (
            <Badge variant="outline" className="mt-2 text-[10px] py-0 px-2 border-green-200 bg-green-50 text-green-700 font-bold flex w-fit items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Verified Profile
            </Badge>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="flex flex-col flex-1 px-8 pb-8 space-y-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3" /> {investor.location || 'Global'}
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
              Investment Focus
            </p>
            <div className="flex flex-wrap gap-1.5">
              {Array.isArray(investor.investmentFocus) && investor.investmentFocus.length > 0 ? (
                investor.investmentFocus.slice(0, 3).map((f: string) => (
                  <Badge key={f} variant="secondary" className="rounded-lg text-[10px] bg-primary/5 text-primary border-none">
                    {f}
                  </Badge>
                ))
              ) : (
                <span className="text-xs text-muted-foreground italic">Generalist</span>
              )}
              {Array.isArray(investor.investmentFocus) && investor.investmentFocus.length > 3 && (
                <Badge variant="outline" className="rounded-lg text-[10px]">+{investor.investmentFocus.length - 3}</Badge>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 py-4 border-y border-primary/5">
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Ticket Size</p>
              <p className="text-sm font-bold text-primary">{investor.ticketSize || 'N/A'}</p>
            </div>
            <div className="space-y-1 text-right">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Status</p>
              <div className="flex justify-end">
                {investor.isOpenToPitches ? (
                  <Badge className="bg-green-100 text-green-700 border-none text-[10px] h-5">Open to Pitches</Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px] h-5">Referral Only</Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        <Button className="w-full rounded-2xl h-12 gap-2 mt-auto group-hover:bg-primary group-hover:text-primary-foreground transition-all" variant="outline" asChild>
          <Link href={`/investors/${investor.id}`}>
            View Profile <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}