
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';

export default function ProfilePage() {
  const { toast } = useToast();
  const { user } = useUser();
  const firestore = useFirestore();

  const userRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);

  const { data: profile, isLoading } = useDoc(userRef);

  const [formData, setFormData] = useState({
    fullName: '',
    headline: '',
    location: '',
    stage: '',
    skills: '',
    lookingFor: '',
  });

  useEffect(() => {
    if (profile) {
      setFormData({
        fullName: profile.fullName || '',
        headline: profile.headline || '',
        location: profile.location || '',
        stage: profile.stage || '',
        skills: Array.isArray(profile.skills) ? profile.skills.join(', ') : '',
        lookingFor: profile.lookingFor || '',
      });
    }
  }, [profile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firestore) return;

    try {
      const skillsArray = formData.skills.split(',').map(s => s.trim()).filter(s => s !== '');
      
      await setDoc(doc(firestore, 'users', user.uid), {
        ...formData,
        skills: skillsArray,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      toast({
        title: "Success",
        description: "Profile updated successfully.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update profile.",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto w-full space-y-6">
      <h1 className="text-3xl font-bold">Edit Profile</h1>
      
      <Card>
        <form onSubmit={handleSave}>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>Tell the community about yourself.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input 
                id="name" 
                value={formData.fullName} 
                onChange={e => setFormData({...formData, fullName: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="headline">Headline</Label>
              <Input 
                id="headline" 
                value={formData.headline}
                onChange={e => setFormData({...formData, headline: e.target.value})}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input 
                  id="location" 
                  value={formData.location}
                  onChange={e => setFormData({...formData, location: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stage">Current Stage</Label>
                <Select value={formData.stage} onValueChange={v => setFormData({...formData, stage: v})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select stage" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Idea">Idea</SelectItem>
                    <SelectItem value="Early">Early</SelectItem>
                    <SelectItem value="Growth">Growth</SelectItem>
                    <SelectItem value="Scaling">Scaling</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="skills">Skills (comma-separated)</Label>
              <Input 
                id="skills" 
                value={formData.skills}
                onChange={e => setFormData({...formData, skills: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lookingFor">What are you looking for?</Label>
              <Textarea 
                id="lookingFor" 
                rows={4} 
                value={formData.lookingFor}
                onChange={e => setFormData({...formData, lookingFor: e.target.value})}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit">Save Profile</Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
