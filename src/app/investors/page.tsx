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
import { Loader2, Search } from 'lucide-react';
import { PublicHeader } from '@/components/public/header';
import { PublicFooter } from '@/components/public/footer';

const STAGE_FILTER_OPTIONS = ['All', 'Idea', 'Early', 'Growth', 'Scaling'] as const;

export default function InvestorsPage() {
  const [investors, setInvestors] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<(typeof STAGE_FILTER_OPTIONS)[number]>('All');
  const firestore = useFirestore();

  useEffect(() => {
    async function loadInvestors() {
      if (!firestore) return;
      setIsLoading(true);
      try {
        const q = query(collection(firestore, 'users'), where('role', '==', 'investor'), limit(100));
        const snap = await getDocs(q);
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setInvestors(items);
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
      const headline = (inv.headline || '').toLowerCase();
      const term = search.toLowerCase();
      const matchesSearch = name.includes(term) || headline.includes(term);
      const matchesStage = stageFilter === 'All' ? true : (inv.preferredStage || '').toLowerCase().includes(stageFilter.toLowerCase());
      return matchesSearch && matchesStage;
    });
  }, [investors, search, stageFilter]);

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="mb-12">
          <h1 className="text-4xl font-bold mb-4">Meet Investors</h1>
          <p className="text-muted-foreground text-lg">Discover investors interested in backing startups.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-[2fr,1fr] mb-10">
          <div className="space-y-2">
            <Label htmlFor="search">Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="search"
                placeholder="Search by name or headline…"
                className="pl-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Preferred Stage</Label>
            <Select value={stageFilter} onValueChange={(v: any) => setStageFilter(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGE_FILTER_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt === 'All' ? 'All stages' : opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="flex py-20 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredInvestors.length === 0 ? (
          <div className="text-center py-20 border rounded-2xl bg-muted/10">
            <p className="text-muted-foreground">No investors match your current filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredInvestors.map((inv) => (
              <Card key={inv.id} className="flex flex-col h-full hover:shadow-xl transition-all border-muted/50 overflow-hidden">
                <CardHeader>
                  <CardTitle className="text-xl">{inv.fullName}</CardTitle>
                  <CardDescription className="line-clamp-2">{inv.headline}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col flex-1 space-y-4">
                  <div className="space-y-2 text-sm flex-1">
                    <p className="text-muted-foreground"><span className="font-semibold text-foreground">Location:</span> {inv.location}</p>
                    <p className="text-muted-foreground"><span className="font-semibold text-foreground">Preferred stage:</span> {inv.preferredStage}</p>
                  </div>
                  <Button variant="outline" className="w-full rounded-xl mt-auto" asChild>
                    <Link href={`/investors/${inv.id}`}>View Details</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}