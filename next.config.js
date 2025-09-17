/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    experimental: {
        serverComponentsExternalPackages: ['@google-cloud/speech', '@google-cloud/storage'],
    },
};

module.exports = nextConfig;
