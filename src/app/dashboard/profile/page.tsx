
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
import { Loader2, Plus, Trash2, Linkedin, Globe, Camera, Upload, ShieldCheck, Zap, Users, ImageIcon } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { validateImage, uploadProfileImage } from '@/lib/storage-helpers';
import { ProfileStrengthWidget } from '@/components/dashboard/profile-strength-widget';

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
  const coverInputRef = useRef<HTMLInputElement>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [isActivatingRole, setIsActivatingRole] = useState<string | null>(null);
  const [startup, setStartup] = useState<any>(null);
  
  const [formData, setFormData] = useState({
    fullName: '',
    imageUrl: '',
    coverImageUrl: '',
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
        const [snap, startupSnap] = await Promise.all([
          getDoc(doc(firestore, 'users', user.uid)),
          getDoc(doc(firestore, 'startups', user.uid))
        ]);

        if (startupSnap.exists()) {
          setStartup(startupSnap.data());
        }

        if (snap.exists()) {
          const profile = snap.data();
          const roles = Array.isArray(profile.roles) ? profile.roles : (profile.role ? [profile.role] : ['founder']);
          setUserRoles(roles);
          setFormData({
            fullName: profile.fullName || '',
            imageUrl: profile.imageUrl || '',
            coverImageUrl: profile.coverImageUrl || '',
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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, isCover = false) => {
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

      const field = isCover ? 'coverImageUrl' : 'imageUrl';
      await setDoc(doc(firestore, 'users', user.uid), {
        [field]: downloadURL,
        updatedAt: serverTimestamp()
      }, { merge: true });

      setFormData(prev => ({ ...prev, [field]: downloadURL }));
      toast({ title: isCover ? "Cover Updated" : "Photo Updated" });
    } catch (error: any) {
      toast({ title: "Upload Failed", variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (coverInputRef.current) coverInputRef.current.value = '';
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
              <div className="space-y-6">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Media Assets</Label>
                
                {/* Cover Image Upload */}
                <div className="relative h-32 rounded-2xl bg-slate-100 overflow-hidden group border border-slate-200">
                  {formData.coverImageUrl ? (
                    <img src={formData.coverImageUrl} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400">
                      <ImageIcon className="h-8 w-8" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <input type="file" ref={coverInputRef} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, true)} />
                    <Button variant="secondary" size="sm" className="rounded-xl h-8 text-[10px] font-bold" onClick={() => coverInputRef.current?.click()} disabled={isUploading}>
                      {isUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
                      Update Cover
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col items-center sm:flex-row gap-8 p-6 bg-slate-50 rounded-[2rem] border border-slate-100 -mt-12 relative z-10 mx-4 shadow-lg shadow-slate-200/50">
                  <div className="relative group">
                    <Avatar className="h-24 w-24 border-4 border-background shadow-xl rounded-2xl overflow-hidden">
                      <AvatarImage src={formData.imageUrl} className="object-cover" />
                      <AvatarFallback className="text-2xl font-black rounded-2xl bg-primary/10 text-primary">{initials}</AvatarFallback>
                    </Avatar>
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl"
                      disabled={isUploading}
                    >
                      <Camera className="h-6 w-6 text-white" />
                    </button>
                  </div>
                  
                  <div className="flex-1 space-y-4 w-full text-center sm:text-left">
                    <div className="space-y-1">
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        accept="image/*" 
                        onChange={(e) => handleImageUpload(e, false)}
                      />
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full sm:w-fit rounded-xl gap-2 h-9 font-bold border-slate-200 bg-white"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                      >
                        {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-3 w-3" />}
                        {formData.imageUrl ? 'Change Avatar' : 'Upload Photo'}
                      </Button>
                      <p className="text-[9px] text-slate-400 font-bold uppercase">JPG, PNG or WebP. Max 5MB.</p>
                    </div>
                  </div>
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
              <div className="space-y-2">
                <Label htmlFor="skills" className="text-xs font-bold uppercase tracking-wide text-slate-500">Skills / Interests (Comma separated)</Label>
                <Input 
                  id="skills" 
                  placeholder="e.g. Strategy, Fundraising, Product"
                  className="h-12 rounded-xl border-slate-100 bg-slate-50/50"
                  value={formData.skills}
                  onChange={e => setFormData({...formData, skills: e.target.value})}
                />
              </div>
            </CardContent>
          </Card>

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
          {/* Profile Strength Widget */}
          <ProfileStrengthWidget profile={formData} startup={startup} />

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
                  value={formData.website}
                  onChange={e => setFormData({
                    ...formData, 
                    website: e.target.value
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
