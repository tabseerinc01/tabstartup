'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useFirestore, useUser } from '@/firebase';
import { doc, collection, addDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { PublicHeader } from '@/components/public/header';
import { PublicFooter } from '@/components/public/footer';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { MapPin, Briefcase, Award, CheckCircle2, MessageSquare, Calendar, Globe, Linkedin, GraduationCap, ArrowLeft, Loader2, Send } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';

export default function FounderPublicProfilePage() {
  const { uid } = useParams();
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  const [founder, setFounder] = useState<any>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [pitchMessage, setPitchMessage] = useState('');
  const [isSendingPitch, setIsSendingPitch] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    async function loadData() {
      if (!firestore || !uid) return;
      setIsLoading(true);
      try {
        const founderSnap = await getDoc(doc(firestore, 'users', uid as string));
        if (founderSnap.exists()) {
          setFounder({ id: founderSnap.id, ...founderSnap.data() });
        }

        if (user?.uid) {
          const userSnap = await getDoc(doc(firestore, 'users', user.uid));
          if (userSnap.exists()) {
            setCurrentUserProfile(userSnap.data());
          }
        }
      } catch (error) {
        console.error("Error loading founder profile:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [firestore, uid, user?.uid]);

  const handleSendPitch = async () => {
    if (!user || !firestore || !uid) return;
    if (!pitchMessage.trim()) {
      toast({ title: "Message Required", description: "Please enter a message for your pitch.", variant: "destructive" });
      return;
    }

    setIsSendingPitch(true);
    try {
      await addDoc(collection(firestore, 'pitches'), {
        fromInvestorUid: user.uid,
        toFounderUid: uid,
        message: pitchMessage,
        status: 'pending',
        createdAt: serverTimestamp(),
      });

      toast({ title: "Pitch Sent!", description: "Your pitch has been delivered to the founder." });
      setPitchMessage('');
      setIsDialogOpen(false);
    } catch (error) {
      console.error("Error sending pitch:", error);
      toast({ title: "Error", description: "Failed to send pitch. Please try again.", variant: "destructive" });
    } finally {
      setIsSendingPitch(false);
    }
  };

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

  if (!founder) {
    return (
      <div className="flex min-h-screen flex-col">
        <PublicHeader />
        <main className="flex-1 flex flex-col items-center justify-center p-4">
          <h1 className="text-2xl font-bold mb-4">Founder not found</h1>
          <Button asChild><Link href="/founders">Back to Founders</Link></Button>
        </main>
        <PublicFooter />
      </div>
    );
  }

  const displayName = founder.fullName || founder.name;
  const imageId = founder.uid || founder.id || 'user';
  const isInvestor = currentUserProfile?.role === 'investor';

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <PublicHeader />
      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <Button variant="ghost" asChild className="mb-6 -ml-4">
            <Link href="/founders" className="gap-2"><ArrowLeft className="h-4 w-4" /> Back to Directory</Link>
          </Button>

          <Card className="overflow-hidden border-none shadow-xl rounded-3xl">
            <div className="h-48 bg-gradient-to-r from-primary/20 via-accent/20 to-primary/10" />
            <div className="px-6 md:px-12 pb-12 -mt-20">
              <div className="flex flex-col md:flex-row gap-8 items-end mb-10">
                <div className="relative h-40 w-40 rounded-3xl overflow-hidden border-8 border-background bg-muted shrink-0 shadow-2xl">
                  <Image 
                    src={founder.imageUrl || `https://picsum.photos/seed/${imageId}/400/400`} 
                    alt={displayName} 
                    fill 
                    className="object-cover" 
                  />
                </div>
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-2">
                    <h1 className="text-4xl font-extrabold tracking-tight">{displayName}</h1>
                    {founder.isVerified && <CheckCircle2 className="h-8 w-8 text-primary fill-primary/10" />}
                  </div>
                  <p className="text-xl text-primary font-semibold">{founder.headline}</p>
                  <div className="flex flex-wrap gap-6 text-sm text-muted-foreground font-medium">
                    <span className="flex items-center gap-1.5"><MapPin className="h-5 w-5 text-primary" /> {founder.location}</span>
                    <span className="flex items-center gap-1.5"><Badge variant="secondary" className="px-3 py-1">{founder.stage} Stage</Badge></span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-4 mb-12">
                {isInvestor ? (
                  <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                      <Button className="flex-1 md:flex-none h-12 px-8 gap-2 rounded-2xl text-base bg-primary hover:bg-primary/90">
                        <Send className="h-5 w-5" /> Send Pitch
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Pitch to {displayName}</DialogTitle>
                        <DialogDescription>
                          Share your investment proposal or express interest in collaborating.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <Textarea 
                          placeholder="Tell the founder why you're interested and what you can offer..."
                          className="min-h-[150px] rounded-xl"
                          value={pitchMessage}
                          onChange={(e) => setPitchMessage(e.target.value)}
                        />
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSendingPitch}>Cancel</Button>
                        <Button onClick={handleSendPitch} disabled={isSendingPitch}>
                          {isSendingPitch ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                          Send Pitch
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                ) : (
                  <Button className="flex-1 md:flex-none h-12 px-8 gap-2 rounded-2xl text-base"><MessageSquare className="h-5 w-5" /> Message Founder</Button>
                )}
                
                <Button variant="outline" className="flex-1 md:flex-none h-12 px-8 gap-2 rounded-2xl text-base"><Calendar className="h-5 w-5" /> Schedule Meeting</Button>
                <div className="flex gap-2">
                  {founder.socialLinks?.linkedin && (
                    <Button variant="ghost" size="icon" className="h-12 w-12 rounded-2xl" asChild>
                      <a href={founder.socialLinks.linkedin} target="_blank" rel="noopener noreferrer"><Linkedin className="h-6 w-6" /></a>
                    </Button>
                  )}
                  {founder.socialLinks?.website && (
                    <Button variant="ghost" size="icon" className="h-12 w-12 rounded-2xl" asChild>
                      <a href={founder.socialLinks.website} target="_blank" rel="noopener noreferrer"><Globe className="h-6 w-6" /></a>
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                <div className="lg:col-span-2 space-y-12">
                  {founder.bio && (
                    <section>
                      <h3 className="text-2xl font-bold mb-4">About Me</h3>
                      <p className="text-muted-foreground text-lg leading-relaxed">{founder.bio}</p>
                    </section>
                  )}

                  {founder.whyBuilding && (
                    <section>
                      <h3 className="text-2xl font-bold mb-4">The Vision</h3>
                      <div className="bg-primary/5 p-8 rounded-3xl border border-primary/10 relative">
                        <span className="absolute -top-4 -left-2 text-6xl text-primary/20 font-serif">“</span>
                        <p className="text-primary text-xl font-medium italic leading-relaxed">
                          {founder.whyBuilding}
                        </p>
                      </div>
                    </section>
                  )}

                  {founder.experience && founder.experience.length > 0 && (
                    <section>
                      <h3 className="text-2xl font-bold mb-6 flex items-center gap-3">
                        <Briefcase className="h-6 w-6 text-primary" /> Professional Experience
                      </h3>
                      <div className="space-y-8">
                        {founder.experience.map((exp: any, i: number) => (
                          <div key={i} className="flex gap-6 relative">
                            {i !== founder.experience.length - 1 && (
                              <div className="absolute left-6 top-14 bottom-0 w-0.5 bg-muted-foreground/10" />
                            )}
                            <div className="mt-1 bg-white border shadow-sm rounded-2xl p-3 h-fit z-10">
                              <Briefcase className="h-6 w-6 text-primary" />
                            </div>
                            <div className="space-y-2">
                              <h4 className="text-xl font-bold">{exp.role}</h4>
                              <p className="text-lg font-semibold text-primary">{exp.company}</p>
                              <p className="text-sm text-muted-foreground bg-muted w-fit px-2 py-0.5 rounded-lg">{exp.duration}</p>
                              <p className="text-muted-foreground leading-relaxed mt-2">{exp.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </div>

                <div className="space-y-10">
                  <section className="bg-muted/30 p-6 rounded-3xl border border-muted-foreground/5">
                    <h3 className="text-xl font-bold mb-4 flex items-center gap-2">Expertise</h3>
                    <div className="flex flex-wrap gap-2">
                      {founder.skills?.map((skill: string) => (
                        <Badge key={skill} variant="outline" className="text-xs px-3 py-1 rounded-xl bg-background border-primary/20 text-primary">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </section>

                  <section className="bg-white p-6 rounded-3xl border shadow-sm">
                    <h3 className="text-xl font-bold mb-4 flex items-center gap-2">Status & Goals</h3>
                    <div className="space-y-3">
                      {founder.availability?.openToInvestment && (
                        <div className="flex items-center gap-2 text-green-700 bg-green-50 p-3 rounded-2xl border border-green-100">
                          <CheckCircle2 className="h-5 w-5 shrink-0" />
                          <span className="text-sm font-semibold">Open to Investment</span>
                        </div>
                      )}
                      {founder.availability?.hiring && (
                        <div className="flex items-center gap-2 text-blue-700 bg-blue-50 p-3 rounded-2xl border border-blue-100">
                          <CheckCircle2 className="h-5 w-5 shrink-0" />
                          <span className="text-sm font-semibold">Currently Hiring</span>
                        </div>
                      )}
                      {founder.availability?.coFounder && (
                        <div className="flex items-center gap-2 text-orange-700 bg-orange-50 p-3 rounded-2xl border border-orange-100">
                          <CheckCircle2 className="h-5 w-5 shrink-0" />
                          <span className="text-sm font-semibold">Looking for Co-founder</span>
                        </div>
                      )}
                      {founder.lookingFor && (
                        <div className="mt-4 pt-4 border-t space-y-2">
                          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Currently seeking</p>
                          <p className="text-sm font-medium leading-relaxed italic">"{founder.lookingFor}"</p>
                        </div>
                      )}
                    </div>
                  </section>

                  {founder.achievements && founder.achievements.length > 0 && (
                    <section>
                      <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <Award className="h-5 w-5 text-primary" /> Key Achievements
                      </h3>
                      <div className="space-y-3">
                        {founder.achievements.map((ach: string, i: number) => (
                          <div key={i} className="flex items-start gap-3 p-3 bg-muted/20 rounded-2xl border border-transparent hover:border-primary/10 transition-colors">
                            <CheckCircle2 className="h-5 w-5 mt-0.5 text-primary shrink-0" />
                            <span className="text-sm font-medium">{ach}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {founder.education && founder.education.length > 0 && (
                    <section>
                      <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <GraduationCap className="h-6 w-6 text-primary" /> Education
                      </h3>
                      <div className="space-y-4">
                        {founder.education.map((edu: any, i: number) => (
                          <div key={i} className="space-y-1 pl-4 border-l-2 border-primary/20">
                            <p className="font-bold">{edu.school}</p>
                            <p className="text-sm text-muted-foreground">{edu.degree}</p>
                            <p className="text-xs font-semibold text-primary">{edu.year}</p>
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