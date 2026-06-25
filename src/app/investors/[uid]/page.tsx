
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
import { Loader2, ArrowLeft, TrendingUp, Linkedin, CheckCircle2, Mail, Zap, Send, Clock, Check, Globe, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { createNotification } from '@/lib/notifications';

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
      toast({ 
        title: "Limit Reached", 
        description: `Your effective limit is ${effectiveLimit} venture pitches.`, 
        variant: "destructive" 
      });
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
        message: `${pitchData.senderName} sent you a venture pitch for ${pitchData.startupName}.`,
        targetId: docRef.id,
        targetType: 'venture_pitch'
      });

      toast({ title: "Pitch Sent", description: "The investor has been notified." });
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

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <PublicHeader />
      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="max-w-4xl auto space-y-8">
          <Button variant="ghost" asChild className="mb-2 -ml-4">
            <Link href="/investors" className="gap-2"><ArrowLeft className="h-4 w-4" /> Back to Directory</Link>
          </Button>

          <Card className="overflow-hidden border-none shadow-xl rounded-3xl bg-background">
            <div className="h-48 bg-gradient-to-r from-accent/20 via-primary/20 to-accent/10" />
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
                  <>
                    {existingPitch ? (
                      <Button disabled className="h-12 px-8 gap-2 rounded-2xl text-base bg-muted text-muted-foreground font-bold">
                        <Check className="h-5 w-5" /> Pitch {existingPitch.status}
                      </Button>
                    ) : (
                      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                          <Button className="h-12 px-8 rounded-2xl text-base gap-2 font-bold shadow-xl">
                            <Zap className="h-5 w-5" /> Pitch Venture
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="rounded-[2rem] sm:max-w-[500px]">
                          {isLimitReached ? (
                             <div className="py-12 text-center space-y-6">
                                <div className="p-4 bg-primary/10 rounded-full w-fit mx-auto">
                                  <Zap className="h-12 w-12 text-primary" />
                                </div>
                                <div className="space-y-2">
                                  <h3 className="text-2xl font-black text-slate-900">Pitch Limit Reached</h3>
                                  <p className="text-slate-500 font-medium px-4">
                                    Your current limit is {effectiveLimit} venture pitches. 
                                    Refer friends to earn bonus pitches or upgrade for high-volume tools.
                                  </p>
                                </div>
                                <Button className="rounded-xl h-12 px-8 font-bold" asChild>
                                  <Link href="/dashboard/billing">View Plans & Upgrade</Link>
                                </Button>
                             </div>
                          ) : (
                            <>
                              <DialogHeader>
                                <DialogTitle className="text-2xl font-black">Pitch to {displayName}</DialogTitle>
                                <DialogDescription>Briefly introduce your venture and why it matches this investor's focus.</DialogDescription>
                              </DialogHeader>
                              <div className="py-4 space-y-4">
                                <div className="p-4 bg-primary/5 rounded-xl border border-primary/10">
                                   <p className="text-xs font-bold text-primary uppercase tracking-widest mb-1">Pitching as:</p>
                                   <p className="font-bold text-slate-900">{startup?.name || "Register your startup first"}</p>
                                </div>
                                <Textarea 
                                  placeholder="Introduce your startup mission and traction..." 
                                  className="min-h-[150px] rounded-xl"
                                  value={pitchMessage}
                                  onChange={(e) => setPitchMessage(e.target.value)}
                                  disabled={!startup}
                                />
                                {!startup && (
                                  <p className="text-xs text-destructive font-bold">You need to list a startup in your dashboard before pitching.</p>
                                )}
                              </div>
                              <DialogFooter>
                                <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="rounded-xl">Cancel</Button>
                                <Button onClick={handleSendPitch} disabled={isSendingPitch || !startup} className="rounded-xl font-bold">
                                  {isSendingPitch ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                                  Send Official Pitch
                                </Button>
                              </DialogFooter>
                            </>
                          )}
                        </DialogContent>
                      </Dialog>
                    )}
                  </>
                )}
                <Button 
                  variant="outline" 
                  className="h-12 px-8 rounded-2xl text-base font-bold border-slate-200" 
                  onClick={() => router.push(`/dashboard/messages?startWith=${uid}`)}
                >
                  <Mail className="h-4 w-4" /> Message
                </Button>
                <div className="flex gap-2">
                  {investor?.socialLinks?.linkedin && (
                    <Button variant="ghost" size="icon" className="h-12 w-12 rounded-2xl" asChild>
                      <a href={investor.socialLinks.linkedin} target="_blank" rel="noopener noreferrer"><Linkedin className="h-6 w-6" /></a>
                    </Button>
                  )}
                  {investor?.socialLinks?.website && (
                    <Button variant="ghost" size="icon" className="h-12 w-12 rounded-2xl" asChild>
                      <a href={investor.socialLinks.website} target="_blank" rel="noopener noreferrer"><Globe className="h-6 w-6" /></a>
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 pt-4 border-t border-slate-50">
                <div className="lg:col-span-2 space-y-12">
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
                
                <div className="space-y-6">
                   <Card className="border-none shadow-sm rounded-3xl bg-slate-50 p-6">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4">Investment Metadata</p>
                      <div className="space-y-4">
                         <div className="space-y-1">
                            <p className="text-xs font-bold text-slate-500">Ticket Size</p>
                            <p className="font-black text-slate-900">{investor?.ticketSize || 'N/A'}</p>
                         </div>
                         <div className="space-y-1">
                            <p className="text-xs font-bold text-slate-500">Preferred Stage</p>
                            <div className="flex flex-wrap gap-1">
                               {Array.isArray(investor?.preferredStage) ? investor.preferredStage.map((s: string) => (
                                 <Badge key={s} variant="outline" className="bg-white">{s}</Badge>
                               )) : <Badge variant="outline" className="bg-white">{investor?.preferredStage || 'Any'}</Badge>}
                            </div>
                         </div>
                      </div>
                   </Card>
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
