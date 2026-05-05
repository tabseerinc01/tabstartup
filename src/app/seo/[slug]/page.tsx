import { Metadata } from 'next';
import SEOPageClient from './seo-page-client';
import { firebaseConfig } from '@/firebase/config';

async function getSEOPage(slug: string) {
  const projectId = firebaseConfig.projectId;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "seoPages" }],
          where: {
            compositeFilter: {
              op: "AND",
              filters: [
                {
                  fieldFilter: {
                    field: { fieldPath: "slug" },
                    op: "EQUAL",
                    value: { stringValue: slug }
                  }
                },
                {
                  fieldFilter: {
                    field: { fieldPath: "status" },
                    op: "EQUAL",
                    value: { stringValue: "active" }
                  }
                }
              ]
            }
          },
          limit: 1
        }
      }),
      next: { revalidate: 60 } // Cache for 1 minute
    });

    const data = await response.json();
    
    // Firestore runQuery returns an array. If empty or no document, page doesn't exist.
    if (!data || !Array.isArray(data) || data.length === 0 || !data[0].document) {
      return null;
    }

    const fields = data[0].document.fields;
    
    // Map Firestore REST format to simple JS object
    const mappedFilters = fields.filters?.mapValue?.fields ? 
      Object.keys(fields.filters.mapValue.fields).reduce((acc: any, key) => {
        acc[key] = fields.filters.mapValue.fields[key].stringValue;
        return acc;
      }, {}) : {};

    return {
      title: fields.title?.stringValue || 'TabStartup Directory',
      metaDescription: fields.metaDescription?.stringValue || 'Discover startups and resources in the TabStartup ecosystem.',
      h1: fields.h1?.stringValue,
      intro: fields.intro?.stringValue,
      slug: fields.slug?.stringValue,
      type: fields.type?.stringValue,
      status: fields.status?.stringValue,
      filters: mappedFilters
    };
  } catch (error) {
    console.error("Error fetching SEO page on server:", error);
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await getSEOPage(slug);
  
  if (!page || page.status !== 'active') {
    return {
      title: 'Directory Not Found | TabStartup',
      description: 'The requested directory could not be found.',
    };
  }

  return {
    title: page.title,
    description: page.metaDescription,
    openGraph: {
      title: page.title,
      description: page.metaDescription,
      url: `https://tabstartup.com/seo/${slug}`,
      siteName: 'TabStartup',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: page.title,
      description: page.metaDescription,
    },
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pageData = await getSEOPage(slug);
  
  return <SEOPageClient slug={slug} initialPageData={pageData} />;
}
