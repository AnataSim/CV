"use client";

import React from "react";
import { useDiscordLogin } from "../hooks/useDiscordLogin";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: any, role: string, name: string, avatarUrl?: string | null) => void;
}

export default function LoginModal({ isOpen, onClose, onSuccess }: LoginModalProps) {
  const { authLoading, authError, handleDiscordLogin } = useDiscordLogin({
    onSuccess,
    onClose
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-theater-black/90 backdrop-blur-md animate-fade-in">
      <div className="bg-neutral-950 border-2 border-theater-gold/60 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl relative overflow-hidden">
        {/* Theatrical gold ticket banner grid */}
        <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-theater-gold via-yellow-200 to-theater-gold" />
        
        {/* Ticket Box side cutouts */}
        <div className="absolute top-1/2 -left-4 h-8 w-8 rounded-full bg-theater-black border border-neutral-900 -translate-y-1/2 pointer-events-none" />
        <div className="absolute top-1/2 -right-4 h-8 w-8 rounded-full bg-theater-black border border-neutral-900 -translate-y-1/2 pointer-events-none" />

        <div className="text-center mb-6">
          <span className="rounded-full border border-theater-gold/20 bg-theater-gold/10 px-3 py-1 text-[10px] font-black text-theater-gold tracking-widest uppercase inline-block mb-2">
            CRUNCHYVERSE BOX OFFICE
          </span>
          <h3 className="font-display text-2xl font-black text-white tracking-wider uppercase">LOKET TIKET TEATER</h3>
        </div>

        {/* ERROR DISPLAYER */}
        {authError && (
          <div className="p-3 bg-theater-red-dark/40 border border-theater-red/30 text-xs font-medium text-red-300 rounded-xl text-left mb-5 animate-fade-in">
            ⚠️ {authError}
          </div>
        )}

        <div className="space-y-6">
          <p className="text-center text-xs text-neutral-400 leading-relaxed">
            Untuk mengakses teater CrunchyVerse, silakan lakukan autentikasi menggunakan akun Discord Anda.
          </p>

          <button
            type="button"
            onClick={handleDiscordLogin}
            disabled={authLoading}
            className="w-full flex items-center justify-center gap-3 bg-[#5865F2] hover:bg-[#4752C4] border border-[#5865F2] hover:border-[#4752C4] py-3.5 px-4 rounded-xl text-xs font-black uppercase tracking-widest text-white transition-all shadow-lg hover:shadow-xl shadow-neutral-950 active:scale-98 disabled:opacity-50 cursor-pointer"
          >
            {authLoading ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin rounded-full h-3 w-3 border-2 border-white/50 border-t-white" />
                <span>Menyambungkan...</span>
              </span>
            ) : (
              <>
                <svg className="h-5 w-5 fill-current" viewBox="0 0 127.14 96.36" xmlns="http://www.w3.org/2000/svg">
                  <path d="M107.7,8.07A105.15,105.15,0,0,0,77.26,0a77.19,77.19,0,0,0-3.3,6.83A96.67,96.67,0,0,0,53.22,6.83,77.19,77.19,0,0,0,49.88,0,105.15,105.15,0,0,0,19.44,8.07C3.66,31.58-1.86,54.65,1,77.53A105.73,105.73,0,0,0,32,96.36a77.7,77.7,0,0,0,6.63-10.85,68.43,68.43,0,0,1-10.4-5c.87-.64,1.71-1.32,2.51-2a75.7,75.7,0,0,0,72.72,0c.8,0.7,1.64,1.38,2.51,2a68.43,68.43,0,0,1-10.4,5,77.7,77.7,0,0,0,6.63,10.85,105.73,105.73,0,0,0,31-18.83C129.87,48.24,124,25.43,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53S36.18,40.36,42.45,40.36,53.83,46,53.83,53,48.72,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.24,60,73.24,53S78.41,40.36,84.69,40.36,96.07,46,96.07,53,91,65.69,84.69,65.69Z" />
                </svg>
                <span>Masuk dengan Discord</span>
              </>
            )}
          </button>
        </div>

        <button 
          onClick={onClose}
          className="mt-6 w-full text-center text-xs font-semibold text-neutral-500 hover:text-neutral-400 cursor-pointer transition-colors"
        >
          Kembali ke Lobi
        </button>
      </div>
    </div>
  );
}
