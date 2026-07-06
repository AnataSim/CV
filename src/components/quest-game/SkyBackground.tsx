import React, { useState, useEffect } from "react";

interface Star {
  id: number;
  left: string;
  top: string;
  size: number;
  speed: string;
  minOp: number;
  maxOp: number;
}

interface SkyBackgroundProps {
  isMorning: boolean;
  isSunset: boolean;
}

export default function SkyBackground({ isMorning, isSunset }: SkyBackgroundProps) {
  const [hasMounted, setHasMounted] = useState(false);
  const [stars] = useState<Star[]>(() =>
    Array.from({ length: 45 }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 80}%`,
      size: Math.random() * 2 + 1,
      speed: `${Math.random() * 3 + 2}s`,
      minOp: Math.random() * 0.3,
      maxOp: Math.random() * 0.7 + 0.3
    }))
  );

  useEffect(() => {
    setHasMounted(true);
  }, []);

  return (
    <div 
      className="absolute inset-0 adaptive-sky select-none z-0"
      style={{
        backgroundImage: `linear-gradient(to bottom, rgba(6, 1, 2, 0.45), rgba(6, 1, 2, 0.85)), url('/challenge_bg.png')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      <img
        src="/pixel_fox.png"
        alt="Pixel Fox"
        className="absolute bottom-12 w-16 h-16 pixelated pointer-events-none z-10 animate-fox-walk"
        style={{ mixBlendMode: 'multiply' }}
      />

      <img
        src="/pixel_butterfly.png"
        alt="Pixel Butterfly"
        className="absolute w-8 h-8 pixelated pointer-events-none z-10 animate-butterfly-fly"
        style={{ mixBlendMode: 'multiply' }}
      />

      {/* Day/Sunset clouds */}
      {(isMorning || isSunset) && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-30">
          <div className="cloud-scroller flex w-[200%] h-full">
            <div className="w-1/2 h-full relative">
              <div className="absolute top-12 left-[10%] w-40 h-12 bg-white/30 rounded-full blur-[3px]" />
              <div className="absolute top-36 left-[35%] w-60 h-16 bg-white/20 rounded-full blur-[4px]" />
              <div className="absolute top-20 left-[70%] w-48 h-14 bg-white/35 rounded-full blur-[3px]" />
            </div>
            <div className="w-1/2 h-full relative">
              <div className="absolute top-12 left-[10%] w-40 h-12 bg-white/30 rounded-full blur-[3px]" />
              <div className="absolute top-36 left-[35%] w-60 h-16 bg-white/20 rounded-full blur-[4px]" />
              <div className="absolute top-20 left-[70%] w-48 h-14 bg-white/35 rounded-full blur-[3px]" />
            </div>
          </div>
        </div>
      )}

      {/* Night Twinkling Stars */}
      {!isMorning && !isSunset && hasMounted && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-90">
          {stars.map((star) => (
            <div
              key={star.id}
              className="star-twinkle absolute rounded-full bg-white"
              style={{
                left: star.left,
                top: star.top,
                width: `${star.size}px`,
                height: `${star.size}px`,
                "--speed": star.speed,
                "--min-op": star.minOp,
                "--max-op": star.maxOp
              } as React.CSSProperties}
            />
          ))}
        </div>
      )}

      {/* Ambient Stage Lighting spotlight overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-theater-black via-transparent to-transparent opacity-85 z-0" />
    </div>
  );
}
