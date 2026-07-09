"use client";

import React, { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db, isFirebaseConfigured } from "../lib/firebase";
import { Mic } from "lucide-react";

interface SubtitleData {
  speaker: string;
  text: string;
  timestamp: number;
}

export default function LiveSubtitles({ guildId }: { guildId: string }) {
  const [subtitle, setSubtitle] = useState<SubtitleData | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured || !db || !guildId) return;

    // Listen to the live subtitle document in real time
    const unsub = onSnapshot(
      doc(db, "live_subtitles", guildId),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as SubtitleData;

          // Only display the subtitle if it was transcribed within the last 15 seconds
          if (Date.now() - data.timestamp < 15000) {
            setSubtitle(data);
            setIsVisible(true);

            // Hide the subtitle automatically after 6 seconds of silence
            const timer = setTimeout(() => {
              setIsVisible(false);
            }, 6000);

            return () => clearTimeout(timer);
          }
        }
      },
      (error) => {
        console.warn("⚠️ LiveSubtitles: Firestore listener error:", error.message);
      }
    );

    return () => unsub();
  }, [guildId]);

  if (!isVisible || !subtitle) return null;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] max-w-xl w-[calc(100vw-32px)] px-4 text-center pointer-events-none transition-all duration-300">
      <div className="bg-neutral-950/85 border border-theater-gold/30 backdrop-blur-md px-6 py-4 rounded-2xl shadow-[0_15px_50px_rgba(0,0,0,0.9),_0_0_20px_rgba(212,175,55,0.1)] flex flex-col items-center gap-2">
        {/* Speaker Badge */}
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-theater-gold/10 border border-theater-gold/20 text-[9px] font-black text-theater-gold uppercase tracking-[0.15em] select-none">
          <Mic size={10} className="animate-pulse" />
          <span>{subtitle.speaker}</span>
        </div>

        {/* Subtitle text */}
        <p className="text-neutral-100 text-sm sm:text-base font-medium tracking-wide leading-relaxed font-sans select-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
          &ldquo;{subtitle.text}&rdquo;
        </p>
      </div>
    </div>
  );
}
