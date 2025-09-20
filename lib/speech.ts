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
    detectedLanguages?: string[];
    primaryLanguage?: string;
    languageConfidence?: number;
}

type AudioEncoding = 'LINEAR16' | 'FLAC' | 'MULAW' | 'AMR' | 'AMR_WB' | 'OGG_OPUS' | 'SPEEX_WITH_HEADER_BYTE' | 'MP3';
type LanguageMode = 'sinhala' | 'english' | 'mixed';

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

export const transcribeAudio = async (
    gcsUri: string,
    audioFormat: string,
    languageMode: LanguageMode = 'mixed'
): Promise<TranscriptionResult> => {
    try {
        console.log('Starting transcription with language mode:', { gcsUri, audioFormat, languageMode });

        if (!gcsUri || !gcsUri.startsWith('gs://')) {
            throw new Error(`Invalid GCS URI: ${gcsUri}`);
        }

        const encoding = getAudioEncoding(audioFormat);

        // Build configuration based on language mode
        let config: any = {
            encoding: encoding,
            sampleRateHertz: 16000,
            model: 'default',
            enableAutomaticPunctuation: true,
            enableWordTimeOffsets: false,
            maxAlternatives: 1,
            audioChannelCount: 2,
            enableSeparateRecognitionPerChannel: false,
        };

        // Configure language settings based on mode
        switch (languageMode) {
            case 'sinhala':
                config.languageCode = 'si-LK';
                console.log('Configured for Sinhala only');
                break;

            case 'english':
                config.languageCode = 'en-US';
                console.log('Configured for English only');
                break;

            case 'mixed':
                config.languageCode = 'si-LK';
                config.alternativeLanguageCodes = ['en-US'];
                console.log('Configured for mixed Sinhala-English');
                break;
        }

        const audio = { uri: gcsUri };

        console.log('Speech API configuration:', JSON.stringify({ config, audio }, null, 2));

        try {
            const [operation] = await speechClient.longRunningRecognize({
                config,
                audio,
            });

            console.log(`${languageMode} mode operation started, waiting for results...`);
            const [response] = await operation.promise();

            return processTranscriptionResponse(response, languageMode);

        } catch (stereoError: unknown) {
            const stereoErr = stereoError as GoogleCloudError;

            if (stereoErr.message?.includes('channel') || stereoErr.message?.includes('mono')) {
                console.log('Stereo failed, retrying with mono configuration...');

                const monoConfig = {
                    ...config,
                    audioChannelCount: 1,
                };

                const [operation] = await speechClient.longRunningRecognize({
                    config: monoConfig,
                    audio,
                });

                const [response] = await operation.promise();
                return processTranscriptionResponse(response, languageMode);
            } else {
                throw stereoError;
            }
        }

    } catch (error: unknown) {
        const err = error as GoogleCloudError;

        console.error(`Speech API error (${languageMode} mode):`, {
            message: err.message,
            code: err.code,
        });

        if (err.message?.includes('channel') || err.message?.includes('mono')) {
            throw new Error('Audio channel error: Please convert to mono (single-channel) audio.');
        }

        if (err.code === 3) {
            throw new Error(`Invalid audio configuration for ${languageMode} mode: ${err.message}`);
        }
        if (err.code === 7) {
            throw new Error('Permission denied: Check service account permissions');
        }
        if (err.code === 16) {
            throw new Error('Authentication failed: Check Google Cloud credentials');
        }
        if (err.code === 4) {
            throw new Error('Request timeout: Audio file might be too long');
        }

        throw new Error(`Speech-to-Text error (${languageMode} mode): ${err.message}`);
    }
};

function processTranscriptionResponse(response: any, languageMode: LanguageMode): TranscriptionResult {
    console.log(`Processing transcription response (${languageMode} mode)...`);

    if (!response.results || response.results.length === 0) {
        return {
            transcription: '',
            confidence: 0,
            segmentCount: 0,
            totalWords: 0,
            message: 'No speech detected',
            detectedLanguages: languageMode === 'mixed' ? ['si-LK', 'en-US'] : [languageMode === 'sinhala' ? 'si-LK' : 'en-US'],
            primaryLanguage: languageMode === 'sinhala' ? 'si-LK' : languageMode === 'english' ? 'en-US' : 'mixed'
        };
    }

    const allTranscripts: string[] = [];
    const allConfidences: number[] = [];
    const detectedLanguages = new Set<string>();

    response.results.forEach((result: any, index: number) => {
        if (result.alternatives && result.alternatives.length > 0) {
            const transcript = result.alternatives[0].transcript;
            const confidence = result.alternatives[0].confidence || 0;
            const languageCode = result.languageCode || (languageMode === 'sinhala' ? 'si-LK' : languageMode === 'english' ? 'en-US' : 'si-LK');

            detectedLanguages.add(languageCode);

            console.log(`Segment ${index + 1} (${languageMode} mode):`, {
                transcript: transcript?.substring(0, 50) + '...',
                confidence: confidence.toFixed(3),
                language: languageCode,
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

    const wordCount = fullTranscription.trim() ? fullTranscription.split(/\s+/).length : 0;

    // Determine primary language based on mode and content
    let primaryLanguage = languageMode === 'sinhala' ? 'si-LK' : languageMode === 'english' ? 'en-US' : 'mixed';

    // For mixed mode, analyze content to determine primary language
    if (languageMode === 'mixed') {
        const sinhalaChars = (fullTranscription.match(/[\u0D80-\u0DFF]/g) || []).length;
        const englishChars = (fullTranscription.match(/[A-Za-z]/g) || []).length;

        if (sinhalaChars > englishChars) {
            primaryLanguage = 'si-LK';
        } else if (englishChars > sinhalaChars) {
            primaryLanguage = 'en-US';
        } else {
            primaryLanguage = 'mixed';
        }

        console.log(`Mixed mode analysis: ${sinhalaChars} Sinhala chars, ${englishChars} English chars, primary: ${primaryLanguage}`);
    }

    console.log(`Transcription completed (${languageMode} mode):`, {
        segments: allTranscripts.length,
        confidence: averageConfidence.toFixed(3),
        words: wordCount,
        detectedLanguages: Array.from(detectedLanguages),
        primaryLanguage
    });

    return {
        transcription: fullTranscription,
        confidence: averageConfidence,
        segmentCount: allTranscripts.length,
        totalWords: wordCount,
        detectedLanguages: Array.from(detectedLanguages),
        primaryLanguage: primaryLanguage,
        languageConfidence: averageConfidence
    };
}
