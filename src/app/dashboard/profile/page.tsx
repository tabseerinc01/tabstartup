'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore } from '@/firebase';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { Loader2, Plus, Trash2, Linkedin, Globe, Twitter, Image as ImageIcon } from 'lucide-react';

export default function ProfilePage() {
  const { toast } = useToast();
  const { user } = useUser();
  const firestore = useFirestore();

  const [isLoading, setIsLoading] = useState(true);
  const [formData, setFormData] = useState({
    fullName: '',
    imageUrl: '',
    headline: '',
    location: '',
    stage: '',
    skills: '',
    bio: '',
    whyBuilding: '',
    lookingFor: '',
    socialLinks: {
      linkedin: '',
      website: '',
      twitter: '',
    },
    availability: {
      openToInvestment: false,
      hiring: false,
      coFounder: false,
    },
    experience: [{ company: '', role: '', duration: '', description: '' }],
    achievements: [''],
  });

  useEffect(() => {
    async function loadProfile() {
      if (!firestore || !user?.uid) return;
      setIsLoading(true);
      try {
        const snap = await getDoc(doc(firestore, 'users', user.uid));
        if (snap.exists()) {
          const profile = snap.data();
          setFormData({
            fullName: profile.fullName || '',
            imageUrl: profile.imageUrl || '',
            headline: profile.headline || '',
            location: profile.location || '',
            stage: profile.stage || '',
            skills: Array.isArray(profile.skills) ? profile.skills.join(', ') : '',
            bio: profile.bio || '',
            whyBuilding: profile.whyBuilding || '',
            lookingFor: profile.lookingFor || '',
            socialLinks: profile.socialLinks || { linkedin: '', website: '', twitter: '' },
            availability: profile.availability || { openToInvestment: false, hiring: false, coFounder: false },
            experience: profile.experience && profile.experience.length > 0 ? profile.experience : [{ company: '', role: '', duration: '', description: '' }],
            achievements: profile.achievements && profile.achievements.length > 0 ? profile.achievements : [''],
          });
        }
      } catch (error) {
        console.error("Error loading profile:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadProfile();
  }, [firestore, user?.uid]);

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

  const addExperience = () => {
    setFormData({
      ...formData,
      experience: [...formData.experience, { company: '', role: '', duration: '', description: '' }]
    });
  };

  const removeExperience = (index: number) => {
    const newExp = [...formData.experience];
    newExp.splice(index, 1);
    setFormData({ ...formData, experience: newExp });
  };

  const updateExperience = (index: number, field: string, value: string) => {
    const newExp = [...formData.experience];
    newExp[index] = { ...newExp[index], [field]: value };
    setFormData({ ...formData, experience: newExp });
  };

  const addAchievement = () => {
    setFormData({ ...formData, achievements: [...formData.achievements, ''] });
  };

  const removeAchievement = (index: number) => {
    const newAch = [...formData.achievements];
    newAch.splice(index, 1);
    setFormData({ ...formData, achievements: newAch });
  };

  const updateAchievement = (index: number, value: string) => {
    const newAch = [...formData.achievements];
    newAch[index] = value;
    setFormData({ ...formData, achievements: newAch });
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto w-full space-y-8 pb-20">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Founder Profile</h1>
        <Button onClick={handleSave}>Save Changes</Button>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Your public identity on TabStartup.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input 
                    id="name" 
                    value={formData.fullName} 
                    onChange={e => setFormData({...formData, fullName: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Input 
                    id="location" 
                    value={formData.location}
                    onChange={e => setFormData({...formData, location: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="imageUrl" className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4" /> Profile Image URL
                </Label>
                <Input 
                  id="imageUrl" 
                  placeholder="https://..."
                  value={formData.imageUrl}
                  onChange={e => setFormData({...formData, imageUrl: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="headline">Headline</Label>
                <Input 
                  id="headline" 
                  placeholder="e.g. Building the future of AgriTech"
                  value={formData.headline}
                  onChange={e => setFormData({...formData, headline: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bio">About Me</Label>
                <Textarea 
                  id="bio" 
                  rows={4} 
                  placeholder="Tell us your story..."
                  value={formData.bio}
                  onChange={e => setFormData({...formData, bio: e.target.value})}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Professional Experience</CardTitle>
              <CardDescription>Share your career journey.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {formData.experience.map((exp, index) => (
                <div key={index} className="space-y-4 p-4 border rounded-lg relative group">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => removeExperience(index)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Company</Label>
                      <Input 
                        value={exp.company} 
                        onChange={e => updateExperience(index, 'company', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Role</Label>
                      <Input 
                        value={exp.role} 
                        onChange={e => updateExperience(index, 'role', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Duration (e.g. 2020 - Present)</Label>
                    <Input 
                      value={exp.duration} 
                      onChange={e => updateExperience(index, 'duration', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Key Responsibilities</Label>
                    <Textarea 
                      rows={2}
                      value={exp.description} 
                      onChange={e => updateExperience(index, 'description', e.target.value)}
                    />
                  </div>
                </div>
              ))}
              <Button variant="outline" className="w-full" onClick={addExperience}>
                <Plus className="h-4 w-4 mr-2" /> Add Experience
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Motivation & Vision</CardTitle>
              <CardDescription>Why are you building this startup?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="why">The "Why" Behind Your Vision</Label>
                <Textarea 
                  id="why" 
                  rows={6} 
                  placeholder="Investors look for passion and purpose."
                  value={formData.whyBuilding}
                  onChange={e => setFormData({...formData, whyBuilding: e.target.value})}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Availability</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="investment" 
                  checked={formData.availability.openToInvestment}
                  onCheckedChange={(checked) => setFormData({
                    ...formData, 
                    availability: {...formData.availability, openToInvestment: !!checked}
                  })}
                />
                <Label htmlFor="investment">Open to Investment</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="hiring" 
                  checked={formData.availability.hiring}
                  onCheckedChange={(checked) => setFormData({
                    ...formData, 
                    availability: {...formData.availability, hiring: !!checked}
                  })}
                />
                <Label htmlFor="hiring">Currently Hiring</Label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Social Links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Linkedin className="h-4 w-4" /> LinkedIn</Label>
                <Input 
                  placeholder="https://..."
                  value={formData.socialLinks.linkedin}
                  onChange={e => setFormData({
                    ...formData, 
                    socialLinks: {...formData.socialLinks, linkedin: e.target.value}
                  })}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}