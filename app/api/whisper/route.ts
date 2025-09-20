import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
    console.log('Whisper API called');

    try {
        if (!process.env.OPENAI_API_KEY) {
            return NextResponse.json(
                { error: 'OpenAI API key not configured' },
                { status: 500 }
            );
        }

        const formData = await request.formData();
        const audioFile = formData.get('audio') as File;

        if (!audioFile) {
            return NextResponse.json(
                { error: 'No audio file provided' },
                { status: 400 }
            );
        }

        console.log('Processing file:', {
            name: audioFile.name,
            type: audioFile.type,
            size: audioFile.size
        });

        const maxSize = 25 * 1024 * 1024;
        if (audioFile.size > maxSize) {
            return NextResponse.json(
                { error: 'File too large. Maximum 25MB allowed.' },
                { status: 400 }
            );
        }

        const allowedTypes = [
            'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/wav', 'audio/wave',
            'video/mp4', 'audio/webm', 'audio/m4a', 'audio/ogg', 'audio/flac'
        ];

        if (!allowedTypes.includes(audioFile.type)) {
            return NextResponse.json(
                { error: `Invalid file type: ${audioFile.type}` },
                { status: 400 }
            );
        }

        console.log('Starting Whisper transcription...');

        const transcription = await openai.audio.transcriptions.create({
            file: audioFile,
            model: 'whisper-1',
            response_format: 'verbose_json',
            temperature: 0.2,
        });

        const wordCount = transcription.text ? transcription.text.split(/\s+/).length : 0;

        const sinhalaRegex = /[\u0D80-\u0DFF]/;
        const containsSinhala = sinhalaRegex.test(transcription.text || '');

        const result = {
            transcription: transcription.text || '',
            confidence: 0.90,
            language: containsSinhala ? 'si-LK' : 'auto-detected',
            totalWords: wordCount,
            duration: transcription.duration,
            segments: transcription.segments?.length || 1,
            model: 'whisper-1'
        };

        console.log('Whisper completed:', {
            textLength: result.transcription.length,
            duration: result.duration,
            wordCount: result.totalWords
        });

        return NextResponse.json(result);

    } catch (error: unknown) {
        console.error('Whisper error:', error);

        const err = error as any;

        if (err.status === 401) {
            return NextResponse.json({
                error: 'Invalid OpenAI API key'
            }, { status: 401 });
        }

        if (err.status === 429) {
            return NextResponse.json({
                error: 'Rate limit exceeded. Try again later.'
            }, { status: 429 });
        }

        return NextResponse.json({
            error: `Transcription failed: ${err.message || 'Unknown error'}`
        }, { status: 500 });
    }
}
