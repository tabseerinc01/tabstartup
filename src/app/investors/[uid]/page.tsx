
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
import { Loader2, ArrowLeft, ArrowRight, MapPin, Globe, Briefcase, TrendingUp, Linkedin, CheckCircle2, Mail, Target, Zap, Users, Rocket, Send, Clock, Check } from 'lucide-react';
import Link from 'next/link';
import { createNotification } from '@/lib/notifications';

export default function InvestorPublicProfilePage() {
  const params = useParams();
  const router = useRouter();
  const firestore = useFirestore();
  const { user: currentUser } = useUser();
  const { toast } = useToast();
  const uid = params?.uid as string;

  const [investor, setInvestor] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [existingConnection, setExistingConnection] = useState<any>(null);
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  const [interestMessage, setInterestMessage] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

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
        console.error("Error loading investor profile:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [firestore, uid, currentUser?.uid]);

  const handleSendRequest = async () => {
    if (!currentUser || !firestore || !uid) {
      toast({ title: "Login Required", variant: "destructive" });
      router.push('/login');
      return;
    }

    setIsSendingRequest(true);
    const connData = {
      initiatorUid: currentUser.uid,
      recipientUid: uid,
      type: 'investor',
      status: 'pending',
      message: interestMessage || "I'd like to pitch my venture for potential investment.",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    try {
      await addDoc(collection(firestore, 'connections'), connData);

      createNotification(firestore, {
        recipientUid: uid,
        actorUid: currentUser.uid,
        type: 'investor_interest',
        title: 'New Venture Pitch',
        message: `${currentUser.displayName || 'A founder'} sent you a connection request.`,
        targetId: uid,
        targetType: 'user'
      });

      toast({ title: "Request Sent", description: "The investor has been notified." });
      setExistingConnection(connData);
      setIsDialogOpen(false);
    } catch (e) {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: 'connections',
        operation: 'create',
        requestResourceData: connData
      }));
    } finally {
      setIsSendingRequest(false);
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
        <div className="max-w-4xl mx-auto space-y-8">
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
                    {existingConnection ? (
                      <Button disabled className="h-12 px-8 gap-2 rounded-2xl text-base bg-muted text-muted-foreground">
                        {existingConnection.status === 'pending' ? <Clock className="h-5 w-5" /> : <Check className="h-5 w-5" />}
                        Connection {existingConnection.status}
                      </Button>
                    ) : (
                      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                          <Button className="h-12 px-8 rounded-2xl text-base gap-2 font-bold shadow-xl">
                            <Zap className="h-5 w-5" /> Pitch Venture
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Pitch to {displayName}</DialogTitle>
                            <DialogDescription>Briefly introduce your venture and why it matches this investor's focus.</DialogDescription>
                          </DialogHeader>
                          <Textarea 
                            placeholder="Introduce your startup..." 
                            className="min-h-[150px] rounded-xl"
                            value={interestMessage}
                            onChange={(e) => setInterestMessage(e.target.value)}
                          />
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                            <Button onClick={handleSendRequest} disabled={isSendingRequest}>
                              {isSendingRequest ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                              Send Pitch
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    )}
                  </>
                )}
                <Button variant="outline" className="h-12 px-8 rounded-2xl text-base" onClick={() => router.push(`/dashboard/messages?startWith=${uid}`)}>
                  <Mail className="h-4 w-4" /> Message
                </Button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 pt-4">
                <div className="lg:col-span-2 space-y-12">
                  {bio && (
                    <section>
                      <h3 className="text-2xl font-bold mb-4 flex items-center gap-2">
                        <TrendingUp className="h-6 w-6 text-primary" /> Investment Philosophy
                      </h3>
                      <div className="bg-primary/5 p-8 rounded-3xl border border-primary/10 relative">
                        <p className="text-primary text-lg font-medium italic leading-relaxed">{bio}</p>
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
