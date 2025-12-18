import React, { useState, useEffect } from 'react';
import { Image as ImageIcon, Settings, Loader2, X, Plus, Wand2, Sparkles } from 'lucide-react';
import { 
  generateImage, 
  uploadUserImage, 
  ImageAspectRatio,
  GeneratedImageResult,
} from './services/imageSandboxApi';
import { compressImage } from './utils/imageCompression';
import { promptTemplates } from './data/promptTemplates';

interface UploadedImage {
  id: string;
  file: File;
  preview: string;
  mediaId: string | null;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
  base64?: string;
  mimeType?: string;
}

function App() {
  const [token, setToken] = useState('');
  const [showTokenInput, setShowTokenInput] = useState(false);
  
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>('IMAGE_ASPECT_RATIO_LANDSCAPE');
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  
  const [generatedImages, setGeneratedImages] = useState<GeneratedImageResult[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const savedToken = localStorage.getItem('VEO_BEARER_TOKEN');
    if (savedToken) setToken(savedToken);
  }, []);

  const handleTokenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newToken = e.target.value;
    setToken(newToken);
    localStorage.setItem('VEO_BEARER_TOKEN', newToken);
  };

  const convertBlobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const files = Array.from(e.target.files);
    
    const newImages: UploadedImage[] = files.map(file => ({
      id: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
      mediaId: null,
      status: 'pending'
    }));
    
    setUploadedImages(prev => [...prev, ...newImages]);
    
    // Process compression for each image
    files.forEach(async (file, index) => {
      const imgId = newImages[index].id;
      try {
        const compressedBlob = await compressImage(file, 100);
        const base64 = await convertBlobToBase64(compressedBlob);
        
        setUploadedImages(prev => prev.map(img => 
          img.id === imgId ? { ...img, base64, mimeType: 'image/jpeg' } : img
        ));
      } catch (err) {
        console.error("Compression failed", err);
        setUploadedImages(prev => prev.map(img => 
          img.id === imgId ? { ...img, status: 'error', error: 'Compression failed' } : img
        ));
      }
    });

    // Reset input
    e.target.value = '';
  };



  const removeImage = (id: string) => {
    setUploadedImages(prev => prev.filter(img => img.id !== id));
  };

  const base64ToBlob = (base64: string, mimeType: string = 'image/png'): Blob => {
    const byteChars = atob(base64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteNumbers[i] = byteChars.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  };

  const downloadGenerated = async (img: GeneratedImageResult, filename: string) => {
    if (img.base64) {
      const blob = base64ToBlob(img.base64, img.mimeType || 'image/png');
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
      return;
    }
    if (img.url) {
      await forceDownload(img.url, filename);
    }
  };

  const forceDownload = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up
      setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
    } catch (err) {
      console.error('Download failed:', err);
      // Fallback
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.target = "_blank";
      link.click();
    }
  };

  const handleGenerate = async () => {
    if (!token) {
      setError("Please set your Google Labs Bearer Token first.");
      setShowTokenInput(true);
      return;
    }
    if (!prompt) {
      setError("Please enter a prompt.");
      return;
    }

    setIsGenerating(true);
    setError(null);
    setGeneratedImages([]);

    try {
      // 1. Check for pending images and upload them
      let currentImages = [...uploadedImages];
      const pendingImages = currentImages.filter(img => !img.mediaId && img.status !== 'error');

      if (pendingImages.length > 0) {
        // Update status to uploading
        setUploadedImages(prev => prev.map(img => 
          pendingImages.some(p => p.id === img.id) ? { ...img, status: 'uploading' } : img
        ));

        // Perform uploads
        const uploadResults = await Promise.all(pendingImages.map(async (img) => {
          try {
            // Check if base64 is ready (compression done)
            if (!img.base64) {
               // If for some reason compression isn't done or failed silently, try again
               const compressedBlob = await compressImage(img.file, 100);
               const base64 = await convertBlobToBase64(compressedBlob);
               img.base64 = base64;
               img.mimeType = 'image/jpeg';
            }

            const mediaId = await uploadUserImage({
              base64: img.base64!,
              mimeType: img.mimeType || 'image/jpeg',
              aspectRatio,
              token
            });
            return { id: img.id, mediaId, status: 'done' as const };
          } catch (e: any) {
            return { id: img.id, error: e.message, status: 'error' as const };
          }
        }));

        // Update local state and UI state with results
        currentImages = currentImages.map(img => {
          const res = uploadResults.find(r => r.id === img.id);
          if (res) {
            return res.status === 'done' 
              ? { ...img, status: 'done', mediaId: res.mediaId }
              : { ...img, status: 'error', error: res.error };
          }
          return img;
        });

        setUploadedImages(currentImages);

        // If any upload failed, stop generation
        if (uploadResults.some(r => r.status === 'error')) {
          throw new Error("Failed to upload some reference images. Please check the errors and try again.");
        }
      }

      // 2. Generate Images
      const mediaIds = currentImages
        .filter(img => img.status === 'done' && img.mediaId)
        .map(img => img.mediaId as string);

      const images = await generateImage({
        prompt,
        aspectRatio,
        token,
        mediaIds,
        count: 4
      });

      setGeneratedImages(images);

    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unknown error occurred");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-2">
            <span className="text-yellow-400 text-3xl">🍌</span>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-yellow-400 to-orange-500">
              Banana Pro Generator
            </h1>
          </div>
          <button 
            onClick={() => setShowTokenInput(!showTokenInput)}
            className="p-2 rounded-full hover:bg-gray-800 transition-colors"
            title="Settings"
          >
            <Settings className="w-6 h-6 text-gray-400" />
          </button>
        </header>

        {showTokenInput && (
          <div className="mb-8 p-4 bg-gray-800 rounded-xl border border-gray-700 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Google Labs Bearer Token
              </label>
              <input
                type="password"
                value={token}
                onChange={handleTokenChange}
                placeholder="ya29.a0..."
                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-sm focus:ring-2 focus:ring-yellow-500 outline-none transition-all"
              />
              <p className="text-xs text-gray-500 mt-2">
                Token is saved locally in your browser.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-8">
          {/* Controls Section */}
          <div className="space-y-6">
            
            {/* Aspect Ratio */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Aspect Ratio
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Landscape', value: 'IMAGE_ASPECT_RATIO_LANDSCAPE', icon: '▭' },
                  { label: 'Portrait', value: 'IMAGE_ASPECT_RATIO_PORTRAIT', icon: '▯' },
                  { label: 'Square', value: 'IMAGE_ASPECT_RATIO_SQUARE', icon: '□' },
                ].map((ratio) => (
                  <button
                    key={ratio.value}
                    onClick={() => setAspectRatio(ratio.value as ImageAspectRatio)}
                    className={`p-3 rounded-lg border text-sm font-medium transition-all flex flex-col items-center gap-1 ${
                      aspectRatio === ratio.value
                        ? 'bg-yellow-500/10 border-yellow-500 text-yellow-500'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    <span className="text-xl leading-none">{ratio.icon}</span>
                    {ratio.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Prompt */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-gray-400">
                  Prompt
                </label>
                <div className="relative">
                  <select 
                    onChange={(e) => {
                      const template = promptTemplates.find(t => t.id === e.target.value);
                      if (template) setPrompt(template.prompt);
                      e.target.value = ""; // Reset select
                    }}
                    className="appearance-none bg-gray-800 text-yellow-500 text-xs font-medium border border-gray-700 rounded-lg py-1 px-3 pr-8 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-yellow-500 cursor-pointer"
                  >
                    <option value="">✨ Template Cepat...</option>
                    {[...new Set(promptTemplates.map(t => t.category))].map(category => (
                      <optgroup key={category} label={category}>
                        {promptTemplates
                          .filter(t => t.category === category)
                          .map(t => (
                            <option key={t.id} value={t.id}>{t.label}</option>
                          ))
                        }
                      </optgroup>
                    ))}
                  </select>
                  <Sparkles className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-yellow-500 pointer-events-none" />
                </div>
              </div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe your image or choose a template above..."
                className="w-full h-32 bg-gray-800 border border-gray-700 rounded-xl p-4 text-sm focus:ring-2 focus:ring-yellow-500 outline-none resize-none transition-all"
              />
            </div>

            {/* Reference Images */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Reference Images (Select multiple to combine)
              </label>
              <div className="flex flex-wrap gap-3">
                {uploadedImages.map((img) => (
                  <div key={img.id} className="relative w-20 h-20 group">
                    <img 
                      src={img.preview} 
                      alt="Ref" 
                      className={`w-full h-full object-cover rounded-lg border ${
                        img.status === 'error' ? 'border-red-500' : 'border-gray-600'
                      }`} 
                    />
                    <button
                      onClick={() => removeImage(img.id)}
                      className="absolute -top-2 -right-2 bg-red-500 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                    {img.status === 'uploading' && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
                        <Loader2 className="w-5 h-5 text-white animate-spin" />
                      </div>
                    )}
                    {img.status === 'error' && (
                       <div className="absolute inset-0 bg-red-500/50 flex items-center justify-center rounded-lg" title={img.error}>
                         <span className="text-xs font-bold text-white">!</span>
                       </div>
                    )}
                  </div>
                ))}
                
                <label className="w-20 h-20 flex flex-col items-center justify-center border-2 border-dashed border-gray-700 rounded-lg cursor-pointer hover:border-yellow-500 hover:text-yellow-500 text-gray-500 transition-all">
                  <Plus className="w-6 h-6 mb-1" />
                  <span className="text-[10px]">Add</span>
                  <input 
                    type="file" 
                    accept="image/*" 
                    multiple
                    className="hidden" 
                    onChange={handleFileUpload}
                  />
                </label>
              </div>
            </div>

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all ${
                isGenerating 
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-400 hover:to-orange-500 text-white shadow-lg hover:shadow-orange-500/25'
              }`}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Wand2 className="w-6 h-6" />
                  Generate
                </>
              )}
            </button>

            {error && (
              <div className="p-4 bg-red-900/20 border border-red-500/50 rounded-xl text-red-200 text-sm">
                {error}
              </div>
            )}
          </div>

          {/* Result Section */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-4 md:p-6 min-h-[400px]">
            {generatedImages.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {generatedImages.map((img, idx) => {
                  const imgSrc = img.base64 
                    ? `data:${img.mimeType || 'image/png'};base64,${img.base64}`
                    : (img.url as string);
                  return (
                  <div 
                    key={idx} 
                    className="relative group w-full bg-gray-900 rounded-xl overflow-hidden cursor-pointer shadow-lg"
                    onClick={() => setSelectedImage(imgSrc)}
                  >
                    <img 
                      src={imgSrc} 
                      alt={`Generated Result ${idx + 1}`} 
                      className="w-full h-auto object-contain hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                       <button
                         onClick={(e) => {
                           e.stopPropagation();
                           downloadGenerated(img, `banana-pro-generated-${idx + 1}.png`);
                         }}
                         className="bg-gray-900/80 text-white p-2 rounded-lg hover:bg-black"
                         title="Download"
                       >
                         <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                       </button>
                    </div>
                  </div>
                );})}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 min-h-[350px]">
                <ImageIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p>Your masterpieces will appear here</p>
              </div>
            )}
          </div>
        </div>

        {/* Lightbox Modal */}
        {selectedImage && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
            onClick={() => setSelectedImage(null)}
          >
            <div className="relative max-w-full max-h-full">
              <img 
                src={selectedImage} 
                alt="Full size" 
                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
              />
              <div className="absolute -top-12 right-0 flex gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (selectedImage.startsWith('data:')) {
                      const link = document.createElement('a');
                      link.href = selectedImage;
                      link.download = `banana-pro-generated-full.png`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    } else {
                      forceDownload(selectedImage, `banana-pro-generated-full.png`);
                    }
                  }}
                  className="p-2 text-white hover:text-gray-300 transition-colors"
                  title="Download"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                </button>
                <button
                  onClick={() => setSelectedImage(null)}
                  className="p-2 text-white hover:text-gray-300 transition-colors"
                >
                  <X className="w-8 h-8" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;