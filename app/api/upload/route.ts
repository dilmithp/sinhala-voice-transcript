import { NextRequest, NextResponse } from 'next/server';
import { uploadToGCS } from '../../../lib/gcs';

export async function POST(request: NextRequest) {
    console.log('Upload API endpoint called');

    try {
        const formData = await request.formData();
        const file = formData.get('audio') as File;

        if (!file) {
            console.error('No file provided in request');
            return NextResponse.json(
                { error: 'No file provided' },
                { status: 400 }
            );
        }

        console.log('File details:', {
            name: file.name,
            type: file.type,
            size: file.size
        });

        // Validate file type
        const allowedTypes = [
            'audio/mpeg',
            'audio/mp3',
            'audio/mp4',
            'audio/wav',
            'video/mp4'
        ];

        if (!allowedTypes.includes(file.type)) {
            console.error('Invalid file type:', file.type);
            return NextResponse.json(
                { error: `Invalid file type: ${file.type}` },
                { status: 400 }
            );
        }

        // Validate file size (50MB limit)
        const maxSize = 50 * 1024 * 1024; // 50MB in bytes
        if (file.size > maxSize) {
            console.error('File too large:', file.size);
            return NextResponse.json(
                { error: 'File size too large. Maximum 50MB allowed.' },
                { status: 400 }
            );
        }

        // Generate unique filename
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(2, 15);
        const extension = file.name.split('.').pop() || 'mp3';
        const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_').substring(0, 50);
        const fileName = `audio/${timestamp}-${randomId}-${cleanName}.${extension}`;

        console.log('Generated filename:', fileName);

        // Convert file to buffer with error handling
        let fileBuffer: Buffer;
        try {
            const arrayBuffer = await file.arrayBuffer();
            fileBuffer = Buffer.from(arrayBuffer);
            console.log('File converted to buffer, size:', fileBuffer.length);
        } catch (error) {
            console.error('Error converting file to buffer:', error);
            return NextResponse.json(
                { error: 'Failed to process file data' },
                { status: 400 }
            );
        }

        // Upload to Google Cloud Storage with retry mechanism
        let gcsUri: string;
        let uploadAttempts = 0;
        const maxAttempts = 3;

        while (uploadAttempts < maxAttempts) {
            try {
                console.log(`Upload attempt ${uploadAttempts + 1}/${maxAttempts}`);
                gcsUri = await uploadToGCS(fileBuffer, fileName, file.type);
                break; // Success, exit retry loop
            } catch (error) {
                uploadAttempts++;
                console.error(`Upload attempt ${uploadAttempts} failed:`, error);

                if (uploadAttempts >= maxAttempts) {
                    throw error; // Re-throw if all attempts failed
                }

                // Wait before retrying (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, uploadAttempts) * 1000));
            }
        }

        // console.log('Upload successful, GCS URI:', gcsUri);

        return NextResponse.json({
            success: true,
            gcsUri: gcsUri!,
            fileName: file.name,
            size: file.size,
            type: file.type
        });

    } catch (error) {
        console.error('Upload API error:', error);

        const errorMessage = error instanceof Error
            ? error.message
            : 'Unknown upload error';

        // Check for specific error types
        if (errorMessage.includes('stream was destroyed')) {
            return NextResponse.json(
                { error: 'Upload connection was interrupted. Please try again.' },
                { status: 500 }
            );
        }

        if (errorMessage.includes('authentication') || errorMessage.includes('credentials')) {
            return NextResponse.json(
                { error: 'Authentication error. Please check server configuration.' },
                { status: 500 }
            );
        }

        return NextResponse.json(
            { error: `Upload failed: ${errorMessage}` },
            { status: 500 }
        );
    }
}
