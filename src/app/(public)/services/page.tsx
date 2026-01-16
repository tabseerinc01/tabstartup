import Image from "next/image";
import { PlaceHolderImages } from "@/lib/placeholder-images";
import {
  FileText,
  Link as LinkIcon,
  Landmark,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ServicesPage() {
  const featureInvoiceImage = PlaceHolderImages.find(
    (img) => img.id === "feature-invoice"
  );
  const featurePaymentLinkImage = PlaceHolderImages.find(
    (img) => img.id === "feature-payment-link"
  );
  const featureTreasuryImage = PlaceHolderImages.find(
    (img) => img.id === "feature-treasury"
  );

  const services = [
    {
      image: featureInvoiceImage,
      icon: <FileText className="h-10 w-10 text-accent" />,
      title: "Advanced Invoicing",
      description:
        "Go beyond simple invoices. Our platform allows for detailed customization, recurring billing, automatic payment reminders, and real-time tracking. Give your clients a professional and seamless payment experience.",
    },
    {
      image: featurePaymentLinkImage,
      icon: <LinkIcon className="h-10 w-10 text-accent" />,
      title: "Flexible Payment Links",
      description:
        "The perfect solution for quick sales, one-off services, or donations. Create fixed-amount or flexible payment links in an instant. Share them via email, social media, or on your website to start collecting payments globally.",
    },
    {
      image: featureTreasuryImage,
      icon: <Landmark className="h-10 w-10 text-accent" />,
      title: "White-Label Treasury Services",
      description:
        "Unlock powerful banking features seamlessly integrated into your TabEdge account. We provide you with US bank accounts and the ability to issue cards, all under your brand, powered by a secure, world-class infrastructure.",
    },
  ];

  return (
    <div className="py-20 sm:py-32">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Our Services
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            Discover the powerful suite of tools TabEdge offers to help you
            manage and grow your business finances.
          </p>
        </div>

        <div className="mt-20 space-y-24">
          {services.map((service, index) => (
            <div
              key={service.title}
              className={`grid grid-cols-1 items-center gap-12 md:grid-cols-2 ${
                index % 2 === 1 ? "md:grid-flow-col-dense" : ""
              }`}
            >
              <div
                className={`flex flex-col ${
                  index % 2 === 1 ? "md:col-start-2" : ""
                }`}
              >
                <div className="mb-4">{service.icon}</div>
                <h2 className="text-3xl font-bold tracking-tight text-foreground">
                  {service.title}
                </h2>
                <p className="mt-4 text-muted-foreground">
                  {service.description}
                </p>
              </div>
              {service.image && (
                <div
                  className={`relative h-80 w-full ${
                    index % 2 === 1 ? "md:col-start-1" : ""
                  }`}
                >
                  <Image
                    src={service.image.imageUrl}
                    alt={service.image.description}
                    data-ai-hint={service.image.imageHint}
                    fill
                    className="rounded-lg object-cover shadow-lg"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
