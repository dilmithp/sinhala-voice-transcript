import { NextRequest, NextResponse } from 'next/server';
import { uploadToGCS } from '../../../lib/gcs';

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('audio') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        // Validate file type
        const allowedTypes = ['audio/mpeg', 'audio/mp4', 'audio/wav', 'video/mp4'];
        if (!allowedTypes.includes(file.type)) {
            return NextResponse.json({ error: 'Invalid file type' }, { status: 400 });
        }

        // Generate unique filename
        const fileName = `audio/${Date.now()}-${file.name}`;
        const fileBuffer = Buffer.from(await file.arrayBuffer());

        // Upload to Google Cloud Storage
        const gcsUri = await uploadToGCS(fileBuffer, fileName, file.type);

        return NextResponse.json({
            success: true,
            gcsUri,
            fileName: file.name,
            size: file.size
        });

    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
}
