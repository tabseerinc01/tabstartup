'use client';

import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { useState, useEffect } from 'react';
import { useFirestore, useUser } from '@/firebase';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PublicHeader } from '@/components/public/header';
import { PublicFooter } from '@/components/public/footer';
import { 
  Loader2, 
  ArrowLeft, 
  MapPin, 
  Globe, 
  Briefcase, 
  Linkedin, 
  CheckCircle2,
  Target,
  MessageSquare,
  Award,
  Zap,
  Rocket
} from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';

export default function MentorPublicProfilePage() {
  const params = useParams();
  const router = useRouter();
  const firestore = useFirestore();
  const { user: currentUser } = useUser();
  const { toast } = useToast();
  const uid = params?.uid as string;

  const [mentor, setMentor] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpeningChat, setIsOpeningChat] = useState(false);

  useEffect(() => {
    async function loadMentor() {
      if (!firestore || !uid) return;
      setIsLoading(true);
      try {
        const snap = await getDoc(doc(firestore, 'users', uid));
        if (snap.exists()) {
          setMentor({ id: snap.id, ...snap.data() });
        }
      } catch (error) {
        console.error("Error loading mentor profile:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadMentor();
  }, [firestore, uid]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        <PublicHeader />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
        <PublicFooter />
      </div>
    );
  }

  const userRoles = (mentor?.roles || (mentor?.role ? [mentor.role] : [])).filter(Boolean);
  const isMentor = mentor?.isMentor || userRoles.includes('mentor');

  if (!mentor || !isMentor) {
    return (
      <div className="flex min-h-screen flex-col">
        <PublicHeader />
        <main className="flex-1 flex flex-col items-center justify-center p-4">
          <h1 className="text-2xl font-bold mb-4 text-slate-900">Mentor profile not found</h1>
          <Button variant="outline" onClick={() => router.push('/mentors')}>
            Back to Mentors
          </Button>
        </main>
        <PublicFooter />
      </div>
    );
  }

  async function handleConnect() {
    if (!firestore || !currentUser?.uid || !uid || isOpeningChat) {
        if (!currentUser) {
            toast({ title: "Login Required", description: "Please sign in to connect." });
            router.push('/login');
        }
        return;
    }
    
    setIsOpeningChat(true);
    try {
      const q = query(
        collection(firestore, "chats"),
        where("participants", "array-contains", currentUser.uid)
      );

      const snap = await getDocs(q);
      let chatId = null;

      snap.forEach(doc => {
        const data = doc.data();
        if (data.participants && data.participants.includes(uid)) {
          chatId = doc.id;
        }
      });

      if (chatId) {
        router.push(`/chats/${chatId}`);
      } else {
        const newChatRef = await addDoc(collection(firestore, 'chats'), {
          participants: [currentUser.uid, uid],
          lastMessage: "Connecting for mentorship...",
          updatedAt: serverTimestamp(),
        });
        router.push(`/chats/${newChatRef.id}`);
      }
    } catch (error) {
      console.error("Error connecting:", error);
      toast({ title: "Error", description: "Failed to establish connection.", variant: "destructive" });
    } finally {
      setIsOpeningChat(false);
    }
  }

  const name = mentor.fullName || 'Mentor';
  const initials = name.split(' ').map((n: any) => n[0]).join('').toUpperCase();
  const isOwnProfile = currentUser?.uid === uid;

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <PublicHeader />
      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto space-y-8">
          <Button variant="ghost" asChild className="mb-2 -ml-4">
            <Link href="/mentors" className="gap-2 text-slate-600 hover:text-primary">
              <ArrowLeft className="h-4 w-4" /> Back to Directory
            </Link>
          </Button>

          <Card className="overflow-hidden border-none shadow-2xl rounded-[3rem] bg-background">
            <div className="h-48 bg-gradient-to-r from-primary/30 via-slate-200 to-primary/20" />
            <div className="px-6 md:px-12 pb-12 -mt-20">
              <div className="flex flex-col md:flex-row gap-8 items-end mb-10">
                <Avatar className="h-40 w-40 rounded-3xl border-8 border-background bg-muted shrink-0 shadow-2xl">
                  <AvatarImage src={mentor.imageUrl} alt={name} className="object-cover" />
                  <AvatarFallback className="text-4xl font-bold">{initials}</AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">
                      {name}
                    </h1>
                    {mentor.isVerified && <CheckCircle2 className="h-8 w-8 text-primary fill-primary/10" />}
                    <div className="flex gap-1">
                      {userRoles.map((role: string) => (
                        <Badge key={role} className="bg-primary/10 text-primary border-none px-4 py-1 rounded-xl capitalize font-bold text-[10px]">
                          {role}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <p className="text-xl text-primary font-semibold">{mentor.headline || "Industry Expert"}</p>
                  <div className="flex flex-wrap gap-6 text-sm text-muted-foreground font-medium">
                    {mentor.location && (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-5 w-5 text-primary" /> {mentor.location}
                      </span>
                    )}
                    <span className="flex items-center gap-1.5">
                      <Briefcase className="h-5 w-5 text-primary" /> {mentor.yearsOfExperience || 'Experienced Professional'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-4 mb-12">
                {!isOwnProfile && (
                  <Button 
                    className="h-14 px-10 rounded-2xl text-base gap-2 font-bold shadow-xl hover:scale-105 transition-transform" 
                    onClick={handleConnect}
                    disabled={isOpeningChat}
                  >
                    {isOpeningChat ? <Loader2 className="h-5 w-5 animate-spin" /> : <MessageSquare className="h-5 w-5" />}
                    Connect & Message
                  </Button>
                )}
                
                {isOwnProfile && (
                  <Button variant="outline" asChild className="h-14 px-8 rounded-2xl text-base font-bold">
                    <Link href="/dashboard/profile">Update Mentor Profile</Link>
                  </Button>
                )}

                <div className="flex gap-2">
                  {mentor.socialLinks?.linkedin && (
                    <Button variant="ghost" size="icon" className="h-14 w-14 rounded-2xl border border-muted" asChild>
                      <a href={mentor.socialLinks.linkedin.startsWith('http') ? mentor.socialLinks.linkedin : `https://${mentor.socialLinks.linkedin}`} target="_blank" rel="noopener noreferrer"><Linkedin className="h-6 w-6 text-[#0077b5]" /></a>
                    </Button>
                  )}
                  {mentor.socialLinks?.website && (
                    <Button variant="ghost" size="icon" className="h-14 w-14 rounded-2xl border border-muted" asChild>
                      <a href={mentor.socialLinks.website.startsWith('http') ? mentor.socialLinks.website : `https://${mentor.socialLinks.website}`} target="_blank" rel="noopener noreferrer"><Globe className="h-6 w-6" /></a>
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 pt-4">
                <div className="lg:col-span-2 space-y-12">
                  {mentor.mentorBio && (
                    <section>
                      <h3 className="text-2xl font-bold mb-4 flex items-center gap-2 text-slate-900">
                         Mentorship Philosophy
                      </h3>
                      <div className="bg-primary/5 p-8 rounded-[2.5rem] border border-primary/10 relative">
                        <span className="absolute -top-4 -left-2 text-6xl text-primary/20 font-serif">“</span>
                        <p className="text-slate-700 text-lg font-medium italic leading-relaxed whitespace-pre-wrap">
                          {mentor.mentorBio}
                        </p>
                      </div>
                    </section>
                  )}

                  {mentor.experience && mentor.experience.length > 0 && (
                    <section>
                      <h3 className="text-2xl font-bold mb-6 flex items-center gap-3 text-slate-900">
                        <Briefcase className="h-6 w-6 text-primary" /> Career History
                      </h3>
                      <div className="space-y-8">
                        {mentor.experience.map((exp: any, i: number) => (
                          <div key={i} className="flex gap-6 relative">
                            {i !== mentor.experience.length - 1 && (
                              <div className="absolute left-6 top-14 bottom-0 w-0.5 bg-muted-foreground/10" />
                            )}
                            <div className="mt-1 bg-white border shadow-sm rounded-2xl p-3 h-fit z-10">
                              <Briefcase className="h-6 w-6 text-primary" />
                            </div>
                            <div className="space-y-2">
                              <h4 className="text-xl font-bold text-slate-900">{exp.role}</h4>
                              <p className="text-lg font-semibold text-primary">{exp.company}</p>
                              <p className="text-sm text-muted-foreground bg-muted w-fit px-2 py-0.5 rounded-lg">{exp.duration}</p>
                              {exp.description && <p className="text-slate-600 leading-relaxed mt-2">{exp.description}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {(userRoles.includes('founder') || userRoles.includes('investor')) && (
                    <section className="space-y-6 pt-12 border-t">
                       <h3 className="text-xl font-bold text-slate-900">Ecosystem Connections</h3>
                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                         {userRoles.includes('founder') && (
                           <Link href={`/founders/${uid}`}>
                             <Card className="hover:border-primary/30 transition-colors p-4 flex items-center gap-3 group">
                               <Rocket className="h-5 w-5 text-primary group-hover:scale-110 transition-transform" />
                               <span className="font-bold text-sm">View Founder Profile</span>
                             </Card>
                           </Link>
                         )}
                         {userRoles.includes('investor') && (
                           <Link href={`/investors/${uid}`}>
                             <Card className="hover:border-primary/30 transition-colors p-4 flex items-center gap-3 group">
                               <Zap className="h-5 w-5 text-primary group-hover:scale-110 transition-transform" />
                               <span className="font-bold text-sm">View Investor Profile</span>
                             </Card>
                           </Link>
                         )}
                       </div>
                    </section>
                  )}
                </div>

                <div className="space-y-10">
                  <section className="bg-white p-8 rounded-[2.5rem] border shadow-xl shadow-primary/5">
                    <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-slate-900">
                      <Target className="h-5 w-5 text-primary" /> Areas of Guidance
                    </h3>
                    <div className="space-y-8">
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-4">
                          Mentor Skills
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {Array.isArray(mentor.mentorSkills) && mentor.mentorSkills.length > 0 ? (
                            mentor.mentorSkills.map((s: string) => (
                              <Badge key={s} variant="secondary" className="rounded-xl px-4 py-1.5 font-bold bg-primary/5 text-primary border-none">
                                {s}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-sm text-muted-foreground italic">General expertise</span>
                          )}
                        </div>
                      </div>

                      <div className="pt-6 border-t">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">
                          Current Availability
                        </p>
                        <div className="flex items-center justify-between">
                            <p className="text-base font-bold text-slate-800">{mentor.mentorAvailability || 'Open to Mentoring'}</p>
                            <Badge className="bg-green-100 text-green-700 hover:bg-green-200 border-none px-3">Active</Badge>
                        </div>
                      </div>
                    </div>
                  </section>

                  {mentor.achievements && mentor.achievements.length > 0 && (
                    <section>
                      <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-slate-900">
                        <Award className="h-5 w-5 text-primary" /> Key Milestones
                      </h3>
                      <div className="space-y-3">
                        {mentor.achievements.map((ach: string, i: number) => (
                          <div key={i} className="flex items-start gap-3 p-4 bg-muted/20 rounded-2xl border border-transparent transition-colors">
                            <CheckCircle2 className="h-5 w-5 mt-0.5 text-primary shrink-0" />
                            <span className="text-sm font-semibold text-slate-700">{ach}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
