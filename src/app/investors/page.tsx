'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, query, where, limit } from 'firebase/firestore';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
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
import { Loader2, Search, Info } from 'lucide-react';
import { PublicHeader } from '@/components/public/header';
import { PublicFooter } from '@/components/public/footer';

type Investor = {
  id: string;
  fullName?: string;
  headline?: string;
  location?: string;
  preferredStage?: string;
  investorNote?: string;
  isOpenToPitches?: boolean;
};

const STAGE_FILTER_OPTIONS = [
  'All',
  'Idea',
  'Early',
  'Growth',
  'Scaling',
] as const;

export default function InvestorsPage() {
  const firestore = useFirestore();
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<(typeof STAGE_FILTER_OPTIONS)[number]>('All');

  const investorsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'users'), where('role', '==', 'investor'), limit(100));
  }, [firestore]);

  const { data: dbInvestors, isLoading } = useCollection(investorsQuery);

  // Fallback data for demonstration
  const fallbackInvestors: Investor[] = [
    {
      id: 'sample-1',
      fullName: 'Global Angel Network',
      headline: 'Angel syndicate focusing on early-stage startups',
      location: 'Remote / Global',
      preferredStage: 'Early & Growth',
      investorNote: 'Open to pitches from Bangladeshi founders with early traction.',
      isOpenToPitches: true,
    },
    {
      id: 'sample-2',
      fullName: 'Rahman VC',
      headline: 'Sector-agnostic micro VC',
      location: 'Dhaka, Bangladesh',
      preferredStage: 'Seed',
      investorNote: 'Interested in B2B SaaS and fintech.',
      isOpenToPitches: false,
    },
  ];

  const investorsList = dbInvestors && dbInvestors.length > 0 ? dbInvestors : fallbackInvestors;
  const usedFallback = !isLoading && (!dbInvestors || dbInvestors.length === 0);

  const filteredInvestors = useMemo(() => {
    return investorsList.filter((inv) => {
      const name = (inv.fullName || '').toLowerCase();
      const headline = (inv.headline || '').toLowerCase();
      const term = search.toLowerCase();
      const matchesSearch = name.includes(term) || headline.includes(term);

      const matchesStage =
        stageFilter === 'All'
          ? true
          : (inv.preferredStage || '').toLowerCase().includes(stageFilter.toLowerCase());

      return matchesSearch && matchesStage;
    });
  }, [investorsList, search, stageFilter]);

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="mb-12">
          <h1 className="text-4xl font-bold mb-4">Meet Investors</h1>
          <p className="text-muted-foreground text-lg">
            Discover investors who are interested in backing founders and startups.
          </p>
          {usedFallback && (
            <div className="flex items-center gap-2 mt-4 text-sm text-amber-600 bg-amber-50 p-3 rounded-lg border border-amber-100 max-w-fit">
              <Info className="h-4 w-4" />
              Showing sample investor profiles until real investors sign up.
            </div>
          )}
        </div>

        {/* Filters */}
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
            <Select
              value={stageFilter}
              onValueChange={(v: (typeof STAGE_FILTER_OPTIONS)[number]) => setStageFilter(v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGE_FILTER_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt === 'All' ? 'All stages' : opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* List */}
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
                  {inv.headline && (
                    <CardDescription className="line-clamp-2">{inv.headline}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="flex flex-col flex-1 space-y-4">
                  <div className="space-y-2 text-sm flex-1">
                    {inv.location && (
                      <p className="text-muted-foreground">
                        <span className="font-semibold text-foreground">Location:</span>{' '}
                        {inv.location}
                      </p>
                    )}
                    {inv.preferredStage && (
                      <p className="text-muted-foreground">
                        <span className="font-semibold text-foreground">Preferred stage:</span>{' '}
                        {inv.preferredStage}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant={inv.isOpenToPitches ? 'default' : 'secondary'} className="rounded-lg">
                      {inv.isOpenToPitches ? 'Open to pitches' : 'Consulting Only'}
                    </Badge>
                  </div>

                  {inv.investorNote && (
                    <p className="text-xs text-muted-foreground italic bg-muted/30 p-2 rounded-lg line-clamp-2">
                      &quot;{inv.investorNote}&quot;
                    </p>
                  )}

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
