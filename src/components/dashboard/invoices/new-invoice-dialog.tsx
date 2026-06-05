
'use client';

import { useState, useEffect } from 'react';
import { useFirestore, useUser, errorEmitter, FirestorePermissionError } from '@/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
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
import { Loader2, Plus, FileText, Calendar, Hash, Banknote } from 'lucide-react';

const STATUSES = ["Draft", "Sent", "Paid", "Overdue", "Cancelled"];
const CURRENCIES = ["USD", "BDT", "EUR", "GBP"];

interface NewInvoiceDialogProps {
  editingInvoice?: any;
  onSuccess?: () => void;
  trigger?: React.ReactNode;
  initialData?: {
    contactId?: string;
    contactName?: string;
    title?: string;
    amount?: number;
    currency?: string;
    description?: string;
  };
}

export function NewInvoiceDialog({ editingInvoice, onSuccess, trigger, initialData }: NewInvoiceDialogProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [contacts, setContacts] = useState<any[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  
  const [formData, setFormData] = useState({
    invoiceNumber: `INV-${Math.floor(1000 + Math.random() * 9000)}`,
    contactId: '',
    title: '',
    amount: '',
    currency: 'USD',
    status: 'Draft',
    description: '',
    issueDate: new Date().toISOString().split('T')[0],
    dueDate: ''
  });

  useEffect(() => {
    if (!isOpen) {
      setIsInitialized(false);
      return;
    }

    if (isOpen && !isInitialized) {
      if (editingInvoice) {
        setFormData({
          invoiceNumber: editingInvoice.invoiceNumber || '',
          contactId: editingInvoice.contactId || '',
          title: editingInvoice.title || '',
          amount: editingInvoice.amount?.toString() || '',
          currency: editingInvoice.currency || 'USD',
          status: editingInvoice.status || 'Draft',
          description: editingInvoice.description || '',
          issueDate: editingInvoice.issueDate || '',
          dueDate: editingInvoice.dueDate || ''
        });
      } else if (initialData) {
        setFormData(prev => ({
          ...prev,
          contactId: initialData.contactId || '',
          title: initialData.title || '',
          amount: initialData.amount?.toString() || '',
          currency: initialData.currency || 'USD',
          description: initialData.description || ''
        }));
      }
      setIsInitialized(true);
    }
  }, [isOpen, editingInvoice, isInitialized, initialData]);

  useEffect(() => {
    async function loadContacts() {
      if (!firestore || !user?.uid || !isOpen) return;
      try {
        const q = query(collection(firestore, 'contacts'), where('ownerUid', '==', user.uid));
        const snap = await getDocs(q);
        setContacts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error("Error loading contacts for invoice:", e);
      }
    }
    loadContacts();
  }, [firestore, user?.uid, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || !user?.uid || isSaving) return;

    setIsSaving(true);
    const selectedContact = contacts.find(c => c.id === formData.contactId);
    
    const invoiceData = {
      ...formData,
      amount: parseFloat(formData.amount) || 0,
      contactName: selectedContact?.contactName || 'Private Client',
      ownerUid: user.uid,
      updatedAt: serverTimestamp(),
      ...(editingInvoice ? {} : { createdAt: serverTimestamp() })
    };

    try {
      if (editingInvoice) {
        await updateDoc(doc(firestore, 'invoices', editingInvoice.id), invoiceData);
        toast({ title: "Invoice Updated" });
      } else {
        await addDoc(collection(firestore, 'invoices'), invoiceData);
        toast({ title: "Invoice Created" });
      }
      setIsOpen(false);
      onSuccess?.();
    } catch (error: any) {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: editingInvoice ? `invoices/${editingInvoice.id}` : 'invoices',
        operation: editingInvoice ? 'update' : 'create',
        requestResourceData: invoiceData
      }));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="rounded-xl h-11 gap-2 shadow-lg shadow-primary/20">
            <Plus className="h-4 w-4" /> New Invoice
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] rounded-[2.5rem]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black">
            {editingInvoice ? 'Update Invoice' : 'Create Invoice'}
          </DialogTitle>
          <DialogDescription>Generate a billing document for your services or deals.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="invNum">Invoice #</Label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input 
                  id="invNum" 
                  required 
                  className="pl-10"
                  value={formData.invoiceNumber}
                  onChange={e => setFormData({...formData, invoiceNumber: e.target.value})}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact">Client / Contact</Label>
              <Select value={formData.contactId} onValueChange={v => setFormData({...formData, contactId: v})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Client" />
                </SelectTrigger>
                <SelectContent>
                  {contacts.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.contactName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Invoice Title</Label>
            <Input 
              id="title" 
              required 
              placeholder="e.g. Design Services - Phase 1"
              value={formData.title}
              onChange={e => setFormData({...formData, title: e.target.value})}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Total Amount</Label>
              <div className="relative">
                <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input 
                  id="amount" 
                  type="number"
                  required
                  className="pl-10"
                  placeholder="0.00"
                  value={formData.amount}
                  onChange={e => setFormData({...formData, amount: e.target.value})}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Select value={formData.currency} onValueChange={v => setFormData({...formData, currency: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="issue">Issue Date</Label>
              <Input 
                id="issue" 
                type="date"
                required
                value={formData.issueDate}
                onChange={e => setFormData({...formData, issueDate: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="due">Due Date</Label>
              <Input 
                id="due" 
                type="date"
                required
                value={formData.dueDate}
                onChange={e => setFormData({...formData, dueDate: e.target.value})}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Current Status</Label>
            <Select value={formData.status} onValueChange={v => setFormData({...formData, status: v})}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="desc">Notes / Description</Label>
            <Textarea 
              id="desc" 
              rows={3}
              placeholder="Payment instructions, bank details, or itemized list..."
              value={formData.description}
              onChange={e => setFormData({...formData, description: e.target.value})}
            />
          </div>

          <DialogFooter className="pt-4">
            <Button type="submit" disabled={isSaving} className="w-full rounded-xl h-12 font-black">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
              {editingInvoice ? 'Update Invoice' : 'Save Invoice'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
