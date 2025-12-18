import React, { useState } from 'react';
import { ArrowUp, Square, Image as ImageIcon, X } from 'lucide-react';

interface InputAreaProps {
  onSend: (text: string, images?: string[]) => void;
  isLoading: boolean;
  onStop?: () => void;
}

export const InputArea: React.FC<InputAreaProps> = ({ onSend, isLoading, onStop }) => {
  const [input, setInput] = useState('');
  const [images, setImages] = useState<string[]>([]);

  const handleSend = () => {
    if (input.trim() && !isLoading) {
      onSend(input, images.length ? images : undefined);
      setInput('');
      setImages([]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };
  
  const handlePickImages = async (files: FileList | null) => {
    if (!files || isLoading) return;
    const max = 4;
    const selected = Array.from(files).slice(0, max);
    const readers = await Promise.all(
      selected.map(
        (file) =>
          new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.readAsDataURL(file);
          })
      )
    );
    setImages((prev) => {
      const merged = [...prev, ...readers].slice(0, max);
      return merged;
    });
  };
  
  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="w-full bg-gradient-to-t from-black via-black to-transparent pt-4 pb-6 px-4 border-t border-gray-700/60">
      <div className="mx-auto md:max-w-3xl">
        <div className="relative flex items-center w-full p-3 bg-[#2f2f2f] rounded-full border border-transparent shadow-sm focus-within:border-gray-500/50 transition-all">
          {!isLoading && (
            <>
              <label
                htmlFor="bangvidgo-image-input"
                className="mr-2 w-8 h-8 rounded-full flex items-center justify-center bg-[#3a3a3a] hover:bg-[#505050] text-white transition-all shadow-sm cursor-pointer"
                title="Upload Gambar"
              >
                <ImageIcon size={16} />
              </label>
              <input
                id="bangvidgo-image-input"
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handlePickImages(e.target.files)}
              />
            </>
          )}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tanya Apa saja ke Bang Vidgo"
            className="flex-1 bg-transparent text-gray-100 placeholder-gray-400 border-0 focus:ring-0 outline-none focus:outline-none py-2 pr-12 text-[15px] leading-6"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {isLoading ? (
              onStop ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="w-8 h-8 rounded-full flex items-center justify-center bg-[#ff4d4f] hover:bg-[#ff7875] text-white transition-all shadow-sm"
                  title="Stop"
                >
                  <Square size={12} className="text-white fill-white" />
                </button>
              ) : (
                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-[#3a3a3a] cursor-not-allowed">
                  <div className="animate-pulse">
                    <Square size={12} className="text-white fill-white" />
                  </div>
                </div>
              )
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className={`w-8 h-8 rounded-full transition-all duration-200 flex items-center justify-center ${
                  input.trim()
                    ? 'bg-white text-black hover:bg-gray-200'
                    : 'bg-[#676767] text-gray-900 cursor-not-allowed opacity-50'
                }`}
              >
                <ArrowUp size={18} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
        {images.length > 0 && (
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {images.map((src, idx) => (
              <div key={idx} className="relative">
                <img src={src} alt="" className="w-12 h-12 object-cover rounded-md border border-gray-700" />
                <button
                  onClick={() => removeImage(idx)}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-gray-800 text-gray-300 hover:bg-gray-700 flex items-center justify-center"
                  title="Hapus"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="text-center mt-2">
          <p className="text-xs text-gray-500">
            copyright |{' '}
            <a 
              href="https://www.azkazamdigital.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="font-medium"
              style={{ color: '#a0522d' }}
            >
              www.azkazamdigital.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};
