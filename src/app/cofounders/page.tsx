'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PublicHeader } from '@/components/public/header';
import { PublicFooter } from '@/components/public/footer';
import { Loader2, Users, Rocket, Zap, ArrowRight, Briefcase, Handshake } from 'lucide-react';

export default function CofoundersPage() {
  const [founders, setFounders] = useState<any[]>([]);
  const [startups, setStartups] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(true);
  const firestore = useFirestore();

  useEffect(() => {
    async function loadCofounderSeekers() {
      if (!firestore) return;
      setIsLoading(true);
      try {
        const q = query(
          collection(firestore, 'users'),
          where('lookingForCofounder', '==', true),
          limit(50)
        );
        const snap = await getDocs(q);
        const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        const uids = users.map(u => u.id);
        if (uids.length > 0) {
          const chunks = [];
          for (let i = 0; i < uids.length; i += 30) {
            chunks.push(uids.slice(i, i + 30));
          }

          const sMap: Record<string, any> = {};
          for (const chunk of chunks) {
            // Fetch ONLY active startups for these users
            const sQ = query(
              collection(firestore, 'startups'), 
              where('ownerUid', 'in', chunk),
              where('status', '==', 'active')
            );
            const sSnap = await getDocs(sQ);
            sSnap.docs.forEach(d => {
              const data = d.data();
              sMap[data.ownerUid] = data;
            });
          }
          setStartups(sMap);
        }
        
        setFounders(users);
      } catch (error) {
        console.error("Error loading co-founders:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadCofounderSeekers();
  }, [firestore]);

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <PublicHeader />
      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-primary/10 rounded-2xl">
              <Handshake className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight">Co-founder Directory</h1>
          </div>
          <p className="text-muted-foreground text-lg max-w-2xl">
            Find visionaries looking for partners to build the next big thing. Discover high-equity opportunities in the startup ecosystem.
          </p>
        </div>

        {isLoading ? (
          <div className="flex py-24 items-center justify-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          </div>
        ) : founders.length === 0 ? (
          <div className="text-center py-32 border-2 border-dashed rounded-[3rem] bg-background/50 flex flex-col items-center">
            <div className="p-4 bg-muted/50 rounded-full mb-6">
              <Users className="h-12 w-12 text-muted-foreground opacity-40" />
            </div>
            <h3 className="text-xl font-bold mb-2">No active co-founder searches</h3>
            <p className="text-muted-foreground max-w-sm mx-auto mb-8">
              We couldn't find any founders currently recruiting. Check back later or browse our general founder directory.
            </p>
            <Button variant="outline" className="rounded-full" asChild>
              <Link href="/founders">Explore Founders</Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {founders.map((founder) => {
              const startup = startups[founder.id];
              const skills = Array.isArray(founder.cofounderSkills) ? founder.cofounderSkills : [];
              const initials = (founder.fullName || 'F').charAt(0);
              const avatarUrl = founder.imageUrl || `https://picsum.photos/seed/${founder.id}/200/200`;

              return (
                <Card key={founder.id} className="flex flex-col h-full hover:shadow-2xl transition-all border-none bg-background shadow-xl rounded-[2.5rem] overflow-hidden group">
                  <CardHeader className="pb-4 pt-8 px-8 flex flex-row gap-4 items-start">
                    <Avatar className="h-16 w-16 border-4 border-primary/5 rounded-2xl shadow-lg">
                      <AvatarImage src={avatarUrl} className="object-cover" />
                      <AvatarFallback className="rounded-2xl text-xl font-bold">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xl font-bold truncate group-hover:text-primary transition-colors">{founder.fullName}</h3>
                      <p className="text-xs font-semibold text-primary truncate uppercase tracking-wider mb-1">{founder.headline}</p>
                      
                      {startup && (
                        <div className="flex flex-col gap-1 mt-1">
                          <Link 
                            href={`/startups/${founder.id}`} 
                            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors font-bold group/link"
                          >
                            <Rocket className="h-3 w-3 text-primary/60" />
                            <span className="truncate">{startup.name}</span>
                            <ArrowRight className="h-2 w-2 opacity-0 group-hover/link:opacity-100 transition-opacity" />
                          </Link>
                          <div className="flex gap-2">
                            <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-muted/30 border-none font-medium text-muted-foreground">
                              {startup.stage}
                            </Badge>
                            <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-muted/30 border-none font-medium text-muted-foreground">
                              {startup.industry}
                            </Badge>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  
                  <CardContent className="flex flex-col flex-1 px-8 pb-8 space-y-6">
                    <div className="space-y-4">
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Partner Skills Required</p>
                        <div className="flex flex-wrap gap-1.5">
                          {skills.length > 0 ? (
                            skills.map((skill: string) => (
                              <Badge key={skill} variant="secondary" className="rounded-lg text-[10px] bg-primary/5 text-primary border-none font-bold">
                                {skill}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground italic font-medium">Seeking generalist partner</span>
                          )}
                        </div>
                      </div>

                      <div className="p-5 rounded-2xl bg-primary/5 border border-primary/10 min-h-[100px]">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 flex items-center gap-1.5">
                          <Briefcase className="h-3 w-3" /> Role & Vision
                        </p>
                        <p className="text-sm line-clamp-3 italic text-foreground/80 leading-relaxed font-medium">
                          "{founder.cofounderRole || "Looking for a strategic partner to join the journey and scale this vision."}"
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4 py-4 border-y border-primary/5">
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Equity Offer</p>
                          <p className="text-lg font-bold text-green-600">
                            {founder.equityOffer || 'TBD'}
                          </p>
                        </div>
                        <div className="space-y-1 text-right">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Commitment</p>
                          <Badge variant="outline" className="text-[10px] font-bold border-primary/20 text-primary bg-white h-6">
                            {founder.commitmentType || 'Full-time'}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    <Button className="w-full rounded-2xl h-12 gap-2 mt-auto group-hover:bg-primary group-hover:text-primary-foreground transition-all" variant="outline" asChild>
                      <Link href={`/founders/${founder.id}`}>
                        View Opportunity <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
