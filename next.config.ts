import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // accès au serveur dev depuis le réseau local (http://192.168.1.66:3000) : autorise le rechargement à chaud
  allowedDevOrigins: ['192.168.1.66', 'localhost'],
};

export default nextConfig;
