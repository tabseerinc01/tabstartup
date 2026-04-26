'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { mockFounders } from '@/lib/mock-data';
import { MapPin, Search, Filter } from 'lucide-react';
import Image from 'next/image';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { PublicHeader } from '@/components/public/header';
import { PublicFooter } from '@/components/public/footer';

export default function FoundersPage() {
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');

  const filteredFounders = mockFounders.filter(founder => {
    const matchesSearch = founder.name.toLowerCase().includes(search.toLowerCase()) || 
                          founder.headline.toLowerCase().includes(search.toLowerCase());
    const matchesStage = stageFilter === 'all' || founder.stage === stageFilter;
    return matchesSearch && matchesStage;
  });

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="mb-12">
          <h1 className="text-4xl font-bold mb-4">Explore Founders</h1>
          <p className="text-muted-foreground text-lg">Discover founders and their ventures.</p>
        </div>
        <div className="flex flex-col md:flex-row gap-4 mb-10">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Stage" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              <SelectItem value="Idea">Idea</SelectItem>
              <SelectItem value="Early">Early</SelectItem>
              <SelectItem value="Growth">Growth</SelectItem>
              <SelectItem value="Scaling">Scaling</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredFounders.map((founder) => (
            <Card key={founder.id} className="group hover:shadow-lg transition-all overflow-hidden">
              <div className="relative h-64 bg-muted"><Image src={founder.imageUrl} alt={founder.name} fill className="object-cover" /></div>
              <CardHeader>
                <div className="flex justify-between items-start mb-2"><CardTitle>{founder.name}</CardTitle><Badge variant="secondary">{founder.stage}</Badge></div>
                <p className="text-sm font-medium">{founder.headline}</p>
                <div className="flex items-center text-xs text-muted-foreground"><MapPin className="mr-1 h-3 w-3" />{founder.location}</div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-1">{founder.skills.map(s => <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>)}</div>
                <Dialog>
                  <DialogTrigger asChild><Button variant="outline" className="w-full">View details</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>About {founder.name}</DialogTitle></DialogHeader>
                    <div className="space-y-4 pt-4">
                      <p className="text-sm font-semibold">Looking for:</p>
                      <p className="text-sm text-muted-foreground">{founder.lookingFor}</p>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
