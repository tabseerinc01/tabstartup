
import Link from "next/link";
import { Rocket } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2", className)}>
      <div className="rounded-lg bg-primary p-1.5 text-primary-foreground">
        <Rocket className="h-6 w-6" />
      </div>
      <span className="text-xl font-bold tracking-tight text-foreground">TabStartup</span>
    </Link>
  );
}
