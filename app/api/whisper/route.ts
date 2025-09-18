import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
    console.log('OpenAI Whisper API endpoint called');

    try {
        if (!process.env.OPENAI_API_KEY) {
            console.error('OpenAI API key not configured');
            return NextResponse.json(
                { error: 'OpenAI API key not configured. Please add OPENAI_API_KEY to environment variables.' },
                { status: 500 }
            );
        }

        const formData = await request.formData();
        const audioFile = formData.get('audio') as File;

        if (!audioFile) {
            console.error('No audio file provided');
            return NextResponse.json(
                { error: 'No audio file provided' },
                { status: 400 }
            );
        }

        console.log('Processing file with Whisper:', {
            name: audioFile.name,
            type: audioFile.type,
            size: audioFile.size
        });

        // Validate file size (25MB limit for Whisper)
        const maxSize = 25 * 1024 * 1024; // 25MB
        if (audioFile.size > maxSize) {
            console.error('File too large for Whisper:', audioFile.size);
            return NextResponse.json(
                { error: 'File size too large. OpenAI Whisper supports files up to 25MB.' },
                { status: 400 }
            );
        }

        // Enhanced file type validation
        const allowedTypes = [
            'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/wav', 'audio/wave',
            'video/mp4', 'audio/webm', 'audio/m4a', 'audio/ogg', 'audio/flac'
        ];

        if (!allowedTypes.includes(audioFile.type)) {
            console.error('Invalid file type for Whisper:', audioFile.type);
            return NextResponse.json(
                { error: `Invalid file type: ${audioFile.type}. Whisper supports MP3, MP4, WAV, M4A, FLAC, OGG, WebM` },
                { status: 400 }
            );
        }

        console.log('Starting Whisper transcription...');

        // Call OpenAI Whisper API without language parameter - let it auto-detect
        const transcription = await openai.audio.transcriptions.create({
            file: audioFile,
            model: 'whisper-1',
            // Remove language parameter - let Whisper auto-detect Sinhala
            response_format: 'verbose_json',
            temperature: 0.2, // Slightly higher for better multilingual performance
            // Enhanced prompt for Sinhala recognition
            prompt: "The following audio contains Sinhala speech. Please transcribe it accurately using Sinhala Unicode characters: අ ආ ඇ ඈ ඉ ඊ උ ඌ එ ඒ ඓ ඔ ඕ ඖ ක ග ච ජ ට ඩ ත ද ප බ ම ය ර ල ව ස ห ළ"
        });

        console.log('Whisper transcription completed');

        // Calculate word count
        const wordCount = transcription.text ? transcription.text.split(/\s+/).length : 0;

        // Detect if the transcription contains Sinhala characters
        const sinhalaRegex = /[\u0D80-\u0DFF]/;
        const containsSinhala = sinhalaRegex.test(transcription.text || '');

        console.log('Language detection:', {
            containsSinhala,
            textPreview: transcription.text?.substring(0, 100)
        });

        // Format response similar to Google Cloud Speech-to-Text
        const result = {
            transcription: transcription.text || '',
            confidence: 0.90, // Slightly lower confidence since no language was specified
            language: containsSinhala ? 'si-LK' : 'auto-detected',
            totalWords: wordCount,
            duration: transcription.duration,
            segments: transcription.segments?.length || 1,
            model: 'whisper-1',
            detectedLanguage: containsSinhala ? 'Sinhala' : 'Other'
        };

        console.log('Whisper result:', {
            textLength: result.transcription.length,
            duration: result.duration,
            wordCount: result.totalWords,
            fileType: audioFile.type,
            detectedLanguage: result.detectedLanguage
        });

        return NextResponse.json(result);

    } catch (error: unknown) {
        console.error('Whisper API error:', error);

        const err = error as any;

        // Handle specific OpenAI errors
        if (err.status === 401) {
            return NextResponse.json({
                error: 'Invalid OpenAI API key. Please check your credentials.'
            }, { status: 401 });
        }

        if (err.status === 429) {
            return NextResponse.json({
                error: 'OpenAI API rate limit exceeded. Please try again later.'
            }, { status: 429 });
        }

        if (err.message?.includes('file size')) {
            return NextResponse.json({
                error: 'File too large for OpenAI Whisper. Maximum size is 25MB.'
            }, { status: 400 });
        }

        if (err.message?.includes('language') || err.message?.includes('Language')) {
            return NextResponse.json({
                error: 'Language detection error. Whisper will auto-detect the language from your audio.'
            }, { status: 400 });
        }

        const errorMessage = err.message || 'Unknown error occurred';
        return NextResponse.json({
            error: `Whisper transcription failed: ${errorMessage}`
        }, { status: 500 });
    }
}
