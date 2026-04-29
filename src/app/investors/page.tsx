'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin, Search, Filter, Loader2, Info } from 'lucide-react';
import Image from 'next/image';
import { PublicHeader } from '@/components/public/header';
import { PublicFooter } from '@/components/public/footer';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, limit } from 'firebase/firestore';
import { mockInvestors } from '@/lib/mock-data';

const STAGE_FILTER_OPTIONS = ["All", "Idea", "Early", "Growth", "Scaling"] as const;

export default function InvestorsPage() {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("All");
  const firestore = useFirestore();

  const investorsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(
      collection(firestore, 'users'),
      where('role', '==', 'investor'),
      limit(100)
    );
  }, [firestore]);

  const { data: dbInvestors, isLoading } = useCollection(investorsQuery);

  // Use Firestore data if available, otherwise fallback to mock data for demonstration
  const investorsList = (dbInvestors && dbInvestors.length > 0) ? dbInvestors : mockInvestors;

  const filteredInvestors = investorsList.filter(investor => {
    const name = (investor.fullName || investor.name || "").toLowerCase();
    const headline = (investor.headline || "").toLowerCase();
    const searchTerm = search.toLowerCase();
    
    const matchesSearch = name.includes(searchTerm) || headline.includes(searchTerm);
    
    const prefStage = Array.isArray(investor.preferredStage) 
      ? investor.preferredStage.join(", ").toLowerCase()
      : (investor.preferredStage || "").toLowerCase();
      
    const matchesStage = stageFilter === "All" || prefStage.includes(stageFilter.toLowerCase());
    
    return matchesSearch && matchesStage;
  });

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="mb-12">
          <h1 className="text-4xl font-bold mb-4">Meet Investors</h1>
          <p className="text-muted-foreground text-lg max-w-2xl">
            Discover investors who are interested in backing founders and high-potential startups.
          </p>
          {(!dbInvestors || dbInvestors.length === 0) && !isLoading && (
            <div className="flex items-center gap-2 mt-4 text-sm text-amber-600 bg-amber-50 p-3 rounded-lg border border-amber-100 max-w-fit">
              <Info className="h-4 w-4" />
              Showing sample investor profiles until real investors sign up.
            </div>
          )}
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
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by stage" />
              </SelectTrigger>
              <SelectContent>
                {STAGE_FILTER_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt === "All" ? "All stages" : opt}
                  </SelectItem>
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
            <Button variant="link" onClick={() => { setSearch(""); setStageFilter("All"); }}>Clear all filters</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredInvestors.map((inv) => (
              <Card key={inv.id || inv.uid} className="flex flex-col h-full hover:shadow-xl transition-all overflow-hidden group border-muted/50">
                <div className="relative h-48 bg-muted overflow-hidden">
                  <Image 
                    src={inv.imageUrl || `https://picsum.photos/seed/${inv.id || inv.uid}/400/400`} 
                    alt={inv.fullName || inv.name} 
                    fill 
                    className="object-cover group-hover:scale-105 transition-transform duration-500" 
                    data-ai-hint="investor portrait"
                  />
                  <div className="absolute bottom-4 left-4">
                    <Badge variant="secondary" className="bg-white/90 backdrop-blur text-primary border-none">
                      {inv.isOpenToPitches || inv.isOpen ? "Open to Pitches" : "Consulting Only"}
                    </Badge>
                  </div>
                </div>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xl line-clamp-1">{inv.fullName || inv.name}</CardTitle>
                  <p className="font-semibold text-sm text-primary line-clamp-1">{inv.headline}</p>
                  <div className="flex items-center text-xs text-muted-foreground">
                    <MapPin className="mr-1 h-3 w-3" />
                    {inv.location || "Global"}
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col flex-1">
                  <div className="mb-4">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Preferred Stages</p>
                    <div className="flex flex-wrap gap-1">
                      {Array.isArray(inv.preferredStage) ? (
                        inv.preferredStage.map((s: string) => <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>)
                      ) : inv.preferredStage ? (
                        <Badge variant="outline" className="text-[10px]">{inv.preferredStage}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Flexible</span>
                      )}
                    </div>
                  </div>
                  
                  {inv.investorNote && (
                    <p className="text-xs text-muted-foreground line-clamp-2 italic bg-muted/30 p-2 rounded-lg mb-6">
                      &quot;{inv.investorNote}&quot;
                    </p>
                  )}

                  <div className="mt-auto">
                    <Button variant="outline" className="w-full rounded-xl" asChild>
                      <Link href={`/investors/${inv.id || inv.uid}`}>View Details</Link>
                    </Button>
                  </div>
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
