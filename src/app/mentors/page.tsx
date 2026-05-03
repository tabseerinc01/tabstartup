'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { collection, query, where, limit, getDocs } from 'firebase/firestore';
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
import { Loader2, Search, MapPin, ArrowRight, Briefcase } from 'lucide-react';
import { PublicHeader } from '@/components/public/header';
import { PublicFooter } from '@/components/public/footer';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export default function MentorsPage() {
  const [mentors, setMentors] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const firestore = useFirestore();

  useEffect(() => {
    async function loadMentors() {
      if (!firestore) return;
      setIsLoading(true);
      try {
        const q = query(collection(firestore, 'users'), where('isMentor', '==', true), limit(100));
        const snap = await getDocs(q);
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setMentors(items);
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
      const skills = (m.mentorSkills || []).join(' ').toLowerCase();
      const searchTerm = search.toLowerCase();
      
      return name.includes(searchTerm) || 
             headline.includes(searchTerm) || 
             bio.includes(searchTerm) ||
             skills.includes(searchTerm);
    });
  }, [mentors, search]);

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <PublicHeader />
      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="mb-12">
          <h1 className="text-4xl font-extrabold tracking-tight mb-4 text-slate-900">Find a Mentor</h1>
          <p className="text-muted-foreground text-lg max-w-2xl">
            Connect with experienced builders and industry experts who can help guide your startup journey.
          </p>
        </div>

        <div className="max-w-xl mb-12">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search by expertise, name or industry..."
              className="pl-12 h-14 rounded-2xl border-none shadow-lg bg-background text-lg"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex py-24 items-center justify-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          </div>
        ) : filteredMentors.length === 0 ? (
          <div className="text-center py-32 border-2 border-dashed rounded-[3rem] bg-background/50">
            <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-20" />
            <h3 className="text-xl font-bold mb-2 text-slate-900">No mentors found</h3>
            <p className="text-muted-foreground">Try adjusting your search terms.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredMentors.map((mentor) => (
              <MentorCard key={mentor.id} mentor={mentor} />
            ))}
          </div>
        )}
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
          <p className="text-sm font-semibold text-primary/80 line-clamp-2 mt-1">
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
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Expertise</p>
            <div className="flex flex-wrap gap-1.5">
              {Array.isArray(mentor.mentorSkills) && mentor.mentorSkills.length > 0 ? (
                mentor.mentorSkills.slice(0, 4).map((skill: string) => (
                  <Badge key={skill} variant="secondary" className="rounded-lg text-[10px] bg-primary/5 text-primary border-none font-bold">
                    {skill}
                  </Badge>
                ))
              ) : (
                <span className="text-xs text-muted-foreground italic">General Mentorship</span>
              )}
              {Array.isArray(mentor.mentorSkills) && mentor.mentorSkills.length > 4 && (
                <Badge variant="outline" className="rounded-lg text-[10px] font-bold">+{mentor.mentorSkills.length - 4}</Badge>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 py-4 border-y border-primary/5">
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Experience</p>
              <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5 text-primary" /> {mentor.yearsOfExperience || 'Experienced'}
              </p>
            </div>
            <div className="space-y-1 text-right">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Availability</p>
              <Badge variant="outline" className="text-[10px] font-bold border-green-200 text-green-700 bg-green-50">
                {mentor.mentorAvailability || 'Available'}
              </Badge>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-muted/30 border border-muted/20 min-h-[80px]">
            <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed italic">
              "{mentor.mentorBio || "Passionate about helping early-stage founders scale their visions and navigate the ecosystem."}"
            </p>
          </div>
        </div>

        <Button className="w-full rounded-2xl h-12 gap-2 mt-auto group-hover:bg-primary group-hover:text-primary-foreground transition-all" variant="outline" asChild>
          <Link href={`/mentors/${mentor.id}`}>
            Connect with Mentor <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
