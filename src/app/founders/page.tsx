
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { mockFounders, Founder } from '@/lib/mock-data';
import { MapPin, Search, Filter } from 'lucide-react';
import Image from 'next/image';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

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
    <div className="container mx-auto px-4 py-12">
      <div className="mb-12">
        <h1 className="text-4xl font-bold mb-4">Explore Founders</h1>
        <p className="text-muted-foreground text-lg">Discover founders, their ideas, and what they are building.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-4 mb-10">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search by name or headline..." 
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Stage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              <SelectItem value="Idea">Idea</SelectItem>
              <SelectItem value="Early">Early</SelectItem>
              <SelectItem value="Growth">Growth</SelectItem>
              <SelectItem value="Scaling">Scaling</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {filteredFounders.map((founder) => (
          <Card key={founder.id} className="flex flex-col h-full hover:shadow-lg transition-shadow overflow-hidden group">
            <div className="relative h-64 bg-muted overflow-hidden">
               <Image 
                src={founder.imageUrl} 
                alt={founder.name} 
                fill 
                className="object-cover group-hover:scale-105 transition-transform duration-500" 
                data-ai-hint="founder portrait"
              />
            </div>
            <CardHeader>
              <div className="flex justify-between items-start mb-2">
                <CardTitle className="text-xl">{founder.name}</CardTitle>
                <Badge variant="secondary">{founder.stage}</Badge>
              </div>
              <p className="font-medium text-sm text-foreground mb-1">{founder.headline}</p>
              <div className="flex items-center text-xs text-muted-foreground">
                <MapPin className="mr-1 h-3 w-3" />
                {founder.location}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 flex-1">
              <div className="flex flex-wrap gap-1">
                {founder.skills.map(skill => (
                  <Badge key={skill} variant="outline" className="text-[10px]">{skill}</Badge>
                ))}
              </div>
              
              <div className="mt-auto pt-4">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="w-full">View details</Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>About {founder.name}</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                      <div className="flex items-center gap-4 mb-6">
                        <div className="relative h-20 w-20 rounded-full overflow-hidden">
                           <Image 
                            src={founder.imageUrl} 
                            alt={founder.name} 
                            fill 
                            className="object-cover" 
                          />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold">{founder.name}</h3>
                          <Badge>{founder.stage} Stage</Badge>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-sm font-semibold mb-1">Headline</h4>
                          <p className="text-sm text-muted-foreground">{founder.headline}</p>
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold mb-1">Looking for</h4>
                          <p className="text-sm text-muted-foreground">{founder.lookingFor}</p>
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold mb-1">Skills</h4>
                          <div className="flex flex-wrap gap-1">
                            {founder.skills.map(skill => (
                              <Badge key={skill} variant="outline" className="text-[10px]">{skill}</Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredFounders.length === 0 && (
        <div className="text-center py-20 bg-muted/20 rounded-xl border border-dashed">
          <p className="text-muted-foreground">No founders found matching your search.</p>
        </div>
      )}
    </div>
  );
}
