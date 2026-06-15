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
import { MapPin, Briefcase, Award, CheckCircle2, MessageSquare, Calendar, Globe, Linkedin, GraduationCap, ArrowLeft, Loader2, Send, Heart, Rocket, ExternalLink, Users, Zap } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { createNotification } from '@/lib/notifications';

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
          const userSnap = await getDoc(doc(firestore, 'users', user.uid));
          if (userSnap.exists()) {
            setCurrentUserProfile(userSnap.data());
          }

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

  const handleSendRequest = async (type: 'investor' | 'cofounder') => {
    if (!user || !firestore || !uid) {
      toast({ title: "Login Required", variant: "destructive" });
      router.push('/login');
      return;
    }
    
    if (user.uid === uid) return;

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

  const displayName = founder.fullName || founder.name;
  const imageId = founder.uid || founder.id || 'user';
  const rolesArr = (currentUserProfile?.roles || (currentUserProfile?.role ? [currentUserProfile.role] : ['user'])).filter(Boolean);
  const isInvestor = rolesArr.includes('investor');
  const isOwnProfile = user?.uid === uid;

  const profileImageUrl = founder.imageUrl || `https://picsum.photos/seed/${imageId}/400/400`;
  const startupIdentifier = startup?.slug || uid;

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <PublicHeader />
      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <Button variant="ghost" asChild className="mb-6 -ml-4">
            <Link href="/founders" className="gap-2"><ArrowLeft className="h-4 w-4" /> Back to Directory</Link>
          </Button>

          <Card className="overflow-hidden border-none shadow-xl rounded-3xl bg-background">
            <div className="h-48 bg-gradient-to-r from-primary/20 via-accent/20 to-primary/10" />
            <div className="px-6 md:px-12 pb-12 -mt-20">
              <div className="flex flex-col md:flex-row gap-8 items-end mb-10">
                <div className="relative h-40 w-40 rounded-3xl overflow-hidden border-8 border-background bg-muted shrink-0 shadow-2xl">
                  <Image src={profileImageUrl} alt={displayName} fill className="object-cover" />
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
                {isInvestor && !isOwnProfile && (
                  <>
                    {existingConnection && existingConnection.type === 'investor' ? (
                      <Button disabled className="h-12 px-8 gap-2 rounded-2xl text-base bg-muted text-muted-foreground">
                        {existingConnection.status === 'pending' ? <Clock className="h-5 w-5" /> : <Check className="h-5 w-5" />}
                        Interest {existingConnection.status}
                      </Button>
                    ) : (
                      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                          <Button className="flex-1 md:flex-none h-12 px-8 gap-2 rounded-2xl text-base bg-primary hover:bg-primary/90">
                            <Heart className="h-5 w-5" /> Express Interest
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-md">
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
                        </DialogContent>
                      </Dialog>
                    )}
                  </>
                )}
                
                {isOwnProfile ? (
                  <Button variant="outline" className="flex-1 md:flex-none h-12 px-8 gap-2 rounded-2xl text-base" asChild>
                    <Link href="/dashboard/profile">Edit My Profile</Link>
                  </Button>
                ) : (
                  <Button variant="outline" className="flex-1 md:flex-none h-12 px-8 gap-2 rounded-2xl text-base" onClick={() => router.push(`/dashboard/messages?startWith=${uid}`)}>
                    <MessageSquare className="h-5 w-5" /> Message Founder
                  </Button>
                )}

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

                  <section>
                    <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                      <Rocket className="h-6 w-6 text-primary" /> Startup
                    </h2>
                    {startup ? (
                      <div className="border border-primary/10 rounded-[2rem] p-8 space-y-4 bg-primary/5">
                        <Link href={`/startups/${startupIdentifier}`} className="text-2xl font-bold text-primary hover:underline">{startup.name}</Link>
                        <p className="text-muted-foreground text-lg leading-relaxed">{startup.shortDescription}</p>
                        <div className="flex gap-3 flex-wrap">
                          <Badge variant="secondary" className="px-4 py-1.5 rounded-xl">{startup.stage}</Badge>
                          <Badge variant="secondary" className="px-4 py-1.5 rounded-xl">{startup.industry}</Badge>
                          <Badge variant="outline" className="px-4 py-1.5 rounded-xl bg-primary text-primary-foreground border-none">{startup.fundingNeed || 'Goal TBD'}</Badge>
                        </div>
                      </div>
                    ) : (
                      <div className="p-8 border-2 border-dashed rounded-[2rem] text-center bg-muted/20">
                        <p className="text-muted-foreground italic">No startup published yet</p>
                      </div>
                    )}
                  </section>
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
