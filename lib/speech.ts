import { SpeechClient } from '@google-cloud/speech';

export const speechClient = new SpeechClient({
    projectId: process.env.GCP_PROJECT_ID,
    credentials: {
        client_email: process.env.GCS_CLIENT_EMAIL,
        private_key: process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
});

interface GoogleCloudError extends Error {
    code?: number;
    details?: string;
    stack?: string;
}

interface TranscriptionResult {
    transcription: string;
    confidence: number;
    segmentCount: number;
    totalWords: number;
    message?: string;
}

type AudioEncoding = 'LINEAR16' | 'FLAC' | 'MULAW' | 'AMR' | 'AMR_WB' | 'OGG_OPUS' | 'SPEEX_WITH_HEADER_BYTE' | 'MP3';

const getAudioEncoding = (format: string): AudioEncoding => {
    const formatLower = format.toLowerCase();
    switch (formatLower) {
        case 'mp3':
            return 'MP3';
        case 'wav':
        case 'wave':
            return 'LINEAR16';
        case 'mp4':
            return 'MP3';
        case 'flac':
            return 'FLAC';
        case 'ogg':
            return 'OGG_OPUS';
        case 'm4a':
            return 'MP3';
        default:
            console.warn(`Unknown format ${format}, defaulting to MP3`);
            return 'MP3';
    }
};

const getSampleRateHertz = (format: string): number => {
    const formatLower = format.toLowerCase();
    switch (formatLower) {
        case 'wav':
        case 'wave':
            return 16000; // Use 16kHz for WAV to avoid channel issues
        case 'flac':
            return 16000;
        case 'mp3':
        case 'mp4':
        case 'm4a':
        default:
            return 16000;
    }
};

export const transcribeAudio = async (
    gcsUri: string,
    audioFormat: string
): Promise<TranscriptionResult> => {
    try {
        console.log('Transcribing audio:', { gcsUri, audioFormat });

        if (!gcsUri || !gcsUri.startsWith('gs://')) {
            throw new Error(`Invalid GCS URI: ${gcsUri}`);
        }

        const encoding = getAudioEncoding(audioFormat);
        const sampleRate = getSampleRateHertz(audioFormat);

        // Enhanced configuration to handle stereo audio
        const config = {
            encoding: encoding,
            sampleRateHertz: sampleRate,
            languageCode: 'si-LK',
            model: 'default',
            enableAutomaticPunctuation: true,
            enableWordTimeOffsets: false,
            maxAlternatives: 1,
            // Handle multi-channel audio properly
            audioChannelCount: 2, // Allow stereo input
            enableSeparateRecognitionPerChannel: false, // Combine channels
            // Alternative approach - let Google Cloud auto-detect
            useEnhanced: false, // Disable enhanced model that might be stricter
        };

        const audio = { uri: gcsUri };

        console.log('Speech API request config:', JSON.stringify({ config, audio }, null, 2));

        // Try with stereo support first
        try {
            console.log('Using longRunningRecognize with stereo support...');
            const [operation] = await speechClient.longRunningRecognize({
                config,
                audio,
            });

            console.log('Operation started, waiting for results...');
            const [response] = await operation.promise();

            return processTranscriptionResponse(response, audioFormat);

        } catch (stereoError: unknown) {
            const stereoErr = stereoError as GoogleCloudError;

            // If stereo fails, try with mono configuration
            if (stereoErr.message?.includes('channel') || stereoErr.message?.includes('mono')) {
                console.log('Stereo failed, retrying with mono configuration...');

                const monoConfig = {
                    ...config,
                    audioChannelCount: 1, // Force mono
                };

                const [operation] = await speechClient.longRunningRecognize({
                    config: monoConfig,
                    audio,
                });

                const [response] = await operation.promise();
                return processTranscriptionResponse(response, audioFormat);
            } else {
                throw stereoError; // Re-throw if it's not a channel issue
            }
        }

    } catch (error: unknown) {
        const err = error as GoogleCloudError;

        console.error('Speech API error details:', {
            message: err.message,
            code: err.code,
            details: err.details,
        });

        // Enhanced error handling
        if (err.message?.includes('channel') || err.message?.includes('mono')) {
            throw new Error(`Audio channel error: Please use mono (single-channel) audio files, or try converting your stereo file to mono. Current error: ${err.message}`);
        }

        if (err.code === 3) {
            throw new Error(`Invalid audio format or configuration: ${err.message}`);
        }
        if (err.code === 7) {
            throw new Error(`Permission denied: Check service account permissions - ${err.message}`);
        }
        if (err.code === 16) {
            throw new Error(`Authentication failed: Check Google Cloud credentials - ${err.message}`);
        }
        if (err.code === 4) {
            throw new Error(`Request timeout: The audio file might be too long - ${err.message}`);
        }

        throw new Error(`Speech-to-Text API error: ${err.message}`);
    }
};

// Helper function to process transcription response
function processTranscriptionResponse(response: any, audioFormat: string): TranscriptionResult {
    console.log('Speech API response received');

    if (!response.results || response.results.length === 0) {
        console.warn('No transcription results returned');
        return {
            transcription: '',
            confidence: 0,
            segmentCount: 0,
            totalWords: 0,
            message: 'No speech detected in audio file'
        };
    }

    const allTranscripts: string[] = [];
    const allConfidences: number[] = [];

    response.results.forEach((result: any, index: number) => {
        if (result.alternatives && result.alternatives.length > 0) {
            const transcript = result.alternatives[0].transcript;
            const confidence = result.alternatives[0].confidence || 0;

            console.log(`Segment ${index + 1}:`, {
                transcript: transcript?.substring(0, 100) + '...',
                confidence,
            });

            if (transcript) {
                allTranscripts.push(transcript.trim());
                allConfidences.push(confidence);
            }
        }
    });

    const fullTranscription = allTranscripts.join(' ');
    const averageConfidence = allConfidences.length > 0
        ? allConfidences.reduce((sum, conf) => sum + conf, 0) / allConfidences.length
        : 0;

    const wordCount = fullTranscription.trim()
        ? fullTranscription.split(/\s+/).length
        : 0;

    console.log('Full transcription result:', {
        segmentCount: allTranscripts.length,
        averageConfidence,
        totalCharacters: fullTranscription.length,
        totalWords: wordCount,
        audioFormat: audioFormat
    });

    return {
        transcription: fullTranscription,
        confidence: averageConfidence,
        segmentCount: allTranscripts.length,
        totalWords: wordCount
    };
}
