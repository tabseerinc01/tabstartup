import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  FileText,
  Link as LinkIcon,
  Landmark,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlaceHolderImages } from "@/lib/placeholder-images";

export default function HomePage() {
  const heroImage = PlaceHolderImages.find((img) => img.id === "hero-image");
  const featureInvoiceImage = PlaceHolderImages.find(
    (img) => img.id === "feature-invoice"
  );
  const featurePaymentLinkImage = PlaceHolderImages.find(
    (img) => img.id === "feature-payment-link"
  );
  const featureTreasuryImage = PlaceHolderImages.find(
    (img) => img.id === "feature-treasury"
  );

  const features = [
    {
      icon: <FileText className="h-8 w-8 text-accent" />,
      title: "Effortless Invoicing",
      description:
        "Create and send professional invoices in seconds. Track payments and automate reminders with ease.",
      image: featureInvoiceImage,
    },
    {
      icon: <LinkIcon className="h-8 w-8 text-accent" />,
      title: "Simple Payment Links",
      description:
        "Generate secure payment links for any product or service. Share them anywhere and get paid instantly.",
      image: featurePaymentLinkImage,
    },
    {
      icon: <Landmark className="h-8 w-8 text-accent" />,
      title: "Integrated Treasury",
      description:
        "Access powerful financial tools, including dedicated bank accounts and card issuing, all under your brand.",
      image: featureTreasuryImage,
    },
  ];

  return (
    <div className="flex flex-col">
      <section className="relative w-full py-20 md:py-32 lg:py-40">
        {heroImage && (
          <Image
            src={heroImage.imageUrl}
            alt={heroImage.description}
            data-ai-hint={heroImage.imageHint}
            fill
            className="absolute inset-0 -z-10 h-full w-full object-cover opacity-20"
          />
        )}
        <div className="container mx-auto px-4 text-center">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl">
              Modern Payments for Your Business
            </h1>
            <p className="mt-6 text-lg text-muted-foreground md:text-xl">
              TabEdge provides the tools you need to get paid faster, manage
              your finances, and grow your business. Invoicing, payment links,
              and powerful treasury services in one platform.
            </p>
            <div className="mt-10 flex items-center justify-center gap-x-6">
              <Button asChild size="lg">
                <Link href="/signup">
                  Get Started for Free <ArrowRight className="ml-2" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/services">Learn More</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-background py-20 sm:py-32">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Everything You Need to Succeed
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              A comprehensive suite of tools to streamline your financial
              operations.
            </p>
          </div>
          <div className="mt-16 grid grid-cols-1 gap-12 md:grid-cols-3">
            {features.map((feature) => (
              <Card key={feature.title} className="overflow-hidden text-center">
                <CardHeader className="items-center">
                  <div className="mb-4 rounded-full bg-primary/10 p-4">
                    {feature.icon}
                  </div>
                  <CardTitle>{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-32">
        <div className="container mx-auto px-4">
          <div className="bg-primary/90 text-primary-foreground rounded-2xl p-12 text-center shadow-lg">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Ready to streamline your payments?
            </h2>
            <p className="mt-4 text-lg opacity-90">
              Join hundreds of businesses growing with TabEdge.
            </p>
            <div className="mt-8">
              <Button asChild size="lg" variant="secondary">
                <Link href="/signup">
                  Sign Up Now <ArrowRight className="ml-2" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
