
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Loader2, HandCoins, FileText, PieChart, TrendingUp, Link as LinkIcon } from 'lucide-react';

export default function FundraisingPage() {
  const { toast } = useToast();
  const { user } = useUser();
  const firestore = useFirestore();

  const startupRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'startups', user.uid);
  }, [firestore, user]);

  const { data: startup, isLoading } = useDoc(startupRef);
  
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    fundingNeed: '',
    equityOffered: '',
    pitchDeckUrl: '',
    fundraisingStatus: 'Open',
  });

  useEffect(() => {
    if (startup) {
      setFormData({
        fundingNeed: startup.fundingNeed || '',
        equityOffered: startup.equityOffered || '',
        pitchDeckUrl: startup.pitchDeckUrl || '',
        fundraisingStatus: startup.fundraisingStatus || 'Open',
      });
    }
  }, [startup]);

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
        <p className="text-muted-foreground text-center max-w-xs">
          Please create your startup profile first before setting up fundraising details.
        </p>
        <Button asChild>
          <a href="/dashboard/startup">Create Startup Listing</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto w-full space-y-8">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <HandCoins className="h-8 w-8 text-primary" /> Fundraising Dashboard
        </h1>
        <p className="text-muted-foreground">Manage your investment round and pitch documents.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="border-primary/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> Target
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formData.fundingNeed || '$0'}</div>
          </CardContent>
        </Card>
        <Card className="border-primary/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <PieChart className="h-4 w-4 text-primary" /> Equity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formData.equityOffered || '0%'}</div>
          </CardContent>
        </Card>
        <Card className="border-primary/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" /> Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formData.fundraisingStatus}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <form onSubmit={handleSave}>
          <CardHeader>
            <CardTitle>Investment Details</CardTitle>
            <CardDescription>Update your funding requirements and pitch deck.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="fundingNeed">Target Funding Amount ($)</Label>
                <Input 
                  id="fundingNeed" 
                  placeholder="e.g. 500,000"
                  value={formData.fundingNeed}
                  onChange={e => setFormData({...formData, fundingNeed: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="equity">Equity Offered (%)</Label>
                <Input 
                  id="equity" 
                  placeholder="e.g. 10"
                  value={formData.equityOffered}
                  onChange={e => setFormData({...formData, equityOffered: e.target.value})}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pitchDeck" className="flex items-center gap-2">
                <LinkIcon className="h-4 w-4" /> Pitch Deck Link (URL)
              </Label>
              <Input 
                id="pitchDeck" 
                placeholder="https://google.drive.com/..."
                value={formData.pitchDeckUrl}
                onChange={e => setFormData({...formData, pitchDeckUrl: e.target.value})}
              />
              <p className="text-xs text-muted-foreground italic">Provide a shareable link to your PDF or Slides presentation.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Fundraising Status</Label>
              <Select value={formData.fundraisingStatus} onValueChange={v => setFormData({...formData, fundraisingStatus: v})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Open">Open (Active)</SelectItem>
                  <SelectItem value="Paused">Paused (Waitlist)</SelectItem>
                  <SelectItem value="Closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Fundraising Details
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
