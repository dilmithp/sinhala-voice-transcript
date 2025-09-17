import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'Sinhala Audio Transcription',
    description: 'Convert Sinhala audio to text using Google Cloud Speech-to-Text',
};

export default function RootLayout({
                                       children,
                                   }: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
        <body>{children}</body>
        </html>
    );
}
