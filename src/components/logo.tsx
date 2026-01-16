import Link from "next/link";
import { DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2", className)}>
      <div className="rounded-full bg-primary p-2 text-primary-foreground">
        <DollarSign className="h-6 w-6" />
      </div>
      <span className="text-xl font-bold text-foreground">TabEdge</span>
    </Link>
  );
}
