'use client';

import { useState, useRef } from 'react';

interface UploadResult {
    success: boolean;
    gcsUri: string;
    fileName: string;
    size: number;
    type: string;
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
    const [uploadProgress, setUploadProgress] = useState<string>('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = event.target.files?.[0];
        if (selectedFile) {
            // Validate file size (50MB limit)
            const maxSize = 50 * 1024 * 1024; // 50MB
            if (selectedFile.size > maxSize) {
                setError('File size too large. Maximum 50MB allowed.');
                return;
            }

            // Validate file type
            const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/wav', 'video/mp4'];
            if (!allowedTypes.includes(selectedFile.type)) {
                setError(`Invalid file type: ${selectedFile.type}. Please use MP3, MP4, or WAV files.`);
                return;
            }

            setFile(selectedFile);
            setTranscription(null);
            setError(null);
            setUploadProgress('');
        }
    };

    const handleUploadAndTranscribe = async () => {
        if (!file) return;

        setUploading(true);
        setTranscribing(false);
        setError(null);
        setTranscription(null);
        setUploadProgress('Preparing file for upload...');

        try {
            // Upload file
            console.log('Starting upload for file:', file.name);
            setUploadProgress('Uploading file to cloud storage...');

            const formData = new FormData();
            formData.append('audio', file);

            const uploadResponse = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            const uploadData = await uploadResponse.text();
            console.log('Upload response received');

            if (!uploadResponse.ok) {
                let errorData;
                try {
                    errorData = uploadData ? JSON.parse(uploadData) : { error: 'Upload failed' };
                } catch {
                    errorData = { error: `Upload failed with status: ${uploadResponse.status}` };
                }
                throw new Error(errorData.error);
            }

            const uploadResult: UploadResult = JSON.parse(uploadData);
            console.log('Upload successful:', {
                fileName: uploadResult.fileName,
                size: uploadResult.size
            });

            setUploading(false);
            setTranscribing(true);
            setUploadProgress('Processing audio for transcription...');

            // Get file extension for audio format
            const audioFormat = file.name.split('.').pop()?.toLowerCase() || 'mp3';
            console.log('Starting transcription with format:', audioFormat);

            // Transcribe audio
            const transcribeResponse = await fetch('/api/transcribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gcsUri: uploadResult.gcsUri,
                    audioFormat,
                }),
            });

            const transcribeData = await transcribeResponse.text();
            console.log('Transcription response received');

            if (!transcribeResponse.ok) {
                let errorData;
                try {
                    errorData = transcribeData ? JSON.parse(transcribeData) : { error: 'Transcription failed' };
                } catch {
                    errorData = { error: `Transcription failed with status: ${transcribeResponse.status}` };
                }
                throw new Error(errorData.error);
            }

            const transcriptionResult: TranscriptionResult = JSON.parse(transcribeData);
            console.log('Transcription completed successfully');
            setTranscription(transcriptionResult);
            setUploadProgress('');

        } catch (error: unknown) {
            console.error('Process failed:', error);
            const errorMessage = error instanceof Error
                ? error.message
                : 'An unexpected error occurred. Please try again.';
            setError(errorMessage);
            setUploadProgress('');
        } finally {
            setUploading(false);
            setTranscribing(false);
        }
    };

    const copyToClipboard = async () => {
        if (transcription?.transcription) {
            try {
                await navigator.clipboard.writeText(transcription.transcription);
                alert('Transcription copied to clipboard!');
            } catch (err) {
                console.error('Failed to copy text: ', err);
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = transcription.transcription;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                alert('Transcription copied to clipboard!');
            }
        }
    };

    const resetForm = () => {
        setFile(null);
        setTranscription(null);
        setError(null);
        setUploadProgress('');
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
            <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-gray-800 mb-2">
                    Sinhala Audio Transcription
                </h1>
                <p className="text-gray-600">
                    Upload your Sinhala audio files and get accurate transcriptions using Google Cloud Speech-to-Text
                </p>
            </div>

            {/* File Input Section */}
            <div className="mb-6">
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/mp3,audio/mpeg,audio/wav,audio/mp4,video/mp4"
                    onChange={handleFileSelect}
                    className="hidden"
                />

                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full p-4 text-gray-600 hover:text-blue-600 transition-colors"
                    >
                        <div className="text-4xl mb-2">📁</div>
                        {file ? (
                            <div>
                                <p className="font-medium text-gray-800">{file.name}</p>
                                <p className="text-sm text-gray-500">
                                    {(file.size / 1024 / 1024).toFixed(2)} MB • {file.type}
                                </p>
                            </div>
                        ) : (
                            <div>
                                <p className="text-lg font-medium mb-2">Choose Audio File</p>
                                <p className="text-sm text-gray-500">
                                    Supported formats: MP3, MP4, WAV (Max 50MB)
                                </p>
                            </div>
                        )}
                    </button>
                </div>
            </div>

            {/* Action Buttons */}
            {file && (
                <div className="flex gap-4 mb-6">
                    <button
                        onClick={handleUploadAndTranscribe}
                        disabled={uploading || transcribing}
                        className="flex-1 bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors font-medium"
                    >
                        {uploading && '⏫ Uploading...'}
                        {transcribing && '🎵 Transcribing...'}
                        {!uploading && !transcribing && '🚀 Upload & Transcribe'}
                    </button>

                    <button
                        onClick={resetForm}
                        disabled={uploading || transcribing}
                        className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:bg-gray-100 transition-colors"
                    >
                        Reset
                    </button>
                </div>
            )}

            {/* Progress Indicator */}
            {(uploading || transcribing) && (
                <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-3"></div>
                        <span className="text-blue-800">
                            {uploadProgress || (transcribing ? 'Transcribing audio... This may take a few minutes for longer files.' : 'Processing...')}
                        </span>
                    </div>
                </div>
            )}

            {/* Error Display */}
            {error && (
                <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-start">
                        <div className="text-red-500 text-xl mr-3">⚠️</div>
                        <div>
                            <h3 className="font-semibold text-red-800 mb-2">Error Occurred</h3>
                            <p className="text-red-700 text-sm">{error}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Transcription Results */}
            {transcription && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-gray-800">Transcription Result</h3>
                        <button
                            onClick={copyToClipboard}
                            className="bg-blue-500 text-white px-4 py-2 rounded text-sm hover:bg-blue-600 transition-colors flex items-center gap-2"
                        >
                            📋 Copy Text
                        </button>
                    </div>

                    {/* Transcription Text */}
                    <div className="bg-white border rounded-lg p-4 mb-4 max-h-64 overflow-y-auto">
                        <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">
                            {transcription.transcription || 'No speech detected in the audio file.'}
                        </p>
                    </div>

                    {/* Statistics Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div className="bg-white p-3 rounded border">
                            <span className="font-medium text-gray-600">Confidence:</span>
                            <div className="text-lg font-semibold text-gray-800">
                                {(transcription.confidence * 100).toFixed(1)}%
                            </div>
                        </div>

                        <div className="bg-white p-3 rounded border">
                            <span className="font-medium text-gray-600">Language:</span>
                            <div className="text-lg font-semibold text-gray-800">
                                {transcription.language}
                            </div>
                        </div>

                        {transcription.segmentCount && (
                            <div className="bg-white p-3 rounded border">
                                <span className="font-medium text-gray-600">Segments:</span>
                                <div className="text-lg font-semibold text-gray-800">
                                    {transcription.segmentCount}
                                </div>
                            </div>
                        )}

                        {transcription.totalWords && (
                            <div className="bg-white p-3 rounded border">
                                <span className="font-medium text-gray-600">Words:</span>
                                <div className="text-lg font-semibold text-gray-800">
                                    {transcription.totalWords}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Instructions */}
            <div className="mt-8 text-center text-sm text-gray-500">
                <p>
                    💡 <strong>Tips:</strong> For best results, use clear audio with minimal background noise.
                    Longer files may take several minutes to process.
                </p>
            </div>
        </div>
    );
}
