'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { mockInvestors } from '@/lib/mock-data';
import { MapPin, TrendingUp } from 'lucide-react';
import Image from 'next/image';
import { PublicHeader } from '@/components/public/header';
import { PublicFooter } from '@/components/public/footer';

export default function InvestorsPage() {
  const [stageFilter, setStageFilter] = useState('all');

  const filteredInvestors = mockInvestors.filter(inv => 
    stageFilter === 'all' || inv.preferredStage.includes(stageFilter)
  );

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="flex-1 container mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold mb-4">Meet Investors</h1>
        <p className="text-muted-foreground text-lg mb-10">Connect with early-stage investors.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {filteredInvestors.map((investor) => (
            <Card key={investor.id} className="flex flex-col md:flex-row overflow-hidden hover:shadow-lg transition-all">
              <div className="relative h-64 md:h-auto md:w-48 bg-muted"><Image src={investor.imageUrl} alt={investor.name} fill className="object-cover" /></div>
              <div className="p-6 flex-1 flex flex-col">
                <div className="flex justify-between items-start mb-2">
                  <CardTitle>{investor.name}</CardTitle>
                  <Badge variant={investor.isOpen ? "default" : "secondary"}>{investor.isOpen ? "Open to pitches" : "Closed"}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mb-4"><MapPin className="mr-1 h-3 w-3 inline" />{investor.location}</p>
                <div className="mb-4">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Preferred Stage</p>
                  <div className="flex flex-wrap gap-1">{investor.preferredStage.map(s => <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>)}</div>
                </div>
                <p className="bg-muted/50 p-3 rounded text-sm italic mb-6">"{investor.note}"</p>
                <Button variant="outline" className="mt-auto w-full" disabled>Pitch (Coming Soon)</Button>
              </div>
            </Card>
          ))}
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
