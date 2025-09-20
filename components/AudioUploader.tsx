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
    detectedLanguages?: string[];
    primaryLanguage?: string;
    languageConfidence?: number;
}

type ServiceTab = 'google' | 'openai';
type LanguageMode = 'sinhala' | 'english' | 'mixed';

export default function AudioUploader() {
    const [activeTab, setActiveTab] = useState<ServiceTab>('google');
    const [languageMode, setLanguageMode] = useState<LanguageMode>('mixed');
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

    const handleLanguageModeChange = (mode: LanguageMode) => {
        setLanguageMode(mode);
        setTranscription(null);
        setError(null);
    };

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = event.target.files?.[0];
        if (selectedFile) {
            const maxSize = activeTab === 'openai' ? 25 * 1024 * 1024 : 100 * 1024 * 1024;
            const maxSizeLabel = activeTab === 'openai' ? '25MB' : '100MB';

            if (selectedFile.size > maxSize) {
                setError(`File too large. Maximum ${maxSizeLabel} allowed.`);
                return;
            }

            const allowedTypes = [
                'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/wav', 'audio/wave',
                'video/mp4', 'audio/webm', 'audio/m4a', 'audio/ogg', 'audio/flac'
            ];

            if (!allowedTypes.includes(selectedFile.type)) {
                setError(`Invalid file type: ${selectedFile.type}`);
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
        setUploadProgress('Preparing...');

        try {
            if (activeTab === 'google') {
                await handleGoogleTranscription();
            } else {
                await handleOpenAITranscription();
            }
        } catch (error: unknown) {
            console.error('Process failed:', error);
            let errorMessage = 'An unexpected error occurred.';

            if (error instanceof Error) {
                errorMessage = error.message;
            }

            setError(errorMessage);
            setUploadProgress('');
        } finally {
            setUploading(false);
            setTranscribing(false);
        }
    };

    const handleGoogleTranscription = async () => {
        if (!file) return;

        setUploadProgress('Uploading to Google Cloud...');

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
                errorData = { error: 'Upload failed' };
            }
            throw new Error(errorData.error);
        }

        const uploadResult: UploadResult = JSON.parse(uploadData);

        setUploading(false);
        setTranscribing(true);

        const modeDescription = {
            'sinhala': 'Transcribing in Sinhala only...',
            'english': 'Transcribing in English only...',
            'mixed': 'Transcribing with mixed language support...'
        };
        setUploadProgress(modeDescription[languageMode]);

        const audioFormat = file.name.split('.').pop()?.toLowerCase() || 'mp3';

        const transcribeResponse = await fetch('/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                gcsUri: uploadResult.gcsUri,
                audioFormat,
                languageMode, // Pass the selected language mode
            }),
        });

        const transcribeData = await transcribeResponse.text();

        if (!transcribeResponse.ok) {
            let errorData;
            try {
                errorData = transcribeData ? JSON.parse(transcribeData) : { error: 'Transcription failed' };
            } catch {
                errorData = { error: 'Transcription failed' };
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
        setUploadProgress('Transcribing with OpenAI Whisper...');

        const formData = new FormData();
        formData.append('audio', file);
        formData.append('languageMode', languageMode);

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
                errorData = { error: 'Transcription failed' };
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

    const getLanguageDisplayName = (langCode: string) => {
        switch (langCode) {
            case 'si-LK':
                return 'සිංහල';
            case 'en-US':
                return 'English';
            case 'mixed':
                return 'Mixed Languages';
            default:
                return langCode;
        }
    };

    const getLanguageModeDescription = () => {
        switch (languageMode) {
            case 'sinhala':
                return 'Optimized for සිංහල speech only';
            case 'english':
                return 'Optimized for English speech only';
            case 'mixed':
                return 'Supports both සිංහල and English in the same audio';
            default:
                return '';
        }
    };

    const getMaxFileSize = () => activeTab === 'openai' ? '25MB' : '100MB';

    return (
        <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
            <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-gray-800 mb-2">
                    Sinhala Audio Transcription
                </h1>
                <p className="text-gray-600">
                    Choose your language mode for optimal transcription accuracy
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
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        🎯 Google Cloud Speech-to-Text
                    </button>
                    <button
                        onClick={() => handleTabChange('openai')}
                        className={`py-2 px-4 text-sm font-medium border-b-2 transition-colors ${
                            activeTab === 'openai'
                                ? 'border-green-500 text-green-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        🤖 OpenAI Whisper
                    </button>
                </div>

                <div className="mt-3 p-3 rounded-lg bg-gray-50">
                    {activeTab === 'google' ? (
                        <div className="text-sm text-gray-600">
                            <strong>Google Cloud Speech-to-Text:</strong> Advanced speech recognition with language-specific optimization.
                            Choose your preferred language mode for best accuracy. Supports up to 100MB files.
                        </div>
                    ) : (
                        <div className="text-sm text-gray-600">
                            <strong>OpenAI Whisper:</strong> State-of-the-art AI model with excellent multilingual support.
                            Language mode selection helps optimize recognition accuracy. Supports up to 25MB files.
                        </div>
                    )}
                </div>
            </div>

            {/* Language Mode Selection */}
            <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Select Language Mode:</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <button
                        onClick={() => handleLanguageModeChange('sinhala')}
                        className={`p-4 border-2 rounded-lg text-left transition-colors ${
                            languageMode === 'sinhala'
                                ? 'border-blue-500 bg-blue-50 text-blue-900'
                                : 'border-gray-300 hover:border-gray-400 text-gray-700'
                        }`}
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">🇱🇰</span>
                            <span className="font-medium">සිංහල Only</span>
                        </div>
                        <p className="text-xs opacity-75">
                            Best for pure Sinhala speech
                        </p>
                    </button>

                    <button
                        onClick={() => handleLanguageModeChange('english')}
                        className={`p-4 border-2 rounded-lg text-left transition-colors ${
                            languageMode === 'english'
                                ? 'border-green-500 bg-green-50 text-green-900'
                                : 'border-gray-300 hover:border-gray-400 text-gray-700'
                        }`}
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">🇺🇸</span>
                            <span className="font-medium">English Only</span>
                        </div>
                        <p className="text-xs opacity-75">
                            Best for pure English speech
                        </p>
                    </button>

                    <button
                        onClick={() => handleLanguageModeChange('mixed')}
                        className={`p-4 border-2 rounded-lg text-left transition-colors ${
                            languageMode === 'mixed'
                                ? 'border-purple-500 bg-purple-50 text-purple-900'
                                : 'border-gray-300 hover:border-gray-400 text-gray-700'
                        }`}
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">🌍</span>
                            <span className="font-medium">Mixed Languages</span>
                        </div>
                        <p className="text-xs opacity-75">
                            For සිංහල-English code-switching
                        </p>
                    </button>
                </div>

                <div className="mt-2 p-2 bg-gray-100 rounded text-sm text-gray-600">
                    <strong>Selected:</strong> {getLanguageModeDescription()}
                </div>
            </div>

            {/* File Input */}
            <div className="mb-6">
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/mp3,audio/mpeg,audio/wav,audio/wave,audio/mp4,video/mp4,audio/m4a,audio/flac,audio/ogg,audio/webm"
                    onChange={handleFileSelect}
                    className="hidden"
                />

                <div className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    languageMode === 'sinhala' ? 'border-blue-300 hover:border-blue-500' :
                        languageMode === 'english' ? 'border-green-300 hover:border-green-500' :
                            'border-purple-300 hover:border-purple-500'
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
                                    Will process in {languageMode} mode
                                </p>
                            </div>
                        ) : (
                            <div>
                                <p className="text-lg font-medium mb-2">Choose Audio File</p>
                                <p className="text-sm text-gray-500">
                                    All formats supported (Max {getMaxFileSize()})
                                </p>
                                <p className="text-xs text-gray-400 mt-2">
                                    Mode: {getLanguageModeDescription()}
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
                            languageMode === 'sinhala' ? 'bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400' :
                                languageMode === 'english' ? 'bg-green-600 hover:bg-green-700 disabled:bg-gray-400' :
                                    'bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400'
                        }`}
                    >
                        {uploading && '⏫ Uploading...'}
                        {transcribing && `🎵 Transcribing (${languageMode} mode)...`}
                        {!uploading && !transcribing && `🚀 Transcribe in ${languageMode} mode`}
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

            {/* Progress */}
            {(uploading || transcribing) && (
                <div className={`mb-6 border rounded-lg p-4 ${
                    languageMode === 'sinhala' ? 'bg-blue-50 border-blue-200' :
                        languageMode === 'english' ? 'bg-green-50 border-green-200' :
                            'bg-purple-50 border-purple-200'
                }`}>
                    <div className="flex items-center justify-center">
                        <div className={`animate-spin rounded-full h-5 w-5 border-b-2 mr-3 ${
                            languageMode === 'sinhala' ? 'border-blue-600' :
                                languageMode === 'english' ? 'border-green-600' :
                                    'border-purple-600'
                        }`}></div>
                        <span className={
                            languageMode === 'sinhala' ? 'text-blue-800' :
                                languageMode === 'english' ? 'text-green-800' :
                                    'text-purple-800'
                        }>
                            {uploadProgress || 'Processing...'}
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
                            <h3 className="font-semibold text-red-800 mb-2">Error</h3>
                            <p className="text-red-700 text-sm">{error}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Transcription Results */}
            {transcription && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-lg font-semibold text-gray-800">Transcription Result</h3>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                                transcription.service === 'google'
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-green-100 text-green-800'
                            }`}>
                                {transcription.service === 'google' ? 'Google Cloud' : 'OpenAI Whisper'}
                            </span>

                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                                languageMode === 'sinhala' ? 'bg-blue-100 text-blue-800' :
                                    languageMode === 'english' ? 'bg-green-100 text-green-800' :
                                        'bg-purple-100 text-purple-800'
                            }`}>
                                {languageMode} mode
                            </span>
                        </div>
                        <button
                            onClick={copyToClipboard}
                            className="bg-blue-500 text-white px-4 py-2 rounded text-sm hover:bg-blue-600 transition-colors flex items-center gap-2"
                        >
                            📋 Copy
                        </button>
                    </div>

                    {/* Transcription Text */}
                    <div className="bg-white border rounded-lg p-4 mb-4 max-h-64 overflow-y-auto">
                        <p className="text-gray-800 leading-relaxed whitespace-pre-wrap" style={{
                            fontSize: '16px',
                            lineHeight: '1.6'
                        }}>
                            {transcription.transcription || 'No speech detected.'}
                        </p>
                    </div>

                    {/* Statistics */}
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
                            <span className="font-medium text-gray-600">Mode:</span>
                            <div className="text-sm font-semibold text-gray-800">
                                {languageMode}
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

                    {/* Language Mode Info */}
                    <div className={`mt-4 p-3 border rounded ${
                        languageMode === 'sinhala' ? 'bg-blue-50 border-blue-200' :
                            languageMode === 'english' ? 'bg-green-50 border-green-200' :
                                'bg-purple-50 border-purple-200'
                    }`}>
                        <div className="flex items-center gap-2">
                            <span className={
                                languageMode === 'sinhala' ? 'text-blue-600' :
                                    languageMode === 'english' ? 'text-green-600' :
                                        'text-purple-600'
                            }>
                                {languageMode === 'sinhala' ? '🇱🇰' : languageMode === 'english' ? '🇺🇸' : '🌍'}
                            </span>
                            <span className={`text-sm ${
                                languageMode === 'sinhala' ? 'text-blue-800' :
                                    languageMode === 'english' ? 'text-green-800' :
                                        'text-purple-800'
                            }`}>
                                <strong>Processed in {languageMode} mode:</strong>
                                {languageMode === 'sinhala' && ' Optimized for සිංහල speech recognition.'}
                                {languageMode === 'english' && ' Optimized for English speech recognition.'}
                                {languageMode === 'mixed' && ' Supports both සිංහල and English in the same audio.'}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Tips */}
            <div className="mt-8 text-center text-sm text-gray-500">
                {/*<p>*/}
                {/*    🎯 <strong>Language Modes:</strong> Choose the mode that matches your audio content for best accuracy.*/}
                {/*    <br />*/}
                {/*    🇱🇰 <strong>සිංහල Mode:</strong> Perfect for pure Sinhala speech.*/}
                {/*    🇺🇸 <strong>English Mode:</strong> Optimized for English speech.*/}
                {/*    🌍 <strong>Mixed Mode:</strong> Handles code-switching.*/}
                {/*</p>*/}
            </div>
        </div>
    );
}
