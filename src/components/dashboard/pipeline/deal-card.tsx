
'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  GripVertical, 
  MoreVertical, 
  Calendar, 
  User,
  Trash2,
  Pencil,
  ArrowUpRight
} from 'lucide-react';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { NewDealDialog } from './new-deal-dialog';
import { format } from 'date-fns';
import Link from 'next/link';

export function DealCard({ deal, onDelete }: { deal: any, onDelete: (id: string) => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: deal.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 1,
  };

  const formattedValue = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: deal.currency || 'USD',
    maximumFractionDigits: 0
  }).format(deal.value || 0);

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <Card className="group relative border-none shadow-sm hover:shadow-md transition-all bg-background rounded-2xl overflow-hidden ring-1 ring-slate-100 mb-3">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
               <button 
                className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-400 p-1 rounded-md transition-colors shrink-0"
                {...listeners}
               >
                 <GripVertical className="h-4 w-4" />
               </button>
               <Link href={`/dashboard/pipeline/${deal.id}`} className="block flex-1 min-w-0">
                  <h4 className="font-bold text-slate-900 truncate group-hover:text-primary transition-colors flex items-center gap-1.5">
                    {deal.title}
                    <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-all text-primary" />
                  </h4>
               </Link>
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-1 rounded-md hover:bg-slate-50 text-slate-400 shrink-0">
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-xl">
                <NewDealDialog 
                  editingDeal={deal} 
                  trigger={
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="gap-2 cursor-pointer rounded-lg m-1">
                      <Pencil className="h-4 w-4" /> Edit Deal
                    </DropdownMenuItem>
                  } 
                />
                <DropdownMenuItem onClick={() => onDelete(deal.id)} className="gap-2 cursor-pointer text-destructive focus:text-destructive rounded-lg m-1">
                  <Trash2 className="h-4 w-4" /> Delete Deal
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <Link href={`/dashboard/pipeline/${deal.id}`}>
            <div className="mt-4 space-y-3">
               <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500 uppercase tracking-tight">
                  <User className="h-3 w-3 text-slate-400" />
                  <span className="truncate">{deal.contactName}</span>
               </div>

               <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-50">
                  <div className="flex items-center gap-1 text-primary font-black text-sm">
                     {formattedValue}
                  </div>
                  {deal.expectedCloseDate && (
                    <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400 uppercase">
                      <Calendar className="h-2.5 w-2.5" />
                      {format(new Date(deal.expectedCloseDate), 'MMM d')}
                    </div>
                  )}
               </div>
            </div>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
