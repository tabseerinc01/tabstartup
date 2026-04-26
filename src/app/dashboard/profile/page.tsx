
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { mockFounders } from '@/lib/mock-data';

export default function ProfilePage() {
  const { toast } = useToast();
  const initialData = mockFounders[0];
  const [formData, setFormData] = useState({
    name: initialData.name,
    headline: initialData.headline,
    location: initialData.location,
    stage: initialData.stage,
    skills: initialData.skills.join(', '),
    lookingFor: initialData.lookingFor,
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    toast({
      title: "Success",
      description: "Profile saved locally (demo mode).",
    });
  };

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
                value={formData.name} 
                onChange={e => setFormData({...formData, name: e.target.value})}
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
                <Select value={formData.stage} onValueChange={v => setFormData({...formData, stage: v as any})}>
                  <SelectTrigger>
                    <SelectValue />
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
