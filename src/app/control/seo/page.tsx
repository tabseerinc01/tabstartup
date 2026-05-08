'use client';

import { useState, useEffect } from 'react';
import { useFirestore, errorEmitter, FirestorePermissionError } from '@/firebase';
import { 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  query,
  orderBy 
} from 'firebase/firestore';
import { 
  Globe, 
  Plus, 
  Loader2, 
  Pencil, 
  Trash2, 
  ExternalLink, 
  Activity,
  FileText,
  Search,
  Settings2
} from 'lucide-react';
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
import Link from 'next/link';
import { cn } from '@/lib/utils';

const PAGE_TYPES = ["startup", "cofounder", "investor", "service"];

export default function SEOManagementPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [pages, setPages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingPage, setEditingPage] = useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const [formData, setFormData] = useState({
    slug: '',
    type: 'startup',
    title: '',
    metaDescription: '',
    h1: '',
    intro: '',
    status: 'active'
  });

  const fetchPages = async () => {
    if (!firestore) return;
    setIsLoading(true);
    try {
      const q = query(collection(firestore, 'seoPages'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setPages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: 'seoPages',
        operation: 'list',
      }));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPages();
  }, [firestore]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore) return;

    setIsSubmitting(true);
    try {
      if (editingPage) {
        await updateDoc(doc(firestore, 'seoPages', editingPage.id), {
          ...formData,
          updatedAt: serverTimestamp()
        });
        toast({ title: "SEO Page Updated" });
      } else {
        await addDoc(collection(firestore, 'seoPages'), {
          ...formData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        toast({ title: "SEO Page Created" });
      }
      setIsDialogOpen(false);
      setEditingPage(null);
      resetForm();
      fetchPages();
    } catch (error) {
      toast({ title: "Operation Failed", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!firestore || !confirm("Delete this SEO hub? This will break any existing external links.")) return;
    try {
      await deleteDoc(doc(firestore, 'seoPages', id));
      setPages(prev => prev.filter(p => p.id !== id));
      toast({ title: "Page Removed" });
    } catch (error) {
      toast({ title: "Delete Failed", variant: "destructive" });
    }
  };

  const resetForm = () => {
    setFormData({
      slug: '',
      type: 'startup',
      title: '',
      metaDescription: '',
      h1: '',
      intro: '',
      status: 'active'
    });
  };

  const startEdit = (page: any) => {
    setEditingPage(page);
    setFormData({
      slug: page.slug || '',
      type: page.type || 'startup',
      title: page.title || '',
      metaDescription: page.metaDescription || '',
      h1: page.h1 || '',
      intro: page.intro || '',
      status: page.status || 'active'
    });
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3">
            <Globe className="h-8 w-8 text-primary" /> Dynamic SEO Hubs
          </h1>
          <p className="text-slate-500 font-medium">Manage curated discovery pages and search engine visibility.</p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setEditingPage(null);
            resetForm();
          }
        }}>
          <DialogTrigger asChild>
            <Button className="rounded-xl h-11 gap-2 shadow-lg shadow-primary/20">
              <Plus className="h-5 w-5" /> Create SEO Page
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto rounded-[2rem]">
            <DialogHeader>
              <DialogTitle>{editingPage ? 'Edit SEO Hub' : 'Create SEO Hub'}</DialogTitle>
              <DialogDescription>Configure indexing parameters and curated content.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="slug">URL Slug</Label>
                  <Input 
                    id="slug" 
                    required 
                    placeholder="e.g. fintech-startups" 
                    value={formData.slug} 
                    onChange={e => setFormData({...formData, slug: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="type">Page Type</Label>
                  <Select value={formData.type} onValueChange={v => setFormData({...formData, type: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAGE_TYPES.map(t => (
                        <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="title">Meta Title</Label>
                <Input 
                  id="title" 
                  required 
                  placeholder="Appears in browser tab and search results" 
                  value={formData.title} 
                  onChange={e => setFormData({...formData, title: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="h1">H1 Heading</Label>
                <Input 
                  id="h1" 
                  required 
                  placeholder="Main page title displayed to users" 
                  value={formData.h1} 
                  onChange={e => setFormData({...formData, h1: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="meta">Meta Description</Label>
                <Textarea 
                  id="meta" 
                  rows={2} 
                  placeholder="Brief summary for search engine snippets..." 
                  value={formData.metaDescription} 
                  onChange={e => setFormData({...formData, metaDescription: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="intro">Intro Content (SEO Body)</Label>
                <Textarea 
                  id="intro" 
                  rows={5} 
                  placeholder="2-3 paragraphs describing this niche..." 
                  value={formData.intro} 
                  onChange={e => setFormData({...formData, intro: e.target.value})}
                />
              </div>

              <div className="space-y-2 pt-2">
                <Label>Indexing Status</Label>
                <Select value={formData.status} onValueChange={v => setFormData({...formData, status: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active (Visible & Indexed)</SelectItem>
                    <SelectItem value="inactive">Inactive (Hidden)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter className="pt-4">
                <Button type="submit" disabled={isSubmitting} className="w-full rounded-xl h-12">
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {editingPage ? 'Update Directory' : 'Publish Directory'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-none shadow-sm rounded-[2.5rem] overflow-hidden bg-white">
        <CardHeader className="px-8 py-8 border-b border-slate-50 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xl">Directory Registry</CardTitle>
            <CardDescription>Manage indexing and automated content generation for platform niches.</CardDescription>
          </div>
          <Badge variant="outline" className="h-8 rounded-lg px-3 bg-slate-50 text-slate-600 border-slate-200 font-bold">
            {pages.length} Configured Hubs
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow className="border-none hover:bg-transparent">
                <TableHead className="pl-8 h-12 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Page Title & Slug</TableHead>
                <TableHead className="h-12 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Type</TableHead>
                <TableHead className="h-12 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Created</TableHead>
                <TableHead className="h-12 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Status</TableHead>
                <TableHead className="h-12 font-bold text-slate-500 uppercase text-[10px] tracking-widest text-right pr-8">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-64 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary opacity-20" />
                  </TableCell>
                </TableRow>
              ) : pages.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-64 text-center text-slate-400 font-medium italic">
                    No SEO pages found. Seed them from the Overview or create one above.
                  </TableCell>
                </TableRow>
              ) : (
                pages.map((p) => {
                  const createdAt = p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt);
                  return (
                    <TableRow key={p.id} className="group border-b border-slate-50 hover:bg-slate-50/30 transition-colors">
                      <TableCell className="pl-8 py-5">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900 block truncate max-w-[280px]">{p.title}</span>
                          <code className="text-[10px] text-primary font-mono mt-0.5">/seo/{p.slug}</code>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="rounded-lg bg-slate-50 text-[10px] border-slate-200 font-bold uppercase py-0.5 px-2">
                          {p.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                         <div className="flex flex-col text-[11px] font-medium text-slate-500">
                           <span>{createdAt.toLocaleDateString()}</span>
                           <span className="opacity-60">{createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                         </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn(
                          "rounded-lg text-[10px] border-none font-bold uppercase py-0.5 px-2 flex w-fit items-center gap-1",
                          p.status === 'active' ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-400"
                        )}>
                          <Activity className="h-2.5 w-2.5" />
                          {p.status || 'Active'}
                        </Badge>
                      </TableCell>
                      <TableCell className="pr-8 text-right">
                        <div className="flex justify-end gap-2">
                          {p.status === 'active' && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-primary/5" asChild>
                              <Link href={`/seo/${p.slug}`} target="_blank">
                                <ExternalLink className="h-4 w-4" />
                              </Link>
                            </Button>
                          )}
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 rounded-lg hover:bg-blue-50 hover:text-blue-600"
                            onClick={() => startEdit(p)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 rounded-lg hover:bg-destructive/5 hover:text-destructive"
                            onClick={() => handleDelete(p.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

