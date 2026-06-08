"use client";

import React from "react";
import { Settings, RefreshCw } from "lucide-react";

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  backendUrl: string;
  setBackendUrl: (url: string) => void;
  isBotConnected: boolean;
  onTestConnection: () => void;
}

export default function ConfigModal({
  isOpen,
  onClose,
  backendUrl,
  setBackendUrl,
  isBotConnected,
  onTestConnection
}: ConfigModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-theater-black/85 backdrop-blur-md animate-fade-in">
      <div className="bg-neutral-900 border border-theater-gold/30 rounded-2xl p-6 max-w-md w-full shadow-2xl relative">
        <h3 className="font-display text-lg font-bold text-theater-gold mb-2 flex items-center gap-2">
          <Settings size={18} />
          <span>Konfigurasi Integrasi Bot</span>
        </h3>
        <p className="text-xs text-neutral-400 mb-4 leading-relaxed">
          Integrasikan panggung website CrunchyVerse Anda dengan Express API bot Discord Anda. Ubah port atau endpoint sesuai dengan server deploy Anda.
        </p>
        
        <div className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">URL Server API Bot Discord</label>
            <input 
              type="text" 
              value={backendUrl}
              onChange={(e) => setBackendUrl(e.target.value)}
              placeholder="e.g. http://localhost:3001"
              className="bg-theater-black border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-theater-red-light transition-all font-mono"
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-theater-black/50 border border-neutral-800 text-xs">
            <span className="text-neutral-400">Status Sinyal:</span>
            <span className={`font-bold flex items-center gap-1 ${isBotConnected ? "text-emerald-400" : "text-theater-red-light"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${isBotConnected ? "bg-emerald-400" : "bg-theater-red-light animate-pulse"}`} />
              {isBotConnected ? "Terhubung ke Live API" : "Mode Offline / Mocks"}
            </span>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button 
            onClick={onTestConnection}
            className="flex-1 bg-theater-red-dark hover:bg-theater-red border border-theater-red-light/30 text-white font-extrabold text-xs uppercase tracking-wider py-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <RefreshCw size={13} />
            <span>Tes Sinyal Ulang</span>
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
