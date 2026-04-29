
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { mockFounders } from '@/lib/mock-data';
import { MapPin, Search, Filter, Loader2, Linkedin, Globe, Twitter, Award, Briefcase, GraduationCap, CheckCircle2, MessageSquare, Calendar } from 'lucide-react';
import Image from 'next/image';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { PublicHeader } from '@/components/public/header';
import { PublicFooter } from '@/components/public/footer';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, limit, doc } from 'firebase/firestore';
import { useDoc } from '@/firebase';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

export default function FoundersPage() {
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const firestore = useFirestore();

  const foundersQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(
      collection(firestore, 'users'),
      where('role', '==', 'founder'),
      limit(50)
    );
  }, [firestore]);

  const { data: dbFounders, isLoading } = useCollection(foundersQuery);

  const foundersList = (dbFounders && dbFounders.length > 0) ? dbFounders : mockFounders;

  const filteredFounders = foundersList.filter(founder => {
    const name = founder.fullName || founder.name || '';
    const headline = founder.headline || '';
    const matchesSearch = name.toLowerCase().includes(search.toLowerCase()) || 
                          headline.toLowerCase().includes(search.toLowerCase());
    const matchesStage = stageFilter === 'all' || founder.stage === stageFilter;
    return matchesSearch && matchesStage;
  });

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="mb-12">
          <h1 className="text-4xl font-bold mb-4">Explore Founders</h1>
          <p className="text-muted-foreground text-lg">Discover visionary founders building the next generation of global startups.</p>
        </div>

        <div className="flex flex-col md:flex-row gap-4 mb-10">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search by name, headline or skills..." 
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

        {isLoading ? (
          <div className="flex py-20 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredFounders.map((founder) => (
              <FounderCard key={founder.id || founder.uid} founder={founder} />
            ))}
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

  return (
    <Card className="flex flex-col h-full hover:shadow-xl transition-all overflow-hidden group border-muted/50">
      <div className="relative h-64 bg-muted overflow-hidden">
        <Image 
          src={founder.imageUrl || `https://picsum.photos/seed/${imageId}/600/600`} 
          alt={displayName} 
          fill 
          className="object-cover group-hover:scale-105 transition-transform duration-500" 
          data-ai-hint="founder portrait"
        />
        {founder.isVerified && (
          <div className="absolute top-4 right-4 bg-white/90 backdrop-blur rounded-full p-1 shadow-sm">
            <CheckCircle2 className="h-5 w-5 text-primary" />
          </div>
        )}
        <div className="absolute bottom-4 left-4">
          <Badge variant="secondary" className="bg-white/90 backdrop-blur text-primary border-none">{founder.stage}</Badge>
        </div>
      </div>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start mb-1">
          <CardTitle className="text-xl flex items-center gap-2">
            {displayName}
          </CardTitle>
        </div>
        <p className="font-semibold text-sm text-primary line-clamp-1">{founder.headline}</p>
        <div className="flex items-center text-xs text-muted-foreground">
          <MapPin className="mr-1 h-3 w-3" />
          {founder.location}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 flex-1">
        <div className="flex flex-wrap gap-1">
          {founder.skills?.slice(0, 4).map((skill: string) => (
            <Badge key={skill} variant="outline" className="text-[10px] bg-muted/30">{skill}</Badge>
          ))}
          {(founder.skills?.length || 0) > 4 && (
            <span className="text-[10px] text-muted-foreground">+{founder.skills.length - 4} more</span>
          )}
        </div>
        
        <div className="mt-auto pt-4 flex gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button className="flex-1">View Full Profile</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] p-0 overflow-hidden">
              <DialogHeader className="sr-only">
                <DialogTitle>{displayName}'s Profile</DialogTitle>
                <DialogDescription>
                  Detailed information about founder {displayName}, including their background, vision, and professional experience.
                </DialogDescription>
              </DialogHeader>
              <ScrollArea className="max-h-[90vh]">
                <div className="p-0">
                  {/* Banner/Header */}
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
                        <div className="flex items-center gap-2">
                          <h2 className="text-3xl font-bold">{displayName}</h2>
                          {founder.isVerified && <CheckCircle2 className="h-6 w-6 text-primary fill-primary/10" />}
                        </div>
                        <p className="text-primary font-medium">{founder.headline}</p>
                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1"><MapPin className="h-4 w-4" /> {founder.location}</span>
                          <span className="flex items-center gap-1"><Badge variant="secondary">{founder.stage} Stage</Badge></span>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3 mb-8">
                      <Button className="flex-1 gap-2"><MessageSquare className="h-4 w-4" /> Message</Button>
                      <Button variant="outline" className="flex-1 gap-2"><Calendar className="h-4 w-4" /> Request Meeting</Button>
                      <div className="flex gap-2">
                        {founder.socialLinks?.linkedin && (
                          <Button variant="ghost" size="icon" asChild>
                            <a href={founder.socialLinks.linkedin} target="_blank" rel="noopener noreferrer"><Linkedin className="h-4 w-4" /></a>
                          </Button>
                        )}
                        {founder.socialLinks?.website && (
                          <Button variant="ghost" size="icon" asChild>
                            <a href={founder.socialLinks.website} target="_blank" rel="noopener noreferrer"><Globe className="h-4 w-4" /></a>
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                      <div className="md:col-span-2 space-y-8">
                        {founder.bio && (
                          <section>
                            <h3 className="text-lg font-bold mb-3 flex items-center gap-2">About</h3>
                            <p className="text-muted-foreground text-sm leading-relaxed">{founder.bio}</p>
                          </section>
                        )}

                        {founder.whyBuilding && (
                          <section>
                            <h3 className="text-lg font-bold mb-3 flex items-center gap-2">Why I'm Building This</h3>
                            <div className="bg-primary/5 p-4 rounded-xl border border-primary/10">
                              <p className="text-muted-foreground text-sm leading-relaxed italic">"{founder.whyBuilding}"</p>
                            </div>
                          </section>
                        )}

                        {founder.experience && founder.experience.length > 0 && (
                          <section>
                            <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><Briefcase className="h-5 w-5 text-primary" /> Experience</h3>
                            <div className="space-y-6">
                              {founder.experience.map((exp: any, i: number) => (
                                <div key={i} className="flex gap-4">
                                  <div className="mt-1 bg-muted rounded-lg p-2 h-fit"><Briefcase className="h-4 w-4" /></div>
                                  <div className="space-y-1">
                                    <h4 className="font-bold text-sm">{exp.role}</h4>
                                    <p className="text-xs font-medium text-primary">{exp.company}</p>
                                    <p className="text-[10px] text-muted-foreground">{exp.duration}</p>
                                    <p className="text-xs text-muted-foreground mt-2">{exp.description}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </section>
                        )}
                      </div>

                      <div className="space-y-8">
                        <section>
                          <h3 className="text-lg font-bold mb-3 flex items-center gap-2">Availability</h3>
                          <div className="space-y-2">
                            {founder.availability?.openToInvestment && <Badge className="w-full justify-center bg-green-500/10 text-green-600 border-green-500/20">Open to Investment</Badge>}
                            {founder.availability?.hiring && <Badge className="w-full justify-center bg-blue-500/10 text-blue-600 border-blue-500/20">Currently Hiring</Badge>}
                            {founder.availability?.coFounder && <Badge className="w-full justify-center bg-orange-500/10 text-orange-600 border-orange-500/20">Looking for Co-founder</Badge>}
                            {!founder.availability && <p className="text-xs text-muted-foreground italic">Contact for availability</p>}
                          </div>
                        </section>

                        <section>
                          <h3 className="text-lg font-bold mb-3 flex items-center gap-2">Expertise</h3>
                          <div className="flex flex-wrap gap-2">
                            {founder.skills?.map((skill: string) => (
                              <Badge key={skill} variant="outline" className="text-[10px]">{skill}</Badge>
                            ))}
                          </div>
                        </section>

                        {founder.achievements && founder.achievements.length > 0 && (
                          <section>
                            <h3 className="text-lg font-bold mb-3 flex items-center gap-2"><Award className="h-5 w-5 text-primary" /> Achievements</h3>
                            <ul className="space-y-2">
                              {founder.achievements.map((ach: string, i: number) => (
                                <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                                  <CheckCircle2 className="h-3 w-3 mt-0.5 text-primary shrink-0" />
                                  {ach}
                                </li>
                              ))}
                            </ul>
                          </section>
                        )}

                        {founder.education && founder.education.length > 0 && (
                          <section>
                            <h3 className="text-lg font-bold mb-3 flex items-center gap-2"><GraduationCap className="h-5 w-5 text-primary" /> Education</h3>
                            <div className="space-y-3">
                              {founder.education.map((edu: any, i: number) => (
                                <div key={i} className="text-xs">
                                  <p className="font-bold">{edu.school}</p>
                                  <p className="text-muted-foreground">{edu.degree}</p>
                                  <p className="text-[10px] text-muted-foreground">{edu.year}</p>
                                </div>
                              ))}
                            </div>
                          </section>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </DialogContent>
          </Dialog>
          <Button variant="outline" size="icon" asChild>
            <a href={`/founders/${founder.uid || founder.id}`}><Linkedin className="h-4 w-4" /></a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
