
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { mockInvestors } from '@/lib/mock-data';
import { MapPin, TrendingUp, Info } from 'lucide-react';
import Image from 'next/image';

export default function InvestorsPage() {
  const [stageFilter, setStageFilter] = useState('all');

  const filteredInvestors = mockInvestors.filter(investor => {
    if (stageFilter === 'all') return true;
    return investor.preferredStage.includes(stageFilter);
  });

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="mb-12">
        <h1 className="text-4xl font-bold mb-4">Meet Investors</h1>
        <p className="text-muted-foreground text-lg">
          Connect with early-stage investors looking for high-potential startups.
        </p>
        <div className="flex items-center gap-2 mt-4 text-sm text-amber-600 bg-amber-50 p-3 rounded-lg border border-amber-100 max-w-fit">
          <Info className="h-4 w-4" />
          These are illustrative investor profiles for demonstration.
        </div>
      </div>

      <div className="flex items-center gap-4 mb-10">
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {filteredInvestors.map((investor) => (
          <Card key={investor.id} className="flex flex-col md:flex-row h-full hover:shadow-lg transition-shadow overflow-hidden">
            <div className="relative h-64 md:h-auto md:w-48 bg-muted shrink-0">
               <Image 
                src={investor.imageUrl} 
                alt={investor.name} 
                fill 
                className="object-cover" 
                data-ai-hint="investor portrait"
              />
            </div>
            <div className="flex flex-col flex-1 p-6">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="text-xl font-bold">{investor.name}</h3>
                  <p className="text-sm text-primary font-medium">{investor.headline}</p>
                </div>
                <Badge variant={investor.isOpen ? "default" : "secondary"}>
                  {investor.isOpen ? "Open to pitches" : "Not accepting pitches"}
                </Badge>
              </div>
              
              <div className="flex items-center text-xs text-muted-foreground mb-4">
                <MapPin className="mr-1 h-3 w-3" />
                {investor.location}
              </div>

              <div className="mb-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Preferred Stages</p>
                <div className="flex flex-wrap gap-1">
                  {investor.preferredStage.map(stage => (
                    <Badge key={stage} variant="outline" className="text-[10px]">{stage}</Badge>
                  ))}
                </div>
              </div>

              <div className="bg-muted/50 p-3 rounded text-sm text-muted-foreground italic mb-6">
                &quot;{investor.note}&quot;
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

      {filteredInvestors.length === 0 && (
        <div className="text-center py-20">
          <p className="text-muted-foreground">No investors found for this stage.</p>
        </div>
      )}
    </div>
  );
}
