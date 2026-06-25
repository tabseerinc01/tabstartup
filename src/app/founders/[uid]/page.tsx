
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useFirestore, useUser, errorEmitter, FirestorePermissionError } from '@/firebase';
import { doc, collection, addDoc, getDoc, getDocs, query, where, limit, serverTimestamp } from 'firebase/firestore';
import { PublicHeader } from '@/components/public/header';
import { PublicFooter } from '@/components/public/footer';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { 
  MapPin, 
  Briefcase, 
  CheckCircle2, 
  MessageSquare, 
  Globe, 
  Linkedin, 
  ArrowLeft, 
  Loader2, 
  Send, 
  Heart, 
  Rocket, 
  Users, 
  Zap, 
  Check, 
  Clock, 
  ShieldCheck, 
  User, 
  FileText,
  Lock,
  AlertCircle
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { createNotification } from '@/lib/notifications';
import { Progress } from '@/components/ui/progress';
import { calculateProfileStrength, calculateTrustScore } from '@/lib/profile-utils';

const BASE_CONN_LIMIT = 5;

export default function FounderPublicProfilePage() {
  const { uid } = useParams();
  const router = useRouter();
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  const [founder, setFounder] = useState<any>(null);
  const [startup, setStartup] = useState<any>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [existingConnection, setExistingConnection] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [interestMessage, setInterestMessage] = useState('');
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  const [sentConnectionsCount, setSentConnectionsCount] = useState(0);

  useEffect(() => {
    async function loadData() {
      if (!firestore || !uid) return;
      setIsLoading(true);
      try {
        const founderSnap = await getDoc(doc(firestore, 'users', uid as string));
        if (founderSnap.exists()) {
          setFounder({ id: founderSnap.id, ...founderSnap.data() });
        }

        const startupSnap = await getDoc(doc(firestore, 'startups', uid as string));
        if (startupSnap.exists()) {
          setStartup({ id: startupSnap.id, ...startupSnap.data() });
        }

        if (user?.uid) {
          const [userSnap, connectionsSnap] = await Promise.all([
            getDoc(doc(firestore, 'users', user.uid)),
            getDocs(query(collection(firestore, 'connections'), where('initiatorUid', '==', user.uid)))
          ]);
          
          if (userSnap.exists()) setCurrentUserProfile(userSnap.data());
          setSentConnectionsCount(connectionsSnap.size);

          const connQ = query(
            collection(firestore, 'connections'),
            where('initiatorUid', '==', user.uid),
            where('recipientUid', '==', uid as string),
            limit(1)
          );
          const connSnap = await getDocs(connQ);
          if (!connSnap.empty) {
            setExistingConnection(connSnap.docs[0].data());
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

  const userPlan = currentUserProfile?.plan || 'basic';
  const bonusConns = currentUserProfile?.bonusLimits?.connections || 0;
  const effectiveLimit = userPlan === 'basic' ? (BASE_CONN_LIMIT + bonusConns) : Infinity;
  const isLimitReached = userPlan === 'basic' && sentConnectionsCount >= effectiveLimit;

  const handleSendRequest = async (type: 'investor' | 'cofounder') => {
    if (!user || !firestore || !uid) {
      toast({ title: "Login Required", variant: "destructive" });
      router.push('/login');
      return;
    }
    
    if (user.uid === uid) return;

    if (isLimitReached) {
      toast({ 
        title: "Limit Reached", 
        description: `Your current monthly limit is ${effectiveLimit} connection requests.`, 
        variant: "destructive" 
      });
      return;
    }

    setIsSendingRequest(true);
    const connData = {
      initiatorUid: user.uid,
      recipientUid: uid,
      type: type,
      status: 'pending',
      message: interestMessage || (type === 'investor' ? "Interested in your startup venture." : "Interested in your co-founder search."),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    try {
      await addDoc(collection(firestore, 'connections'), connData);

      createNotification(firestore, {
        recipientUid: uid as string,
        actorUid: user.uid,
        type: type === 'investor' ? 'investor_interest' : 'cofounder_interest',
        title: type === 'investor' ? 'Investor Interest' : 'Co-founder Request',
        message: `${currentUserProfile?.fullName || 'Someone'} sent you a ${type} connection request.`,
        targetId: uid as string,
        targetType: 'user'
      });

      toast({ title: "Request Sent", description: "The founder has been notified." });
      setExistingConnection(connData);
      setInterestMessage('');
      setIsDialogOpen(false);
    } catch (error) {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: 'connections',
        operation: 'create',
        requestResourceData: connData
      }));
    } finally {
      setIsSendingRequest(false);
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

  const isOwnProfile = user?.uid === uid;
  const displayName = founder.fullName || founder.name;
  
  // New logic for strength and trust
  const strength = calculateProfileStrength(founder, startup);
  const trustScore = calculateTrustScore(founder, startup);

  // Verification Checks
  const hasLinkedIn = !!(founder.linkedinUrl || founder.socialLinks?.linkedin);
  const hasWebsite = !!(founder.website || founder.socialLinks?.website);
  const hasStartupVerified = !!startup?.startupVerified;

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <PublicHeader />
      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto">
          <Button variant="ghost" asChild className="mb-6 -ml-4">
            <Link href="/founders" className="gap-2"><ArrowLeft className="h-4 w-4" /> Back to Directory</Link>
          </Button>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8 space-y-8">
              <Card className="overflow-hidden border-none shadow-xl rounded-3xl bg-background">
                <div className="h-48 bg-muted relative">
                   {founder.coverImageUrl ? (
                     <Image src={founder.coverImageUrl} alt="Cover" fill className="object-cover" />
                   ) : (
                     <div className="h-full w-full bg-gradient-to-r from-primary/20 via-accent/20 to-primary/10" />
                   )}
                </div>
                <div className="px-6 md:px-12 pb-12 -mt-20">
                  <div className="flex flex-col md:flex-row gap-8 items-end mb-10">
                    <div className="relative h-40 w-40 rounded-3xl overflow-hidden border-8 border-background bg-muted shrink-0 shadow-2xl">
                      <Image src={founder.imageUrl || `https://picsum.photos/seed/${founder.id}/400/400`} alt={displayName} fill className="object-cover" />
                    </div>
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-2">
                        <h1 className="text-4xl font-extrabold tracking-tight">{displayName}</h1>
                        {founder.isVerified && <CheckCircle2 className="h-8 w-8 text-primary fill-primary/10" />}
                      </div>
                      <p className="text-xl text-primary font-semibold">{founder.headline}</p>
                      <div className="flex flex-wrap gap-6 text-sm text-muted-foreground font-medium">
                        <span className="flex items-center gap-1.5"><MapPin className="h-5 w-5 text-primary" /> {founder.location || 'Remote'}</span>
                        <span className="flex items-center gap-1.5"><Badge variant="secondary" className="px-3 py-1">{founder.stage} Stage</Badge></span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4 mb-12">
                    {!isOwnProfile && (
                      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                          <Button className="flex-1 md:flex-none h-12 px-8 gap-2 rounded-2xl text-base bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20">
                            <Heart className="h-5 w-5" /> Express Interest
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-md">
                          {isLimitReached ? (
                            <div className="py-8 text-center space-y-6">
                              <Zap className="h-12 w-12 text-primary mx-auto" />
                              <div className="space-y-2">
                                <h3 className="text-xl font-black">Connection Limit Reached</h3>
                                <p className="text-sm text-slate-500">Your effective limit is {effectiveLimit} monthly networking requests. Refer friends to expand.</p>
                              </div>
                              <Button className="rounded-xl" asChild><Link href="/dashboard/billing">View Plans</Link></Button>
                            </div>
                          ) : (
                            <>
                              <DialogHeader>
                                <DialogTitle>Connect with {displayName}</DialogTitle>
                                <DialogDescription>Share your vision and why you're interested in this founder.</DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4 py-4">
                                <Textarea 
                                  placeholder="Write a short message (optional)..."
                                  className="min-h-[150px] rounded-xl"
                                  value={interestMessage}
                                  onChange={(e) => setInterestMessage(e.target.value)}
                                />
                              </div>
                              <DialogFooter>
                                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                                <Button onClick={() => handleSendRequest('investor')} disabled={isSendingRequest}>
                                  {isSendingRequest ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                                  Send Request
                                </Button>
                              </DialogFooter>
                            </>
                          )}
                        </DialogContent>
                      </Dialog>
                    )}
                    
                    {isOwnProfile ? (
                      <Button variant="outline" className="flex-1 md:flex-none h-12 px-8 gap-2 rounded-2xl text-base font-bold" asChild>
                        <Link href="/dashboard/profile">Edit My Profile</Link>
                      </Button>
                    ) : (
                      <Button 
                        variant="outline" 
                        className="flex-1 md:flex-none h-12 px-8 gap-2 rounded-2xl text-base font-bold" 
                        onClick={() => router.push(`/dashboard/messages?startWith=${uid}`)}
                      >
                        <MessageSquare className="h-5 w-5" /> Message Founder
                      </Button>
                    )}
                  </div>

                  <div className="space-y-12">
                    {founder.bio && (
                      <section>
                         <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                          <User className="h-6 w-6 text-primary" /> About
                        </h2>
                        <div className="bg-slate-50/50 p-8 rounded-[2rem] border border-slate-100 leading-relaxed text-lg text-slate-700">
                          {founder.bio}
                        </div>
                      </section>
                    )}

                    {founder.lookingForCofounder && (
                      <section>
                        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                          <Users className="h-6 w-6 text-primary" /> Looking for Co-founder
                        </h2>
                        <Card className="border-primary/20 bg-primary/5 rounded-[2rem] overflow-hidden">
                          <CardContent className="p-8 space-y-6">
                            <div>
                              <p className="text-sm font-bold text-primary uppercase tracking-widest mb-1">Role Needed</p>
                              <p className="text-3xl font-extrabold">{founder.cofounderRole || 'Co-founder'}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-8 py-6 border-y border-primary/10">
                              <div>
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Equity Offered</p>
                                <p className="text-xl font-bold text-primary">{founder.equityOffer || 'TBD'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Commitment</p>
                                <p className="text-lg font-semibold">{founder.commitmentType || 'Flexible'}</p>
                              </div>
                            </div>
                            <Button 
                              className="w-full rounded-2xl h-12 font-bold" 
                              variant="secondary"
                              onClick={() => handleSendRequest('cofounder')}
                              disabled={isSendingRequest || (existingConnection?.type === 'cofounder')}
                            >
                                {existingConnection?.type === 'cofounder' ? 'Request Sent' : 'Connect as Co-founder'}
                            </Button>
                          </CardContent>
                        </Card>
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
                       <p className="text-[10px] font-black uppercase tracking-widest text-primary">Profile Strength</p>
                       <span className="text-2xl font-black">{strength}%</span>
                    </div>
                    <Progress value={strength} className="h-2 bg-white/10" />
                 </div>
                 <div className="relative z-10 pt-4 border-t border-white/5">
                    <div className="flex items-center justify-between">
                       <p className="text-[10px] font-black uppercase tracking-widest text-primary">Trust Score</p>
                       <span className="text-2xl font-black">{trustScore} / 100</span>
                    </div>
                 </div>
                 <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-16 -mt-16 group-hover:scale-110 transition-transform duration-700" />
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
                             <Globe className="h-4 w-4" /> Website Verified
                          </div>
                          {hasWebsite ? <CheckCircle2 className="h-4 w-4" /> : <Lock className="h-4 w-4 opacity-30" />}
                       </div>

                       <div className={cn(
                         "flex items-center justify-between p-3 rounded-xl border transition-colors",
                         hasStartupVerified ? "bg-amber-50 border-amber-100 text-amber-700" : "bg-slate-50 border-slate-100 text-slate-400"
                       )}>
                          <div className="flex items-center gap-3 text-sm font-bold">
                             <Rocket className="h-4 w-4" /> Startup Verified
                          </div>
                          {hasStartupVerified ? <CheckCircle2 className="h-4 w-4" /> : <Lock className="h-4 w-4 opacity-30" />}
                       </div>

                       <div className="flex items-center justify-between p-3 rounded-xl border bg-slate-50 border-slate-100 text-slate-300">
                          <div className="flex items-center gap-3 text-sm font-bold">
                             <ShieldCheck className="h-4 w-4" /> Official ID
                          </div>
                          <Badge variant="outline" className="text-[8px] font-black px-1.5 h-4 border-slate-200">SOON</Badge>
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
