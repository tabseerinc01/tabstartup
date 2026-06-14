import { Metadata } from 'next';
import StartupProfileClient from './startup-profile-client';
import { firebaseConfig } from '@/firebase/config';

// Robust helper to find startup by slug or ID via REST API
async function getStartupData(identifier: string) {
  const projectId = firebaseConfig.projectId;
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  
  try {
    // 1. Try finding by SLUG field
    const queryUrl = `${baseUrl}:runQuery`;
    const slugResponse = await fetch(queryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "startups" }],
          where: {
            fieldFilter: {
              field: { fieldPath: "slug" },
              op: "EQUAL",
              value: { stringValue: identifier }
            }
          },
          limit: 1
        }
      }),
      next: { revalidate: 60 }
    });

    const queryData = await slugResponse.json();
    if (queryData && Array.isArray(queryData) && queryData.length > 0 && queryData[0].document) {
      const fields = queryData[0].document.fields;
      return {
        name: fields.name?.stringValue || 'Startup',
        shortDescription: fields.shortDescription?.stringValue || 'A revolutionary venture on TabStartup.',
        ownerUid: fields.ownerUid?.stringValue,
        status: fields.status?.stringValue,
        slug: fields.slug?.stringValue
      };
    }

    // 2. Fallback to ID-based lookup if slug failed (Identifier might be the document ID/UID)
    const idUrl = `${baseUrl}/startups/${identifier}`;
    const idResponse = await fetch(idUrl, { next: { revalidate: 60 } });
    if (idResponse.ok) {
      const data = await idResponse.json();
      const fields = data.fields;
      if (fields) {
          return {
            name: fields.name?.stringValue || 'Startup',
            shortDescription: fields.shortDescription?.stringValue || 'A revolutionary venture on TabStartup.',
            ownerUid: fields.ownerUid?.stringValue,
            status: fields.status?.stringValue,
            slug: fields.slug?.stringValue
          };
      }
    }

    return null;
  } catch (error) {
    console.error("Error fetching startup on server:", error);
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const startup = await getStartupData(slug);
  
  if (!startup || startup.status === 'hidden') {
    return { title: 'Venture Profile | TabStartup' };
  }

  const title = `${startup.name} | TabStartup Venture`;
  const description = startup.shortDescription;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      images: [`https://picsum.photos/seed/${startup.ownerUid || 'startup'}/1200/630`],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`https://picsum.photos/seed/${startup.ownerUid || 'startup'}/1200/630`],
    },
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <StartupProfileClient slugOrId={slug} />;
}
