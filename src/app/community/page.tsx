import { PublicHeader } from '@/components/public/header';
import { PublicFooter } from '@/components/public/footer';

export default function CommunityPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="flex-1 container mx-auto px-4 py-20 text-center">
        <h1 className="text-4xl font-bold mb-6">TabStartup Community</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          We are building a vibrant ecosystem where founders support founders. 
          Discussion forums, local meetups, and digital networking features are coming soon.
        </p>
        <div className="mt-12 p-8 border rounded-2xl bg-muted/20">
          <p className="text-sm font-medium text-primary">Estimated Release: Q4 2024</p>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
