import React, { useState, useEffect } from 'react';
import { XMarkIcon } from './icons';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    currentToken: string;
    onSave: (token: string) => void;
}

const TokenSettingsModal: React.FC<Props> = ({ isOpen, onClose, currentToken, onSave }) => {
    const [tokenInput, setTokenInput] = useState(currentToken);

    useEffect(() => {
        setTokenInput(currentToken);
    }, [currentToken, isOpen]);

    if (!isOpen) return null;

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(tokenInput.trim());
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}></div>

            {/* Modal Content */}
            <div className="glass-panel w-full max-w-lg rounded-3xl p-8 relative z-10 animate-scaleIn bg-white shadow-2xl border-slate-200">
                <div className="flex items-center justify-between mb-8">
                    <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2">
                        Pengaturan API
                    </h2>
                    <button onClick={onClose} className="p-2.5 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-700">
                        <XMarkIcon className="w-7 h-7" />
                    </button>
                </div>

                <form onSubmit={handleSave} className="space-y-8">
                    <div className="space-y-3">
                        <label htmlFor="authToken" className="block text-base font-bold text-slate-800">
                            Token Bearer Google Labs
                        </label>
                        <input
                            id="authToken"
                            type="password"
                            value={tokenInput}
                            onChange={(e) => setTokenInput(e.target.value)}
                            placeholder="ya29.a0..."
                            className="input-base pr-10 font-mono text-base py-4 bg-slate-50 focus:bg-white"
                            autoComplete="off"
                        />
                        <p className="text-sm text-slate-500 leading-relaxed">
                            Diperlukan untuk mengakses model VEO 3.1 Sandbox. Token ini disimpan secara lokal dan aman di browser Anda sendiri.
                        </p>
                    </div>

                    <div className="flex justify-end gap-4 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-3.5 rounded-xl font-bold text-base text-slate-600 hover:bg-slate-100 transition-colors"
                        >
                            Batal
                        </button>
                        <button
                            type="submit"
                            className="px-8 py-3.5 rounded-xl font-bold text-base bg-veo-primary text-white shadow-lg shadow-veo-primary/20 hover:bg-veo-primary/90 hover:scale-[1.02] active:scale-[0.98] transition-all"
                        >
                            Simpan Token
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default TokenSettingsModal;