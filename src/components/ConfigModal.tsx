"use client";

import React, { useState } from "react";
import { Settings, RefreshCw, Server, CheckCircle2, AlertCircle, Sparkles } from "lucide-react";

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  backendUrl: string;
  setBackendUrl: (url: string) => void;
  isBotConnected: boolean;
  onTestConnection: () => Promise<void> | void;
}

export default function ConfigModal({
  isOpen,
  onClose,
  backendUrl,
  setBackendUrl,
  isBotConnected,
  onTestConnection
}: ConfigModalProps) {
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);

  if (!isOpen) return null;

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      await onTestConnection();
      setTimeout(() => {
        setIsTesting(false);
      }, 500);
    } catch {
      setIsTesting(false);
      setTestResult("error");
    }
  };

  const handleResetLocalhost = () => {
    setBackendUrl("http://localhost:3001");
    setTestResult(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBackendUrl(e.target.value);
    setTestResult(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-theater-black/85 backdrop-blur-md animate-fade-in">
      <div className="bg-neutral-900 border border-theater-gold/30 rounded-2xl p-6 max-w-md w-full shadow-2xl relative">
        <h3 className="font-display text-lg font-bold text-theater-gold mb-1.5 flex items-center gap-2">
          <Settings size={18} />
          <span>Konfigurasi Integrasi Bot</span>
        </h3>
        <p className="text-xs text-neutral-400 mb-4 leading-relaxed">
          Hubungkan website CrunchyVerse dengan Express API & Bot Discord. Masukkan URL server aktif Anda (Lokal / Tunnel / Cloud Host).
        </p>
        
        <div className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                URL Server API Bot Discord
              </label>
              <button
                type="button"
                onClick={handleResetLocalhost}
                className="text-[9px] font-bold text-theater-gold hover:text-yellow-300 underline cursor-pointer flex items-center gap-1"
              >
                <Server size={10} />
                <span>Reset Localhost</span>
              </button>
            </div>
            <input 
              type="text" 
              value={backendUrl}
              onChange={handleInputChange}
              onBlur={() => setBackendUrl(backendUrl.trim().replace(/\/+$/, ""))}
              placeholder="e.g. http://localhost:3001 atau https://your-bot.onrender.com"
              className="bg-theater-black border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-theater-red-light transition-all font-mono"
            />
          </div>

          {/* Quick Presets */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-neutral-500 font-semibold uppercase tracking-wider">Preset Quick-Set:</span>
            <button
              type="button"
              onClick={() => {
                setBackendUrl("http://localhost:3001");
                setTestResult(null);
              }}
              className="px-2 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-[10px] text-neutral-300 font-mono transition-all border border-neutral-700 cursor-pointer"
            >
              http://localhost:3001
            </button>
            <button
              type="button"
              onClick={() => {
                setBackendUrl("http://127.0.0.1:3001");
                setTestResult(null);
              }}
              className="px-2 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-[10px] text-neutral-300 font-mono transition-all border border-neutral-700 cursor-pointer"
            >
              http://127.0.0.1:3001
            </button>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-theater-black/50 border border-neutral-800 text-xs">
            <span className="text-neutral-400">Status Sinyal:</span>
            <span className={`font-bold flex items-center gap-1.5 ${isBotConnected ? "text-emerald-400" : "text-theater-red-light"}`}>
              {isTesting ? (
                <>
                  <RefreshCw size={12} className="animate-spin text-amber-400" />
                  <span className="text-amber-400">Memeriksa Sinyal...</span>
                </>
              ) : (
                <>
                  <span className={`h-2 w-2 rounded-full ${isBotConnected ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" : "bg-theater-red-light animate-pulse"}`} />
                  {isBotConnected ? (
                    <span className="flex items-center gap-1">
                      <CheckCircle2 size={12} className="text-emerald-400" />
                      Terhubung ke Live API
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <AlertCircle size={12} className="text-rose-400" />
                      Mode Offline / Mocks
                    </span>
                  )}
                </>
              )}
            </span>
          </div>

          {!isBotConnected && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300/90 leading-relaxed">
              <p className="font-semibold flex items-center gap-1.5 mb-1 text-amber-400">
                <Sparkles size={13} />
                <span>Tips Menghubungkan Backend:</span>
              </p>
              <ul className="list-disc list-inside space-y-1 text-[10px]">
                <li><strong>Lokal (Pengembangan):</strong> Jalankan server bot di terminal dengan <code className="bg-amber-950 px-1 py-0.5 rounded text-amber-200">npm run dev</code> di dalam folder <code className="bg-amber-950 px-1 py-0.5 rounded text-amber-200">discord-bot</code>.</li>
                <li><strong>Deploy Cloud (Render / Koyeb):</strong> Tempelkan URL HTTPS server deploy Anda di atas lalu klik <em>Tes Sinyal Ulang</em>.</li>
              </ul>
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button 
            onClick={handleTest}
            disabled={isTesting}
            className="flex-1 bg-theater-red-dark hover:bg-theater-red disabled:opacity-50 border border-theater-red-light/30 text-white font-extrabold text-xs uppercase tracking-wider py-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-theater-red-dark/20"
          >
            <RefreshCw size={13} className={isTesting ? "animate-spin" : ""} />
            <span>{isTesting ? "Pengujian..." : "Tes Sinyal Ulang"}</span>
          </button>
          
          <button 
            onClick={onClose}
            className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-white font-extrabold text-xs uppercase tracking-wider py-3 rounded-xl transition-all cursor-pointer"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
}

