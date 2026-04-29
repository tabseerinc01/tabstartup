
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { mockInvestors } from '@/lib/mock-data';
import { MapPin, Info, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { PublicHeader } from '@/components/public/header';
import { PublicFooter } from '@/components/public/footer';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, limit } from 'firebase/firestore';

export default function InvestorsPage() {
  const [stageFilter, setStageFilter] = useState('all');
  const firestore = useFirestore();

  const investorsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(
      collection(firestore, 'users'),
      where('role', '==', 'investor'),
      limit(50)
    );
  }, [firestore]);

  const { data: dbInvestors, isLoading } = useCollection(investorsQuery);

  // Fallback to mock data if Firestore returns nothing
  const investorsList = (dbInvestors && dbInvestors.length > 0) ? dbInvestors : mockInvestors;

  const filteredInvestors = investorsList.filter(investor => {
    if (stageFilter === 'all') return true;
    const pref = investor.preferredStage || '';
    return Array.isArray(pref) ? pref.includes(stageFilter) : pref.includes(stageFilter);
  });

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="mb-12">
          <h1 className="text-4xl font-bold mb-4">Meet Investors</h1>
          <p className="text-muted-foreground text-lg">
            Connect with early-stage investors looking for high-potential startups.
          </p>
          <div className="flex items-center gap-2 mt-4 text-sm text-amber-600 bg-amber-50 p-3 rounded-lg border border-amber-100 max-w-fit">
            <Info className="h-4 w-4" />
            {dbInvestors && dbInvestors.length > 0 ? "Real investor profiles loaded from community." : "These are illustrative investor profiles for demonstration."}
          </div>
        </div>

        <div className="flex items-center gap-4 mb-10">
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Preferred Stage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any Stage</SelectItem>
              <SelectItem value="Idea">Idea</SelectItem>
              <SelectItem value="Early">Early</SelectItem>
              <SelectItem value="Growth">Growth</SelectItem>
              <SelectItem value="Scaling">Scaling</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex py-20 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {filteredInvestors.map((investor) => (
              <Card key={investor.id} className="flex flex-col md:flex-row h-full hover:shadow-lg transition-shadow overflow-hidden">
                <div className="relative h-64 md:h-auto md:w-48 bg-muted shrink-0">
                  <Image 
                    src={investor.imageUrl || `https://picsum.photos/seed/${investor.id}/400/400`} 
                    alt={investor.fullName || investor.name} 
                    fill 
                    className="object-cover" 
                    data-ai-hint="investor portrait"
                  />
                </div>
                <div className="flex flex-col flex-1 p-6">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="text-xl font-bold">{investor.fullName || investor.name}</h3>
                      <p className="text-sm text-primary font-medium">{investor.headline}</p>
                    </div>
                    <Badge variant={investor.isOpenToPitches || investor.isOpen ? "default" : "secondary"}>
                      {(investor.isOpenToPitches || investor.isOpen) ? "Open to pitches" : "Not accepting pitches"}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center text-xs text-muted-foreground mb-4">
                    <MapPin className="mr-1 h-3 w-3" />
                    {investor.location}
                  </div>

                  <div className="mb-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Preferred Stages</p>
                    <div className="flex flex-wrap gap-1">
                      {Array.isArray(investor.preferredStage) ? investor.preferredStage.map((stage: string) => (
                        <Badge key={stage} variant="outline" className="text-[10px]">{stage}</Badge>
                      )) : <Badge variant="outline" className="text-[10px]">{investor.preferredStage}</Badge>}
                    </div>
                  </div>

                  <div className="bg-muted/50 p-3 rounded text-sm text-muted-foreground italic mb-6">
                    &quot;{investor.investorNote || investor.note || "Passionate about backing great founders."}&quot;
                  </div>

                  <div className="mt-auto">
                    <Button variant="outline" className="w-full" disabled title="Contact functionality coming soon">
                      Pitch (coming soon)
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
