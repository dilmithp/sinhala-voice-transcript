'use client';

import { useState, useRef } from 'react';

interface UploadResult {
    success: boolean;
    gcsUri: string;
    fileName: string;
    size: number;
}

interface TranscriptionResult {
    transcription: string;
    confidence: number;
    language: string;
    segmentCount?: number;
    totalWords?: number;
}

export default function AudioUploader() {
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [transcribing, setTranscribing] = useState(false);
    const [transcription, setTranscription] = useState<TranscriptionResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = event.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            setTranscription(null);
            setError(null);
        }
    };

    const handleUploadAndTranscribe = async () => {
        if (!file) return;

        setUploading(true);
        setTranscribing(false);
        setError(null);
        setTranscription(null);

        try {
            console.log('Uploading file:', file.name);
            const formData = new FormData();
            formData.append('audio', file);

            const uploadResponse = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            const uploadData = await uploadResponse.text();
            console.log('Upload response:', uploadData);

            if (!uploadResponse.ok) {
                let errorData;
                try {
                    errorData = uploadData ? JSON.parse(uploadData) : { error: 'Upload failed' };
                } catch {
                    errorData = { error: 'Upload failed' };
                }
                throw new Error(`Upload failed: ${errorData.error}`);
            }

            const uploadResult: UploadResult = JSON.parse(uploadData);
            console.log('Upload successful:', uploadResult);

            setUploading(false);
            setTranscribing(true);

            const audioFormat = file.name.split('.').pop()?.toLowerCase() || 'mp3';
            console.log('Starting transcription with format:', audioFormat);

            const transcribeResponse = await fetch('/api/transcribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gcsUri: uploadResult.gcsUri,
                    audioFormat,
                }),
            });

            const transcribeData = await transcribeResponse.text();
            console.log('Transcribe response:', transcribeData);

            if (!transcribeResponse.ok) {
                let errorData;
                try {
                    errorData = transcribeData ? JSON.parse(transcribeData) : { error: 'Transcription failed' };
                } catch {
                    errorData = { error: 'Transcription failed' };
                }
                throw new Error(`Transcription failed: ${errorData.error}`);
            }

            const transcriptionResult: TranscriptionResult = JSON.parse(transcribeData);
            console.log('Transcription successful:', transcriptionResult);
            setTranscription(transcriptionResult);

        } catch (error: unknown) {
            console.error('Process failed:', error);
            const errorMessage = error instanceof Error
                ? error.message
                : 'Transcription failed. Please try again.';
            setError(errorMessage);
        } finally {
            setUploading(false);
            setTranscribing(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
            <h2 className="text-2xl font-bold text-center mb-6 text-gray-800">
                Sinhala Audio Transcription
            </h2>

            <div className="mb-6">
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/mp3,audio/wav,audio/mp4,video/mp4"
                    onChange={handleFileSelect}
                    className="hidden"
                />

                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 transition-colors"
                >
                    {file ? file.name : 'Choose Audio File (MP3, MP4, WAV)'}
                </button>
            </div>

            {file && (
                <div className="mb-6">
                    <button
                        onClick={handleUploadAndTranscribe}
                        disabled={uploading || transcribing}
                        className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
                    >
                        {uploading && 'Uploading...'}
                        {transcribing && 'Transcribing... This may take a few minutes.'}
                        {!uploading && !transcribing && 'Upload & Transcribe'}
                    </button>
                </div>
            )}

            {error && (
                <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
                    <h3 className="font-semibold text-red-800 mb-2">Error Occurred:</h3>
                    <p className="text-red-700 text-sm">{error}</p>
                </div>
            )}

            {transcription && (
                <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="font-semibold mb-2">Transcription Result:</h3>

                    <div className="max-h-60 overflow-y-auto bg-white p-3 rounded border mb-3">
                        <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">
                            {transcription.transcription || 'No speech detected in the audio file.'}
                        </p>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">
                        <div>
                            <span className="font-medium">Confidence:</span><br />
                            {(transcription.confidence * 100).toFixed(1)}%
                        </div>
                        <div>
                            <span className="font-medium">Language:</span><br />
                            {transcription.language}
                        </div>
                        {transcription.segmentCount && (
                            <div>
                                <span className="font-medium">Segments:</span><br />
                                {transcription.segmentCount}
                            </div>
                        )}
                        {transcription.totalWords && (
                            <div>
                                <span className="font-medium">Word Count:</span><br />
                                {transcription.totalWords}
                            </div>
                        )}
                    </div>

                    <div className="mt-3">
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(transcription.transcription);
                                alert('Transcription copied to clipboard!');
                            }}
                            className="bg-blue-500 text-white px-4 py-2 rounded text-sm hover:bg-blue-600 transition-colors"
                        >
                            Copy Text
                        </button>
                    </div>
                </div>
            )}

            {file && (
                <div className="mt-4 text-sm text-gray-500">
                    <p>Selected file: {file.name}</p>
                    <p>Size: {(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    <p>Type: {file.type}</p>
                </div>
            )}
        </div>
    );
}
