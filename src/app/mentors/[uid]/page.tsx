
'use client';

import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, collection, addDoc, serverTimestamp, query, where, getDocs, limit } from 'firebase/firestore';
import { useState, useEffect } from 'react';
import { useFirestore, useUser, errorEmitter, FirestorePermissionError } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PublicHeader } from '@/components/public/header';
import { PublicFooter } from '@/components/public/footer';
import { Loader2, ArrowLeft, MapPin, Briefcase, Linkedin, CheckCircle2, Target, MessageSquare, Award, Zap, Rocket, Clock, Check, AlertCircle, ShieldCheck, Globe, Lock, User, Languages, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { createNotification } from '@/lib/notifications';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { calculateProfileStrength, calculateTrustScore } from '@/lib/profile-utils';
import { cn } from '@/lib/utils';
import { MentorshipRequestDialog } from '@/components/dashboard/mentorship/request-dialog';

export default function MentorPublicProfilePage() {
  const params = useParams();
  const router = useRouter();
  const firestore = useFirestore();
  const { user: currentUser } = useUser();
  const { toast } = useToast();
  const uid = params?.uid as string;

  const [mentor, setMentor] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [existingRequest, setExistingRequest] = useState<any>(null);

  useEffect(() => {
    async function loadData() {
      if (!firestore || !uid) return;
      setIsLoading(true);
      try {
        const snap = await getDoc(doc(firestore, 'users', uid));
        if (snap.exists()) {
          setMentor({ id: snap.id, ...snap.data() });
        }

        if (currentUser?.uid) {
          const reqQ = query(
            collection(firestore, 'mentorshipRequests'),
            where('founderUid', '==', currentUser.uid),
            where('mentorUid', '==', uid),
            limit(1)
          );
          const reqSnap = await getDocs(reqQ);
          if (!reqSnap.empty) {
            setExistingRequest(reqSnap.docs[0].data());
          }
        }
      } catch (error) {
        console.error("Error loading mentor profile:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [firestore, uid, currentUser?.uid]);

  if (isLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-primary opacity-20" /></div>;

  const name = mentor?.fullName || 'Mentor';
  const isOwnProfile = currentUser?.uid === uid;
  
  const strength = calculateProfileStrength(mentor);
  const trustScore = calculateTrustScore(mentor);
  const hasLinkedIn = !!(mentor?.linkedinUrl || mentor?.socialLinks?.linkedin);
  const hasWebsite = !!(mentor?.website || mentor?.socialLinks?.website);

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <PublicHeader />
      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto space-y-8">
          <Button variant="ghost" asChild className="mb-2 -ml-4">
            <Link href="/mentors" className="gap-2"><ArrowLeft className="h-4 w-4" /> Back to Directory</Link>
          </Button>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8 space-y-8">
              <Card className="overflow-hidden border-none shadow-2xl rounded-[3rem] bg-background">
                <div className="h-48 bg-muted relative">
                   {mentor.coverImageUrl ? (
                     <img src={mentor.coverImageUrl} alt="Cover" className="w-full h-full object-cover" />
                   ) : (
                     <div className="h-full w-full bg-gradient-to-r from-primary/30 via-slate-200 to-primary/20" />
                   )}
                </div>
                <div className="px-6 md:px-12 pb-12 -mt-20">
                  <div className="flex flex-col md:flex-row gap-8 items-end mb-10">
                    <Avatar className="h-40 w-40 rounded-3xl border-8 border-background bg-muted shrink-0 shadow-2xl">
                      <AvatarImage src={mentor?.imageUrl} className="object-cover" />
                      <AvatarFallback className="text-4xl font-bold">{name[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h1 className="text-4xl font-extrabold tracking-tight">{name}</h1>
                        {mentor?.isVerified && <ShieldCheck className="h-8 w-8 text-primary fill-primary/10" />}
                      </div>
                      <p className="text-xl text-primary font-semibold">{mentor?.headline || "Industry Expert"}</p>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground font-medium">
                        <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {mentor.location || 'Remote'}</span>
                        <span className="flex items-center gap-1.5"><Briefcase className="h-4 w-4" /> {mentor.yearsOfExperience || '5+'} Years Exp.</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4 mb-12">
                    {!isOwnProfile && (
                      <MentorshipRequestDialog 
                        mentor={mentor} 
                        existingRequest={existingRequest} 
                        trigger={
                          <Button className="h-14 px-10 rounded-2xl text-base gap-2 font-black shadow-xl" disabled={!!existingRequest}>
                             {existingRequest ? <Check className="h-5 w-5" /> : <Zap className="h-5 w-5" />}
                             {existingRequest ? `Request ${existingRequest.status}` : 'Request Mentorship'}
                          </Button>
                        } 
                      />
                    )}
                    <Button 
                      variant="outline" 
                      className="h-14 px-8 rounded-2xl text-base font-bold border-slate-200" 
                      onClick={() => router.push(`/dashboard/messages?startWith=${uid}`)}
                    >
                      <MessageSquare className="h-5 w-5" /> Message
                    </Button>
                  </div>

                  <div className="space-y-12">
                    <section>
                      <h3 className="text-2xl font-black flex items-center gap-3 mb-6">
                        <User className="h-6 w-6 text-primary" /> About Expertise
                      </h3>
                      <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100 text-lg text-slate-700 leading-relaxed italic">
                        "{mentor.mentorBio || mentor.bio || "Available to support early-stage founders with strategic guidance and operational expertise."}"
                      </div>
                    </section>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                       <section className="space-y-4">
                          <h4 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                             <Award className="h-4 w-4" /> Primary Skills
                          </h4>
                          <div className="flex flex-wrap gap-2">
                             {(mentor.mentorSkills || mentor.skills || []).map((skill: string) => (
                               <Badge key={skill} variant="secondary" className="rounded-lg bg-primary/5 text-primary border-none font-bold px-3 py-1">
                                 {skill}
                               </Badge>
                             ))}
                          </div>
                       </section>
                       <section className="space-y-4">
                          <h4 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                             <Languages className="h-4 w-4" /> Languages
                          </h4>
                          <div className="flex flex-wrap gap-2">
                             {(mentor.languages || ['English']).map((lang: string) => (
                               <Badge key={lang} variant="outline" className="rounded-lg border-slate-200 font-bold px-3 py-1">
                                 {lang}
                               </Badge>
                             ))}
                          </div>
                       </section>
                    </div>

                    {mentor.experience && mentor.experience.length > 0 && (
                      <section className="space-y-6 pt-8 border-t border-slate-50">
                        <h3 className="text-2xl font-black text-slate-900">Career Milestones</h3>
                        <div className="space-y-6">
                           {mentor.experience.map((exp: any, i: number) => (
                             <div key={i} className="flex gap-6 relative">
                                <div className="mt-1.5 h-3 w-3 rounded-full bg-primary shrink-0 relative z-10" />
                                {i < mentor.experience.length - 1 && (
                                  <div className="absolute left-[5px] top-4 bottom-[-1.5rem] w-0.5 bg-slate-100" />
                                )}
                                <div className="space-y-1">
                                   <p className="font-black text-slate-900">{exp.role}</p>
                                   <p className="text-sm font-bold text-primary">{exp.company}</p>
                                   <p className="text-xs text-slate-400 font-medium uppercase tracking-tight">{exp.duration}</p>
                                   {exp.description && <p className="text-sm text-slate-600 mt-2 leading-relaxed">{exp.description}</p>}
                                </div>
                             </div>
                           ))}
                        </div>
                      </section>
                    )}
                  </div>
                </div>
              </Card>
            </div>

            <div className="lg:col-span-4 space-y-6">
              <Card className="border-none shadow-xl rounded-[2rem] bg-slate-900 text-white p-8 space-y-6 relative overflow-hidden group">
                 <div className="relative z-10 space-y-4">
                    <div className="flex items-center justify-between">
                       <p className="text-[10px] font-black uppercase tracking-widest text-primary">Trust Level</p>
                       <span className="text-2xl font-black">{trustScore}%</span>
                    </div>
                    <Progress value={strength} className="h-2 bg-white/10" />
                 </div>
                 <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-16 -mt-16" />
              </Card>

              <Card className="border-none shadow-sm rounded-[2rem] bg-white ring-1 ring-slate-100 p-8">
                 <div className="space-y-6">
                    <div className="flex items-center gap-2 border-b border-slate-50 pb-4">
                       <ShieldCheck className="h-5 w-5 text-primary" />
                       <h3 className="font-black text-slate-900 uppercase text-xs tracking-widest">Verification Status</h3>
                    </div>

                    <div className="space-y-4">
                       <div className={cn(
                         "flex items-center justify-between p-3 rounded-xl border transition-colors",
                         hasLinkedIn ? "bg-blue-50 border-blue-100 text-blue-700" : "bg-slate-50 border-slate-100 text-slate-400"
                       )}>
                          <div className="flex items-center gap-3 text-sm font-bold">
                             <Linkedin className="h-4 w-4" /> LinkedIn
                          </div>
                          {hasLinkedIn ? <CheckCircle2 className="h-4 w-4" /> : <Lock className="h-4 w-4 opacity-30" />}
                       </div>

                       <div className={cn(
                         "flex items-center justify-between p-3 rounded-xl border transition-colors",
                         hasWebsite ? "bg-primary/5 border-primary/10 text-primary" : "bg-slate-50 border-slate-100 text-slate-400"
                       )}>
                          <div className="flex items-center gap-3 text-sm font-bold">
                             <Globe className="h-4 w-4" /> Website
                          </div>
                          {hasWebsite ? <CheckCircle2 className="h-4 w-4" /> : <Lock className="h-4 w-4 opacity-30" />}
                       </div>

                       <div className="flex items-center justify-between p-3 rounded-xl border bg-slate-50 border-slate-100 text-slate-300">
                          <div className="flex items-center gap-3 text-sm font-bold">
                             <Award className="h-4 w-4" /> Active Mentor
                          </div>
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                       </div>
                    </div>

                    <div className="pt-4">
                       <Button variant="ghost" className="w-full justify-start h-12 rounded-xl text-primary font-bold gap-3" asChild>
                          <a href={mentor.linkedinUrl || '#'} target="_blank">
                             <ExternalLink className="h-4 w-4" /> View Verified Social
                          </a>
                       </Button>
                    </div>
                 </div>
              </Card>
            </div>
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
