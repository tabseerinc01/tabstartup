'use client';

import { useState, useEffect } from 'react';
import { useFirestore, useUser, errorEmitter, FirestorePermissionError } from '@/firebase';
import { 
  collection, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  doc, 
  addDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { Wrench, Loader2, Pencil, Trash2, Plus, HandCoins, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from '@/hooks/use-toast';

const CATEGORIES = ["Legal", "Design", "Marketing", "Consulting", "Technology", "Finance"];

export default function ServiceCatalogPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  
  const [allServices, setAllServices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingService, setEditingService] = useState<any>(null);
  const [isUpdatingService, setIsUpdatingService] = useState(false);
  
  const [isAddingService, setIsAddingService] = useState(false);
  const [isCreatingService, setIsCreatingService] = useState(false);
  const [newService, setNewService] = useState({
    title: '',
    description: '',
    category: '',
    price: ''
  });

  const fetchData = async () => {
    if (!firestore) return;
    setIsLoading(true);
    try {
      const svSnap = await getDocs(collection(firestore, 'services'));
      setAllServices(svSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (serverError) {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: 'services',
        operation: 'list',
      }));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [firestore]);

  const handleAddService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || !user) return;

    setIsCreatingService(true);
    try {
      const serviceData = {
        ...newService,
        providerName: user.displayName || user.email?.split('@')[0] || "Admin",
        providerUid: user.uid,
        status: "active",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await addDoc(collection(firestore, 'services'), serviceData);
      
      toast({ title: "Service Created Successfully" });
      setIsAddingService(false);
      setNewService({ title: '', description: '', category: '', price: '' });
      fetchData(); // Refresh list
    } catch (error) {
      toast({ title: "Creation Failed", variant: "destructive" });
    } finally {
      setIsCreatingService(false);
    }
  };

  const handleDeleteService = async (serviceId: string) => {
    if (!firestore) return;
    if (!confirm("Are you sure you want to delete this service listing? This action cannot be undone.")) return;

    try {
      await deleteDoc(doc(firestore, 'services', serviceId));
      setAllServices(prev => prev.filter(s => s.id !== serviceId));
      toast({ title: "Service Listing Removed" });
    } catch (error) {
      toast({ title: "Delete Failed", variant: "destructive" });
    }
  };

  const handleUpdateService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || !editingService) return;

    setIsUpdatingService(true);
    try {
      const { id, ...data } = editingService;
      await updateDoc(doc(firestore, 'services', id), {
        ...data,
        updatedAt: serverTimestamp()
      });

      setAllServices(prev => prev.map(s => s.id === id ? editingService : s));
      toast({ title: "Service Details Updated" });
      setEditingService(null);
    } catch (error) {
      toast({ title: "Update Failed", variant: "destructive" });
    } finally {
      setIsUpdatingService(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3">
            <Wrench className="h-8 w-8 text-primary" /> Service Catalog
          </h1>
          <p className="text-slate-500 font-medium">Moderate professional startup services and provider listings.</p>
        </div>

        <Dialog open={isAddingService} onOpenChange={setIsAddingService}>
          <DialogTrigger asChild>
            <Button className="rounded-xl h-11 gap-2 shadow-lg shadow-primary/20">
              <Plus className="h-5 w-5" /> Add New Service
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Add Professional Service</DialogTitle>
              <DialogDescription>Register a new service offering in the marketplace.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddService} className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="new-title">Service Title</Label>
                <Input 
                  id="new-title" 
                  required
                  placeholder="e.g. Legal Compliance Audit"
                  value={newService.title} 
                  onChange={e => setNewService({...newService, title: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="new-category">Category</Label>
                  <Select 
                    value={newService.category} 
                    onValueChange={v => setNewService({...newService, category: v})}
                  >
                    <SelectTrigger id="new-category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-price">Price</Label>
                  <Input 
                    id="new-price" 
                    placeholder="e.g. $150/hr"
                    value={newService.price} 
                    onChange={e => setNewService({...newService, price: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-desc">Description</Label>
                <Textarea 
                  id="new-desc" 
                  required
                  placeholder="Provide details about what the service includes..."
                  rows={4}
                  value={newService.description} 
                  onChange={e => setNewService({...newService, description: e.target.value})}
                />
              </div>
              <DialogFooter className="pt-4">
                <Button type="submit" disabled={isCreatingService} className="w-full">
                  {isCreatingService ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Publish Service
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-none shadow-sm rounded-[2.5rem] overflow-hidden bg-white">
        <CardHeader className="px-8 py-8 border-b border-slate-50 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xl">Marketplace Listings</CardTitle>
            <CardDescription>Manage professional support offerings within the TabStartup ecosystem.</CardDescription>
          </div>
          <Badge variant="outline" className="h-8 rounded-lg px-3 bg-slate-50 text-slate-600 border-slate-200 font-bold">
            {allServices.length} Active Listings
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow className="border-none hover:bg-transparent">
                <TableHead className="pl-8 h-12 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Service Title</TableHead>
                <TableHead className="h-12 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Category</TableHead>
                <TableHead className="h-12 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Provider</TableHead>
                <TableHead className="h-12 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Status</TableHead>
                <TableHead className="h-12 font-bold text-slate-500 uppercase text-[10px] tracking-widest text-right pr-8">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary opacity-20" />
                  </TableCell>
                </TableRow>
              ) : allServices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-slate-400 font-medium italic">
                    No services found in the marketplace.
                  </TableCell>
                </TableRow>
              ) : (
                allServices.map((s) => (
                  <TableRow key={s.id} className="group border-b border-slate-50 hover:bg-slate-50/30 transition-colors">
                    <TableCell className="pl-8 py-5">
                      <span className="font-bold text-slate-900 block">{s.title}</span>
                      <div className="flex items-center gap-1.5 mt-0.5 opacity-60">
                        <HandCoins className="h-3 w-3" />
                        <p className="text-[10px] font-bold uppercase tracking-widest">Fee: {s.price || 'TBD'}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="rounded-lg bg-slate-50 text-[10px] border-slate-200 font-bold uppercase py-0.5 px-2">
                        {s.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">
                          {s.providerName?.charAt(0)}
                        </div>
                        <span className="text-sm font-medium text-slate-600">{s.providerName}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="rounded-lg bg-green-50 text-[10px] border-green-200 text-green-700 font-bold uppercase py-0.5 px-2 flex w-fit items-center gap-1">
                        <Activity className="h-2.5 w-2.5" />
                        {s.status || 'Active'}
                      </Badge>
                    </TableCell>
                    <TableCell className="pr-8 text-right">
                      <div className="flex justify-end gap-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 rounded-lg hover:bg-blue-50 hover:text-blue-600"
                              onClick={() => setEditingService(s)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-[500px]">
                            <DialogHeader>
                              <DialogTitle>Edit Service Listing</DialogTitle>
                              <DialogDescription>Modify the service details for the public marketplace.</DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleUpdateService} className="space-y-4 py-4">
                              <div className="space-y-2">
                                <Label htmlFor="title">Service Title</Label>
                                <Input 
                                  id="title" 
                                  value={editingService?.title || ''} 
                                  onChange={e => setEditingService({...editingService, title: e.target.value})}
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label htmlFor="category">Category</Label>
                                  <Select 
                                    value={editingService?.category || ''} 
                                    onValueChange={v => setEditingService({...editingService, category: v})}
                                  >
                                    <SelectTrigger id="category">
                                      <SelectValue placeholder="Select category" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {CATEGORIES.map(cat => (
                                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="price">Price</Label>
                                  <Input 
                                    id="price" 
                                    value={editingService?.price || ''} 
                                    onChange={e => setEditingService({...editingService, price: e.target.value})}
                                  />
                                </div>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="desc">Description</Label>
                                <Textarea 
                                  id="desc" 
                                  rows={4}
                                  value={editingService?.description || ''} 
                                  onChange={e => setEditingService({...editingService, description: e.target.value})}
                                />
                              </div>
                              <DialogFooter className="pt-4">
                                <Button type="submit" disabled={isUpdatingService} className="w-full">
                                  {isUpdatingService ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                  Save Changes
                                </Button>
                              </DialogFooter>
                            </form>
                          </DialogContent>
                        </Dialog>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 rounded-lg hover:bg-destructive/5 hover:text-destructive"
                          onClick={() => handleDeleteService(s.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
