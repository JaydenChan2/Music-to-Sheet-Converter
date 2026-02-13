import React, { useState } from 'react';
import UploadSection from './components/UploadSection';
import TabViewer from './components/TabViewer';
import PlaybackControls from './components/PlaybackControls';
import { Music4 } from 'lucide-react';

function App() {
  const [file, setFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFileSelected = (selectedFile) => {
    console.log("File selected:", selectedFile);
    setFile(selectedFile);
    // TODO: Trigger processing
    uploadFile(selectedFile);
  };

  const uploadFile = async (file) => {
    setIsProcessing(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('http://127.0.0.1:5000/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      console.log("Upload success:", data);
      // Next: Call process endpoint
    } catch (error) {
      console.error("Upload error:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-purple-500/30">
      {/* Background Gradients */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-900/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-900/20 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-8 md:py-16">
        <header className="mb-16 text-center">
          <div className="inline-flex items-center justify-center p-3 mb-6 rounded-2xl bg-slate-900/50 border border-slate-800 shadow-xl backdrop-blur-sm">
            <Music4 size={32} className="text-purple-400" />
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-4 tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            Guitar Tab AI
          </h1>
          <p className="text-lg text-slate-400 max-w-xl mx-auto leading-relaxed">
            Transform any audio recording into accurate guitar tablature instantly using advanced signal processing.
          </p>
        </header>

        <main>
          {!file && !isProcessing && (
            <UploadSection onFileSelected={handleFileSelected} />
          )}

          {/* Processing Status */}
          {isProcessing && (
            <div className="text-center py-20 animate-pulse">
              <div className="inline-block relative w-16 h-16 mb-4">
                <div className="absolute top-0 w-16 h-16 border-4 border-purple-500/30 rounded-full"></div>
                <div className="absolute top-0 w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
              <p className="text-purple-400 text-xl font-medium">Processing your audio</p>
              <p className="text-slate-500 mt-2">Extracting frequencies & generating tabs...</p>
            </div>
          )}

          {/* Results View */}
          {!isProcessing && file && (
            <div className="pb-32 animate-in fade-in slide-in-from-bottom-4 duration-700">
              {/* Metadata Card */}
              <div className="max-w-4xl mx-auto mb-8 flex items-center justify-between p-4 bg-slate-900/50 rounded-xl border border-slate-800">
                <div>
                  <h2 className="text-lg font-semibold text-white">{file.name}</h2>
                  <p className="text-slate-400 text-sm">Processed successfully</p>
                </div>
                <button
                  onClick={() => setFile(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Upload New
                </button>
              </div>

              {/* Tab Viewer */}
              <TabViewer
                tabs={null} // TODO: Pass real data
                currentTime={0}
                isPlaying={false}
              />

              {/* Controls */}
              <PlaybackControls
                isPlaying={false}
                onPlayPause={() => { }}
                progress={0}
                duration={0}
                tempo={120}
              />
            </div>
          )}
        </main>

        <footer className="mt-24 text-center text-slate-600 text-sm pb-8">
          <p>© {new Date().getFullYear()} Guitar Tab AI. Built with Flask & React.</p>
        </footer>
      </div>
    </div>
  );
}

export default App;
