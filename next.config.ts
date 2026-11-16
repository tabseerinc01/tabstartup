import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: [
    'pdfmake',
    '@foliojs-fork/pdfkit',
    '@foliojs-fork/fontkit',
  ],

  outputFileTracingIncludes: {
    '/api/cron/event-email': [
      './src/assets/pdf-fonts/NotoSansBengali.ttf',
      './public/brand/tabstartup-logo.png',
    ],
    '/api/events/orders/**/tickets/**/pdf': [
      './src/assets/pdf-fonts/NotoSansBengali.ttf',
      './public/brand/tabstartup-logo.png',
    ],
  },

  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'media.licdn.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.firebasestorage.app',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;