import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'Sinhala Audio Transcription',
    description: 'Convert Sinhala audio files to text using Google Cloud Speech-to-Text API',
    keywords: 'sinhala, transcription, speech-to-text, audio, google cloud',
};

export default function RootLayout({
                                       children,
                                   }: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
        <body className="antialiased">
        {children}
        </body>
        </html>
    );
}
