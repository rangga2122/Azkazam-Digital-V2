
import React, { useState } from 'react';
import { AuthService, User } from '../services/authService';
import { LockClosedIcon, SparklesIcon, UserIcon } from './icons';

interface Props {
    onLogin: (user: User) => void;
}

const LoginPage: React.FC<Props> = ({ onLogin }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        // Simulate network delay for UX
        await new Promise(resolve => setTimeout(resolve, 800));

        try {
            const user = await AuthService.login(email, password);
            if (user) {
                onLogin(user);
            } else {
                setError('Email, password salah, atau akun telah kedaluwarsa.');
                setIsLoading(false);
            }
        } catch (e: any) {
            setError(e?.message || 'Gagal login');
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 relative overflow-hidden bg-slate-50">
             {/* Animated Background */}
             <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] opacity-40 animate-gradient-x"
                     style={{
                        backgroundImage: 'radial-gradient(circle at center, rgba(249,115,22,0.08) 0%, rgba(251,146,60,0.05) 30%, transparent 70%)'
                     }}>
                </div>
            </div>

            <div className="glass-panel w-full max-w-[400px] mx-auto p-6 sm:p-10 rounded-[2rem] shadow-2xl relative z-10 animate-scaleIn">
                <div className="text-center mb-8 sm:mb-10">
                    <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-veo-primary/10 rounded-2xl mb-4 sm:mb-6">
                        <SparklesIcon className="w-8 h-8 sm:w-10 sm:h-10 text-veo-primary" />
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-black text-slate-900 mb-2">Selamat Datang</h1>
                    <p className="text-slate-500 text-sm sm:text-base">Masuk Untuk Mengakses App azkazamdigital</p>
                    <p className="text-lg sm:text-xl font-bold text-slate-600 mt-2">Dev azkazamdigital.com</p>
                </div>

                {error && (
                    <div className="mb-6 p-3 sm:p-4 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl font-medium flex items-start gap-2 animate-fadeIn">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 flex-shrink-0 mt-0.5">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                        </svg>
                        <span>{error}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6">
                    <div className="space-y-2">
                        <label htmlFor="email" className="flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-700 uppercase tracking-wider">
                             <UserIcon className="h-5 w-5 text-slate-400" />
                             <span>EMAIL</span>
                        </label>
                        <input
                            id="email"
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="input-base py-3 sm:py-3.5 text-base"
                            placeholder="nama@contoh.com"
                        />
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="password" className="flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-700 uppercase tracking-wider">
                            <LockClosedIcon className="h-5 w-5 text-slate-400" />
                            <span>PASSWORD</span>
                        </label>
                        <input
                            id="password"
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="input-base py-3 sm:py-3.5 text-base"
                            placeholder="••••••••"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className={`w-full py-3.5 sm:py-4 bg-veo-primary text-white rounded-2xl font-bold text-base sm:text-lg tracking-wide shadow-lg shadow-veo-primary/20 transition-all
                            ${isLoading ? 'opacity-70 cursor-not-allowed' : 'hover:bg-veo-primary/90 hover:scale-[1.02] active:scale-[0.98]'}`}
                    >
                        {isLoading ? 'Memproses...' : 'Masuk'}
                    </button>
                </form>
                 <div className="mt-8 text-center text-xs sm:text-sm text-slate-400">
                    <p>Vidgo Max Admin Panel</p>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
