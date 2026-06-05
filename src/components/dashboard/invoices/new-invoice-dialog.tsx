
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, FileText, Hash, Banknote, Trash2, Package, Smartphone } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

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
    productType: 'Digital',
    currency: 'USD',
    status: 'Draft',
    description: '',
    issueDate: new Date().toISOString().split('T')[0],
    dueDate: ''
  });

  const [items, setItems] = useState<any[]>([
    { id: '1', description: '', quantity: 1, unitPrice: 0, total: 0 }
  ]);

  const totalAmount = items.reduce((acc, item) => acc + (item.total || 0), 0);

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
          productType: editingInvoice.productType || 'Digital',
          currency: editingInvoice.currency || 'USD',
          status: editingInvoice.status || 'Draft',
          description: editingInvoice.description || '',
          issueDate: editingInvoice.issueDate || '',
          dueDate: editingInvoice.dueDate || ''
        });
        if (editingInvoice.items) {
          setItems(editingInvoice.items.map((it: any, idx: number) => ({ ...it, id: idx.toString() })));
        }
      } else if (initialData) {
        setFormData(prev => ({
          ...prev,
          contactId: initialData.contactId || '',
          title: initialData.title || '',
          currency: initialData.currency || 'USD',
          description: initialData.description || ''
        }));
        setItems([{ id: '1', description: initialData.description || '', quantity: 1, unitPrice: initialData.amount || 0, total: initialData.amount || 0 }]);
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

  const addItem = () => {
    setItems([...items, { id: Math.random().toString(), description: '', quantity: 1, unitPrice: 0, total: 0 }]);
  };

  const removeItem = (id: string) => {
    if (items.length === 1) return;
    setItems(items.filter(i => i.id !== id));
  };

  const updateItem = (id: string, field: string, value: any) => {
    setItems(items.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        if (field === 'quantity' || field === 'unitPrice') {
          updated.total = (parseFloat(updated.quantity) || 0) * (parseFloat(updated.unitPrice) || 0);
        }
        return updated;
      }
      return item;
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || !user?.uid || isSaving) return;

    setIsSaving(true);
    const selectedContact = contacts.find(c => c.id === formData.contactId);
    
    const invoiceData = {
      ...formData,
      items: items.map(({ id, ...rest }) => rest), // Remove internal UI IDs
      amount: totalAmount,
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
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto rounded-[2.5rem]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black">
            {editingInvoice ? 'Update Invoice' : 'Create Invoice'}
          </DialogTitle>
          <DialogDescription>Generate a billing document with detailed items.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="space-y-4">
            <Label className="text-[10px] font-black uppercase tracking-widest text-primary">Product Categorization</Label>
            <RadioGroup 
              value={formData.productType} 
              onValueChange={v => setFormData({...formData, productType: v})}
              className="grid grid-cols-2 gap-4"
            >
              <div>
                <RadioGroupItem value="Digital" id="digital" className="peer sr-only" />
                <Label
                  htmlFor="digital"
                  className="flex flex-col items-center justify-between rounded-xl border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer transition-all"
                >
                  <Smartphone className="mb-2 h-6 w-6" />
                  <span className="text-xs font-bold uppercase tracking-tight">Digital Product</span>
                </Label>
              </div>
              <div>
                <RadioGroupItem value="Physical" id="physical" className="peer sr-only" />
                <Label
                  htmlFor="physical"
                  className="flex flex-col items-center justify-between rounded-xl border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer transition-all"
                >
                  <Package className="mb-2 h-6 w-6" />
                  <span className="text-xs font-bold uppercase tracking-tight">Physical Product</span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="grid grid-cols-2 gap-4">
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Invoice Title</Label>
            <Input 
              id="title" 
              required 
              placeholder="e.g. Q1 Service Delivery"
              value={formData.title}
              onChange={e => setFormData({...formData, title: e.target.value})}
            />
          </div>

          {/* Line Items Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] font-black uppercase tracking-widest text-primary">Billable Items</Label>
              <Button type="button" variant="outline" size="sm" onClick={addItem} className="rounded-xl h-8 gap-1.5 font-bold text-[10px]">
                <Plus className="h-3.5 w-3.5" /> Add Item
              </Button>
            </div>
            
            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={item.id} className="grid grid-cols-12 gap-3 items-end bg-slate-50/50 p-4 rounded-2xl border border-slate-100 ring-1 ring-slate-100">
                  <div className="col-span-12 md:col-span-6 space-y-1.5">
                    <Label className="text-[9px] font-bold uppercase text-slate-400">Description</Label>
                    <Input 
                      placeholder="Product or service details..."
                      value={item.description}
                      onChange={e => updateItem(item.id, 'description', e.target.value)}
                    />
                  </div>
                  <div className="col-span-4 md:col-span-2 space-y-1.5">
                    <Label className="text-[9px] font-bold uppercase text-slate-400">Qty</Label>
                    <Input 
                      type="number" 
                      min="1"
                      value={item.quantity}
                      onChange={e => updateItem(item.id, 'quantity', e.target.value)}
                    />
                  </div>
                  <div className="col-span-4 md:col-span-2 space-y-1.5">
                    <Label className="text-[9px] font-bold uppercase text-slate-400">Price</Label>
                    <Input 
                      type="number" 
                      placeholder="0.00"
                      value={item.unitPrice}
                      onChange={e => updateItem(item.id, 'unitPrice', e.target.value)}
                    />
                  </div>
                  <div className="col-span-4 md:col-span-2 flex items-center justify-end">
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => removeItem(item.id)}
                      className="text-slate-300 hover:text-destructive h-10 w-10"
                      disabled={items.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="issue">Issue Date</Label>
              <Input id="issue" type="date" required value={formData.issueDate} onChange={e => setFormData({...formData, issueDate: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="due">Due Date</Label>
              <Input id="due" type="date" required value={formData.dueDate} onChange={e => setFormData({...formData, dueDate: e.target.value})} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Select value={formData.currency} onValueChange={v => setFormData({...formData, currency: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
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
          </div>

          <div className="bg-primary/5 p-6 rounded-[2rem] border border-primary/10 flex justify-between items-center">
             <div>
               <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Total Summary</p>
               <h4 className="text-3xl font-black text-slate-900">{formData.currency} {totalAmount.toLocaleString()}</h4>
             </div>
             <div className="text-right">
               <p className="text-[9px] font-bold text-slate-400 uppercase">Items Count</p>
               <p className="text-lg font-black text-slate-700">{items.length}</p>
             </div>
          </div>

          <DialogFooter className="pt-4">
            <Button type="submit" disabled={isSaving} className="w-full rounded-xl h-12 font-black">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
              {editingInvoice ? 'Update Invoice' : 'Generate Invoice'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
