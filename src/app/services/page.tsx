
'use client';

import { useState, useEffect } from 'react';
import { collection, query, getDocs, addDoc, serverTimestamp, orderBy, where, limit } from 'firebase/firestore';
import { useFirestore, useUser, errorEmitter, FirestorePermissionError } from '@/firebase';
import { PublicHeader } from '@/components/public/header';
import { PublicFooter } from '@/components/public/footer';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Wrench, 
  Loader2, 
  Briefcase, 
  FileText, 
  Scale, 
  TrendingUp, 
  CheckCircle2, 
  ArrowRight,
  DatabaseZap,
  MessageSquare,
  Clock,
  Check
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { createNotification } from '@/lib/notifications';

export default function ServicesPage() {
  const [services, setServices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);
  const [existingConns, setExistingConns] = useState<Record<string, any>>({});
  const [isConnecting, setIsConnecting] = useState<string | null>(null);
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const router = useRouter();

  async function loadServices() {
    if (!firestore) return;
    setIsLoading(true);
    try {
      const q = query(collection(firestore, 'services'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setServices(list);

      if (user?.uid) {
        const connsQ = query(collection(firestore, 'connections'), where('initiatorUid', '==', user.uid), where('type', '==', 'service'));
        const connsSnap = await getDocs(connsQ);
        const map: any = {};
        connsSnap.docs.forEach(d => map[d.data().recipientUid] = d.data());
        setExistingConns(map);
      }
    } catch (error) {
      console.error("Error loading services:", error);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadServices();
  }, [firestore, user?.uid]);

  const handleContact = async (providerUid: string, serviceTitle: string) => {
    if (!user) {
      toast({ title: "Login Required", variant: "destructive" });
      router.push('/login');
      return;
    }

    if (user.uid === providerUid) return;

    setIsConnecting(providerUid);
    const connData = {
      initiatorUid: user.uid,
      recipientUid: providerUid,
      type: 'service',
      status: 'pending',
      message: `Interested in your service: ${serviceTitle}`,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    try {
      await addDoc(collection(firestore, 'connections'), connData);

      createNotification(firestore, {
        recipientUid: providerUid,
        actorUid: user.uid,
        type: 'connection',
        title: 'New Service Inquiry',
        message: `${user.displayName || 'A founder'} is interested in your service.`,
        targetId: providerUid,
        targetType: 'user'
      });

      toast({ title: "Inquiry Sent", description: "The provider has been notified." });
      setExistingConns(prev => ({ ...prev, [providerUid]: connData }));
    } catch (e) {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: 'connections',
        operation: 'create',
        requestResourceData: connData
      }));
    } finally {
      setIsConnecting(null);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <PublicHeader />
      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
          <div className="space-y-2">
            <h1 className="text-4xl font-extrabold tracking-tight flex items-center gap-3">
              <Wrench className="h-8 w-8 text-primary" /> Services Marketplace
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl">Expert support to scale your venture faster.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex py-24 items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {services.map((s) => (
              <Card key={s.id} className="flex flex-col h-full hover:shadow-xl transition-all border-none bg-background shadow-xl rounded-[2.5rem] overflow-hidden group">
                <CardHeader className="pb-4 pt-8 px-8">
                  <div className="flex items-center justify-between mb-4">
                    <Badge variant="secondary" className="rounded-full px-3 py-1 font-bold text-[10px] tracking-widest uppercase">{s.category}</Badge>
                    <span className="text-xl font-extrabold text-primary">{s.price}</span>
                  </div>
                  <CardTitle className="text-2xl group-hover:text-primary transition-colors">{s.title}</CardTitle>
                  <CardDescription className="line-clamp-3 h-[72px]">{s.description}</CardDescription>
                </CardHeader>
                <CardFooter className="px-8 pb-8 pt-4">
                   {existingConns[s.providerUid] ? (
                     <Button className="w-full h-12 rounded-2xl gap-2 bg-muted text-muted-foreground" disabled>
                        {existingConns[s.providerUid].status === 'pending' ? <Clock className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                        Inquiry {existingConns[s.providerUid].status}
                     </Button>
                   ) : (
                     <Button 
                      className="w-full h-12 rounded-2xl gap-2 font-bold"
                      onClick={() => handleContact(s.providerUid, s.title)}
                      disabled={isConnecting === s.providerUid}
                     >
                       {isConnecting === s.providerUid ? <Loader2 className="animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                       Contact Provider
                     </Button>
                   )}
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
