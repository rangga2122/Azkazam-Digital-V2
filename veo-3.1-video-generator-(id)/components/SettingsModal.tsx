import React, { useState, useEffect } from 'react';
import { getToken, saveToken } from '../services/storage';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [token, setTokenState] = useState('');

  useEffect(() => {
    if (isOpen) {
      setTokenState(getToken());
    }
  }, [isOpen]);

  const handleSave = () => {
    saveToken(token);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
          <h3 className="text-xl font-bold text-gray-900">Pengaturan API</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Google Labs Bearer Token
          </label>
          <input 
            type="password" 
            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-veo-primary focus:ring-2 focus:ring-veo-primary/20 outline-none transition-all text-sm"
            placeholder="ya29.a0..."
            value={token}
            onChange={(e) => setTokenState(e.target.value)}
          />
          <p className="text-xs text-gray-500 mt-2">
            Token ini akan disimpan di browser Anda (Local Storage) dan digunakan untuk otentikasi permintaan generate video.
          </p>
        </div>

        <div className="flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Batal
          </button>
          <button 
            onClick={handleSave}
            className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-veo-gradient hover:opacity-90 shadow-md shadow-veo-primary/20 transition-all"
          >
            Simpan Token
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;