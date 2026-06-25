
'use client';

import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Circle, ShieldCheck, Zap, ArrowRight } from 'lucide-react';
import { 
  calculateProfileStrength, 
  getProfileChecklist, 
  getStrengthFeedback,
  calculateTrustScore 
} from '@/lib/profile-utils';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface ProfileStrengthWidgetProps {
  profile: any;
  startup?: any;
  showChecklist?: boolean;
  className?: string;
}

export function ProfileStrengthWidget({ profile, startup, showChecklist = true, className }: ProfileStrengthWidgetProps) {
  if (!profile) return null;

  const strength = calculateProfileStrength(profile, startup);
  const trustScore = calculateTrustScore(profile, startup);
  const checklist = getProfileChecklist(profile, startup);
  const feedback = getStrengthFeedback(strength);

  return (
    <Card className={cn("border-none shadow-xl rounded-[2.5rem] bg-background ring-1 ring-slate-100 overflow-hidden", className)}>
      <CardHeader className="bg-primary/[0.03] p-8 border-b border-primary/5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-xl text-primary">
              <Zap className="h-5 w-5" />
            </div>
            <CardTitle className="text-xl font-black">Profile Strength</CardTitle>
          </div>
          <span className="text-2xl font-black text-primary">{strength}%</span>
        </div>
        <Progress value={strength} className="h-2 bg-primary/10" />
        <p className="text-sm font-medium text-slate-500 mt-4 leading-relaxed">
          {feedback}
        </p>
      </CardHeader>
      
      <CardContent className="p-8 space-y-8">
        <div className="flex items-center justify-between p-4 bg-slate-900 text-white rounded-2xl relative overflow-hidden group">
          <div className="relative z-10">
            <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Ecosystem Trust Score</p>
            <p className="text-2xl font-black">{trustScore} / 100</p>
          </div>
          <ShieldCheck className="h-10 w-10 text-primary opacity-20 group-hover:scale-110 transition-transform relative z-10" />
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-2xl -mr-16 -mt-16" />
        </div>

        {showChecklist && (
          <div className="space-y-4">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-2">Completion Checklist</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {checklist.map((item, idx) => (
                <div key={idx} className={cn(
                  "flex items-center gap-3 p-3 rounded-xl transition-all",
                  item.completed ? "bg-green-50/50" : "bg-slate-50 opacity-60"
                )}>
                  {item.completed ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 text-slate-300 shrink-0" />
                  )}
                  <span className={cn(
                    "text-xs font-bold truncate",
                    item.completed ? "text-green-700" : "text-slate-500"
                  )}>{item.label}</span>
                </div>
              ))}
            </div>
            
            {strength < 100 && (
              <Button variant="link" asChild className="p-0 h-auto text-primary font-bold text-xs gap-2 mt-4">
                <Link href="/dashboard/profile">Complete Profile <ArrowRight className="h-3 w-3" /></Link>
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
