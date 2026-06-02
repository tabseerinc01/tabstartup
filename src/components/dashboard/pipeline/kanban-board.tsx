
'use client';

import { useState, useMemo } from 'react';
import { 
  DndContext, 
  DragOverlay, 
  closestCorners, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors, 
  DragStart,
  DragEnd,
  defaultDropAnimationSideEffects,
  useDroppable
} from '@dnd-kit/core';
import { 
  SortableContext, 
  sortableKeyboardCoordinates, 
  verticalListSortingStrategy 
} from '@dnd-kit/sortable';
import { DealCard } from './deal-card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const STAGES = ["Lead", "Contacted", "Proposal Sent", "Won", "Lost"];

function DroppableColumn({ id, deals, onDeleteDeal }: { id: string, deals: any[], onDeleteDeal: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({
    id: id,
  });

  return (
    <div className="flex-shrink-0 w-80 flex flex-col gap-4">
      <div className="flex items-center justify-between px-2">
         <div className="flex items-center gap-2">
            <div className={cn(
              "h-2 w-2 rounded-full",
              id === 'Won' ? 'bg-green-500' :
              id === 'Lost' ? 'bg-red-500' :
              'bg-primary'
            )} />
            <h3 className="font-black text-slate-900 uppercase text-[11px] tracking-[0.1em]">{id}</h3>
         </div>
         <Badge variant="secondary" className="bg-slate-100 text-slate-500 border-none h-5 px-2 font-bold text-[10px]">
           {deals.length}
         </Badge>
      </div>
      
      <div 
        ref={setNodeRef}
        className={cn(
          "flex-1 bg-slate-50/50 rounded-[2rem] p-3 ring-1 ring-slate-100/50 overflow-y-auto transition-colors",
          isOver && "bg-primary/5 ring-primary/20"
        )}
      >
         <SortableContext 
          id={id}
          items={deals.map(d => d.id)}
          strategy={verticalListSortingStrategy}
         >
           <div className="flex flex-col gap-3 min-h-[150px]">
             {deals.map((deal) => (
               <DealCard key={deal.id} deal={deal} onDelete={onDeleteDeal} />
             ))}
             
             {deals.length === 0 && (
               <div className="h-32 flex items-center justify-center text-[10px] font-bold text-slate-300 uppercase tracking-widest border-2 border-dashed border-slate-100 rounded-2xl">
                  Drop deals here
               </div>
             )}
           </div>
         </SortableContext>
      </div>
    </div>
  );
}

export function KanbanBoard({ deals, onMoveDeal, onDeleteDeal }: { 
  deals: any[], 
  onMoveDeal: (dealId: string, newStage: string) => void,
  onDeleteDeal: (id: string) => void
}) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const activeDeal = useMemo(() => {
    return deals.find(d => d.id === activeId);
  }, [deals, activeId]);

  function handleDragStart(event: DragStart) {
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEnd) {
    const { active, over } = event;
    
    if (!over) {
      setActiveId(null);
      return;
    }

    const activeDeal = deals.find(d => d.id === active.id);
    if (!activeDeal) {
      setActiveId(null);
      return;
    }

    // Identify the new stage. 
    // over.id could be the Stage ID (if dropped on empty col) or a Deal ID (if dropped on another card)
    let newStage = over.id as string;
    
    // If dropped on another card, get that card's stage
    const overDeal = deals.find(d => d.id === over.id);
    if (overDeal) {
      newStage = overDeal.stage;
    }

    // Trigger update if stage actually changed
    if (activeDeal.stage !== newStage && STAGES.includes(newStage)) {
      onMoveDeal(activeDeal.id, newStage);
    }

    setActiveId(null);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-6 h-[70vh] overflow-x-auto pb-4 custom-scrollbar">
        {STAGES.map((stage) => (
          <DroppableColumn 
            key={stage}
            id={stage}
            deals={deals.filter(d => d.stage === stage)}
            onDeleteDeal={onDeleteDeal}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={{
        sideEffects: defaultDropAnimationSideEffects({
          styles: {
            active: {
              opacity: '0.5',
            },
          },
        }),
      }}>
        {activeId && activeDeal ? (
          <DealCard deal={activeDeal} onDelete={() => {}} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
