import Image from "next/image";
import { PlaceHolderImages } from "@/lib/placeholder-images";

export default function AboutPage() {
  const aboutImage = PlaceHolderImages.find((img) => img.id === "about-team");

  return (
    <div className="py-20 sm:py-32">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Our Mission
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            At TabEdge, we are dedicated to empowering businesses of all sizes
            with simple, powerful, and accessible financial tools. We believe
            that managing payments should be seamless, allowing you to focus on
            what you do best: growing your business and serving your customers.
          </p>
        </div>

        {aboutImage && (
          <div className="mt-16">
            <Image
              src={aboutImage.imageUrl}
              alt={aboutImage.description}
              data-ai-hint={aboutImage.imageHint}
              width={1000}
              height={600}
              className="mx-auto rounded-lg shadow-lg"
            />
          </div>
        )}

        <div className="mt-16 grid grid-cols-1 gap-12 md:grid-cols-3 text-center">
          <div>
            <h3 className="text-xl font-semibold text-foreground">
              Simplicity
            </h3>
            <p className="mt-2 text-muted-foreground">
              We design intuitive tools that are easy to use, no matter your
              technical skill level.
            </p>
          </div>
          <div>
            <h3 className="text-xl font-semibold text-foreground">
              Security
            </h3>
            <p className="mt-2 text-muted-foreground">
              Your security is our top priority. We use industry-leading
              practices to protect your data and transactions.
            </p>
          </div>
          <div>
            <h3 className="text-xl font-semibold text-foreground">
              Innovation
            </h3>
            <p className="mt-2 text-muted-foreground">
              We constantly innovate to bring you the latest in financial
              technology, helping you stay ahead of the curve.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
