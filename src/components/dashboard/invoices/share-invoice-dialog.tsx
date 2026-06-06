
'use client';

import { useState } from 'react';
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
import { useToast } from '@/hooks/use-toast';
import { Share2, Copy, Mail, Check, Link as LinkIcon, ExternalLink } from 'lucide-react';

interface ShareInvoiceDialogProps {
  invoice: any;
}

export function ShareInvoiceDialog({ invoice }: ShareInvoiceDialogProps) {
  const { toast } = useToast();
  const [isCopied, setIsCopied] = useState(false);

  // Generate public link
  const publicUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/invoices/${invoice.id}` 
    : '';

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicUrl);
    setIsCopied(true);
    toast({ title: "Link Copied", description: "You can now share this link with your client." });
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleEmailShare = () => {
    const subject = encodeURIComponent(`Invoice #${invoice.invoiceNumber} from ${invoice.billFromName}`);
    const body = encodeURIComponent(
      `Hello,\n\nPlease find the invoice #${invoice.invoiceNumber} for your review at the following link:\n\n${publicUrl}\n\nTotal Amount: ${invoice.currency} ${invoice.amount.toLocaleString()}\nDue Date: ${invoice.dueDate || 'N/A'}\n\nThank you,\n${invoice.billFromName}`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="rounded-xl h-11 gap-2 font-bold border-primary/20 text-primary hover:bg-primary/5">
          <Share2 className="h-4 w-4" /> Share
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[450px] rounded-[2.5rem]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black">Share Invoice</DialogTitle>
          <DialogDescription>
            Give your client a secure link to view and download this invoice.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Public Access Link</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input 
                  readOnly 
                  value={publicUrl} 
                  className="pl-10 bg-slate-50 border-none rounded-xl text-xs h-11"
                />
              </div>
              <Button 
                onClick={handleCopyLink} 
                className="rounded-xl h-11 px-4 font-bold shadow-lg shadow-primary/20"
              >
                {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button 
              variant="outline" 
              onClick={handleEmailShare}
              className="rounded-xl h-14 flex-col gap-1 border-slate-100 hover:bg-slate-50 font-bold"
            >
              <Mail className="h-5 w-5 text-primary" />
              <span className="text-[10px] uppercase">Email Client</span>
            </Button>
            <Button 
              variant="outline" 
              onClick={() => window.open(publicUrl, '_blank')}
              className="rounded-xl h-14 flex-col gap-1 border-slate-100 hover:bg-slate-50 font-bold"
            >
              <ExternalLink className="h-5 w-5 text-slate-400" />
              <span className="text-[10px] uppercase">Preview Link</span>
            </Button>
          </div>

          <div className="bg-primary/5 p-5 rounded-2xl border border-primary/10">
            <p className="text-[10px] font-medium text-primary leading-relaxed text-center italic">
              "Future payment collection will be integrated here, allowing you to trace receipts directly from the share link."
            </p>
          </div>
        </div>
        
        <DialogFooter className="sm:justify-center">
          <p className="text-[9px] font-bold text-slate-300 uppercase tracking-tighter">
            Invoice Identity: {invoice.id}
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
