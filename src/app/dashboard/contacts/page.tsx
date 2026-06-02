
'use client';

import { useState, useMemo } from 'react';
import { useFirestore, useUser, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, addDoc, serverTimestamp } from 'firebase/firestore';
import { 
  Contact2, 
  Plus, 
  Search, 
  Filter, 
  Loader2, 
  MoreVertical, 
  Mail, 
  Phone, 
  Building2, 
  ChevronRight,
  ArrowRight,
  UserPlus
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter,
  DialogTrigger
} from '@/components/ui/dialog';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import Link from 'next/link';

const CONTACT_TYPES = ["lead", "partner", "investor", "founder", "mentor", "client", "other"];

export default function ContactsListPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [newContact, setNewContact] = useState({
    contactName: '',
    companyName: '',
    email: '',
    phone: '',
    type: 'lead',
    notes: ''
  });

  const contactsQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'contacts'), where('ownerUid', '==', user.uid));
  }, [firestore, user?.uid]);

  const { data: contacts, isLoading } = useCollection(contactsQuery);

  const filteredContacts = useMemo(() => {
    if (!contacts) return [];
    return contacts.filter(c => {
      const matchesSearch = 
        c.contactName.toLowerCase().includes(search.toLowerCase()) ||
        c.companyName?.toLowerCase().includes(search.toLowerCase()) ||
        c.email?.toLowerCase().includes(search.toLowerCase());
      
      const matchesType = typeFilter === 'all' || c.type === typeFilter;

      return matchesSearch && matchesType;
    }).sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
  }, [contacts, search, typeFilter]);

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || !user?.uid || isSaving) return;

    setIsSaving(true);
    const contactData = {
      ...newContact,
      ownerUid: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      tags: []
    };

    try {
      await addDoc(collection(firestore, 'contacts'), contactData);
      toast({ title: "Contact Created", description: `${newContact.contactName} added to your workspace.` });
      setIsAddDialogOpen(false);
      setNewContact({
        contactName: '',
        companyName: '',
        email: '',
        phone: '',
        type: 'lead',
        notes: ''
      });
    } catch (error) {
      console.error("Error creating contact:", error);
      toast({ title: "Error", description: "Failed to create contact.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isUserLoading || isLoading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest animate-pulse">Syncing Contacts...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto w-full space-y-8 animate-in fade-in duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
             <div className="h-1 w-8 bg-primary rounded-full" />
             <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Workspace CRM</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900">Private Contacts</h1>
          <p className="text-slate-500 font-medium">Manage your personal ecosystem connections and leads.</p>
        </div>

        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-2xl h-12 px-6 font-bold gap-2 shadow-xl shadow-primary/20">
              <Plus className="h-5 w-5" /> Add Contact
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px] rounded-[2.5rem]">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black">Add New Contact</DialogTitle>
              <DialogDescription>Create a private record for your professional network.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddContact} className="space-y-4 py-4">
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contactName">Full Name</Label>
                  <Input 
                    id="contactName" 
                    required 
                    placeholder="e.g. Jane Doe"
                    value={newContact.contactName}
                    onChange={e => setNewContact({...newContact, contactName: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="company">Company</Label>
                    <Input 
                      id="company" 
                      placeholder="e.g. TabStartup"
                      value={newContact.companyName}
                      onChange={e => setNewContact({...newContact, companyName: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="type">Type</Label>
                    <Select 
                      value={newContact.type} 
                      onValueChange={v => setNewContact({...newContact, type: v})}
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
                      placeholder="jane@example.com"
                      value={newContact.email}
                      onChange={e => setNewContact({...newContact, email: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input 
                      id="phone" 
                      placeholder="+880..."
                      value={newContact.phone}
                      onChange={e => setNewContact({...newContact, phone: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Initial Notes</Label>
                  <Textarea 
                    id="notes" 
                    placeholder="Background info, meeting notes, etc..."
                    value={newContact.notes}
                    onChange={e => setNewContact({...newContact, notes: e.target.value})}
                  />
                </div>
              </div>
              <DialogFooter className="pt-4">
                <Button type="submit" disabled={isSaving} className="w-full rounded-xl h-12 font-bold">
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Save Contact
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <div className="md:col-span-8 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <Input 
            placeholder="Search by name, company, or email..." 
            className="pl-12 h-14 rounded-2xl border-none shadow-sm bg-background text-lg"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="md:col-span-4">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-14 rounded-2xl border-none shadow-sm bg-background px-6 font-bold capitalize">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-slate-400" />
                <SelectValue placeholder="All Types" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {CONTACT_TYPES.map(t => (
                <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!contacts || filteredContacts.length === 0 ? (
        <Card className="border-2 border-dashed rounded-[3rem] bg-background/50 py-32 text-center">
          <CardContent className="space-y-6">
            <div className="p-6 bg-slate-50 rounded-full w-fit mx-auto">
              <UserPlus className="h-16 w-16 text-slate-200" />
            </div>
            <div>
              <p className="text-xl font-black text-slate-900">No contacts found</p>
              <p className="text-slate-500 font-medium">Start building your private network by adding your first contact.</p>
            </div>
            {search || typeFilter !== 'all' ? (
              <Button variant="outline" onClick={() => { setSearch(''); setTypeFilter('all'); }} className="rounded-full">
                Clear Filters
              </Button>
            ) : (
              <Button onClick={() => setIsAddDialogOpen(true)} className="rounded-full px-8 h-12 font-bold">
                Add Your First Contact
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredContacts.map((contact) => (
            <Link key={contact.id} href={`/dashboard/contacts/${contact.id}`}>
              <Card className="group border-none shadow-sm hover:shadow-xl transition-all duration-300 rounded-[2.5rem] overflow-hidden bg-background ring-1 ring-slate-100 h-full flex flex-col">
                <CardHeader className="p-8 pb-4">
                  <div className="flex items-start justify-between mb-4">
                    <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-black text-xl">
                      {contact.contactName.charAt(0)}
                    </div>
                    <Badge variant="secondary" className="capitalize rounded-lg px-2.5 py-0.5 text-[9px] font-black tracking-widest bg-primary/5 text-primary border-none">
                      {contact.type}
                    </Badge>
                  </div>
                  <CardTitle className="text-xl font-black text-slate-900 group-hover:text-primary transition-colors truncate">
                    {contact.contactName}
                  </CardTitle>
                  {contact.companyName && (
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-tight mt-1">
                      <Building2 className="h-3 w-3" /> {contact.companyName}
                    </div>
                  )}
                </CardHeader>
                <CardContent className="p-8 pt-0 flex-1 space-y-4">
                   <div className="space-y-2">
                     {contact.email && (
                        <div className="flex items-center gap-2 text-sm text-slate-600 font-medium">
                          <Mail className="h-3.5 w-3.5 text-slate-400" /> <span className="truncate">{contact.email}</span>
                        </div>
                     )}
                     {contact.phone && (
                        <div className="flex items-center gap-2 text-sm text-slate-600 font-medium">
                          <Phone className="h-3.5 w-3.5 text-slate-400" /> <span>{contact.phone}</span>
                        </div>
                     )}
                   </div>
                   <div className="pt-4 border-t border-slate-50 flex items-center justify-between">
                      <span className="text-[10px] font-black text-slate-300 uppercase tracking-tighter">
                        Updated {contact.updatedAt?.toDate() ? contact.updatedAt.toDate().toLocaleDateString() : 'recently'}
                      </span>
                      <div className="flex items-center text-[10px] font-black text-primary uppercase tracking-[0.2em] opacity-0 group-hover:opacity-100 transition-all translate-x-[-10px] group-hover:translate-x-0">
                         Details <ChevronRight className="h-3 w-3" />
                      </div>
                   </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
