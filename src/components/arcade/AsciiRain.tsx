import { useEffect, useRef } from "react";

const GLYPHS = "01<>/\\|=+*#@$%&NEONARCADE▓▒░";
const DURATION = 3000;
const FADE = 900;

/**
 * Full-viewport ASCII rain that plays once (~3s) then fades out,
 * revealing the wordmark behind it. Disabled for reduced motion.
 */
const AsciiRain = ({ className }: { className?: string }) => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = canvas.offsetHeight * dpr;

    const fontSize = 14 * dpr;
    const columns = Math.ceil(canvas.width / fontSize);
    const drops = Array.from({ length: columns }, () => Math.random() * -60);
    const start = performance.now();
    let raf = 0;

    const draw = (now: number) => {
      const t = now - start;
      const fade = t > DURATION ? Math.max(0, 1 - (t - DURATION) / FADE) : 1;

      ctx.fillStyle = "rgba(15, 18, 32, 0.2)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = `${fontSize}px "JetBrains Mono", monospace`;

      for (let i = 0; i < columns; i++) {
        const char = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        const isViolet = Math.random() < 0.12;
        ctx.fillStyle = isViolet
          ? `rgba(124, 92, 255, ${0.95 * fade})`
          : `rgba(45, 226, 230, ${0.35 * fade})`;
        ctx.fillText(char, i * fontSize, drops[i] * fontSize);
        if (drops[i] * fontSize > canvas.height && Math.random() > 0.97) {
          drops[i] = 0;
        }
        drops[i] += 0.85;
      }

      if (t < DURATION + FADE) {
        raf = requestAnimationFrame(draw);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
};

export default AsciiRain;
