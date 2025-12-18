import React, { useState, useCallback, useEffect } from 'react';
import { generateLearningScript, generateSceneImages, regenerateSceneImage, generateEducationalCaption, generateKeyPoints, getActionDescription } from './services/geminiService';
import type { LearningMaterial, TeacherConfig, VisualStyle, TeacherGender, TeacherAge, TeacherVibe, Scene } from './types';
import { LoadingSpinner, CopyIcon, DownloadIcon, VideoIcon, SelectInput, ImageUpload } from './components/ui';
import { GenerationStatus, GenerationState } from '../types';

// --- UI COMPONENTS ---

const Header: React.FC = () => null;

const Stepper: React.FC<{ currentStep: number }> = ({ currentStep }) => {
    const steps = ["Materi & Gaya", "Naskah Narasi", "Studio Visual"];
    return (
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <ol className="flex items-center w-full">
                {steps.map((label, index) => {
                    const stepNumber = index + 1;
                    const isCompleted = currentStep > stepNumber;
                    const isCurrent = currentStep === stepNumber;
                    return (
                        <li key={label} className={`flex w-full items-center ${stepNumber < steps.length ? "after:content-[''] after:w-full after:h-1 after:border-b after:border-4 after:inline-block" : ""} ${isCompleted ? 'after:border-orange-500' : 'after:border-gray-300'}`}>
                            <div className="flex flex-col items-center justify-center">
                                <span className={`flex items-center justify-center w-10 h-10 rounded-full shrink-0 ${isCurrent || isCompleted ? 'bg-orange-500 text-white font-bold shadow-lg' : 'bg-gray-200 text-gray-500'}`}>
                                    {isCompleted ? (
                                        <svg className="w-4 h-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 16 12"><path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M1 5.917 5.724 10.5 15 1.5" /></svg>
                                    ) : (
                                        stepNumber
                                    )}
                                </span>
                                <span className={`mt-2 text-xs sm:text-sm font-medium ${isCurrent ? 'text-orange-600' : 'text-gray-500'}`}>{label}</span>
                            </div>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
};

const StepCard: React.FC<{ children: React.ReactNode, title: string, description?: string }> = ({ children, title, description }) => (
    <div className="bg-white rounded-3xl border border-gray-200 p-6 sm:p-8 shadow-sm">
        <h2 className="text-2xl font-bold text-orange-600 mb-2">{title}</h2>
        {description && <p className="text-gray-600 mb-6">{description}</p>}
        <div className="space-y-6">
            {children}
        </div>
    </div>
);

// --- STEPS ---

const Step1Materi: React.FC<{
    material: LearningMaterial;
    setMaterial: React.Dispatch<React.SetStateAction<LearningMaterial>>;
    teacher: TeacherConfig;
    setTeacher: React.Dispatch<React.SetStateAction<TeacherConfig>>;
    onNext: () => void;
}> = ({ material, setMaterial, teacher, setTeacher, onNext }) => {
    const [error, setError] = useState<string | null>(null);
    const [isGeneratingPoints, setIsGeneratingPoints] = useState(false);

    const visualStyles: { value: VisualStyle; label: string }[] = [
        { value: "Roblox 3D", label: "Roblox Style (3D)" },
        { value: "Minecraft Voxel", label: "Minecraft Voxel Style" },
        { value: "Disney Pixar 3D", label: "Disney Pixar Animation" },
        { value: "Kartun Sopo Jarwo (3D Animation)", label: "Kartun 3D Lokal (ala Sopo Jarwo)" },
        { value: "Anime Naruto Style", label: "Anime Jepang (ala Naruto)" },
        { value: "Chibi Anime", label: "Anime Chibi (Imut)" },
        { value: "Lego Stopmotion", label: "Lego Brick Style" },
        { value: "Claymation", label: "Claymation / Plastisin (ala Shaun the Sheep)" },
        { value: "Paper Cutout", label: "Paper Cutout (Papercraft)" },
        { value: "Pixel Art 2D", label: "Pixel Art (2D)" },
        { value: "Flat Vector 2D", label: "Flat Vector (2D)" },
        { value: "Low-Poly 3D", label: "Low-Poly (3D)" },
        { value: "Realistic 3D Cartoon", label: "Kartun 3D Realistis" },
        { value: "Watercolor Illustration", label: "Ilustrasi Aquarel (Watercolor)" },
        { value: "Superhero Comic", label: "Buku Komik Superhero" }
    ];

    const genders: { value: TeacherGender; label: string }[] = [
        { value: "Bu Guru (Perempuan)", label: "Ibu Guru" },
        { value: "Pak Guru (Laki-laki)", label: "Bapak Guru" }
    ];

    const ages: { value: TeacherAge; label: string }[] = [
        { value: "Muda & Enerjik (20-an)", label: "Muda & Enerjik (20-an)" },
        { value: "Berpengalaman (30-40an)", label: "Dewasa & Mengayomi (30-40an)" },
        { value: "Senior & Bijaksana (50+)", label: "Senior & Bijaksana (50+)" }
    ];

    const vibes: { value: TeacherVibe; label: string }[] = [
        { value: "Seru & Lucu", label: "Seru & Lucu (Fun)" },
        { value: "Lembut & Mengayomi", label: "Lembut & Sabar" },
        { value: "Tegas & Memotivasi", label: "Tegas & Semangat" },
        { value: "Santai & Gaul", label: "Santai & Kekinian" }
    ];

    const handleGeneratePoints = async () => {
        if (!material.title.trim()) {
            setError("Isi judul materi terlebih dahulu.");
            return;
        }
        setIsGeneratingPoints(true);
        setError(null);
        try {
            const points = await generateKeyPoints(material.title);
            setMaterial(m => ({ ...m, keyPoints: points }));
        } catch (e) {
            setError("Gagal membuat poin otomatis. Silakan isi manual.");
        } finally {
            setIsGeneratingPoints(false);
        }
    };

    const handleNext = () => {
        if (!material.title.trim() || !material.keyPoints.trim()) {
            setError("Harap isi judul materi dan poin-poin pentingnya.");
            return;
        }
        onNext();
    };

    return (
        <StepCard title="Langkah 1: Materi & Gaya Video" description="Tentukan topik pelajaran dan karakter visual videonya.">
            <div className="grid grid-cols-1 gap-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Judul Materi Pelajaran</label>
                    <input
                        type="text"
                        value={material.title}
                        onChange={e => setMaterial(m => ({ ...m, title: e.target.value }))}
                        placeholder="Contoh: Mengenal Tata Surya, Perkalian Dasar 1-10"
                        className="w-full bg-white border border-gray-300 text-gray-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-300"
                    />
                </div>
                <div>
                    <div className="flex justify-between items-end mb-2">
                         <label className="block text-sm font-medium text-gray-700">Poin Penting Materi</label>
                         <button 
                            onClick={handleGeneratePoints} 
                            disabled={isGeneratingPoints}
                            className="text-xs bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-1 rounded-lg transition-colors disabled:opacity-50"
                         >
                             {isGeneratingPoints ? "Sedang berpikir..." : "✨ Bantu Isi Poin (AI)"}
                         </button>
                    </div>
                    <textarea
                        value={material.keyPoints}
                        onChange={e => setMaterial(m => ({ ...m, keyPoints: e.target.value }))}
                        placeholder="Contoh: 1. Matahari pusat tata surya. 2. Ada 8 planet. 3. Bumi planet ketiga."
                        rows={4}
                        className="w-full bg-white border border-gray-300 text-gray-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none"
                    />
                </div>

                <div className="border-t border-gray-200 pt-6">
                    <h3 className="text-lg font-semibold text-orange-600 mb-4">Karakter Visual & Guru</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <SelectInput label="Gaya Visual Video" value={teacher.visualStyle} options={visualStyles} onChange={(e) => setTeacher(t => ({...t, visualStyle: e.target.value as VisualStyle}))} />
                        <SelectInput label="Jenis Kelamin Guru" value={teacher.gender} options={genders} onChange={(e) => setTeacher(t => ({...t, gender: e.target.value as TeacherGender}))} />
                        <SelectInput label="Estimasi Usia Guru" value={teacher.age} options={ages} onChange={(e) => setTeacher(t => ({...t, age: e.target.value as TeacherAge}))} />
                        <SelectInput label="Gaya Bicara / Vibe" value={teacher.vibe} options={vibes} onChange={(e) => setTeacher(t => ({...t, vibe: e.target.value as TeacherVibe}))} />
                    </div>

                    <div className="mt-4 p-4 bg-white rounded-xl border border-dashed border-gray-300">
                        <ImageUpload 
                            label="Upload Foto Wajah Guru (Opsional) - Agar wajah konsisten"
                            onImageUpload={(base64) => setTeacher(t => ({...t, teacherPhoto: base64}))}
                            currentImage={teacher.teacherPhoto}
                            onRemove={() => setTeacher(t => ({...t, teacherPhoto: undefined}))}
                        />
                        {teacher.teacherPhoto && (
                             <p className="text-xs text-gray-500 mt-2 italic">
                                * Foto ini akan dikonversi menjadi gaya {teacher.visualStyle} dan digunakan di setiap scene agar karakter konsisten.
                             </p>
                        )}
                    </div>
                </div>
            </div>
            
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button onClick={handleNext} className="w-full bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-600 hover:to-orange-700 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg transform hover:scale-[1.02]">
                Lanjut: Buat Naskah Otomatis &rarr;
            </button>
        </StepCard>
    );
};

const Step2Naskah: React.FC<{
    material: LearningMaterial;
    teacher: TeacherConfig;
    scenes: Scene[];
    setScenes: React.Dispatch<React.SetStateAction<Scene[]>>;
    onNext: () => void;
    onBack: () => void;
}> = ({ material, teacher, scenes, setScenes, onNext, onBack }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleGenerateScript = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const scripts = await generateLearningScript(material.title, material.keyPoints, teacher);
            const newScenes = scripts.map((script, index) => ({
                id: index,
                script: script,
                image: undefined,
                videoPrompt: undefined
            }));
            setScenes(newScenes);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Gagal membuat naskah.");
        } finally {
            setIsLoading(false);
        }
    }, [material, teacher, setScenes]);

    const handleNext = () => {
        if (scenes.length === 0 || scenes.some(s => !s.script.trim())) {
            setError("Pastikan naskah sudah dibuat dan tidak kosong.");
            return;
        }
        onNext();
    };

    const sceneLabels = [
        "Scene 1: Pembuka (Hook/Pertanyaan)", 
        "Scene 2: Isi Materi Bagian 1", 
        "Scene 3: Isi Materi Bagian 2", 
        "Scene 4: Isi Materi Bagian 3", 
        "Scene 5: Penutup (Call to Action)"
    ];

    return (
        <StepCard title="Langkah 2: Naskah Narasi" description={`AI akan membuatkan 5 scene cerita pendek untuk materi "${material.title}".`}>
            {scenes.length === 0 ? (
                <div className="text-center py-10">
                    <p className="text-gray-600 mb-6">Siap membuat naskah dengan gaya <strong>{teacher.visualStyle}</strong> bersama <strong>{teacher.gender}</strong>?</p>
                    <button onClick={handleGenerateScript} disabled={isLoading} className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-8 rounded-full shadow-lg transition-transform transform hover:scale-105 disabled:opacity-50 disabled:transform-none">
                        {isLoading ? <LoadingSpinner message="Sedang meracik naskah..." /> : "✨ Generate Naskah Ajaib"}
                    </button>
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="flex justify-end">
                         <button onClick={handleGenerateScript} disabled={isLoading} className="text-sm text-orange-600 hover:underline">
                            {isLoading ? 'Sedang membuat ulang...' : 'Buat Ulang Naskah'}
                         </button>
                    </div>
                    {scenes.map((scene, index) => (
                        <div key={index} className="bg-white p-4 rounded-xl border border-gray-200">
                            <label className="block text-sm font-bold text-gray-700 mb-2">{sceneLabels[index]}</label>
                            <textarea
                                value={scene.script}
                                onChange={e => {
                                    const newScript = e.target.value;
                                    setScenes(prev => {
                                        const next = [...prev];
                                        next[index] = { ...next[index], script: newScript };
                                        return next;
                                    });
                                }}
                                rows={3}
                                className="w-full bg-white border border-gray-300 text-gray-800 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none"
                            />
                            <p className="text-xs text-gray-500 text-right mt-1">
                                {scene.script.split(/\s+/).filter(Boolean).length} kata (Target: 13-16 kata)
                            </p>
                        </div>
                    ))}
                </div>
            )}

            {error && <p className="text-red-400 text-sm">{error}</p>}
            
            <div className="flex space-x-4 pt-6 border-t border-gray-200 mt-4">
                <button onClick={onBack} className="w-1/3 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold py-3 px-4 rounded-xl transition-colors">Kembali</button>
                <button onClick={handleNext} disabled={scenes.length === 0} className="w-2/3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
                    Lanjut: Buat Gambar Visual &rarr;
                </button>
            </div>
        </StepCard>
    );
};

const Step3Studio: React.FC<{
    material: LearningMaterial;
    teacher: TeacherConfig;
    scenes: Scene[];
    setScenes: React.Dispatch<React.SetStateAction<Scene[]>>;
    onNext: () => void;
    onBack: () => void;
}> = ({ material, teacher, scenes, setScenes, onNext, onBack }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
    const [inlineMap, setInlineMap] = useState<Record<string, GenerationState>>({});
    const [playingMap, setPlayingMap] = useState<Record<string, boolean>>({});
    const [captionData, setCaptionData] = useState<{ caption: string, hashtags: string } | null>(null);
    const [isCaptionLoading, setIsCaptionLoading] = useState(false);

    useEffect(() => {
        // Populate video prompts if empty or updated
        setScenes(prev => prev.map((scene, index) => {
            if (!scene.videoPrompt) {
                // Determine pronoun based on gender
                const pronoun = teacher.gender.includes("Laki") ? "He" : "She";
                
                // Get dynamic action from geminiService (same as image)
                const actionDesc = getActionDescription(index, material.title, teacher.visualStyle);
                
                return {
                    ...scene,
                    // New prompt format: Action description + Lipsync
                    videoPrompt: `Cinematic shot. ${pronoun} is ${actionDesc}. ${pronoun} Lipsync in Indonesian: "${scene.script}"\n\nnegative prompt: text, watermark, bad anatomy, distorted face`
                };
            }
            return scene;
        }));
    }, [scenes, setScenes, teacher.gender, teacher.visualStyle, material.title]);

    const handleGenerateImages = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const scripts = scenes.map(s => s.script);
            const images = await generateSceneImages(material.title, scripts, teacher);
            setScenes(prev => prev.map((s, i) => ({ ...s, image: images[i] })));
        } catch (err) {
            setError(err instanceof Error ? err.message : "Gagal membuat gambar.");
        } finally {
            setIsLoading(false);
        }
    }, [material, scenes, teacher, setScenes]);

    const handleRegenerateOne = async (index: number) => {
        setRegeneratingIndex(index);
        try {
            const newImage = await regenerateSceneImage(material.title, scenes[index].script, teacher, index);
            setScenes(prev => {
                const next = [...prev];
                next[index] = { ...next[index], image: newImage };
                return next;
            });
        } catch (err) {
            console.error(err);
        } finally {
            setRegeneratingIndex(null);
        }
    };

    const handleCopyPrompt = (text: string | undefined, index: number) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    const handleDownloadImage = (url: string | undefined, index: number) => {
        if(!url) return;
        const link = document.createElement('a');
        link.href = url;
                                        link.download = `konten-belajar-anak-scene-${index + 1}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const hasImages = scenes.every(s => s.image);

    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail as any;
            const url = typeof detail?.url === 'string' ? detail.url : '';
            const state = detail?.state as GenerationState | undefined;
            if (!url || !state) return;
            setInlineMap(prev => ({ ...prev, [url]: state }));
        };
        window.addEventListener('inline-video-state', handler as EventListener);
        return () => window.removeEventListener('inline-video-state', handler as EventListener);
    }, []);

    return (
        <StepCard title="Langkah 3: Studio Visual" description="Generate gambar karakter guru dan lingkungan sesuai gaya yang dipilih.">
            {!hasImages && (
                <div className="text-center py-6">
                    <p className="mb-4 text-gray-600">
                        {teacher.teacherPhoto ? 
                            "Menggunakan foto guru untuk konsistensi karakter..." : 
                            "Membuat karakter baru..."
                        }
                    </p>
                    <button onClick={handleGenerateImages} disabled={isLoading} className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold py-4 px-8 rounded-full shadow-lg transition-all transform hover:scale-105 disabled:opacity-50">
                        {isLoading ? <LoadingSpinner message="Melukis 5 adegan..." /> : "🎨 Generate 5 Gambar Adegan"}
                    </button>
                </div>
            )}

            {scenes[0].image && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {scenes.map((scene, index) => (
                        <div key={index} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                            <div className="relative aspect-[9/16] w-full bg-black">
                                {(() => {
                                    const st = scene.image ? inlineMap[scene.image]?.status : undefined;
                                    const videoUrl = scene.image ? inlineMap[scene.image]?.videoUrl : undefined;
                                    const isReady = st === GenerationStatus.Completed && !!videoUrl;
                                    const isPlaying = !!scene.image && !!playingMap[scene.image];
                                    if (isReady && isPlaying && videoUrl) {
                                        return (
                                            <div className="absolute inset-0 animate-fadeIn">
                                                <video src={videoUrl as string} controls autoPlay loop playsInline className="w-full h-full object-contain" />
                                                <div className="absolute top-2 right-2 z-10">
                                                    <a href={(import.meta.env?.DEV ? '/download' : '/api/download') + `?url=${encodeURIComponent(videoUrl as string)}&filename=${encodeURIComponent('konten-belajar-anak-video.mp4')}`} className="bg-black/50 hover:bg-orange-600 backdrop-blur-md text-white p-2 rounded-lg shadow-lg border border-white/10 transition-all" title="Download Video">
                                                        <DownloadIcon className="w-4 h-4" />
                                                    </a>
                                                </div>
                                            </div>
                                        );
                                    }
                                    if (scene.image) {
                                        return <img src={scene.image} alt={`Scene ${index+1}`} className="w-full h-full object-cover" />;
                                    }
                                    return (<div className="flex items-center justify-center h-full text-gray-400">No Image</div>);
                                })()}
                                <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                                    Scene {index + 1}
                                </div>
                                {scene.image && (() => {
                                    const st = inlineMap[scene.image]?.status;
                                    const prog = inlineMap[scene.image]?.progress || 0;
                                    const msg = inlineMap[scene.image]?.message || '';
                                    if (st === GenerationStatus.Uploading || st === GenerationStatus.Pending || st === GenerationStatus.Processing) {
                                        return (
                                            <div className="absolute inset-0 flex items-center justify-center p-3">
                                                <div className="space-y-2 w-full max-w-xs text-center">
                                                    <div className="relative w-12 h-12 mx-auto">
                                                        <div className="absolute inset-0 rounded-full border-8 border-white/30"></div>
                                                        <div className="absolute inset-0 rounded-full border-t-8 border-orange-600 animate-spin"></div>
                                                    </div>
                                                    <p className="text-[11px] font-medium text-white">{msg || 'Membuat video...'}</p>
                                                    <div className="h-2 w-full bg-white/20 rounded-full overflow-hidden">
                                                        <div className="h-full bg-orange-600 rounded-full transition-all" style={{ width: `${Math.max(5, prog)}%` }}></div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                })()}
                            </div>
                            
                            <div className="p-3 space-y-3">
                                <p className="text-xs text-gray-700 italic line-clamp-2">"{scene.script}"</p>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => handleRegenerateOne(index)} 
                                        disabled={regeneratingIndex === index || isLoading}
                                        className="flex-1 bg-white border border-gray-300 hover:bg-gray-50 text-xs py-2 rounded text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {regeneratingIndex === index ? '...' : 'Regenerate'}
                                    </button>
                                    <button onClick={() => handleDownloadImage(scene.image, index)} className="px-3 bg-white border border-gray-300 hover:bg-gray-50 rounded text-gray-800">
                                        <DownloadIcon className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="pt-2 border-t border-gray-200">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-xs font-bold text-gray-700">Veo Prompt (Video)</span>
                                        <button onClick={() => handleCopyPrompt(scene.videoPrompt, index)} className="text-xs text-gray-600 hover:text-black flex items-center">
                                            <CopyIcon className="w-3 h-3 mr-1" /> {copiedIndex === index ? 'Copied' : 'Copy'}
                                        </button>
                                    </div>
                                    <textarea 
                                        readOnly 
                                        value={scene.videoPrompt} 
                                        className="w-full bg-white border border-gray-300 text-xs text-gray-700 rounded p-2 h-16 resize-none"
                                    />
                                    {scene.image && inlineMap[scene.image]?.status === GenerationStatus.Failed && (
                                        <p className="mt-1 text-xs text-red-600">
                                            {(inlineMap[scene.image]?.error as any) || inlineMap[scene.image]?.message || 'Gagal membuat video.'}
                                        </p>
                                    )}
                                    {scene.image && inlineMap[scene.image]?.status === GenerationStatus.Completed && inlineMap[scene.image]?.videoUrl && (
                                        <a
                                            href={(import.meta.env?.DEV ? '/download' : '/api/download') + `?url=${encodeURIComponent(inlineMap[scene.image]?.videoUrl as string)}&filename=${encodeURIComponent('konten-belajar-anak-video.mp4')}`}
                                            className="block w-full mt-1 text-center bg-slate-900 hover:bg-slate-800 text-white text-xs py-1.5 rounded transition-colors"
                                        >
                                            Download Video
                                        </a>
                                    )}
                                    {scene.image && inlineMap[scene.image]?.status === GenerationStatus.Completed && inlineMap[scene.image]?.videoUrl && (
                                        <button
                                            onClick={() => setPlayingMap(prev => ({ ...prev, [scene.image as string]: true }))}
                                            className="block w-full mt-1 text-center bg-slate-800 hover:bg-slate-700 text-white text-xs py-1.5 rounded transition-colors"
                                        >
                                            Play Video
                                        </button>
                                    )}
                                    <button 
                                        onClick={() => {
                                            try {
                                                const detail = { imageUrl: scene.image, prompt: scene.videoPrompt } as any;
                                                window.dispatchEvent(new CustomEvent('create-veo-video', { detail }));
                                            } catch {}
                                        }}
                                        className={`block w-full mt-1 text-center text-white text-xs py-1.5 rounded transition-colors ${scene.image && (inlineMap[scene.image]?.status === GenerationStatus.Uploading || inlineMap[scene.image]?.status === GenerationStatus.Pending || inlineMap[scene.image]?.status === GenerationStatus.Processing) ? 'bg-slate-300 cursor-not-allowed' : 'bg-orange-600 hover:bg-orange-500'}`}
                                        disabled={!!scene.image && (inlineMap[scene.image]?.status === GenerationStatus.Uploading || inlineMap[scene.image]?.status === GenerationStatus.Pending || inlineMap[scene.image]?.status === GenerationStatus.Processing)}
                                    >
                                        {scene.image && inlineMap[scene.image]?.status === GenerationStatus.Completed ? 'Generate Ulang' : (scene.image && (inlineMap[scene.image]?.status === GenerationStatus.Uploading || inlineMap[scene.image]?.status === GenerationStatus.Pending || inlineMap[scene.image]?.status === GenerationStatus.Processing) ? 'Sedang Membuat…' : 'Buat Video')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {hasImages && (
                <div className="mt-6 space-y-6">
                    <div className="bg-white p-6 rounded-xl border border-gray-200">
                        <h3 className="text-gray-800 font-bold mb-4">Caption Media Sosial</h3>
                        {!captionData ? (
                            <button onClick={async () => {
                                setIsCaptionLoading(true);
                                try {
                                    const res = await generateEducationalCaption(material.title, material.keyPoints);
                                    setCaptionData(res);
                                } catch (e) {
                                    console.error(e);
                                } finally {
                                    setIsCaptionLoading(false);
                                }
                            }} disabled={isCaptionLoading} className="bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 rounded-lg transition-colors">
                                {isCaptionLoading ? "Menulis..." : "Buat Caption & Hashtag Otomatis"}
                            </button>
                        ) : (
                            <div className="space-y-3">
                                <div className="bg-white border border-gray-300 p-4 rounded-lg text-gray-800 text-sm whitespace-pre-wrap">
                                    {captionData.caption}
                                    <br /><br />
                                    <span className="text-gray-700">{captionData.hashtags}</span>
                                </div>
                                <button onClick={() => { try { navigator.clipboard.writeText(`${captionData.caption}\n\n${captionData.hashtags}`); } catch {} }} className="text-xs text-orange-600 hover:underline font-bold">Copy Text</button>
                            </div>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <button onClick={async () => {
                            for (let i = 0; i < scenes.length; i++) {
                                if (scenes[i].image) {
                                    const link = document.createElement('a');
                                    link.href = scenes[i].image!;
                                    link.download = `konten-belajar-anak-${material.title.replace(/\s+/g, '-')}-scene-${i + 1}.png`;
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                    await new Promise(r => setTimeout(r, 500));
                                }
                            }
                        }} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 text-white font-bold hover:bg-green-700">
                            <DownloadIcon className="w-5 h-5" /> Download Semua Gambar
                        </button>
                        <button onClick={() => {
                            const readyUrls = scenes
                                .map(s => (s.image ? inlineMap[s.image]?.videoUrl : undefined))
                                .filter(Boolean) as string[];
                            if (readyUrls.length === 0) { alert('Belum ada video selesai untuk diunduh.'); return; }
                            const downloadBase = import.meta.env?.DEV ? '/download' : '/api/download';
                            readyUrls.forEach((url, idx) => {
                                const filename = `konten-belajar-anak-video-${idx + 1}.mp4`;
                                const proxied = `${downloadBase}?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
                                setTimeout(() => {
                                    const a = document.createElement('a');
                                    a.style.display = 'none';
                                    a.href = proxied;
                                    a.download = filename;
                                    a.target = '_self';
                                    document.body.appendChild(a);
                                    a.click();
                                    setTimeout(() => { if (a.parentNode) a.parentNode.removeChild(a); }, 100);
                                }, idx * 300);
                            });
                        }} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800">
                            <DownloadIcon className="w-5 h-5" /> Download Semua Video
                        </button>
                        <button onClick={() => {
                            const readyUrls = scenes
                                .map(s => (s.image ? inlineMap[s.image]?.videoUrl : undefined))
                                .filter(Boolean) as string[];
                            if (readyUrls.length === 0) { alert('Belum ada video selesai.'); return; }
                            const downloadBase = import.meta.env?.DEV ? '/download' : '/api/download';
                            const urls = readyUrls.map((u, i) => `${downloadBase}?url=${encodeURIComponent(u)}&filename=${encodeURIComponent(`konten-belajar-anak-${String(i + 1).padStart(2, '0')}.mp4`)}`);
                            try { sessionStorage.setItem('EDITOR_NARASI_URLS', JSON.stringify(urls)); } catch {}
                            try { window.dispatchEvent(new CustomEvent('navigate-editor-narasi', { detail: { urls } })); } catch {}
                        }} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-600 text-white font-bold hover:bg-orange-500">
                            <VideoIcon className="w-5 h-5" /> Gabungkan Semua Video
                        </button>
                    </div>
                </div>
            )}

            {error && <p className="text-red-400 text-sm text-center">{error}</p>}

            <div className="pt-6 border-t border-gray-200 mt-4">
                <button onClick={onBack} className="w-full bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold py-3 px-4 rounded-xl transition-colors">Kembali</button>
            </div>
        </StepCard>
    );
};


// --- MAIN APP ---

const App: React.FC = () => {
    const [currentStep, setCurrentStep] = useState(1);
    
    const [material, setMaterial] = useState<LearningMaterial>({ title: '', keyPoints: '' });
    const [teacher, setTeacher] = useState<TeacherConfig>({
        gender: "Bu Guru (Perempuan)",
        age: "Muda & Enerjik (20-an)",
        vibe: "Seru & Lucu",
        visualStyle: "Roblox 3D"
    });
    const [scenes, setScenes] = useState<Scene[]>([]);

    const nextStep = () => setCurrentStep(p => Math.min(p + 1, 3));
    const prevStep = () => setCurrentStep(p => Math.max(p - 1, 1));
    
    const resetState = () => {
        setMaterial({ title: '', keyPoints: '' });
        setScenes([]);
        setCurrentStep(1);
    };

    return (
        <div className="flex flex-col min-h-screen bg-white text-slate-900 font-sans selection:bg-orange-200 selection:text-slate-900">
            
            <main className="flex-grow container mx-auto px-4 sm:px-6 lg:px-8 pb-12">
                <div className="max-w-3xl mx-auto">
                    <Stepper currentStep={currentStep} />
                    <div className="mt-4">
                        {currentStep === 1 && <Step1Materi material={material} setMaterial={setMaterial} teacher={teacher} setTeacher={setTeacher} onNext={nextStep} />}
                        {currentStep === 2 && <Step2Naskah material={material} teacher={teacher} scenes={scenes} setScenes={setScenes} onNext={nextStep} onBack={prevStep} />}
                        {currentStep === 3 && <Step3Studio material={material} teacher={teacher} scenes={scenes} setScenes={setScenes} onNext={nextStep} onBack={prevStep} />}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default App;
