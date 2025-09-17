import { NextRequest, NextResponse } from 'next/server';
import { transcribeAudio } from '../../../lib/speech';

interface TranscribeRequestBody {
    gcsUri: string;
    audioFormat: string;
}

interface GoogleCloudError extends Error {
    code?: number;
    details?: string;
    stack?: string;
}

export async function POST(request: NextRequest) {
    try {
        const body: TranscribeRequestBody = await request.json();
        const { gcsUri, audioFormat } = body;

        console.log('Transcribe request:', { gcsUri, audioFormat });

        if (!gcsUri) {
            console.error('Missing GCS URI');
            return NextResponse.json({ error: 'GCS URI required' }, { status: 400 });
        }

        // Validate environment variables
        if (!process.env.GCP_PROJECT_ID || !process.env.GCS_CLIENT_EMAIL || !process.env.GCS_PRIVATE_KEY) {
            console.error('Missing required environment variables');
            return NextResponse.json({
                error: 'Server configuration error: Missing Google Cloud credentials'
            }, { status: 500 });
        }

        console.log('Starting transcription...');
        const result = await transcribeAudio(gcsUri, audioFormat);
        console.log('Transcription result:', result);

        return NextResponse.json({
            transcription: result.transcription,
            confidence: result.confidence,
            language: 'si-LK',
            segmentCount: result.segmentCount,
            totalWords: result.totalWords
        });

    } catch (error: unknown) {
        const gcError = error as GoogleCloudError;

        console.error('Transcription API error:', {
            message: gcError.message,
            stack: gcError.stack,
            code: gcError.code,
            details: gcError.details
        });

        if (gcError.message?.includes('authentication')) {
            return NextResponse.json({
                error: 'Authentication failed. Check Google Cloud credentials.'
            }, { status: 401 });
        }

        if (gcError.message?.includes('permission')) {
            return NextResponse.json({
                error: 'Permission denied. Check service account permissions.'
            }, { status: 403 });
        }

        if (gcError.message?.includes('not found')) {
            return NextResponse.json({
                error: 'Audio file not found in storage bucket.'
            }, { status: 404 });
        }

        return NextResponse.json({
            error: `Transcription failed: ${gcError.message}`,
            details: process.env.NODE_ENV === 'development' ? gcError.stack : undefined
        }, { status: 500 });
    }
}
