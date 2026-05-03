'use client';

import { useState, useEffect } from 'react';
import { collection, query, getDocs, addDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
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
  MessageSquare
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

export default function ServicesPage() {
  const [services, setServices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);
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
      setServices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error("Error loading services:", error);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadServices();
  }, [firestore]);

  const handleSeedData = async () => {
    if (!firestore) return;
    setIsSeeding(true);
    try {
      const initialServices = [
        {
          title: "Company Registration",
          description: "Get your startup legally registered in Bangladesh or internationally with ease. We handle the paperwork so you can focus on building.",
          category: "Legal",
          price: "$200",
          providerName: "App Prototyper",
          providerUid: "assistant-prototyper-uid",
          createdAt: serverTimestamp(),
        },
        {
          title: "Pitch Deck Design",
          description: "Stunning, data-driven pitch decks designed to capture investor attention and secure your next round of funding.",
          category: "Design",
          price: "$150",
          providerName: "App Prototyper",
          providerUid: "assistant-prototyper-uid",
          createdAt: serverTimestamp(),
        },
        {
          title: "Profile Optimization",
          description: "Expert audit of your TabStartup profile. We help you showcase your vision to attract top-tier mentors and investors.",
          category: "Consulting",
          price: "$50",
          providerName: "App Prototyper",
          providerUid: "assistant-prototyper-uid",
          createdAt: serverTimestamp(),
        },
        {
          title: "Marketing & Growth",
          description: "Customized growth marketing strategies for early-stage ventures. Launch your MVP and reach your first 1,000 users.",
          category: "Marketing",
          price: "$300",
          providerName: "App Prototyper",
          providerUid: "assistant-prototyper-uid",
          createdAt: serverTimestamp(),
        },
        {
          title: "Legal & Compliance",
          description: "Ongoing compliance support, tax registration, and annual filings for startups operating in emerging markets.",
          category: "Legal",
          price: "$100",
          providerName: "App Prototyper",
          providerUid: "assistant-prototyper-uid",
          createdAt: serverTimestamp(),
        }
      ];

      for (const service of initialServices) {
        await addDoc(collection(firestore, 'services'), service);
      }

      toast({ title: "Success", description: "Initial services have been seeded." });
      loadServices();
    } catch (error) {
      console.error("Error seeding services:", error);
      toast({ title: "Error", description: "Failed to seed initial data.", variant: "destructive" });
    } finally {
      setIsSeeding(false);
    }
  };

  const handleContact = (providerUid: string) => {
    if (!user) {
      toast({ title: "Login Required", description: "Please sign in to contact providers." });
      router.push('/login');
      return;
    }
    router.push(`/dashboard/messages?startWith=${providerUid}`);
  };

  const getIcon = (category: string) => {
    switch (category) {
      case 'Legal': return <Scale className="h-6 w-6" />;
      case 'Design': return <FileText className="h-6 w-6" />;
      case 'Marketing': return <TrendingUp className="h-6 w-6" />;
      default: return <Briefcase className="h-6 w-6" />;
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
            <p className="text-muted-foreground text-lg max-w-2xl">
              Professional services for the TabStartup ecosystem. Find expert support to scale your venture faster.
            </p>
          </div>

          {services.length === 0 && !isLoading && (
            <Button onClick={handleSeedData} disabled={isSeeding} variant="outline" className="gap-2 rounded-xl">
              {isSeeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseZap className="h-4 w-4" />}
              Seed Initial Services
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="flex py-24 items-center justify-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          </div>
        ) : services.length === 0 ? (
          <div className="text-center py-32 border-2 border-dashed rounded-[3rem] bg-background/50 flex flex-col items-center">
             <Wrench className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
             <h3 className="text-xl font-bold">No services available yet</h3>
             <p className="text-muted-foreground mb-6">Be the first to offer a service to our community!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {services.map((service) => (
              <Card key={service.id} className="flex flex-col h-full hover:shadow-2xl transition-all border-none bg-background shadow-xl rounded-[2.5rem] overflow-hidden group">
                <CardHeader className="pb-4 pt-8 px-8">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-primary/10 rounded-2xl text-primary">
                      {getIcon(service.category)}
                    </div>
                    <Badge variant="secondary" className="rounded-full px-3 py-1 font-bold text-[10px] tracking-widest uppercase bg-primary/5 text-primary border-none">
                      {service.category}
                    </Badge>
                  </div>
                  <CardTitle className="text-2xl group-hover:text-primary transition-colors">{service.title}</CardTitle>
                  <CardDescription className="text-muted-foreground leading-relaxed line-clamp-3 h-[72px]">
                    {service.description}
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="flex-1 px-8 pb-4">
                  <div className="p-5 rounded-2xl bg-muted/30 border border-muted-foreground/5 space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Service Fee</span>
                      <span className="text-xl font-extrabold text-primary">{service.price}</span>
                    </div>
                    <div className="pt-4 border-t border-muted-foreground/10 flex items-center gap-2">
                       <CheckCircle2 className="h-4 w-4 text-green-500" />
                       <span className="text-xs font-medium text-slate-700">By {service.providerName}</span>
                    </div>
                  </div>
                </CardContent>

                <CardFooter className="px-8 pb-8 pt-4">
                   <Button 
                    className="w-full h-12 rounded-2xl gap-2 font-bold group-hover:scale-105 transition-transform"
                    onClick={() => handleContact(service.providerUid)}
                   >
                     <MessageSquare className="h-4 w-4" /> Contact Provider
                   </Button>
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
