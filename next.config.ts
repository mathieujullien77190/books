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
    ];
  },
};

export default nextConfig;
