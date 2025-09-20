import { NextRequest, NextResponse } from 'next/server';
import { transcribeAudio } from '../../../lib/speech';

interface TranscribeRequestBody {
    gcsUri: string;
    audioFormat: string;
    languageMode?: 'sinhala' | 'english' | 'mixed';
}

interface GoogleCloudError extends Error {
    code?: number;
    details?: string;
    stack?: string;
}

export async function POST(request: NextRequest) {
    console.log('Transcribe API endpoint called');

    try {
        const body: TranscribeRequestBody = await request.json();
        const { gcsUri, audioFormat, languageMode = 'mixed' } = body;

        console.log('Transcribe request:', { gcsUri, audioFormat, languageMode });

        if (!gcsUri) {
            console.error('Missing GCS URI');
            return NextResponse.json(
                { error: 'GCS URI required' },
                { status: 400 }
            );
        }

        if (!audioFormat) {
            console.error('Missing audio format');
            return NextResponse.json(
                { error: 'Audio format required' },
                { status: 400 }
            );
        }

        // Validate environment variables
        const requiredEnvVars = ['GCP_PROJECT_ID', 'GCS_CLIENT_EMAIL', 'GCS_PRIVATE_KEY'];
        const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

        if (missingEnvVars.length > 0) {
            console.error('Missing environment variables:', missingEnvVars);
            return NextResponse.json({
                error: `Server configuration error: Missing ${missingEnvVars.join(', ')}`
            }, { status: 500 });
        }

        console.log(`Starting transcription in ${languageMode} mode...`);
        const result = await transcribeAudio(gcsUri, audioFormat, languageMode);
        console.log('Transcription completed successfully');

        return NextResponse.json({
            transcription: result.transcription,
            confidence: result.confidence,
            language: result.primaryLanguage || (languageMode === 'sinhala' ? 'si-LK' : languageMode === 'english' ? 'en-US' : 'mixed'),
            segmentCount: result.segmentCount,
            totalWords: result.totalWords,
            detectedLanguages: result.detectedLanguages,
            primaryLanguage: result.primaryLanguage
        });

    } catch (error: unknown) {
        const gcError = error as GoogleCloudError;

        console.error('Transcription API error:', {
            message: gcError.message,
            code: gcError.code,
            details: gcError.details,
        });

        // Return specific error messages
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

        if (gcError.message?.includes('quota')) {
            return NextResponse.json({
                error: 'API quota exceeded. Please try again later.'
            }, { status: 429 });
        }

        const errorMessage = gcError.message || 'Unknown error occurred';
        return NextResponse.json({
            error: `Transcription failed: ${errorMessage}`
        }, { status: 500 });
    }
}
