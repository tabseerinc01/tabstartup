'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore, useStorage, errorEmitter, FirestorePermissionError } from '@/firebase';
import { doc, setDoc, getDoc, serverTimestamp, arrayUnion, query, collection, where, getDocs, writeBatch, limit } from 'firebase/firestore';
import { Loader2, Plus, Trash2, Linkedin, Globe, Camera, Upload, ShieldCheck, Zap, Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { validateImage, uploadProfileImage } from '@/lib/storage-helpers';

const AVAILABLE_ROLES = [
  { id: 'founder', label: 'Founder', icon: Zap },
  { id: 'investor', label: 'Investor', icon: ShieldCheck },
  { id: 'mentor', label: 'Mentor', icon: Users },
];

export default function ProfilePage() {
  const { toast } = useToast();
  const { user } = useUser();
  const firestore = useFirestore();
  const storage = useStorage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [isActivatingRole, setIsActivatingRole] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    fullName: '',
    imageUrl: '',
    headline: '',
    investorHeadline: '',
    location: '',
    stage: '',
    skills: '',
    bio: '',
    investorBio: '',
    whyBuilding: '',
    lookingFor: '',
    linkedinUrl: '',
    ticketSize: '',
    isOpenToPitches: false,
    investmentFocus: '',
    preferredStage: '',
    lookingForCofounder: false,
    cofounderSkills: '',
    cofounderRole: '',
    equityOffer: '',
    commitmentType: '',
    isMentor: false,
    mentorSkills: '',
    mentorBio: '',
    yearsOfExperience: '',
    mentorAvailability: '',
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
          const roles = Array.isArray(profile.roles) ? profile.roles : (profile.role ? [profile.role] : ['founder']);
          setUserRoles(roles);
          setFormData({
            fullName: profile.fullName || '',
            imageUrl: profile.imageUrl || '',
            headline: profile.headline || '',
            investorHeadline: profile.investorHeadline || '',
            location: profile.location || '',
            stage: profile.stage || '',
            skills: Array.isArray(profile.skills) ? profile.skills.join(', ') : '',
            bio: profile.bio || '',
            investorBio: profile.investorBio || '',
            whyBuilding: profile.whyBuilding || '',
            lookingFor: profile.lookingFor || '',
            linkedinUrl: profile.linkedinUrl || profile.socialLinks?.linkedin || '',
            ticketSize: profile.ticketSize || '',
            isOpenToPitches: profile.isOpenToPitches || false,
            investmentFocus: Array.isArray(profile.investmentFocus) ? profile.investmentFocus.join(', ') : '',
            preferredStage: Array.isArray(profile.preferredStage) ? profile.preferredStage.join(', ') : '',
            lookingForCofounder: profile.lookingForCofounder || false,
            cofounderSkills: Array.isArray(profile.cofounderSkills) ? profile.cofounderSkills.join(', ') : '',
            cofounderRole: profile.cofounderRole || '',
            equityOffer: profile.equityOffer || '',
            commitmentType: profile.commitmentType || '',
            isMentor: profile.isMentor || roles.includes('mentor') || false,
            mentorSkills: Array.isArray(profile.mentorSkills) ? profile.mentorSkills.join(', ') : '',
            mentorBio: profile.mentorBio || '',
            yearsOfExperience: profile.yearsOfExperience || '',
            mentorAvailability: profile.mentorAvailability || '',
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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !storage || !firestore) return;

    const { error } = validateImage(file);
    if (error) {
      toast({ title: "Validation Error", description: error, variant: "destructive" });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const downloadURL = await uploadProfileImage(storage, user.uid, file, (progress) => {
        setUploadProgress(progress);
      });

      await setDoc(doc(firestore, 'users', user.uid), {
        imageUrl: downloadURL,
        updatedAt: serverTimestamp()
      }, { merge: true });

      setFormData(prev => ({ ...prev, imageUrl: downloadURL }));
      toast({ title: "Image Uploaded", description: "Your profile picture has been updated." });
    } catch (error: any) {
      toast({ title: "Upload Failed", description: "Could not upload image.", variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firestore || isUploading) return;

    setIsSaving(true);
    try {
      const skillsArray = formData.skills.split(',').map(s => s.trim()).filter(s => s !== '');
      const focusArray = formData.investmentFocus.split(',').map(s => s.trim()).filter(s => s !== '');
      const stageArray = formData.preferredStage.split(',').map(s => s.trim()).filter(s => s !== '');
      const cofounderSkillsArray = formData.cofounderSkills.split(',').map(s => s.trim()).filter(s => s !== '');
      const mentorSkillsArray = formData.mentorSkills.split(',').map(s => s.trim()).filter(s => s !== '');
      
      const updatedData = {
        ...formData,
        skills: skillsArray,
        investmentFocus: focusArray,
        preferredStage: stageArray,
        cofounderSkills: cofounderSkillsArray,
        mentorSkills: mentorSkillsArray,
        isMentor: userRoles.includes('mentor'),
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(firestore, 'users', user.uid), updatedData, { merge: true });

      // Robust Qualification Check
      const isProfileComplete = !!(
        formData.fullName.trim() && 
        formData.bio.trim() && 
        formData.location.trim() && 
        userRoles.length > 0
      );

      if (isProfileComplete) {
        const refQ = query(
          collection(firestore, 'referrals'), 
          where('referredUid', '==', user.uid),
          limit(1)
        );
        const refSnap = await getDocs(refQ);
        if (!refSnap.empty) {
          const batch = writeBatch(firestore);
          refSnap.docs.forEach(d => {
            const data = d.data();
            if (!data.referredProfileCompleted) {
               batch.update(d.ref, { referredProfileCompleted: true });
            }
          });
          await batch.commit();
        }
      }

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
    } finally {
      setIsSaving(false);
    }
  };

  const activateRole = async (roleId: string) => {
    if (!firestore || !user?.uid || isActivatingRole) return;
    
    setIsActivatingRole(roleId);
    const updatePayload = {
      roles: arrayUnion(roleId),
      updatedAt: serverTimestamp()
    };

    try {
      await setDoc(doc(firestore, 'users', user.uid), updatePayload, { merge: true });
      setUserRoles(prev => [...new Set([...prev, roleId])]);
      toast({ title: "Role Activated", description: `You have successfully joined the ecosystem as a ${roleId}.` });
    } catch (error: any) {
      toast({ title: "Activation Failed", variant: "destructive" });
    } finally {
      setIsActivatingRole(null);
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

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary opacity-20" />
      </div>
    );
  }

  const initials = formData.fullName?.charAt(0) || user?.email?.charAt(0).toUpperCase() || '?';

  return (
    <div className="max-w-4xl mx-auto w-full space-y-8 pb-20 animate-in fade-in duration-700">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Profile Settings</h1>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {userRoles.map(role => (
              <Badge key={role} className="capitalize bg-primary/10 text-primary border-none text-[10px] font-black px-2.5 tracking-widest">
                {role}
              </Badge>
            ))}
          </div>
        </div>
        <Button onClick={handleSave} disabled={isSaving || isUploading} className="rounded-xl h-11 px-8 font-bold shadow-lg shadow-primary/20">
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Save Changes
        </Button>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          
          <Card className="border-none shadow-xl rounded-[2.5rem] bg-primary/5 ring-1 ring-primary/10 overflow-hidden">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-black flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" /> Ecosystem Roles
              </CardTitle>
              <CardDescription className="text-slate-500 font-medium">Activate additional profiles to unlock specialized tools.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {AVAILABLE_ROLES.map(role => {
                  const isActive = userRoles.includes(role.id);
                  return (
                    <Button
                      key={role.id}
                      variant={isActive ? "default" : "outline"}
                      className={`h-auto py-5 flex-col gap-2 rounded-2xl transition-all ${isActive ? 'bg-white text-primary shadow-sm hover:bg-white border-none' : 'border-dashed border-primary/20 hover:bg-primary/5'}`}
                      onClick={() => !isActive && activateRole(role.id)}
                      disabled={isActive || isActivatingRole === role.id}
                    >
                      {isActivatingRole === role.id ? (
                        <Loader2 className="h-6 w-6 animate-spin" />
                      ) : (
                        <role.icon className={`h-7 w-7 ${isActive ? 'text-primary' : 'text-slate-300'}`} />
                      )}
                      <span className="font-black text-[10px] uppercase tracking-widest">{role.label}</span>
                      {isActive && <Badge variant="secondary" className="h-4 px-1.5 text-[8px] font-black bg-green-50 text-green-700 uppercase">Active</Badge>}
                    </Button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-xl rounded-[2.5rem] bg-background ring-1 ring-slate-100 overflow-hidden">
            <CardHeader className="p-8 pb-4">
              <CardTitle className="text-xl font-black">Basic Information</CardTitle>
              <CardDescription>Your public identity in the community directory.</CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
              <div className="flex flex-col items-center sm:flex-row gap-8 p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
                <div className="relative group">
                  <Avatar className="h-32 w-32 border-8 border-background shadow-2xl rounded-3xl overflow-hidden">
                    <AvatarImage src={formData.imageUrl} className="object-cover" />
                    <AvatarFallback className="text-3xl font-black rounded-3xl bg-primary/10 text-primary">{initials}</AvatarFallback>
                  </Avatar>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl"
                    disabled={isUploading}
                  >
                    <Camera className="h-8 w-8 text-white" />
                  </button>
                </div>
                
                <div className="flex-1 space-y-4 w-full">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Profile Picture</Label>
                    <div className="flex flex-col gap-3">
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        accept="image/jpeg,image/png,image/webp" 
                        onChange={handleImageUpload}
                      />
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full sm:w-fit rounded-xl gap-2 h-10 font-bold border-slate-200"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                      >
                        {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        {formData.imageUrl ? 'Change Photo' : 'Upload Photo'}
                      </Button>
                      <p className="text-[10px] text-slate-400 font-medium italic">Supported: JPG, PNG, WebP. Max 5MB.</p>
                    </div>
                  </div>
                  {isUploading && (
                    <div className="space-y-1.5">
                      <Progress value={uploadProgress} className="h-1 bg-slate-200" />
                      <p className="text-[9px] text-primary font-black text-right uppercase tracking-tighter">{Math.round(uploadProgress)}% Complete</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-xs font-bold uppercase tracking-wide text-slate-500">Full Name</Label>
                  <Input 
                    id="name" 
                    className="h-12 rounded-xl border-slate-100 bg-slate-50/50"
                    value={formData.fullName} 
                    onChange={e => setFormData({...formData, fullName: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="location" className="text-xs font-bold uppercase tracking-wide text-slate-500">Current Location</Label>
                  <Input 
                    id="location" 
                    placeholder="e.g. Dhaka, BD"
                    className="h-12 rounded-xl border-slate-100 bg-slate-50/50"
                    value={formData.location}
                    onChange={e => setFormData({...formData, location: e.target.value})}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="headline" className="text-xs font-bold uppercase tracking-wide text-slate-500">Professional Headline</Label>
                <Input 
                  id="headline" 
                  placeholder="e.g. Founder building the future of Fintech in Bangladesh"
                  className="h-12 rounded-xl border-slate-100 bg-slate-50/50"
                  value={formData.headline}
                  onChange={e => setFormData({...formData, headline: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bio" className="text-xs font-bold uppercase tracking-wide text-slate-500">Personal Biography</Label>
                <Textarea 
                  id="bio" 
                  rows={4} 
                  placeholder="Share your story, achievements and mission with the community..."
                  className="rounded-2xl border-slate-100 bg-slate-50/50 p-4"
                  value={formData.bio}
                  onChange={e => setFormData({...formData, bio: e.target.value})}
                />
              </div>
            </CardContent>
          </Card>

          {userRoles.includes('investor') && (
            <Card className="border-none shadow-xl rounded-[2.5rem] bg-background ring-1 ring-primary/10 overflow-hidden animate-in slide-in-from-top-4 duration-500">
              <CardHeader className="bg-primary/[0.03] p-8 border-b border-primary/5">
                <CardTitle className="flex items-center gap-2 font-black text-primary">
                  <ShieldCheck className="h-6 w-6" /> Investor Portfolio
                </CardTitle>
                <CardDescription className="text-slate-500">Define your deployment strategy to attract matching ventures.</CardDescription>
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="ticketSize">Average Ticket Size</Label>
                    <Input 
                      id="ticketSize" 
                      placeholder="e.g. $10k - $50k"
                      className="h-12 rounded-xl border-slate-100 bg-slate-50/50"
                      value={formData.ticketSize}
                      onChange={e => setFormData({...formData, ticketSize: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="preferredStage">Preferred Startup Stages</Label>
                    <Input 
                      id="preferredStage" 
                      placeholder="e.g. Idea, Early, Growth"
                      className="h-12 rounded-xl border-slate-100 bg-slate-50/50"
                      value={formData.preferredStage}
                      onChange={e => setFormData({...formData, preferredStage: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="focus">Investment Sectors / Focus</Label>
                  <Input 
                    id="focus" 
                    placeholder="e.g. Fintech, AI, SaaS, HealthTech"
                    className="h-12 rounded-xl border-slate-100 bg-slate-50/50"
                    value={formData.investmentFocus}
                    onChange={e => setFormData({...formData, investmentFocus: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="investorBio">Investment Philosophy</Label>
                  <Textarea 
                    id="investorBio" 
                    rows={4} 
                    placeholder="Tell founders about your support model beyond capital..."
                    className="rounded-2xl border-slate-100 bg-slate-50/50 p-4"
                    value={formData.investorBio}
                    onChange={e => setFormData({...formData, investorBio: e.target.value})}
                  />
                </div>
                <div className="flex items-center space-x-3 bg-primary/5 p-5 rounded-2xl border border-primary/10">
                  <Checkbox 
                    id="openToPitches" 
                    className="h-5 w-5"
                    checked={formData.isOpenToPitches}
                    onCheckedChange={(checked) => setFormData({
                      ...formData, 
                      isOpenToPitches: !!checked
                    })}
                  />
                  <div className="grid gap-0.5 leading-none">
                    <Label htmlFor="openToPitches" className="font-black text-sm text-primary uppercase tracking-wide cursor-pointer">Open to Direct Pitches</Label>
                    <p className="text-[10px] text-slate-500 font-medium italic">Founders will be able to send you investment requests via the directory.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {userRoles.includes('founder') && (
            <Card className="border-none shadow-xl rounded-[2.5rem] bg-background ring-1 ring-slate-100 overflow-hidden animate-in slide-in-from-top-4 duration-500">
              <CardHeader className="p-8 pb-4">
                <CardTitle className="flex items-center gap-2 font-black">
                  <Zap className="h-6 w-6 text-primary" /> Venture Strategy
                </CardTitle>
                <CardDescription>Detail your partner requirements and building vision.</CardDescription>
              </CardHeader>
              <CardContent className="p-8 space-y-8">
                <div className="space-y-2">
                  <Label htmlFor="why">The "Why" Behind Your Vision</Label>
                  <Textarea 
                    id="why" 
                    rows={4} 
                    placeholder="Describe your motivation. Passion attracts partners and capital."
                    className="rounded-2xl border-slate-100 bg-slate-50/50 p-4"
                    value={formData.whyBuilding}
                    onChange={e => setFormData({...formData, whyBuilding: e.target.value})}
                  />
                </div>
                
                <div className="flex items-center space-x-3 bg-slate-50 p-5 rounded-2xl border border-slate-100">
                  <Checkbox 
                    id="lookingForCofounder" 
                    className="h-5 w-5"
                    checked={formData.lookingForCofounder}
                    onCheckedChange={(checked) => setFormData({
                      ...formData, 
                      lookingForCofounder: !!checked
                    })}
                  />
                  <div className="grid gap-0.5 leading-none">
                    <Label htmlFor="lookingForCofounder" className="font-black text-sm uppercase tracking-wide cursor-pointer">Actively seeking a Co-founder</Label>
                    <p className="text-[10px] text-slate-500 font-medium italic">Highlight your profile in the co-founder directory.</p>
                  </div>
                </div>

                {formData.lookingForCofounder && (
                  <div className="space-y-6 pt-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="commitmentType">Partner Commitment</Label>
                        <Select 
                          value={formData.commitmentType} 
                          onValueChange={v => setFormData({...formData, commitmentType: v})}
                        >
                          <SelectTrigger className="h-12 rounded-xl">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Full-time">Full-time Partner</SelectItem>
                            <SelectItem value="Part-time">Part-time Partner</SelectItem>
                            <SelectItem value="Advisory">Advisory Role</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="equityOffer">Equity Range (%)</Label>
                        <Input 
                          id="equityOffer" 
                          placeholder="e.g. 10-25%"
                          className="h-12 rounded-xl border-slate-100 bg-slate-50/50"
                          value={formData.equityOffer}
                          onChange={e => setFormData({...formData, equityOffer: e.target.value})}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cofounderRole">Co-founder Responsibilities</Label>
                      <Textarea 
                        id="cofounderRole" 
                        placeholder="What specific skills are you missing? (e.g. CTO, Head of Growth)"
                        className="rounded-2xl border-slate-100 bg-slate-50/50 p-4"
                        value={formData.cofounderRole}
                        rows={3}
                        onChange={e => setFormData({...formData, cofounderRole: e.target.value})}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="border-none shadow-xl rounded-[2.5rem] bg-background ring-1 ring-slate-100 overflow-hidden">
            <CardHeader className="p-8 pb-4">
              <CardTitle className="text-xl font-black">Professional History</CardTitle>
              <CardDescription>Chronicle your career journey for verification.</CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
              <div className="space-y-4">
                {formData.experience.map((exp, index) => (
                  <div key={index} className="space-y-4 p-6 bg-slate-50 rounded-[2rem] border border-slate-100 relative group transition-all hover:bg-white hover:shadow-lg hover:ring-1 hover:ring-slate-100">
                    <button 
                      type="button"
                      className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-destructive h-8 w-8 flex items-center justify-center rounded-full hover:bg-destructive/5"
                      onClick={() => removeExperience(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase tracking-tight text-slate-400">Organization</Label>
                        <Input 
                          value={exp.company} 
                          className="h-10 rounded-xl"
                          onChange={e => updateExperience(index, 'company', e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase tracking-tight text-slate-400">Position</Label>
                        <Input 
                          value={exp.role} 
                          className="h-10 rounded-xl"
                          onChange={e => updateExperience(index, 'role', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-bold uppercase tracking-tight text-slate-400">Duration</Label>
                      <Input 
                        value={exp.duration} 
                        placeholder="e.g. Jan 2020 - Present"
                        className="h-10 rounded-xl"
                        onChange={e => updateExperience(index, 'duration', e.target.value)}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" className="w-full h-14 rounded-2xl border-dashed border-slate-200 text-slate-400 hover:bg-slate-50 font-bold gap-2" onClick={addExperience}>
                <Plus className="h-5 w-5" /> Add Professional Milestone
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-none shadow-xl rounded-[2.5rem] bg-slate-900 text-white overflow-hidden relative group">
            <CardHeader className="pb-4 relative z-10">
              <CardTitle className="text-lg font-black flex items-center gap-2">
                <Globe className="h-5 w-5 text-primary" /> Public Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 relative z-10">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10 group-hover:bg-white/10 transition-colors">
                  <div className="space-y-0.5">
                    <Label htmlFor="investment" className="font-bold text-sm cursor-pointer">Open to Investment</Label>
                    <p className="text-[9px] text-slate-400 uppercase tracking-tighter">Visible to global investors</p>
                  </div>
                  <Checkbox 
                    id="investment" 
                    className="border-white/20 data-[state=checked]:bg-primary"
                    checked={formData.availability.openToInvestment}
                    onCheckedChange={(checked) => setFormData({
                      ...formData, 
                      availability: {...formData.availability, openToInvestment: !!checked}
                    })}
                  />
                </div>
                <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10 group-hover:bg-white/10 transition-colors">
                  <div className="space-y-0.5">
                    <Label htmlFor="hiring" className="font-bold text-sm cursor-pointer">Currently Hiring</Label>
                    <p className="text-[9px] text-slate-400 uppercase tracking-tighter">Attract elite startup talent</p>
                  </div>
                  <Checkbox 
                    id="hiring" 
                    className="border-white/20 data-[state=checked]:bg-primary"
                    checked={formData.availability.hiring}
                    onCheckedChange={(checked) => setFormData({
                      ...formData, 
                      availability: {...formData.availability, hiring: !!checked}
                    })}
                  />
                </div>
              </div>
            </CardContent>
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
          </Card>

          <Card className="border-none shadow-xl rounded-[2.5rem] bg-background ring-1 ring-slate-100 overflow-hidden">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-black">Social Presence</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 pb-8">
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <Linkedin className="h-3.5 w-3.5 text-primary" /> LinkedIn Profile
                </Label>
                <Input 
                  placeholder="https://linkedin.com/in/..."
                  className="h-11 rounded-xl bg-slate-50/50 border-slate-100"
                  value={formData.linkedinUrl}
                  onChange={e => setFormData({
                    ...formData, 
                    linkedinUrl: e.target.value
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <Globe className="h-3.5 w-3.5 text-primary" /> Personal Website
                </Label>
                <Input 
                  placeholder="https://..."
                  className="h-11 rounded-xl bg-slate-50/50 border-slate-100"
                  value={formData.socialLinks.website}
                  onChange={e => setFormData({
                    ...formData, 
                    socialLinks: {...formData.socialLinks, website: e.target.value}
                  })}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-primary text-white border-none rounded-[2.5rem] shadow-2xl shadow-primary/20 overflow-hidden relative">
            <CardHeader className="relative z-10">
              <CardTitle className="text-base font-black uppercase tracking-widest flex items-center gap-2">
                <Zap className="h-5 w-5 fill-white" /> Pro Tips
              </CardTitle>
            </CardHeader>
            <CardContent className="relative z-10 text-xs space-y-4 font-medium leading-relaxed">
              <p className="opacity-90">• <strong>Verified Identity:</strong> Profiles with authentic photos and detailed biographies receive <strong>3x more</strong> engagement from capital partners.</p>
              <p className="opacity-90">• <strong>Global Reach:</strong> Your availability status is indexed by our search engine to highlight you to relevant founders or investors.</p>
            </CardContent>
            <div className="absolute bottom-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-16 -mb-16 pointer-events-none" />
          </Card>
        </div>
      </div>
    </div>
  );
}
