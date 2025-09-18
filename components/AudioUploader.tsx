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
    service?: 'google' | 'openai';
}

type ServiceTab = 'google' | 'openai';

export default function AudioUploader() {
    const [activeTab, setActiveTab] = useState<ServiceTab>('google');
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [transcribing, setTranscribing] = useState(false);
    const [transcription, setTranscription] = useState<TranscriptionResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [uploadProgress, setUploadProgress] = useState<string>('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleTabChange = (tab: ServiceTab) => {
        setActiveTab(tab);
        setTranscription(null);
        setError(null);
        setUploadProgress('');
    };

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = event.target.files?.[0];
        if (selectedFile) {
            // Updated file size limits - 100MB for Google Cloud, 25MB for OpenAI
            const maxSize = activeTab === 'openai' ? 25 * 1024 * 1024 : 100 * 1024 * 1024;
            const maxSizeLabel = activeTab === 'openai' ? '25MB' : '100MB';

            if (selectedFile.size > maxSize) {
                setError(`File size too large. Maximum ${maxSizeLabel} allowed for ${activeTab === 'openai' ? 'OpenAI Whisper' : 'Google Cloud'}.`);
                return;
            }

            // Updated supported file types with better WAV support
            const allowedTypes = [
                'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/wav', 'audio/wave',
                'video/mp4', 'audio/webm', 'audio/m4a', 'audio/ogg', 'audio/flac'
            ];

            if (!allowedTypes.includes(selectedFile.type)) {
                setError(`Invalid file type: ${selectedFile.type}. Supported formats: MP3, MP4, WAV, M4A, FLAC, OGG, WebM`);
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
            if (activeTab === 'google') {
                await handleGoogleTranscription();
            } else {
                await handleOpenAITranscription();
            }
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

    const handleGoogleTranscription = async () => {
        if (!file) return;

        setUploadProgress('Uploading file to Google Cloud Storage...');

        const formData = new FormData();
        formData.append('audio', file);

        const uploadResponse = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
        });

        const uploadData = await uploadResponse.text();

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
        console.log('Google Cloud upload successful');

        setUploading(false);
        setTranscribing(true);
        setUploadProgress('Processing audio with Google Speech-to-Text...');

        const audioFormat = file.name.split('.').pop()?.toLowerCase() || 'mp3';

        const transcribeResponse = await fetch('/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                gcsUri: uploadResult.gcsUri,
                audioFormat,
            }),
        });

        const transcribeData = await transcribeResponse.text();

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
        transcriptionResult.service = 'google';
        setTranscription(transcriptionResult);
        setUploadProgress('');
    };

    const handleOpenAITranscription = async () => {
        if (!file) return;

        setUploading(false);
        setTranscribing(true);
        setUploadProgress('Processing audio with OpenAI Whisper...');

        const formData = new FormData();
        formData.append('audio', file);
        // Remove the language parameter - let Whisper auto-detect

        const transcribeResponse = await fetch('/api/whisper', {
            method: 'POST',
            body: formData,
        });

        const transcribeData = await transcribeResponse.text();

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
        transcriptionResult.service = 'openai';
        setTranscription(transcriptionResult);
        setUploadProgress('');
    };


    const copyToClipboard = async () => {
        if (transcription?.transcription) {
            try {
                await navigator.clipboard.writeText(transcription.transcription);
                alert('Transcription copied to clipboard!');
            } catch (err) {
                console.error('Failed to copy text: ', err);
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

    const getMaxFileSize = () => activeTab === 'openai' ? '25MB' : '100MB';
    const getServiceName = () => activeTab === 'openai' ? 'OpenAI Whisper' : 'Google Cloud Speech-to-Text';

    return (
        <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
            <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-gray-800 mb-2">
                    Sinhala Audio Transcription
                </h1>
                <p className="text-gray-600">
                    Upload your Sinhala audio files and get accurate transcriptions
                </p>
            </div>

            {/* Service Selection Tabs */}
            <div className="mb-6">
                <div className="flex border-b border-gray-200">
                    <button
                        onClick={() => handleTabChange('google')}
                        className={`py-2 px-4 text-sm font-medium border-b-2 transition-colors ${
                            activeTab === 'google'
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        🎯 Google Cloud Speech-to-Text
                    </button>
                    <button
                        onClick={() => handleTabChange('openai')}
                        className={`py-2 px-4 text-sm font-medium border-b-2 transition-colors ${
                            activeTab === 'openai'
                                ? 'border-green-500 text-green-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        🤖 OpenAI Whisper
                    </button>
                </div>

                {/* Service Description */}
                <div className="mt-3 p-3 rounded-lg bg-gray-50">
                    {activeTab === 'google' ? (
                        <div className="text-sm text-gray-600">
                            <strong>Google Cloud Speech-to-Text:</strong> Advanced speech recognition optimized for Sinhala language with confidence scores and detailed analytics. Supports files up to 100MB.
                        </div>
                    ) : (
                        <div className="text-sm text-gray-600">
                            {/*<strong>OpenAI Whisper:</strong> State-of-the-art speech recognition model with excellent multilingual support including Sinhala. Supports files up to 25MB.*/}
                        </div>
                    )}
                </div>
            </div>

            {/* File Input Section */}
            <div className="mb-6">
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/mp3,audio/mpeg,audio/wav,audio/wave,audio/mp4,video/mp4,audio/m4a,audio/flac,audio/ogg,audio/webm"
                    onChange={handleFileSelect}
                    className="hidden"
                />

                <div className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    activeTab === 'google'
                        ? 'border-blue-300 hover:border-blue-500'
                        : 'border-green-300 hover:border-green-500'
                }`}>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full p-4 text-gray-600 hover:text-blue-600 transition-colors"
                    >
                        <div className="text-4xl mb-2">🎵</div>
                        {file ? (
                            <div>
                                <p className="font-medium text-gray-800">{file.name}</p>
                                <p className="text-sm text-gray-500">
                                    {(file.size / 1024 / 1024).toFixed(2)} MB • {file.type}
                                </p>
                                <p className="text-xs text-gray-400 mt-1">
                                    Will be processed with {getServiceName()}
                                </p>
                            </div>
                        ) : (
                            <div>
                                <p className="text-lg font-medium mb-2">Choose Audio File</p>
                                <p className="text-sm text-gray-500">
                                    Supported: MP3, MP4, WAV, M4A, FLAC, OGG, WebM (Max {getMaxFileSize()})
                                </p>
                                <p className="text-xs text-gray-400 mt-2">
                                    Selected service: {getServiceName()}
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
                        className={`flex-1 text-white py-3 px-6 rounded-lg font-medium transition-colors ${
                            activeTab === 'google'
                                ? 'bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400'
                                : 'bg-green-600 hover:bg-green-700 disabled:bg-gray-400'
                        }`}
                    >
                        {uploading && '⏫ Uploading...'}
                        {transcribing && `🎵 Transcribing with ${activeTab === 'google' ? 'Google' : 'Whisper'}...`}
                        {!uploading && !transcribing && `🚀 Transcribe with ${activeTab === 'google' ? 'Google' : 'Whisper'}`}
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
                <div className={`mb-6 border rounded-lg p-4 ${
                    activeTab === 'google'
                        ? 'bg-blue-50 border-blue-200'
                        : 'bg-green-50 border-green-200'
                }`}>
                    <div className="flex items-center justify-center">
                        <div className={`animate-spin rounded-full h-5 w-5 border-b-2 mr-3 ${
                            activeTab === 'google' ? 'border-blue-600' : 'border-green-600'
                        }`}></div>
                        <span className={activeTab === 'google' ? 'text-blue-800' : 'text-green-800'}>
                            {uploadProgress || (transcribing ? 'Transcribing audio... This may take several minutes for larger files.' : 'Processing...')}
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
                        <div className="flex items-center gap-2">
                            <h3 className="text-lg font-semibold text-gray-800">Transcription Result</h3>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                                transcription.service === 'google'
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-green-100 text-green-800'
                            }`}>
                                {transcription.service === 'google' ? 'Google Cloud' : 'OpenAI Whisper'}
                            </span>
                        </div>
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
                        {transcription.confidence !== undefined && (
                            <div className="bg-white p-3 rounded border">
                                <span className="font-medium text-gray-600">Confidence:</span>
                                <div className="text-lg font-semibold text-gray-800">
                                    {(transcription.confidence * 100).toFixed(1)}%
                                </div>
                            </div>
                        )}

                        <div className="bg-white p-3 rounded border">
                            <span className="font-medium text-gray-600">Language:</span>
                            <div className="text-lg font-semibold text-gray-800">
                                {transcription.language || 'Sinhala'}
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
                    WAV files provide the highest quality. Larger files (up to 100MB) may take several minutes to process.
                </p>
            </div>
        </div>
    );
}
