'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore } from '@/firebase';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { Loader2, HandCoins, FileText, PieChart, TrendingUp, Link as LinkIcon } from 'lucide-react';

export default function FundraisingPage() {
  const { toast } = useToast();
  const { user } = useUser();
  const firestore = useFirestore();

  const [isLoading, setIsLoading] = useState(true);
  const [startup, setStartup] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    fundingNeed: '',
    equityOffered: '',
    pitchDeckUrl: '',
    fundraisingStatus: 'Open',
  });

  useEffect(() => {
    async function loadStartup() {
      if (!firestore || !user?.uid) return;
      setIsLoading(true);
      try {
        const snap = await getDoc(doc(firestore, 'startups', user.uid));
        if (snap.exists()) {
          const data = snap.data();
          setStartup(data);
          setFormData({
            fundingNeed: data.fundingNeed || '',
            equityOffered: data.equityOffered || '',
            pitchDeckUrl: data.pitchDeckUrl || '',
            fundraisingStatus: data.fundraisingStatus || 'Open',
          });
        }
      } catch (error) {
        console.error("Error loading fundraising startup:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadStartup();
  }, [firestore, user?.uid]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firestore) return;

    setIsSaving(true);
    try {
      await setDoc(doc(firestore, 'startups', user.uid), {
        ...formData,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      toast({
        title: "Fundraising Info Updated",
        description: "Your investment details have been saved.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save fundraising data.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!startup) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <HandCoins className="h-16 w-16 text-muted-foreground opacity-20" />
        <h2 className="text-xl font-semibold">Startup Profile Required</h2>
        <p className="text-muted-foreground">Please create your startup profile first.</p>
        <Button asChild><a href="/dashboard/startup">Create Startup Listing</a></Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto w-full space-y-8">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <HandCoins className="h-8 w-8 text-primary" /> Fundraising Dashboard
        </h1>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Target</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{formData.fundingNeed || '$0'}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Equity</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{formData.equityOffered || '0%'}</div></CardContent>
        </Card>
      </div>

      <Card>
        <form onSubmit={handleSave}>
          <CardHeader>
            <CardTitle>Investment Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="fundingNeed">Target Amount ($)</Label>
                <Input value={formData.fundingNeed} onChange={e => setFormData({...formData, fundingNeed: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="equity">Equity (%)</Label>
                <Input value={formData.equityOffered} onChange={e => setFormData({...formData, equityOffered: e.target.value})} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pitchDeck">Pitch Deck Link</Label>
              <Input value={formData.pitchDeckUrl} onChange={e => setFormData({...formData, pitchDeckUrl: e.target.value})} />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Details
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}