import type { NextConfig } from 'next';

/** Sites autorisés à afficher la bibliothèque dans une iframe (le bureau d'AOC) ; `self` pour elle-même. */
const FRAME_ANCESTORS = ["'self'", 'https://mathieu-jullien.vercel.app', 'http://localhost:*'];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // accès au serveur dev depuis le réseau local (http://192.168.1.66:3000) : autorise le rechargement à chaud
  allowedDevOrigins: ['192.168.1.66', 'localhost'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: `frame-ancestors ${FRAME_ANCESTORS.join(' ')}` },
        ],
      },
      // couvertures et modèle 3D : changent rarement ; sans cela Vercel les revalide une à une à chaque visite
      ...['/covers/:path*', '/mesange/:path*'].map((source) => ({
        source,
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
        ],
      })),
    ];
  },
};

export default nextConfig;
