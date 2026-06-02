'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useFirestore, useUser, useDoc, useMemoFirebase, errorEmitter, FirestorePermissionError } from '@/firebase';
import { doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { 
  ArrowLeft, 
  Loader2, 
  Building2, 
  Mail, 
  Phone, 
  Calendar, 
  Pencil, 
  Trash2, 
  Clock, 
  Save, 
  X,
  User,
  Tag as TagIcon,
  MessageSquare,
  Plus
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

const CONTACT_TYPES = ["lead", "partner", "investor", "founder", "mentor", "client", "other"];

export default function ContactDetailsPage() {
  const { contactId } = useParams();
  const { user } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const contactRef = useMemoFirebase(() => {
    if (!firestore || !contactId) return null;
    return doc(firestore, 'contacts', contactId as string);
  }, [firestore, contactId]);

  const { data: contact, isLoading } = useDoc(contactRef);

  const [editForm, setEditForm] = useState<any>(null);

  useEffect(() => {
    if (contact) {
      setEditForm({
        contactName: contact.contactName || '',
        companyName: contact.companyName || '',
        email: contact.email || '',
        phone: contact.phone || '',
        type: contact.type || 'lead',
        notes: contact.notes || '',
        tags: contact.tags || []
      });
    }
  }, [contact]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || !contactId || isSaving) return;

    setIsSaving(true);
    const updateData = {
      ...editForm,
      updatedAt: serverTimestamp()
    };

    updateDoc(doc(firestore, 'contacts', contactId as string), updateData)
      .then(() => {
        toast({ title: "Contact Updated", description: "Changes have been saved successfully." });
        setIsEditing(false);
      })
      .catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: `contacts/${contactId}`,
          operation: 'update',
          requestResourceData: updateData
        }));
      })
      .finally(() => {
        setIsSaving(false);
      });
  };

  const handleDelete = async () => {
    if (!firestore || !contactId || isDeleting) return;
    if (!confirm("Are you sure you want to delete this contact? This action cannot be undone.")) return;

    setIsDeleting(true);
    deleteDoc(doc(firestore, 'contacts', contactId as string))
      .then(() => {
        toast({ title: "Contact Deleted", description: "The record has been removed from your workspace." });
        router.push('/dashboard/contacts');
      })
      .catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: `contacts/${contactId}`,
          operation: 'delete'
        }));
        setIsDeleting(false);
      });
  };

  if (isLoading || !contact) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest animate-pulse">Loading Record...</p>
      </div>
    );
  }

  // Security check: ensure user owns this contact
  if (contact.ownerUid !== user?.uid) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center space-y-6">
        <div className="p-6 bg-destructive/10 rounded-full text-destructive">
          <Trash2 className="h-12 w-12" />
        </div>
        <h2 className="text-2xl font-black">Access Denied</h2>
        <p className="text-slate-500">You do not have permission to view this contact record.</p>
        <Button onClick={() => router.push('/dashboard/contacts')}>Back to Contacts</Button>
      </div>
    );
  }

  const createdAt = contact.createdAt?.toDate?.() || new Date();
  const updatedAt = contact.updatedAt?.toDate?.() || new Date();

  return (
    <div className="max-w-4xl mx-auto w-full space-y-8 animate-in fade-in duration-700 pb-20">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.back()} className="gap-2 -ml-4 hover:bg-slate-100 rounded-full font-bold text-slate-500">
          <ArrowLeft className="h-4 w-4" /> Back to Workspace
        </Button>
        <div className="flex gap-2">
          {!isEditing ? (
            <>
              <Button variant="outline" onClick={() => setIsEditing(true)} className="rounded-xl h-10 gap-2 font-bold border-slate-200">
                <Pencil className="h-4 w-4" /> Edit Record
              </Button>
              <Button variant="outline" onClick={handleDelete} disabled={isDeleting} className="rounded-xl h-10 gap-2 font-bold border-slate-200 text-destructive hover:bg-destructive/5 hover:text-destructive">
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => setIsEditing(false)} className="rounded-xl h-10 font-bold">
              Cancel
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {isEditing ? (
            <Card className="border-none shadow-xl rounded-[2.5rem] bg-background ring-1 ring-slate-100 overflow-hidden">
              <form onSubmit={handleUpdate}>
                <CardHeader className="bg-primary/5 p-8 border-b border-slate-100">
                  <CardTitle className="text-2xl font-black">Update Contact</CardTitle>
                  <CardDescription>Modify details for {contact.contactName}.</CardDescription>
                </CardHeader>
                <CardContent className="p-8 space-y-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="contactName">Full Name</Label>
                      <Input 
                        id="contactName" 
                        required 
                        value={editForm?.contactName}
                        onChange={e => setEditForm({...editForm, contactName: e.target.value})}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="company">Company</Label>
                        <Input 
                          id="company" 
                          value={editForm?.companyName}
                          onChange={e => setEditForm({...editForm, companyName: e.target.value})}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="type">Type</Label>
                        <Select 
                          value={editForm?.type} 
                          onValueChange={v => setEditForm({...editForm, type: v})}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CONTACT_TYPES.map(t => (
                              <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input 
                          id="email" 
                          type="email" 
                          value={editForm?.email}
                          onChange={e => setEditForm({...editForm, email: e.target.value})}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">Phone</Label>
                        <Input 
                          id="phone" 
                          value={editForm?.phone}
                          onChange={e => setEditForm({...editForm, phone: e.target.value})}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="notes">Notes</Label>
                      <Textarea 
                        id="notes" 
                        rows={6}
                        value={editForm?.notes}
                        onChange={e => setEditForm({...editForm, notes: e.target.value})}
                      />
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="p-8 bg-slate-50 border-t border-slate-100">
                  <Button type="submit" disabled={isSaving} className="w-full rounded-xl h-12 font-black gap-2 shadow-lg shadow-primary/20">
                    {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                    Save Changes
                  </Button>
                </CardFooter>
              </form>
            </Card>
          ) : (
            <>
              <Card className="border-none shadow-xl rounded-[2.5rem] bg-background ring-1 ring-slate-100 overflow-hidden">
                <div className="h-32 bg-gradient-to-r from-primary/10 via-primary/5 to-background" />
                <div className="px-8 pb-10 -mt-10">
                  <div className="flex flex-col md:flex-row gap-6 items-end mb-8">
                    <div className="h-24 w-24 rounded-[2rem] bg-primary flex items-center justify-center text-primary-foreground font-black text-4xl shadow-2xl ring-8 ring-background">
                      {contact.contactName.charAt(0)}
                    </div>
                    <div className="flex-1 space-y-1">
                      <h2 className="text-3xl font-black text-slate-900 tracking-tight">{contact.contactName}</h2>
                      <div className="flex flex-wrap items-center gap-3">
                         <Badge variant="secondary" className="capitalize bg-primary/5 text-primary border-none rounded-lg px-3 h-6 font-bold text-[10px] tracking-widest">
                           {contact.type}
                         </Badge>
                         {contact.companyName && (
                            <div className="flex items-center gap-1.5 text-sm font-bold text-slate-400">
                               <Building2 className="h-4 w-4" /> {contact.companyName}
                            </div>
                         )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8 border-t border-slate-50">
                    <div className="space-y-6">
                       <div className="space-y-1">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Communication</Label>
                          <div className="space-y-3 pt-2">
                             <div className="flex items-center gap-3 p-4 rounded-2xl bg-slate-50 ring-1 ring-slate-100">
                                <Mail className="h-5 w-5 text-primary" />
                                <div className="min-w-0">
                                   <p className="text-[10px] font-bold text-slate-400 uppercase">Email Address</p>
                                   <p className="text-sm font-bold text-slate-700 truncate">{contact.email || 'Not provided'}</p>
                                </div>
                             </div>
                             <div className="flex items-center gap-3 p-4 rounded-2xl bg-slate-50 ring-1 ring-slate-100">
                                <Phone className="h-5 w-5 text-primary" />
                                <div className="min-w-0">
                                   <p className="text-[10px] font-bold text-slate-400 uppercase">Phone Number</p>
                                   <p className="text-sm font-bold text-slate-700 truncate">{contact.phone || 'Not provided'}</p>
                                </div>
                             </div>
                          </div>
                       </div>
                    </div>

                    <div className="space-y-6">
                       <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Biography & Background</Label>
                          <div className="bg-primary/5 p-6 rounded-[2rem] min-h-[160px] border border-primary/10">
                             <p className="text-sm leading-relaxed text-slate-600 font-medium italic">
                               "{contact.notes || "No additional notes or background information has been recorded for this contact yet."}"
                             </p>
                          </div>
                       </div>
                    </div>
                  </div>
                </div>
              </Card>

              <section className="space-y-4">
                 <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                   <Clock className="h-5 w-5 text-primary" /> Activity History
                 </h3>
                 <div className="relative space-y-4 before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-slate-200 before:via-slate-200 before:to-transparent">
                    <div className="relative flex items-start gap-6 group">
                       <div className="mt-1 h-10 w-10 shrink-0 rounded-full bg-slate-100 ring-4 ring-background flex items-center justify-center z-10 border border-slate-200">
                          <Clock className="h-4 w-4 text-slate-400" />
                       </div>
                       <div className="flex-1 bg-white p-6 rounded-[2rem] shadow-sm ring-1 ring-slate-100 group-hover:shadow-md transition-shadow">
                          <div className="flex items-center justify-between mb-2">
                             <p className="text-sm font-black text-slate-900">Last Record Update</p>
                             <span className="text-[10px] font-bold text-slate-400">{format(updatedAt, 'PPP p')}</span>
                          </div>
                          <p className="text-xs text-slate-500 font-medium">The contact information was synchronized with the latest workspace data.</p>
                       </div>
                    </div>
                    <div className="relative flex items-start gap-6 group">
                       <div className="mt-1 h-10 w-10 shrink-0 rounded-full bg-primary/10 ring-4 ring-background flex items-center justify-center z-10 border border-primary/20">
                          <Plus className="h-4 w-4 text-primary" />
                       </div>
                       <div className="flex-1 bg-white p-6 rounded-[2rem] shadow-sm ring-1 ring-slate-100 group-hover:shadow-md transition-shadow">
                          <div className="flex items-center justify-between mb-2">
                             <p className="text-sm font-black text-slate-900">Contact Created</p>
                             <span className="text-[10px] font-bold text-slate-400">{format(createdAt, 'PPP p')}</span>
                          </div>
                          <p className="text-xs text-slate-500 font-medium">Record successfully added to the private workspace directory by owner.</p>
                       </div>
                    </div>
                 </div>
              </section>
            </>
          )}
        </div>

        <div className="space-y-6">
           <Card className="border-none shadow-xl rounded-[2.5rem] bg-slate-900 text-white overflow-hidden group">
              <CardHeader className="pb-4">
                 <div className="flex items-center gap-2 mb-2">
                    <div className="h-1 w-6 bg-primary rounded-full" />
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">Workspace Tools</span>
                 </div>
                 <CardTitle className="text-lg font-black">Contact Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pb-8">
                 <Button variant="outline" className="w-full justify-start gap-3 h-12 rounded-xl bg-white/5 border-white/10 hover:bg-white/10 text-white font-bold transition-all border-none group/btn">
                    <Mail className="h-4 w-4 text-primary group-hover/btn:scale-110 transition-transform" /> Send Email Inquiry
                 </Button>
                 <Button variant="outline" className="w-full justify-start gap-3 h-12 rounded-xl bg-white/5 border-white/10 hover:bg-white/10 text-white font-bold transition-all border-none group/btn">
                    <MessageSquare className="h-4 w-4 text-primary group-hover/btn:scale-110 transition-transform" /> Record Log Entry
                 </Button>
                 <Button variant="outline" className="w-full justify-start gap-3 h-12 rounded-xl bg-white/5 border-white/10 hover:bg-white/10 text-white font-bold transition-all border-none group/btn">
                    <TagIcon className="h-4 w-4 text-primary group-hover/btn:scale-110 transition-transform" /> Manage Tags
                 </Button>
              </CardContent>
           </Card>

           <Card className="border-none shadow-sm rounded-[2rem] bg-white ring-1 ring-slate-100">
              <CardHeader className="pb-2">
                 <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400">Meta Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pb-6">
                 <div className="space-y-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">System Identity</p>
                    <code className="block p-3 rounded-xl bg-slate-50 text-[10px] font-mono text-slate-500 break-all ring-1 ring-slate-100">
                       {contactId}
                    </code>
                 </div>
                 <div className="space-y-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Ownership</p>
                    <div className="flex items-center gap-2">
                       <User className="h-3 w-3 text-slate-300" />
                       <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Private Workspace Record</span>
                    </div>
                 </div>
              </CardContent>
           </Card>
        </div>
      </div>
    </div>
  );
}