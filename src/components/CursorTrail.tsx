"use client";

import React, { useEffect, useRef } from 'react';
import { useCosmetics } from '../context/CosmeticContext';

interface TrailDot {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  decay: number;
  color: string;
}

export const CursorTrail: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { getCursorPalette } = useCosmetics();
  const paletteRef = useRef(getCursorPalette());

  useEffect(() => {
    paletteRef.current = getCursorPalette();
  }, [getCursorPalette]);

  useEffect(() => {
    const isMobile = window.innerWidth <= 768 || ('ontouchstart' in window && !window.matchMedia('(pointer: fine)').matches);
    if (isMobile) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const maxDots = 140;
    const stepDistance = 2.5;
    const decayRate = 0.038;
    const dotRadius = 7.5;

    let animId: number | null = null;
    let dots: TrailDot[] = [];
    let lastX = -100;
    let lastY = -100;
    let isPointerActive = false;
    let idleTimer: any = null;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const spawnDot = (x: number, y: number, initialRadius = dotRadius) => {
      const palette = paletteRef.current;
      const color = palette[Math.floor(Math.random() * palette.length)];

      dots.push({
        x,
        y,
        radius: initialRadius,
        alpha: 0.85,
        decay: decayRate,
        color,
      });

      // Maintain a healthy dense trail even during high-speed flicks
      if (dots.length > maxDots) {
        dots.shift();
      }
    };

    // Instant zero-delay 1:1 sub-pixel pointer tracking (2.5px step distance)
    const updatePointer = (x: number, y: number) => {
      isPointerActive = true;

      if (lastX < 0) {
        lastX = x;
        lastY = y;
      }

      const dx = x - lastX;
      const dy = y - lastY;
      const dist = Math.hypot(dx, dy);

      if (dist >= stepDistance) {
        const steps = Math.floor(dist / stepDistance);
        for (let i = 1; i <= steps; i++) {
          const px = lastX + dx * (i / steps);
          const py = lastY + dy * (i / steps);
          spawnDot(px, py, dotRadius);
        }
      } else {
        spawnDot(x, y, dotRadius);
      }

      lastX = x;
      lastY = y;

      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        isPointerActive = false;
        lastX = -100;
        lastY = -100;
      }, 500);

      // Start render loop immediately if paused
      if (!animId) {
        animId = requestAnimationFrame(render);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      updatePointer(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches && e.touches.length > 0) {
        const touch = e.touches[0];
        updatePointer(touch.clientX, touch.clientY);
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches && e.touches.length > 0) {
        const touch = e.touches[0];
        lastX = touch.clientX;
        lastY = touch.clientY;
        updatePointer(touch.clientX, touch.clientY);
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchstart', handleTouchStart, { passive: true });

    // Render Loop - 1:1 PC identical ultra-dense gapless rendering
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (dots.length > 0 || isPointerActive) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter'; // Neon additive blending

        for (let i = dots.length - 1; i >= 0; i--) {
          const d = dots[i];
          d.alpha -= d.decay;
          d.radius *= 0.94; // Smooth shrink

          if (d.alpha <= 0 || d.radius <= 0.4) {
            dots.splice(i, 1);
            continue;
          }

          // Outer glowing orb
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
          ctx.fillStyle = d.color;
          ctx.globalAlpha = d.alpha * 0.75;
          ctx.fill();

          // Bright center core
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.radius * 0.45, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.globalAlpha = d.alpha * 0.95;
          ctx.fill();
        }

        ctx.restore();
      }

      // Auto-pause loop when completely idle and all dots faded out
      if (dots.length === 0 && !isPointerActive) {
        animId = null;
        return;
      }

      animId = requestAnimationFrame(render);
    };

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchstart', handleTouchStart);
      if (idleTimer) clearTimeout(idleTimer);
      if (animId) cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 99999,
      }}
    />
  );
};
