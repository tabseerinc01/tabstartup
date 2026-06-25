
'use client';

import { useState, useEffect } from 'react';
import { useFirestore, useUser, errorEmitter, FirestorePermissionError } from '@/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, serverTimestamp, getDoc } from 'firebase/firestore';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter,
  DialogTrigger
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
import { Loader2, Plus, Zap } from 'lucide-react';
import Link from 'next/link';

const STAGES = ["Lead", "Contacted", "Proposal Sent", "Won", "Lost"];
const BASIC_PLAN_DEAL_LIMIT = 5;

export function NewDealDialog({ editingDeal, onSuccess, trigger }: { editingDeal?: any, onSuccess?: () => void, trigger?: React.ReactNode }) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [contacts, setContacts] = useState<any[]>([]);
  const [activeDealsCount, setActiveDealsCount] = useState(0);
  const [userPlan, setUserPlan] = useState('basic');
  const [isInitialized, setIsInitialized] = useState(false);
  
  const [formData, setFormData] = useState({
    title: '',
    contactId: '',
    value: '',
    currency: 'USD',
    stage: 'Lead',
    description: '',
    expectedCloseDate: ''
  });

  const isLimitReached = !editingDeal && userPlan === 'basic' && activeDealsCount >= BASIC_PLAN_DEAL_LIMIT;

  useEffect(() => {
    if (!isOpen) {
      setIsInitialized(false);
      return;
    }

    if (isOpen && !isInitialized) {
      if (editingDeal) {
        setFormData({
          title: editingDeal.title || '',
          contactId: editingDeal.contactId || '',
          value: editingDeal.value?.toString() || '',
          currency: editingDeal.currency || 'USD',
          stage: editingDeal.stage || 'Lead',
          description: editingDeal.description || '',
          expectedCloseDate: editingDeal.expectedCloseDate || ''
        });
      } else {
        setFormData({
          title: '',
          contactId: '',
          value: '',
          currency: 'USD',
          stage: 'Lead',
          description: '',
          expectedCloseDate: ''
        });
      }
      setIsInitialized(true);
    }
  }, [isOpen, editingDeal, isInitialized]);

  useEffect(() => {
    async function loadWorkspaceData() {
      if (!firestore || !user?.uid || !isOpen) return;
      try {
        const [contactsSnap, userSnap] = await Promise.all([
          getDocs(query(collection(firestore, 'contacts'), where('ownerUid', '==', user.uid))),
          getDoc(doc(firestore, 'users', user.uid))
        ]);
        
        setContacts(contactsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        
        if (userSnap.exists()) {
          setUserPlan(userSnap.data().plan || 'basic');
        }

        // Count only ACTIVE deals for limit enforcement
        const dealsQ = query(
          collection(firestore, 'deals'), 
          where('ownerUid', '==', user.uid)
        );
        const dealsSnap = await getDocs(dealsQ);
        const activeCount = dealsSnap.docs.filter(d => !['Won', 'Lost'].includes(d.data().stage)).length;
        setActiveDealsCount(activeCount);

      } catch (e) {
        console.error("Error loading workspace data for deal:", e);
      }
    }
    loadWorkspaceData();
  }, [firestore, user?.uid, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || !user?.uid || isSaving) return;

    if (isLimitReached) {
      toast({ 
        title: "Limit Reached", 
        description: `Upgrade to Pro to manage more than ${BASIC_PLAN_DEAL_LIMIT} active deals.`, 
        variant: "destructive" 
      });
      return;
    }

    setIsSaving(true);
    const selectedContact = contacts.find(c => c.id === formData.contactId);
    
    const dealData = {
      ...formData,
      value: parseFloat(formData.value) || 0,
      contactName: selectedContact?.contactName || 'Unassigned',
      ownerUid: user.uid,
      updatedAt: serverTimestamp(),
      ...(editingDeal ? {} : { createdAt: serverTimestamp() })
    };

    try {
      if (editingDeal) {
        await updateDoc(doc(firestore, 'deals', editingDeal.id), dealData);
        toast({ title: "Deal Updated" });
      } else {
        await addDoc(collection(firestore, 'deals'), dealData);
        toast({ title: "Deal Created" });
      }
      setIsOpen(false);
      onSuccess?.();
    } catch (error: any) {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: editingDeal ? `deals/${editingDeal.id}` : 'deals',
        operation: editingDeal ? 'update' : 'create',
        requestResourceData: dealData
      }));
    } finally {
      setIsSaving(false);
    }
  };

  const handleValueChange = (val: string) => {
    if (val === '' || /^\d*\.?\d*$/.test(val)) {
      setFormData({ ...formData, value: val });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="rounded-xl h-11 gap-2 shadow-lg shadow-primary/20">
            <Plus className="h-4 w-4" /> New Deal
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[550px] rounded-[2.5rem]">
        {isLimitReached ? (
           <div className="py-12 text-center space-y-6">
              <div className="p-4 bg-primary/10 rounded-full w-fit mx-auto">
                <Zap className="h-12 w-12 text-primary" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-slate-900">Pipeline Limit Reached</h3>
                <p className="text-slate-500 font-medium px-4">
                  Basic Plan is limited to {BASIC_PLAN_DEAL_LIMIT} active deals. 
                  Close existing deals or upgrade to Pro for an unlimited pipeline.
                </p>
              </div>
              <Button className="rounded-xl h-12 px-8 font-bold" asChild>
                <Link href="/dashboard/billing">View Plans & Upgrade</Link>
              </Button>
           </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-2xl font-black">{editingDeal ? 'Edit Deal' : 'Add New Deal'}</DialogTitle>
              <DialogDescription>Capture opportunities and track them in your pipeline.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 py-4">
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dealTitle">Deal Title</Label>
                  <Input 
                    id="dealTitle" 
                    required 
                    placeholder="e.g. Series A Investment"
                    value={formData.title}
                    onChange={e => setFormData({...formData, title: e.target.value})}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="contact">Contact</Label>
                    <Select value={formData.contactId} onValueChange={v => setFormData({...formData, contactId: v})}>
                      <SelectTrigger id="contact">
                        <SelectValue placeholder="Select Contact" />
                      </SelectTrigger>
                      <SelectContent>
                        {contacts.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.contactName}</SelectItem>
                        ))}
                        {contacts.length === 0 && <SelectItem value="none" disabled>No contacts found</SelectItem>}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="stage">Current Stage</Label>
                    <Select value={formData.stage} onValueChange={v => setFormData({...formData, stage: v})}>
                      <SelectTrigger id="stage">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STAGES.map(s => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="value">Deal Value</Label>
                    <div className="relative">
                       <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">$</span>
                       <Input 
                        id="value" 
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        className="pl-7"
                        value={formData.value}
                        onChange={e => handleValueChange(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="closeDate">Expected Close</Label>
                    <Input 
                      id="closeDate" 
                      type="date"
                      value={formData.expectedCloseDate}
                      onChange={e => setFormData({...formData, expectedCloseDate: e.target.value})}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="desc">Description & Strategy</Label>
                  <Textarea 
                    id="desc" 
                    rows={3}
                    placeholder="What is the key to winning this deal?"
                    value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                  />
                </div>
              </div>
              <DialogFooter className="pt-4">
                <Button type="submit" disabled={isSaving} className="w-full rounded-xl h-12 font-black">
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {editingDeal ? 'Update Deal' : 'Start Deal'}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
