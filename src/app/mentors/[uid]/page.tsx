
'use client';

import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, collection, addDoc, serverTimestamp, query, where, getDocs, limit } from 'firebase/firestore';
import { useState, useEffect } from 'react';
import { useFirestore, useUser, errorEmitter, FirestorePermissionError } from '@/firebase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PublicHeader } from '@/components/public/header';
import { PublicFooter } from '@/components/public/footer';
import { Loader2, ArrowLeft, MapPin, Briefcase, Linkedin, CheckCircle2, Target, MessageSquare, Award, Zap, Rocket, Clock, Check, AlertCircle, ShieldCheck, Globe, Lock } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { createNotification } from '@/lib/notifications';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { calculateProfileStrength, calculateTrustScore } from '@/lib/profile-utils';
import { cn } from '@/lib/utils';

const BASIC_PLAN_CONN_LIMIT = 5;

export default function MentorPublicProfilePage() {
  const params = useParams();
  const router = useRouter();
  const firestore = useFirestore();
  const { user: currentUser } = useUser();
  const { toast } = useToast();
  const uid = params?.uid as string;

  const [mentor, setMentor] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [existingConnection, setExistingConnection] = useState<any>(null);
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  const [userPlan, setUserPlan] = useState('basic');
  const [sentConnectionsCount, setSentConnectionsCount] = useState(0);

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
          const [userSnap, connectionsSnap] = await Promise.all([
            getDoc(doc(firestore, 'users', currentUser.uid)),
            getDocs(query(collection(firestore, 'connections'), where('initiatorUid', '==', currentUser.uid)))
          ]);
          
          if (userSnap.exists()) setUserPlan(userSnap.data().plan || 'basic');
          setSentConnectionsCount(connectionsSnap.size);

          const connQ = query(
            collection(firestore, 'connections'),
            where('initiatorUid', '==', currentUser.uid),
            where('recipientUid', '==', uid),
            limit(1)
          );
          const connSnap = await getDocs(connQ);
          if (!connSnap.empty) {
            setExistingConnection(connSnap.docs[0].data());
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

  const isLimitReached = userPlan === 'basic' && sentConnectionsCount >= BASIC_PLAN_CONN_LIMIT;

  async function handleConnect() {
    if (!firestore || !currentUser?.uid || !uid) return;
    if (isLimitReached) return;
    
    setIsSendingRequest(true);
    const connData = {
      initiatorUid: currentUser.uid,
      recipientUid: uid,
      type: 'mentor',
      status: 'pending',
      message: "I'm looking for mentorship.",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    try {
      await addDoc(collection(firestore, 'connections'), connData);
      createNotification(firestore, {
        recipientUid: uid,
        actorUid: currentUser.uid,
        type: 'connection',
        title: 'Mentorship Request',
        message: 'A founder requested mentorship.',
        targetId: uid,
        targetType: 'user'
      });
      toast({ title: "Request Sent" });
      setExistingConnection(connData);
    } catch (e) {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: 'connections',
        operation: 'create',
        requestResourceData: connData
      }));
    } finally {
      setIsSendingRequest(false);
    }
  }

  if (isLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;

  const name = mentor?.fullName || 'Mentor';
  const isOwnProfile = currentUser?.uid === uid;
  
  const strength = calculateProfileStrength(mentor);
  const trustScore = calculateTrustScore(mentor);
  const hasLinkedIn = !!(mentor?.linkedinUrl || mentor?.socialLinks?.linkedin);
  const hasWebsite = !!(mentor?.website || mentor?.socialLinks?.website);
  const isMentorVerified = !!mentor?.mentorBio;

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
                     <Image src={mentor.coverImageUrl} alt="Cover" fill className="object-cover" />
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
                        {mentor?.isVerified && <CheckCircle2 className="h-8 w-8 text-primary fill-primary/10" />}
                      </div>
                      <p className="text-xl text-primary font-semibold">{mentor?.headline || "Industry Expert"}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4 mb-12">
                    {!isOwnProfile && (
                      <>
                        {existingConnection ? (
                          <Button disabled className="h-14 px-8 rounded-2xl text-base bg-muted text-muted-foreground">
                            {existingConnection.status === 'pending' ? <Clock className="h-5 w-5" /> : <Check className="h-5 w-5" />}
                            Mentorship {existingConnection.status}
                          </Button>
                        ) : (
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button className="h-14 px-10 rounded-2xl text-base gap-2 font-bold shadow-xl">
                                <Zap className="h-5 w-5" /> Request Mentorship
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="rounded-[2rem]">
                              <div className="py-8 text-center space-y-6">
                                 <h3 className="text-2xl font-black">Establish Connection</h3>
                                 <Button className="w-full" onClick={handleConnect} disabled={isSendingRequest}>Confirm Request</Button>
                              </div>
                            </DialogContent>
                          </Dialog>
                        )}
                      </>
                    )}
                    <Button 
                      variant="outline" 
                      className="h-14 px-8 rounded-2xl text-base font-bold" 
                      onClick={() => router.push(`/dashboard/messages?startWith=${uid}`)}
                    >
                      <MessageSquare className="h-5 w-5" /> Message
                    </Button>
                  </div>

                  <div className="space-y-6">
                    <h3 className="text-2xl font-black flex items-center gap-2">
                       <Award className="h-6 w-6 text-primary" /> Expert Overview
                    </h3>
                    <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100 text-lg text-slate-700 leading-relaxed italic">
                       "{mentor.mentorBio || mentor.bio || "Available to support early-stage founders with strategic guidance and operational expertise."}"
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            <div className="lg:col-span-4 space-y-6">
              <Card className="border-none shadow-xl rounded-[2rem] bg-slate-900 text-white p-8 space-y-6 relative overflow-hidden group">
                 <div className="relative z-10 space-y-4">
                    <div className="flex items-center justify-between">
                       <p className="text-[10px] font-black uppercase tracking-widest text-primary">Trust Status</p>
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

                       <div className={cn(
                         "flex items-center justify-between p-3 rounded-xl border transition-colors",
                         isMentorVerified ? "bg-emerald-50 border-emerald-100 text-emerald-700" : "bg-slate-50 border-slate-100 text-slate-400"
                       )}>
                          <div className="flex items-center gap-3 text-sm font-bold">
                             <Award className="h-4 w-4" /> Mentor Profile
                          </div>
                          {isMentorVerified ? <CheckCircle2 className="h-4 w-4" /> : <Lock className="h-4 w-4 opacity-30" />}
                       </div>
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
