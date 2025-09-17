import { Storage } from '@google-cloud/storage';

const storage = new Storage({
    projectId: process.env.GCP_PROJECT_ID,
    credentials: {
        client_email: process.env.GCS_CLIENT_EMAIL,
        private_key: process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
});

const bucket = storage.bucket(process.env.GCS_BUCKET_NAME as string);

export const uploadToGCS = async (file: Buffer, fileName: string, contentType: string): Promise<string> => {
    const blob = bucket.file(fileName);
    const stream = blob.createWriteStream({
        metadata: { contentType },
        resumable: false,
    });

    return new Promise<string>((resolve, reject) => {
        stream.on('error', reject);
        stream.on('finish', () => {
            resolve(`gs://${process.env.GCS_BUCKET_NAME}/${fileName}`);
        });
        stream.end(file);
    });
};

export { bucket };
