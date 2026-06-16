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
import { Loader2, ArrowLeft, MapPin, Briefcase, Linkedin, CheckCircle2, Target, MessageSquare, Award, Zap, Rocket, Clock, Check } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { createNotification } from '@/lib/notifications';

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

  async function handleConnect() {
    if (!firestore || !currentUser?.uid || !uid) {
        toast({ title: "Login Required", variant: "destructive" });
        router.push('/login');
        return;
    }
    
    setIsSendingRequest(true);
    const connData = {
      initiatorUid: currentUser.uid,
      recipientUid: uid,
      type: 'mentor',
      status: 'pending',
      message: "I'm looking for mentorship and would love to connect.",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    try {
      await addDoc(collection(firestore, 'connections'), connData);

      createNotification(firestore, {
        recipientUid: uid,
        actorUid: currentUser.uid,
        type: 'connection',
        title: 'New Mentorship Request',
        message: `${currentUser.displayName || 'A founder'} requested mentorship.`,
        targetId: uid,
        targetType: 'user'
      });

      toast({ title: "Request Sent", description: "The mentor will review your profile." });
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

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <PublicHeader />
      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto space-y-8">
          <Button variant="ghost" asChild className="mb-2 -ml-4">
            <Link href="/mentors" className="gap-2"><ArrowLeft className="h-4 w-4" /> Back to Directory</Link>
          </Button>

          <Card className="overflow-hidden border-none shadow-2xl rounded-[3rem] bg-background">
            <div className="h-48 bg-gradient-to-r from-primary/30 via-slate-200 to-primary/20" />
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
                      <Button className="h-14 px-10 rounded-2xl text-base gap-2 font-bold shadow-xl" onClick={handleConnect} disabled={isSendingRequest}>
                        {isSendingRequest ? <Loader2 className="h-5 w-5 animate-spin" /> : <Zap className="h-5 w-5" />}
                        Request Mentorship
                      </Button>
                    )}
                  </>
                )}
                <Button 
                  variant="outline" 
                  className="h-14 px-8 rounded-2xl text-base" 
                  onClick={() => router.push(`/dashboard/messages?startWith=${uid}`)}
                >
                  <MessageSquare className="h-5 w-5" /> Message
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
