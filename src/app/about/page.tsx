
import { PublicHeader } from '@/components/public/header';
import { PublicFooter } from '@/components/public/footer';

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="flex-1 container mx-auto px-4 py-20">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl font-bold mb-8">About TabStartup</h1>
          <div className="prose prose-lg dark:prose-invert">
            <p>
              TabStartup was born from a simple observation: founders in emerging markets, 
              particularly Bangladesh, have immense talent but often lack the structured 
              networking and resource access required to go global.
            </p>
            <p>
              Our mission is to bridge that gap. We provide a central hub where 
              ideas meet capital, and challenges meet experience.
            </p>
            <h2 className="text-2xl font-bold mt-12 mb-4">Our Vision</h2>
            <p>
              To become the leading platform for early-stage startup development 
              outside of traditional Silicon Valley bubbles.
            </p>
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
