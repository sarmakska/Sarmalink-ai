/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ['pdfkit'],
  outputFileTracingIncludes: {
    '/api/expenses/claim-pdf/[id]': ['./public/fonts/**', './public/logo.png'],
  },
}

export default nextConfig
