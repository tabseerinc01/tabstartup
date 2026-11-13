'use client';

import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

export function Logo({
  className,
  onClick,
}: {
  className?: string;
  onClick?: () => void;
}) {
  return (
    <Link
      href="/"
      className={cn("flex items-center shrink-0", className)}
      onClick={onClick}
      aria-label="TabStartup Home"
    >
      <Image
        src="/brand/tabstartup-logo.png"
        alt="TabStartup"
        width={180}
        height={48}
        className="h-10 w-auto object-contain"
        priority
      />
    </Link>
  );
}
