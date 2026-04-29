'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Globe, MapPin, Tag, Loader2, Rocket, Share2 } from 'lucide-react';
import { useUser, useFirestore } from '@/firebase';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';

export default function StartupPage() {
  const { toast } = useToast();
  const { user } = useUser();
  const firestore = useFirestore();

  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [startupData, setStartupData] = useState<any>(null);

  const [startup, setStartup] = useState({
    name: '',
    shortDescription: '',
    industry: '',
    stage: 'Idea',
    fundingNeed: '',
    location: '',
    website: '',
    tags: '',
  });

  useEffect(() => {
    async function loadStartup() {
      if (!firestore || !user?.uid) return;
      setIsLoading(true);
      try {
        const snap = await getDoc(doc(firestore, 'startups', user.uid));
        if (snap.exists()) {
          const data = snap.data();
          setStartupData(data);
          setStartup({
            name: data.name || '',
            shortDescription: data.shortDescription || '',
            industry: data.industry || '',
            stage: data.stage || 'Idea',
            fundingNeed: data.fundingNeed || '',
            location: data.location || '',
            website: data.website || '',
            tags: Array.isArray(data.tags) ? data.tags.join(', ') : '',
          });
          setIsEditing(false);
        } else {
          setIsEditing(true);
        }
      } catch (error) {
        console.error("Error loading startup:", error);
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
      const tagsArray = startup.tags.split(',').map(t => t.trim()).filter(t => t !== '');
      
      const updateData = {
        ...startup,
        tags: tagsArray,
        ownerUid: user.uid,
        updatedAt: serverTimestamp(),
        ...(startupData ? {} : { createdAt: serverTimestamp() })
      };

      await setDoc(doc(firestore, 'startups', user.uid), updateData, { merge: true });

      toast({
        title: "Startup Saved",
        description: "Your startup profile has been updated.",
      });
      setIsEditing(false);
      setStartupData(updateData);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save startup data.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const copyListingLink = () => {
    const url = `${window.location.origin}/startups/${user?.uid}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link Copied",
      description: "Startup listing link copied to clipboard.",
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto w-full space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Startup Listing</h1>
        <div className="flex gap-2">
          {!isEditing && startupData && (
            <>
              <Button variant="outline" className="gap-2" onClick={copyListingLink}>
                <Share2 className="h-4 w-4" /> Share Listing
              </Button>
              <Button variant="outline" onClick={() => setIsEditing(true)}>
                Edit Listing
              </Button>
            </>
          )}
        </div>
      </div>
      
      {isEditing ? (
        <Card>
          <form onSubmit={handleSave}>
            <CardHeader>
              <CardTitle>{startupData ? 'Update Startup' : 'Register Your Startup'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Startup Name</Label>
                  <Input 
                    id="name" 
                    required 
                    value={startup.name}
                    onChange={e => setStartup({...startup, name: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="industry">Industry</Label>
                  <Input 
                    id="industry" 
                    value={startup.industry}
                    onChange={e => setStartup({...startup, industry: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Short Description</Label>
                <Textarea 
                  id="description" 
                  rows={3} 
                  value={startup.shortDescription}
                  onChange={e => setStartup({...startup, shortDescription: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="stage">Current Stage</Label>
                  <Select value={startup.stage} onValueChange={v => setStartup({...startup, stage: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Idea">Idea</SelectItem>
                      <SelectItem value="Seed">Seed</SelectItem>
                      <SelectItem value="Growth">Growth</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="funding">Funding Need ($)</Label>
                  <Input 
                    id="funding" 
                    value={startup.fundingNeed}
                    onChange={e => setStartup({...startup, fundingNeed: e.target.value})}
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save Listing
              </Button>
              {startupData && <Button variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button>}
            </CardFooter>
          </form>
        </Card>
      ) : (
        <Card className="border-primary/20 shadow-lg">
          <CardHeader>
            <div className="flex justify-between items-start">
              <CardTitle className="text-2xl">{startupData?.name}</CardTitle>
              <Badge>{startupData?.stage}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-lg">{startupData?.shortDescription}</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" /> {startupData?.location || 'Remote'}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Globe className="h-4 w-4" /> {startupData?.website || 'No website'}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}