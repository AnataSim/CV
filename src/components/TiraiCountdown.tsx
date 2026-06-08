"use client";

import React from "react";
import { Lock, ArrowLeft, Calendar, HelpCircle } from "lucide-react";

interface TiraiCountdownProps {
  timeLeft: {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  };
  onScrollToLobby: () => void;
}

export default function TiraiCountdown({ timeLeft, onScrollToLobby }: TiraiCountdownProps) {
  // Format numbers to always show two digits
  const formatNum = (num: number) => String(num).padStart(2, "0");

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[calc(100vh-16px)] px-4 py-12 relative overflow-hidden select-none">
      {/* Decorative background light rays and spotlights */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-theater-red/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-theater-gold/5 rounded-full blur-[120px] pointer-events-none" />
      
      {/* Subtle theater curtain backdrop texture simulation */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay"
        style={{
          backgroundImage: `repeating-linear-gradient(90deg, #000 0px, #000 20px, #fff 20px, #fff 40px)`
        }}
      />

      <div className="max-w-xl w-full text-center z-10 flex flex-col items-center">
        {/* Animated Theater Lock Symbol */}
        <div className="relative mb-6 group">
          <div className="absolute inset-0 bg-gradient-to-r from-theater-red to-theater-gold rounded-full blur-xl opacity-30 group-hover:opacity-50 transition-opacity duration-700 animate-pulse" />
          <div className="relative h-20 w-20 rounded-full bg-neutral-950 border-2 border-theater-gold/60 flex items-center justify-center text-theater-gold shadow-2xl shadow-theater-red-dark/30 group-hover:border-theater-gold group-hover:text-yellow-200 transition-all duration-300">
            <Lock className="h-9 w-9 animate-bounce-slow" />
          </div>
        </div>

        {/* Premium Badge */}
        <span className="rounded-full border border-theater-gold/30 bg-theater-gold/10 px-4 py-1 text-[10px] font-black text-theater-gold tracking-widest uppercase inline-block mb-3 animate-fade-in">
          TIRAI DIKUNCI
        </span>

        {/* Serif dramatic Title */}
        <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white via-neutral-100 to-neutral-400 tracking-wider uppercase mb-4 leading-tight">
          Tirai Tantangan
        </h2>

        {/* Description card */}
        <p className="text-sm text-neutral-400 max-w-md mx-auto leading-relaxed mb-10 font-sans px-4">
          Tirai Tantangan Teater Interaktif ditutup untuk penonton umum hingga pembukaan resmi. Admin dan pengurus tetap memiliki akses langsung saat ini.
        </p>

        {/* Countdown Grid */}
        <div className="grid grid-cols-4 gap-3 sm:gap-4 w-full max-w-lg mb-12 px-2">
          {/* Days */}
          <div className="flex flex-col items-center">
            <div className="w-full aspect-square sm:h-24 sm:w-24 bg-neutral-950/80 border border-theater-gold/30 hover:border-theater-gold/60 rounded-2xl flex items-center justify-center shadow-xl backdrop-blur-md relative overflow-hidden group transition-all duration-300">
              <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-theater-gold/50 to-transparent" />
              <span className="text-2xl sm:text-4xl font-mono font-black text-white group-hover:scale-105 transition-transform duration-300 select-all">
                {formatNum(timeLeft.days)}
              </span>
            </div>
            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mt-2">Hari</span>
          </div>

          {/* Hours */}
          <div className="flex flex-col items-center">
            <div className="w-full aspect-square sm:h-24 sm:w-24 bg-neutral-950/80 border border-theater-gold/30 hover:border-theater-gold/60 rounded-2xl flex items-center justify-center shadow-xl backdrop-blur-md relative overflow-hidden group transition-all duration-300">
              <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-theater-gold/50 to-transparent" />
              <span className="text-2xl sm:text-4xl font-mono font-black text-white group-hover:scale-105 transition-transform duration-300 select-all">
                {formatNum(timeLeft.hours)}
              </span>
            </div>
            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mt-2">Jam</span>
          </div>

          {/* Minutes */}
          <div className="flex flex-col items-center">
            <div className="w-full aspect-square sm:h-24 sm:w-24 bg-neutral-950/80 border border-theater-gold/30 hover:border-theater-gold/60 rounded-2xl flex items-center justify-center shadow-xl backdrop-blur-md relative overflow-hidden group transition-all duration-300">
              <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-theater-gold/50 to-transparent" />
              <span className="text-2xl sm:text-4xl font-mono font-black text-white group-hover:scale-105 transition-transform duration-300 select-all">
                {formatNum(timeLeft.minutes)}
              </span>
            </div>
            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mt-2">Menit</span>
          </div>

          {/* Seconds */}
          <div className="flex flex-col items-center">
            <div className="w-full aspect-square sm:h-24 sm:w-24 bg-neutral-950/80 border border-theater-gold/30 hover:border-theater-gold/60 rounded-2xl flex items-center justify-center shadow-xl backdrop-blur-md relative overflow-hidden group transition-all duration-300">
              <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-theater-gold/50 to-transparent" />
              <span className="text-2xl sm:text-4xl font-mono font-black text-theater-red group-hover:scale-105 transition-transform duration-300 select-all animate-pulse-slow">
                {formatNum(timeLeft.seconds)}
              </span>
            </div>
            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mt-2">Detik</span>
          </div>
        </div>

        {/* Information Callout */}
        <div className="flex items-center gap-3 bg-neutral-950/40 border border-neutral-900 px-4 py-3 rounded-2xl max-w-sm mb-8 animate-fade-in text-left">
          <Calendar size={18} className="text-theater-gold shrink-0" />
          <p className="text-[11px] text-neutral-500 font-medium">
            Jadwal rilis publik: <span className="text-neutral-300 font-bold">1 September 2026</span> (Waktu Indonesia Barat).
          </p>
        </div>

        {/* Action Button */}
        <button
          onClick={onScrollToLobby}
          className="flex items-center gap-2 px-6 py-3.5 bg-neutral-950 hover:bg-neutral-900 border border-neutral-800 hover:border-theater-gold/40 text-neutral-400 hover:text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer shadow-lg active:scale-98"
        >
          <ArrowLeft size={14} />
          <span>Kembali ke Lobi Utama</span>
        </button>
      </div>
    </div>
  );
}
