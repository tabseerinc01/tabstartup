import type { ReactNode } from "react";
import { PublicHeader } from "@/components/public/header";
import { PublicFooter } from "@/components/public/footer";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}
