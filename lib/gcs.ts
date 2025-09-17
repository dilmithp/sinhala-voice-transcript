import { Storage } from '@google-cloud/storage';

interface StorageConfig {
    projectId?: string;
    credentials?: {
        client_email?: string;
        private_key?: string;
    };
}

const createStorageClient = (): Storage => {
    // Better private key handling
    let privateKey = process.env.GCS_PRIVATE_KEY;

    if (privateKey) {
        // Handle different encoding formats
        privateKey = privateKey
            .replace(/\\n/g, '\n')  // Replace literal \n with actual newlines
            .replace(/"/g, '')      // Remove any quotes
            .trim();                // Remove whitespace

        // Ensure proper formatting
        if (!privateKey.startsWith('-----BEGIN PRIVATE KEY-----')) {
            console.error('Private key format appears incorrect');
        }
    }

    const config: StorageConfig = {
        projectId: process.env.GCP_PROJECT_ID,
        credentials: {
            client_email: process.env.GCS_CLIENT_EMAIL,
            private_key: privateKey,
        },
    };

    return new Storage(config);
};

const storage = createStorageClient();
const bucketName = process.env.GCS_BUCKET_NAME;

if (!bucketName) {
    throw new Error('GCS_BUCKET_NAME environment variable is not set');
}

const bucket = storage.bucket(bucketName);

export const uploadToGCS = async (
    fileBuffer: Buffer,
    fileName: string,
    contentType: string
): Promise<string> => {
    try {
        console.log('Starting GCS upload:', { fileName, contentType, size: fileBuffer.length });

        // Verify credentials before upload
        if (!process.env.GCP_PROJECT_ID || !process.env.GCS_CLIENT_EMAIL || !process.env.GCS_PRIVATE_KEY) {
            throw new Error('Missing required Google Cloud credentials');
        }

        const file = bucket.file(fileName);

        // Use the save method with proper options
        await file.save(fileBuffer, {
            metadata: {
                contentType,
            },
            public: false,
        });

        const gcsUri = `gs://${bucketName}/${fileName}`;
        console.log('File uploaded successfully to GCS:', gcsUri);

        return gcsUri;

    } catch (error) {
        console.error('GCS upload error:', error);

        const err = error as Error;

        // Handle specific authentication errors
        if (err.message.includes('DECODER routines') || err.message.includes('unsupported')) {
            throw new Error('Invalid Google Cloud private key format. Please check your credentials.');
        }

        if (err.message.includes('authentication') || err.message.includes('Unauthorized')) {
            throw new Error('Google Cloud authentication failed. Please verify your service account credentials.');
        }

        throw new Error(`Failed to upload to Google Cloud Storage: ${err.message}`);
    }
};

export { bucket };
