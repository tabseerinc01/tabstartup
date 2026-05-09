'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { mockFounders } from '@/lib/mock-data';
import { MapPin, Search, Filter, Loader2, Linkedin, MessageSquare, Calendar, CheckCircle2, Rocket, Briefcase, HandCoins, Info, LayoutGrid, Users } from 'lucide-react';
import Image from 'next/image';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { PublicHeader } from '@/components/public/header';
import { PublicFooter } from '@/components/public/footer';
import { useFirestore } from '@/firebase';
import { collection, query, where, limit, getDocs } from 'firebase/firestore';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function FoundersPage() {
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [industryFilter, setIndustryFilter] = useState('');
  const [founders, setFounders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const firestore = useFirestore();

  useEffect(() => {
    async function loadFounders() {
      if (!firestore) return;
      setIsLoading(true);
      try {
        // 1. Fetch using new multi-role structure
        const multiRoleQuery = query(
          collection(firestore, 'users'),
          where('roles', 'array-contains', 'founder'),
          limit(100)
        );
        
        // 2. Fetch using legacy role structure for migration compatibility
        const legacyRoleQuery = query(
          collection(firestore, 'users'),
          where('role', '==', 'founder'),
          limit(100)
        );

        const [multiSnap, legacySnap] = await Promise.all([
          getDocs(multiRoleQuery),
          getDocs(legacyRoleQuery)
        ]);

        // Merge and deduplicate
        const userMap = new Map();
        multiSnap.docs.forEach(d => userMap.set(d.id, { id: d.id, ...d.data() }));
        legacySnap.docs.forEach(d => {
          if (!userMap.has(d.id)) {
            userMap.set(d.id, { id: d.id, ...d.data() });
          }
        });

        const foundersItems = Array.from(userMap.values());

        // 3. Load Active Startups only
        const startupsQ = query(
          collection(firestore, 'startups'),
          where('status', '==', 'active')
        );
        const startupsSnap = await getDocs(startupsQ);
        const startupsMap = new Map();
        startupsSnap.docs.forEach(doc => {
          const data = doc.data();
          if (data.ownerUid) {
            startupsMap.set(data.ownerUid, { id: doc.id, ...data });
          }
        });

        // 4. Merge
        const mergedFounders = (foundersItems.length > 0 ? foundersItems : mockFounders).map(founder => ({
          ...founder,
          startup: startupsMap.get(founder.uid || founder.id) || null
        }));

        setFounders(mergedFounders);
      } catch (error) {
        console.error("Error loading founders and startups:", error);
        setFounders(mockFounders);
      } finally {
        setIsLoading(false);
      }
    }
    loadFounders();
  }, [firestore]);

  const filteredFounders = useMemo(() => {
    return founders.filter(founder => {
      const name = (founder.fullName || founder.name || '').toLowerCase();
      const headline = (founder.headline || '').toLowerCase();
      const startupName = (founder.startup?.name || '').toLowerCase();
      const startupIndustry = (founder.startup?.industry || '').toLowerCase();
      const startupDesc = (founder.startup?.shortDescription || '').toLowerCase();
      
      const matchesSearch = 
        name.includes(search.toLowerCase()) || 
        headline.includes(search.toLowerCase()) ||
        startupName.includes(search.toLowerCase()) ||
        startupDesc.includes(search.toLowerCase());
      
      const matchesStage = stageFilter === 'all' || 
        (founder.stage === stageFilter) || 
        (founder.startup?.stage === stageFilter);

      const matchesIndustry = industryFilter === '' || 
        startupIndustry.includes(industryFilter.toLowerCase());

      return matchesSearch && matchesStage && matchesIndustry;
    });
  }, [founders, search, stageFilter, industryFilter]);

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="mb-12">
          <h1 className="text-4xl font-bold mb-4">Explore Founders</h1>
          <p className="text-muted-foreground text-lg">Discover visionary founders building the next generation of global startups.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-10">
          <div className="md:col-span-6 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search by name, startup or vision..." 
              className="pl-10 h-12 rounded-xl"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="md:col-span-3 relative">
            <LayoutGrid className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Filter by Industry..." 
              className="pl-10 h-12 rounded-xl"
              value={industryFilter}
              onChange={(e) => setIndustryFilter(e.target.value)}
            />
          </div>
          <div className="md:col-span-3">
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="h-12 rounded-xl">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Stage" />
                </div>
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

        {isLoading ? (
          <div className="flex py-20 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredFounders.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredFounders.map((founder) => (
              <FounderCard key={founder.id} founder={founder} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 bg-muted/20 rounded-[2rem] border-2 border-dashed">
            <div className="p-4 bg-background rounded-full mb-4 shadow-sm">
              <Search className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-bold mb-2">No founders found</h3>
            <p className="text-muted-foreground text-center max-w-sm px-6">
              We couldn't find any startups matching your current criteria. Try adjusting your filters or search terms.
            </p>
            <Button 
              variant="outline" 
              className="mt-6 rounded-full" 
              onClick={() => {
                setSearch('');
                setStageFilter('all');
                setIndustryFilter('');
              }}
            >
              Clear all filters
            </Button>
          </div>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}

function FounderCard({ founder }: { founder: any }) {
  const displayName = founder.fullName || founder.name;
  const imageId = founder.uid || founder.id || 'user';
  const startup = founder.startup;

  return (
    <Card className="flex flex-col h-full hover:shadow-xl transition-all overflow-hidden group border-muted/50 bg-background">
      <div className="relative h-64 bg-muted overflow-hidden">
        <Image 
          src={founder.imageUrl || `https://picsum.photos/seed/${imageId}/600/600`} 
          alt={displayName} 
          fill 
          className="object-cover group-hover:scale-105 transition-transform duration-500" 
        />
        {founder.isVerified && (
          <div className="absolute top-4 right-4 bg-white/90 backdrop-blur rounded-full p-1 shadow-sm">
            <CheckCircle2 className="h-5 w-5 text-primary" />
          </div>
        )}
        <div className="absolute bottom-4 left-4 flex flex-wrap gap-2">
          <Badge variant="secondary" className="bg-white/90 backdrop-blur text-primary border-none font-bold">
            {startup?.stage || founder.stage}
          </Badge>
          {founder.lookingForCofounder && (
            <Badge className="bg-accent text-accent-foreground border-none font-bold flex items-center gap-1 shadow-sm">
              <Users className="h-3 w-3" /> Looking for Co-founder
            </Badge>
          )}
        </div>
      </div>
      <CardHeader className="pb-2">
        <CardTitle className="text-xl">{displayName}</CardTitle>
        <p className="font-semibold text-sm text-primary line-clamp-1">{founder.headline}</p>
        <div className="flex items-center text-xs text-muted-foreground mt-1">
          <MapPin className="mr-1 h-3 w-3" />
          {founder.location}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 flex-1">
        <div className="border-t pt-4 space-y-4">
          {startup ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-base flex items-center gap-2">
                  <Rocket className="h-4 w-4 text-primary" /> {startup.name}
                </h4>
                <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-tight px-2">
                  {startup.industry || "Tech"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2 h-10 italic">
                {startup.shortDescription || "Building a revolutionary new startup."}
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Briefcase className="h-3 w-3" />
                  <span className="truncate">{startup.industry || "Technology"}</span>
                </div>
                <div className="flex items-center gap-1.5 text-primary font-medium">
                  <HandCoins className="h-3 w-3" />
                  <span>{startup.fundingNeed || "TBD"}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-6 flex flex-col items-center justify-center text-muted-foreground bg-muted/20 rounded-xl border border-dashed">
              <Info className="h-5 w-5 mb-2 opacity-30" />
              <p className="text-xs font-medium italic">No startup listed yet</p>
            </div>
          )}
        </div>

        <div className="mt-auto pt-4 flex gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button className="flex-1 rounded-xl">View Details</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] p-0 overflow-hidden rounded-3xl">
              <DialogHeader className="sr-only">
                <DialogTitle>{displayName}'s Profile</DialogTitle>
                <DialogDescription>Detailed view of founder expertise and journey.</DialogDescription>
              </DialogHeader>
              <ScrollArea className="max-h-[90vh]">
                <div className="p-0">
                  <div className="h-32 bg-gradient-to-r from-primary/20 to-accent/20" />
                  <div className="px-8 pb-8 -mt-12">
                    <div className="flex flex-col md:flex-row gap-6 items-end mb-8">
                      <div className="relative h-32 w-32 rounded-2xl overflow-hidden border-4 border-background bg-muted shrink-0 shadow-lg">
                        <Image 
                          src={founder.imageUrl || `https://picsum.photos/seed/${imageId}/200/200`} 
                          alt={displayName} 
                          fill 
                          className="object-cover" 
                        />
                      </div>
                      <div className="flex-1 space-y-2">
                        <h2 className="text-3xl font-bold">{displayName}</h2>
                        <p className="text-primary font-medium">{founder.headline}</p>
                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1"><MapPin className="h-4 w-4" /> {founder.location}</span>
                          <span className="flex items-center gap-1"><Badge variant="secondary">{startup?.stage || founder.stage} Stage</Badge></span>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3 mb-8">
                      <Button className="flex-1 gap-2 rounded-xl" asChild>
                        <Link href={`/founders/${founder.uid || founder.id}`}><MessageSquare className="h-4 w-4" /> Message</Link>
                      </Button>
                      <Button variant="outline" className="flex-1 gap-2 rounded-xl"><Calendar className="h-4 w-4" /> Request Meeting</Button>
                    </div>

                    {startup && (
                      <div className="bg-primary/5 p-6 rounded-2xl border border-primary/10 mb-6">
                        <div className="flex justify-between items-start mb-4">
                          <h3 className="font-bold text-xl flex items-center gap-2">
                            <Rocket className="h-5 w-5 text-primary" /> {startup.name}
                          </h3>
                          <Badge className="bg-primary/10 text-primary border-none">{startup.industry}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed mb-6 italic">
                          "{startup.shortDescription}"
                        </p>
                        <div className="grid grid-cols-2 gap-6 p-4 bg-background rounded-xl border mb-6">
                          <div className="space-y-1">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Target Funding</p>
                            <p className="text-lg font-bold text-primary">{startup.fundingNeed || 'TBD'}</p>
                          </div>
                          <div className="space-y-1 text-right">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Status</p>
                            <p className="text-sm font-semibold">{startup.fundraisingStatus || 'Open'}</p>
                          </div>
                        </div>
                        <Button variant="link" className="p-0 h-auto text-primary font-bold" asChild>
                          <Link href={`/startups/${founder.uid || founder.id}`}>Full Startup Profile & Pitch Deck</Link>
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>
            </DialogContent>
          </Dialog>
          <Button variant="outline" size="icon" className="rounded-xl" asChild>
            <Link href={`/founders/${founder.uid || founder.id}`}><Linkedin className="h-4 w-4" /></Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}