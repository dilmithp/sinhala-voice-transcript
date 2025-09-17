import AudioUploader from '../components/AudioUploader';

export default function Home() {
    return (
        <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8">
            <div className="container mx-auto px-4">
                <AudioUploader />
            </div>
        </main>
    );
}
