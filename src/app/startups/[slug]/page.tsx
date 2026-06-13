import { Metadata } from 'next';
import StartupProfileClient from './startup-profile-client';
import { firebaseConfig } from '@/firebase/config';

async function getStartupBySlug(slug: string) {
  const projectId = firebaseConfig.projectId;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "startups" }],
          where: {
            fieldFilter: {
              field: { fieldPath: "slug" },
              op: "EQUAL",
              value: { stringValue: slug }
            }
          },
          limit: 1
        }
      }),
      next: { revalidate: 60 }
    });

    const data = await response.json();
    if (!data || !Array.isArray(data) || data.length === 0 || !data[0].document) {
      return null;
    }

    const fields = data[0].document.fields;
    return {
      name: fields.name?.stringValue || 'Startup',
      shortDescription: fields.shortDescription?.stringValue || 'A revolutionary venture on TabStartup.',
      industry: fields.industry?.stringValue || 'Technology',
      ownerUid: fields.ownerUid?.stringValue,
      slug: fields.slug?.stringValue,
      status: fields.status?.stringValue
    };
  } catch (error) {
    console.error("Error fetching startup for metadata:", error);
    return null;
  }
}

async function getStartupById(id: string) {
  const projectId = firebaseConfig.projectId;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/startups/${id}`;
  
  try {
    const response = await fetch(url, { next: { revalidate: 60 } });
    if (!response.ok) return null;
    const data = await response.json();
    const fields = data.fields;
    return {
      name: fields.name?.stringValue || 'Startup',
      shortDescription: fields.shortDescription?.stringValue || 'A revolutionary venture on TabStartup.',
      slug: fields.slug?.stringValue,
      ownerUid: fields.ownerUid?.stringValue
    };
  } catch (error) {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  
  // Try slug first
  let startup = await getStartupBySlug(slug);
  
  // If not found by slug, try ID (backward compatibility)
  if (!startup) {
    startup = await getStartupById(slug);
  }
  
  if (!startup || startup.status === 'hidden') {
    return {
      title: 'Startup Not Found | TabStartup',
    };
  }

  const title = `${startup.name} | ${startup.industry} Startup | TabStartup`;
  const description = startup.shortDescription;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      images: [`https://picsum.photos/seed/${startup.ownerUid}/1200/630`],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`https://picsum.photos/seed/${startup.ownerUid}/1200/630`],
    },
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <StartupProfileClient slugOrId={slug} />;
}
