'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { collection, query, where, limit, getDocs, orderBy } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
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
import { Loader2, Search, MapPin, ArrowRight, Briefcase, GraduationCap, Star, Clock } from 'lucide-react';
import { PublicHeader } from '@/components/public/header';
import { PublicFooter } from '@/components/public/footer';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export default function MentorsPage() {
  const [mentors, setMentors] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expertiseFilter, setExpertiseFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  
  const firestore = useFirestore();

  useEffect(() => {
    async function loadMentors() {
      if (!firestore) return;
      setIsLoading(true);
      try {
        const multiRoleQuery = query(
          collection(firestore, 'users'), 
          where('roles', 'array-contains', 'mentor'), 
          limit(100)
        );
        const legacyQuery = query(
          collection(firestore, 'users'),
          where('isMentor', '==', true),
          limit(100)
        );

        const [multiSnap, legacySnap] = await Promise.all([
          getDocs(multiRoleQuery),
          getDocs(legacyQuery)
        ]);

        const userMap = new Map();
        multiSnap.docs.forEach(d => userMap.set(d.id, { id: d.id, ...d.data() }));
        legacySnap.docs.forEach(d => {
          if (!userMap.has(d.id)) {
            userMap.set(d.id, { id: d.id, ...d.data() });
          }
        });

        setMentors(Array.from(userMap.values()));
      } catch (error) {
        console.error("Error loading mentors:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadMentors();
  }, [firestore]);

  const filteredMentors = useMemo(() => {
    return mentors.filter((m) => {
      const name = (m.fullName || '').toLowerCase();
      const headline = (m.headline || '').toLowerCase();
      const bio = (m.mentorBio || '').toLowerCase();
      const searchTerm = search.toLowerCase();
      
      const matchesSearch = name.includes(searchTerm) || headline.includes(searchTerm) || bio.includes(searchTerm);
      const matchesExpertise = expertiseFilter === 'all' || 
                              (m.mentorSkills || []).some((s: string) => s.toLowerCase().includes(expertiseFilter.toLowerCase()));

      return matchesSearch && matchesExpertise;
    }).sort((a, b) => {
      if (sortBy === 'newest') return (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0);
      if (sortBy === 'experience') return (parseInt(b.yearsOfExperience) || 0) - (parseInt(a.yearsOfExperience) || 0);
      return 0;
    });
  }, [mentors, search, expertiseFilter, sortBy]);

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <PublicHeader />
      <main className="flex-1 container mx-auto px-4 py-12 md:py-20">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/10 rounded-2xl">
                <GraduationCap className="h-8 w-8 text-primary" />
              </div>
              <h1 className="text-4xl font-black tracking-tight text-slate-900">Mentor Directory</h1>
            </div>
            <p className="text-xl text-muted-foreground max-w-2xl font-medium">
              Learn from experienced builders and operators who have successfully scaled startups globally.
            </p>
          </div>

          <Card className="border-none shadow-xl rounded-[2.5rem] bg-background p-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search expertise..."
                    className="pl-10 rounded-xl"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Expertise Area</Label>
                <Select value={expertiseFilter} onValueChange={setExpertiseFilter}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Specialties</SelectItem>
                    <SelectItem value="Strategy">Strategy</SelectItem>
                    <SelectItem value="Product">Product</SelectItem>
                    <SelectItem value="Marketing">Marketing</SelectItem>
                    <SelectItem value="Fundraising">Fundraising</SelectItem>
                    <SelectItem value="Legal">Legal</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Sort By</Label>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Recently Joined</SelectItem>
                    <SelectItem value="experience">Years of Experience</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end">
                <Button variant="outline" asChild className="w-full rounded-xl font-bold gap-2">
                   <Link href="/signup?role=mentor">Become a Mentor</Link>
                </Button>
              </div>
            </div>
          </Card>

          {isLoading ? (
            <div className="flex py-24 items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" /></div>
          ) : filteredMentors.length === 0 ? (
            <Card className="border-2 border-dashed rounded-[3rem] bg-background/50 py-32 text-center">
              <CardContent className="space-y-6">
                <div className="p-6 bg-muted/50 rounded-full w-fit mx-auto"><GraduationCap className="h-12 w-12 text-slate-300" /></div>
                <h3 className="text-xl font-bold">No mentors found</h3>
                <p className="text-slate-500">Try adjusting your filters to find suitable expertise.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredMentors.map((mentor) => (
                <MentorCard key={mentor.id} mentor={mentor} />
              ))}
            </div>
          )}
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}

function MentorCard({ mentor }: { mentor: any }) {
  const name = mentor.fullName || 'Anonymous Mentor';
  const initials = name.split(' ').map((n: any) => n[0]).join('').toUpperCase();
  const avatarUrl = mentor.imageUrl || `https://picsum.photos/seed/${mentor.id}/200/200`;

  return (
    <Card className="flex flex-col h-full hover:shadow-2xl transition-all border-none bg-background shadow-xl rounded-[2.5rem] overflow-hidden group">
      <CardHeader className="pb-4 pt-8 px-8 flex flex-row gap-4 items-start">
        <Avatar className="h-20 w-20 border-4 border-primary/5 rounded-2xl shadow-lg">
          <AvatarImage src={avatarUrl} alt={name} className="object-cover" />
          <AvatarFallback className="rounded-2xl text-2xl font-bold">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-bold truncate group-hover:text-primary transition-colors text-slate-900">{name}</h3>
          <p className="text-sm font-semibold text-primary/80 line-clamp-2 mt-1 uppercase tracking-tight">
            {mentor.headline || "Industry Expert"}
          </p>
          <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground font-medium">
             <MapPin className="h-3 w-3" /> {mentor.location || 'Remote'}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="flex flex-col flex-1 px-8 pb-8 space-y-6">
        <div className="space-y-4">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Expertise Area</p>
            <div className="flex flex-wrap gap-1.5">
              {Array.isArray(mentor.mentorSkills) && mentor.mentorSkills.length > 0 ? (
                mentor.mentorSkills.slice(0, 3).map((skill: string) => (
                  <Badge key={skill} variant="secondary" className="rounded-lg text-[9px] bg-primary/5 text-primary border-none font-black uppercase tracking-tight">
                    {skill}
                  </Badge>
                ))
              ) : (
                <span className="text-[10px] text-slate-400 font-bold uppercase italic">Startup Generalist</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 py-4 border-y border-slate-50">
            <div className="space-y-1">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Experience</p>
              <p className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5 text-primary" /> {mentor.yearsOfExperience || '5+'} yrs
              </p>
            </div>
            <div className="space-y-1 text-right">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Availability</p>
              <Badge variant="outline" className="text-[8px] font-black uppercase border-green-200 text-green-700 bg-green-50">
                {mentor.mentorAvailability || 'Available'}
              </Badge>
            </div>
          </div>
        </div>

        <Button className="w-full rounded-2xl h-12 gap-2 mt-auto group-hover:bg-primary group-hover:text-primary-foreground transition-all" variant="outline" asChild>
          <Link href={`/mentors/${mentor.id}`}>
            Request Guidance <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
