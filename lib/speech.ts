import { SpeechClient } from '@google-cloud/speech';

// Use the correct type from the Google Cloud library
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
            return 'LINEAR16';
        case 'mp4':
            return 'MP3';
        case 'flac':
            return 'FLAC';
        case 'ogg':
            return 'OGG_OPUS';
        default:
            console.warn(`Unknown format ${format}, defaulting to MP3`);
            return 'MP3';
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

        const config = {
            encoding: getAudioEncoding(audioFormat),
            sampleRateHertz: 16000,
            languageCode: 'si-LK',
            model: 'default',
            enableAutomaticPunctuation: true,
            enableWordTimeOffsets: false,
            maxAlternatives: 1,
        };

        const audio = { uri: gcsUri };

        console.log('Speech API request config:', JSON.stringify({ config, audio }, null, 2));
        console.log('Using longRunningRecognize for transcription...');

        const [operation] = await speechClient.longRunningRecognize({
            config,
            audio,
        });

        console.log('Operation started, waiting for results...');
        const [response] = await operation.promise();

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

        response.results.forEach((result, index) => {
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
            totalWords: wordCount
        });

        return {
            transcription: fullTranscription,
            confidence: averageConfidence,
            segmentCount: allTranscripts.length,
            totalWords: wordCount
        };

    } catch (error: unknown) {
        const err = error as GoogleCloudError;

        console.error('Speech API error details:', {
            message: err.message,
            code: err.code,
            details: err.details,
        });

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
