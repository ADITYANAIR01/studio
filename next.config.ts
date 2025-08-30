import type {NextConfig} from 'next';

const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

// Security headers configuration
const securityHeaders = [
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY'
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block'
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin'
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=()'
  }
];

const nextConfig: NextConfig = {
  /* config options here */
  // output: 'export', // Temporarily disabled
  trailingSlash: true,
  
  // Security-focused TypeScript and ESLint configuration
  typescript: {
    ignoreBuildErrors: true, // Temporarily ignore build errors
  },
  eslint: {
    ignoreDuringBuilds: true, // Temporarily ignore during builds
  },
  
  // Disable X-Powered-By header for security
  poweredByHeader: false,
  
  // Security headers (commented out for static export)
  // async headers() {
  //   return [
  //     {
  //       source: '/(.*)',
  //       headers: securityHeaders
  //     }
  //   ];
  // },
  
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  
  // Compiler optimizations for production
  compiler: {
    ...(isProduction && {
      removeConsole: {
        exclude: ['error', 'warn'] // Keep error and warning logs in production
      }
    })
  },
  
  // Experimental features
  experimental: {
    strictNextHead: true
  },
  
  // Ensure environment variables are available in the client
  env: {
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
    NEXT_PUBLIC_SECURITY_LEVEL: process.env.NEXT_PUBLIC_SECURITY_LEVEL,
    NEXT_PUBLIC_ENCRYPTION_ITERATIONS: process.env.NEXT_PUBLIC_ENCRYPTION_ITERATIONS,
    NEXT_PUBLIC_MAX_LOGIN_ATTEMPTS: process.env.NEXT_PUBLIC_MAX_LOGIN_ATTEMPTS,
    NEXT_PUBLIC_LOCKOUT_DURATION: process.env.NEXT_PUBLIC_LOCKOUT_DURATION,
    NEXT_PUBLIC_SESSION_TIMEOUT: process.env.NEXT_PUBLIC_SESSION_TIMEOUT,
    NEXT_PUBLIC_IDLE_TIMEOUT: process.env.NEXT_PUBLIC_IDLE_TIMEOUT,
  },
};

// Only add webpack config for production builds
if (isProduction) {
  nextConfig.webpack = (config, { dev, buildId, isServer }) => {
    // Production security optimizations
    config.optimization.minimize = true;
    return config;
  };
}

export default nextConfig;
