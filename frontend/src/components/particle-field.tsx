"use client";

import { useEffect, useRef } from "react";

/**
 * A site-wide field of slow-drifting motes, echoing the brass dust that turns
 * inside the Escrow Armillary hero. Fixed behind all content, cheap on the CPU
 * (a few dozen to ~130 dots), and still under `prefers-reduced-motion`.
 */

type Dot = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  a: number;
  tw: number;
  phase: number;
  hue: string;
};

const PALETTE = [
  "201, 162, 91",
  "230, 198, 131",
  "200, 192, 173",
  "70, 161, 146",
];

export function ParticleField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rand = (min: number, max: number) => min + Math.random() * (max - min);

    let width = 0;
    let height = 0;
    let dots: Dot[] = [];
    let raf = 0;
    let running = true;
    let t = 0;

    const seed = () => {
      const count = Math.round(Math.min(170, Math.max(60, (width * height) / 14500)));
      dots = Array.from({ length: count }, () => {
        const roll = Math.random();
        const hue = roll < 0.46 ? PALETTE[0] : roll < 0.82 ? PALETTE[1] : roll < 0.93 ? PALETTE[2] : PALETTE[3];
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          vx: rand(-0.12, 0.12),
          vy: rand(-0.16, -0.02),
          r: rand(0.6, 2.1),
          a: rand(0.14, 0.55),
          tw: rand(0.35, 1.5),
          phase: Math.random() * Math.PI * 2,
          hue,
        };
      });
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    };

    const draw = (advance: boolean) => {
      ctx.clearRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height / 2;
      const cos = Math.cos(0.0006);
      const sin = Math.sin(0.0006);

      for (const d of dots) {
        if (advance) {
          // slow rigid swirl about centre, like the armillary's turning dust
          const dx = d.x - cx;
          const dy = d.y - cy;
          d.x = cx + dx * cos - dy * sin + d.vx;
          d.y = cy + dx * sin + dy * cos + d.vy;
          if (d.x < -6) d.x = width + 6;
          else if (d.x > width + 6) d.x = -6;
          if (d.y < -6) d.y = height + 6;
          else if (d.y > height + 6) d.y = -6;
        }
        const a = advance ? d.a * (0.5 + 0.5 * Math.sin(t * d.tw + d.phase)) : d.a;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${d.hue}, ${a.toFixed(3)})`;
        ctx.fill();
      }
    };

    const tick = () => {
      if (!running) return;
      t += 0.016;
      draw(true);
      raf = requestAnimationFrame(tick);
    };

    const onVisibility = () => {
      running = !document.hidden;
      cancelAnimationFrame(raf);
      if (running && !reduced) raf = requestAnimationFrame(tick);
    };

    const onResize = () => resize();

    resize();
    if (reduced) draw(false);
    else raf = requestAnimationFrame(tick);

    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
    />
  );
}
