
'use client';

import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, collection, addDoc, query, where, getDocs, limit, serverTimestamp } from 'firebase/firestore';
import { useState, useEffect } from 'react';
import { useFirestore, useUser, errorEmitter, FirestorePermissionError } from '@/firebase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PublicHeader } from '@/components/public/header';
import { PublicFooter } from '@/components/public/footer';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, ArrowLeft, TrendingUp, Linkedin, CheckCircle2, Mail, Zap, Send, Clock, Check, Globe, AlertCircle, ShieldCheck, Lock } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { createNotification } from '@/lib/notifications';
import { Progress } from '@/components/ui/progress';
import { calculateProfileStrength, calculateTrustScore } from '@/lib/profile-utils';
import { cn } from '@/lib/utils';

const BASE_PITCH_LIMIT = 2;

export default function InvestorPublicProfilePage() {
  const params = useParams();
  const router = useRouter();
  const firestore = useFirestore();
  const { user: currentUser } = useUser();
  const { toast } = useToast();
  const uid = params?.uid as string;

  const [investor, setInvestor] = useState<any>(null);
  const [startup, setStartup] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [existingPitch, setExistingPitch] = useState<any>(null);
  const [isSendingPitch, setIsSendingPitch] = useState(false);
  const [pitchMessage, setPitchMessage] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  const [userPlan, setUserPlan] = useState('basic');
  const [sentPitchesCount, setSentPitchesCount] = useState(0);
  const [bonusPitches, setBonusPitches] = useState(0);

  useEffect(() => {
    async function loadData() {
      if (!firestore || !uid) return;
      setIsLoading(true);
      try {
        const snap = await getDoc(doc(firestore, 'users', uid));
        if (snap.exists()) {
          setInvestor({ id: snap.id, ...snap.data() });
        }

        if (currentUser?.uid) {
          const [startupSnap, userSnap, pitchesSnap] = await Promise.all([
            getDoc(doc(firestore, 'startups', currentUser.uid)),
            getDoc(doc(firestore, 'users', currentUser.uid)),
            getDocs(query(collection(firestore, 'venturePitches'), where('senderUid', '==', currentUser.uid)))
          ]);
          
          if (startupSnap.exists()) setStartup(startupSnap.data());
          if (userSnap.exists()) {
            const uData = userSnap.data();
            setUserPlan(uData.plan || 'basic');
            setBonusPitches(uData.bonusLimits?.pitches || 0);
          }
          setSentPitchesCount(pitchesSnap.size);

          const existingPitchQ = query(
            collection(firestore, 'venturePitches'),
            where('senderUid', '==', currentUser.uid),
            where('recipientUid', '==', uid),
            limit(1)
          );
          const existingPitchSnap = await getDocs(existingPitchQ);
          if (!existingPitchSnap.empty) {
            setExistingPitch(existingPitchSnap.docs[0].data());
          }
        }
      } catch (error) {
        console.error("Error loading investor profile:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [firestore, uid, currentUser?.uid]);

  const effectiveLimit = userPlan === 'basic' ? (BASE_PITCH_LIMIT + bonusPitches) : Infinity;
  const isLimitReached = userPlan === 'basic' && sentPitchesCount >= effectiveLimit;

  const handleSendPitch = async () => {
    if (!currentUser || !firestore || !uid) {
      toast({ title: "Login Required", variant: "destructive" });
      router.push('/login');
      return;
    }

    if (isLimitReached) {
      toast({ title: "Limit Reached", variant: "destructive" });
      return;
    }

    setIsSendingPitch(true);
    const pitchData = {
      senderUid: currentUser.uid,
      senderName: currentUser.displayName || 'TabStartup Founder',
      recipientUid: uid,
      startupId: currentUser.uid,
      startupName: startup?.name || 'My Venture',
      pitchMessage: pitchMessage || "I'd like to pitch my venture for potential investment.",
      status: 'pending',
      createdAt: serverTimestamp(),
    };

    try {
      const docRef = await addDoc(collection(firestore, 'venturePitches'), pitchData);
      createNotification(firestore, {
        recipientUid: uid,
        actorUid: currentUser.uid,
        type: 'venture_pitch',
        title: '🚀 New Venture Pitch',
        message: `${pitchData.senderName} sent you a venture pitch.`,
        targetId: docRef.id,
        targetType: 'venture_pitch'
      });
      toast({ title: "Pitch Sent" });
      setExistingPitch(pitchData);
      setIsDialogOpen(false);
    } catch (e) {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: 'venturePitches',
        operation: 'create',
        requestResourceData: pitchData
      }));
    } finally {
      setIsSendingPitch(false);
    }
  };

  if (isLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;

  const displayName = investor?.fullName || 'Investor';
  const headline = investor?.investorHeadline || investor?.headline || "Active Investor";
  const bio = investor?.investorBio || investor?.bio;
  const isOwnProfile = currentUser?.uid === uid;

  const strength = calculateProfileStrength(investor);
  const trustScore = calculateTrustScore(investor);
  const hasLinkedIn = !!(investor?.linkedinUrl || investor?.socialLinks?.linkedin);
  const hasWebsite = !!(investor?.website || investor?.socialLinks?.website);
  const isInvestorVerified = !!investor?.investorBio;

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <PublicHeader />
      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto space-y-8">
          <Button variant="ghost" asChild className="mb-2 -ml-4">
            <Link href="/investors" className="gap-2"><ArrowLeft className="h-4 w-4" /> Back to Directory</Link>
          </Button>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8 space-y-8">
              <Card className="overflow-hidden border-none shadow-xl rounded-3xl bg-background">
                <div className="h-48 bg-muted relative">
                   {investor.coverImageUrl ? (
                     <Image src={investor.coverImageUrl} alt="Cover" fill className="object-cover" />
                   ) : (
                     <div className="h-full w-full bg-gradient-to-r from-accent/20 via-primary/20 to-accent/10" />
                   )}
                </div>
                <div className="px-6 md:px-12 pb-12 -mt-20">
                  <div className="flex flex-col md:flex-row gap-8 items-end mb-10">
                    <Avatar className="h-40 w-40 rounded-3xl border-8 border-background bg-muted shrink-0 shadow-2xl">
                      <AvatarImage src={investor?.imageUrl} className="object-cover" />
                      <AvatarFallback className="text-4xl font-bold">{displayName[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h1 className="text-4xl font-extrabold tracking-tight">{displayName}</h1>
                        {investor?.isVerified && <CheckCircle2 className="h-8 w-8 text-primary fill-primary/10" />}
                      </div>
                      <p className="text-xl text-primary font-semibold">{headline}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4 mb-12">
                    {!isOwnProfile && (
                      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                          <Button className="h-12 px-8 rounded-2xl text-base gap-2 font-bold shadow-xl">
                            <Zap className="h-5 w-5" /> Pitch Venture
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="rounded-[2rem] sm:max-w-[500px]">
                          {isLimitReached ? (
                             <div className="py-12 text-center space-y-6">
                                <Zap className="h-12 w-12 text-primary mx-auto" />
                                <h3 className="text-2xl font-black">Limit Reached</h3>
                                <Button className="rounded-xl" asChild><Link href="/dashboard/billing">Upgrade</Link></Button>
                             </div>
                          ) : (
                            <>
                              <DialogHeader>
                                <DialogTitle>Pitch to {displayName}</DialogTitle>
                                <DialogDescription>Share your mission and traction.</DialogDescription>
                              </DialogHeader>
                              <div className="py-4 space-y-4">
                                <Textarea 
                                  placeholder="Introduction..." 
                                  className="min-h-[150px] rounded-xl"
                                  value={pitchMessage}
                                  onChange={(e) => setPitchMessage(e.target.value)}
                                  disabled={!startup}
                                />
                              </div>
                              <DialogFooter>
                                <Button onClick={handleSendPitch} disabled={isSendingPitch || !startup}>Send Official Pitch</Button>
                              </DialogFooter>
                            </>
                          )}
                        </DialogContent>
                      </Dialog>
                    )}
                    <Button 
                      variant="outline" 
                      className="h-12 px-8 rounded-2xl text-base font-bold border-slate-200" 
                      onClick={() => router.push(`/dashboard/messages?startWith=${uid}`)}
                    >
                      <Mail className="h-4 w-4" /> Message
                    </Button>
                  </div>

                  {bio && (
                    <section>
                      <h3 className="text-2xl font-bold mb-4 flex items-center gap-2">
                        <TrendingUp className="h-6 w-6 text-primary" /> Investment Philosophy
                      </h3>
                      <div className="bg-primary/5 p-8 rounded-3xl border border-primary/10 relative">
                        <p className="text-primary text-lg font-medium italic leading-relaxed">"{bio}"</p>
                      </div>
                    </section>
                  )}
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

                       <div className={cn(
                         "flex items-center justify-between p-3 rounded-xl border transition-colors",
                         isInvestorVerified ? "bg-amber-50 border-amber-100 text-amber-700" : "bg-slate-50 border-slate-100 text-slate-400"
                       )}>
                          <div className="flex items-center gap-3 text-sm font-bold">
                             <ShieldCheck className="h-4 w-4" /> Investor Verified
                          </div>
                          {isInvestorVerified ? <CheckCircle2 className="h-4 w-4" /> : <Lock className="h-4 w-4 opacity-30" />}
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
