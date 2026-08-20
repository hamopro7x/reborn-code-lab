import { useEffect, useRef } from "react";

/**
 * Animated Cyber / Fintech backdrop rendered on a single canvas.
 * Purely decorative: pointer-events none, sits behind content.
 */
export function FintechBackdrop({
  className = "",
  fullscreen = false,
}: { className?: string; fullscreen?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let w = 1;
    let h = 1;
    let dpr = 1;
    let raf = 0;
    let running = true;

    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    type Node = { x: number; y: number; vx: number; vy: number };
    type Particle = { x: number; y: number; vx: number; vy: number; r: number; hue: number };
    type Candle = { x: number; o: number; c: number; hi: number; lo: number; up: boolean };
    type Trail = { x: number; y: number; len: number; sp: number; vertical: boolean; hue: number };
    type Glyph = { x: number; y: number; text: string; life: number; max: number; mono: boolean };

    let nodes: Node[] = [];
    let particles: Particle[] = [];
    let candlesL: Candle[] = [];
    let candlesR: Candle[] = [];
    let trails: Trail[] = [];
    let glyphs: Glyph[] = [];
    let mapDots: { x: number; y: number; r: number; ph: number }[] = [];
    let linePts: number[] = [];

    const CODE = [
      "function analyze(){",
      "const data = fetch()",
      "if (trend == 'up')",
      "return result",
      "let clr = 0x0f",
      "await sync(node)",
      "} else { sell() }",
      "sig.verify(hash)",
    ];

    const makeCandles = (count: number, baseX: number, step: number, baseY: number) => {
      const out: Candle[] = [];
      let last = baseY;
      for (let i = 0; i < count; i++) {
        const o = last;
        const c = Math.max(baseY - 70, Math.min(baseY + 70, o + rand(-16, 16)));
        last = c;
        out.push({
          x: baseX + i * step,
          o,
          c,
          hi: Math.min(o, c) - rand(4, 22),
          lo: Math.max(o, c) + rand(4, 22),
          up: c < o,
        });
      }
      return out;
    };

    const build = () => {
      const area = (w * h) / 1000;
      const nodeCount = Math.max(18, Math.min(70, Math.round(area / 6)));
      nodes = Array.from({ length: nodeCount }, () => ({
        x: rand(0, w),
        y: rand(0, h),
        vx: rand(-0.12, 0.12),
        vy: rand(-0.12, 0.12),
      }));

      particles = Array.from({ length: Math.max(20, Math.min(90, Math.round(area / 4.5))) }, () => ({
        x: rand(0, w),
        y: rand(0, h),
        vx: rand(-0.25, 0.25),
        vy: rand(-0.35, -0.05),
        r: rand(0.6, 2.0),
        hue: [175, 190, 205, 45].at(Math.floor(rand(0, 4)))!,
      }));

      const colsTop = Math.max(10, Math.floor((w - 24) / 13));
      const colsBottom = Math.max(10, Math.floor((w - 24) / 12));
      candlesL = makeCandles(colsTop, 12, 13, h * 0.24);
      candlesR = makeCandles(colsBottom, 12, 12, h * 0.78);

      trails = Array.from({ length: 12 }, () => ({
        x: rand(0, w),
        y: rand(0, h),
        len: rand(60, 190),
        sp: rand(0.6, 1.8),
        vertical: Math.random() > 0.55,
        hue: Math.random() > 0.5 ? 185 : 200,
      }));

      glyphs = [];
      mapDots = [];
      const mapW = Math.min(w * 0.42, 520);
      const mapH = mapW * 0.42;
      const mapX = w - mapW - 20;
      const mapY = 10;
      for (let i = 0; i < 420; i++) {
        // pseudo-continent mask via layered noise-ish sine field
        const u = Math.random();
        const v = Math.random();
        const f =
          Math.sin(u * 9.1 + 1.2) * Math.cos(v * 6.3 - 0.7) +
          0.7 * Math.sin(u * 17.3 + v * 11.1);
        if (f < 0.35) continue;
        mapDots.push({
          x: mapX + u * mapW,
          y: mapY + v * mapH,
          r: rand(0.5, 1.3),
          ph: rand(0, Math.PI * 2),
        });
      }

      linePts = Array.from({ length: 60 }, (_, i) => h * 0.5 + Math.sin(i * 0.32) * 26 + rand(-8, 8));
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    };

    // ---------- draw layers ----------
    const drawGrid = (t: number) => {
      const step = 46;
      const off = (t * 0.012) % step;
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(168, 168, 164, 0.11)";
      ctx.beginPath();
      for (let x = -step + off; x < w; x += step) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = -step + off; y < h; y += step) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();
    };

    const drawMap = (t: number) => {
      for (const d of mapDots) {
        const a = 0.34 + 0.26 * Math.sin(t * 0.0016 + d.ph);
        ctx.fillStyle = `rgba(168, 168, 164, ${a})`;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const drawCandles = (set: Candle[], t: number, phase: number) => {
      for (let i = 0; i < set.length; i++) {
        const c = set[i]!;
        const wob = Math.sin(t * 0.001 + i * 0.5 + phase) * 3;
        const up = c.up;
        const col = up ? "196, 196, 192" : "118, 118, 114";
        ctx.strokeStyle = `rgba(${col}, 0.6)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(c.x + 3, c.hi + wob);
        ctx.lineTo(c.x + 3, c.lo + wob);
        ctx.stroke();
        ctx.fillStyle = `rgba(${col}, 0.5)`;
        const top = Math.min(c.o, c.c) + wob;
        const hgt = Math.max(2, Math.abs(c.c - c.o));
        ctx.fillRect(c.x, top, 6, hgt);
      }
    };

    const drawGraph = (t: number) => {
      ctx.save();
      ctx.beginPath();
      const seg = w / (linePts.length - 1);
      for (let i = 0; i < linePts.length; i++) {
        const y = linePts[i]! + Math.sin(t * 0.0012 + i * 0.4) * 8;
        if (i === 0) ctx.moveTo(0, y);
        else ctx.lineTo(i * seg, y);
      }
      ctx.strokeStyle = "rgba(168, 168, 164, 0.42)";
      ctx.lineWidth = 1.4;
      ctx.shadowColor = "rgba(168, 168, 164, 0.35)";
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.restore();
    };

    const drawNetwork = (t: number) => {
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
      }
      ctx.lineWidth = 0.7;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]!;
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j]!;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > 150 * 150) continue;
          const alpha = (1 - Math.sqrt(d2) / 150) * 0.34;
          ctx.strokeStyle = `rgba(168, 168, 164, ${alpha})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        const pulse = 0.55 + 0.3 * Math.sin(t * 0.002 + a.x * 0.01);
        ctx.fillStyle = `rgba(168, 168, 164, ${pulse})`;
        ctx.beginPath();
        ctx.arc(a.x, a.y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const drawParticles = () => {
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.y < -10) {
          p.y = h + 10;
          p.x = rand(0, w);
        }
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        ctx.fillStyle = `hsla(100, 3%, 65%, 0.75)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const drawTrails = () => {
      for (const tr of trails) {
        const g = tr.vertical
          ? ctx.createLinearGradient(tr.x, tr.y, tr.x, tr.y + tr.len)
          : ctx.createLinearGradient(tr.x, tr.y, tr.x + tr.len, tr.y);
        g.addColorStop(0, `hsla(100, 3%, 65%, 0)`);
        g.addColorStop(0.6, `hsla(100, 3%, 68%, 0.5)`);
        g.addColorStop(1, `hsla(100, 3%, 75%, 0)`);
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(tr.x, tr.y);
        if (tr.vertical) ctx.lineTo(tr.x, tr.y + tr.len);
        else ctx.lineTo(tr.x + tr.len, tr.y);
        ctx.stroke();

        if (tr.vertical) {
          tr.y += tr.sp;
          if (tr.y > h + tr.len) {
            tr.y = -tr.len;
            tr.x = rand(0, w);
          }
        } else {
          tr.x += tr.sp;
          if (tr.x > w + tr.len) {
            tr.x = -tr.len;
            tr.y = rand(0, h);
          }
        }
      }
    };

    const spawnGlyph = () => {
      const mono = Math.random() > 0.45;
      const edge = Math.random();
      const x =
        edge < 0.38
          ? rand(4, Math.max(6, w * 0.2))
          : edge < 0.76
            ? rand(w * 0.74, Math.max(w * 0.76, w - 90))
            : rand(w * 0.2, Math.max(w * 0.22, w * 0.74));
      const text = mono
        ? Array.from({ length: Math.round(rand(6, 14)) }, () => (Math.random() > 0.5 ? "1" : "0")).join("")
        : Math.random() > 0.45
          ? CODE[Math.floor(rand(0, CODE.length))]!
          : `${rand(10, 99).toFixed(2)}  ${Math.random() > 0.5 ? "+" : "-"}${rand(0, 9).toFixed(2)}%`;
      const max = rand(2600, 5200);
      glyphs.push({ x, y: rand(10, h - 10), text, life: 0, max, mono });
      if (glyphs.length > 70) glyphs.shift();
    };

    const drawGlyphs = (dt: number) => {
      ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "left";
      for (let i = glyphs.length - 1; i >= 0; i--) {
        const g = glyphs[i]!;
        g.life += dt;
        if (g.life > g.max) {
          glyphs.splice(i, 1);
          continue;
        }
        const k = g.life / g.max;
        const a = Math.sin(Math.PI * k) * (g.mono ? 0.5 : 0.42);
        ctx.fillStyle = g.mono
          ? `rgba(168, 168, 164, ${a})`
          : `rgba(168, 168, 164, ${a})`;
        ctx.fillText(g.text, g.x, g.y);
      }
    };

    const drawHud = (t: number) => {
      ctx.save();
      ctx.strokeStyle = "rgba(168, 168, 164, 0.35)";
      ctx.lineWidth = 1;
      // corner brackets
      const b = 22;
      const corners: [number, number, number, number][] = [
        [10, 10, 1, 1],
        [w - 10, 10, -1, 1],
        [10, h - 10, 1, -1],
        [w - 10, h - 10, -1, -1],
      ];
      for (const [cx, cy, sx, sy] of corners) {
        ctx.beginPath();
        ctx.moveTo(cx + sx * b, cy);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx, cy + sy * b);
        ctx.stroke();
      }
      // rotating arc gauge
      const gx = w - 58;
      const gy = h - 62;
      const r = 26;
      ctx.strokeStyle = "rgba(168, 168, 164, 0.22)";
      ctx.beginPath();
      ctx.arc(gx, gy, r, 0, Math.PI * 2);
      ctx.stroke();
      const start = (t * 0.0009) % (Math.PI * 2);
      ctx.strokeStyle = "rgba(168, 168, 164, 0.6)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(gx, gy, r, start, start + 1.6);
      ctx.stroke();
      ctx.restore();
    };

    let last = 0;
    let glyphTimer = 0;

    const frame = (now: number) => {
      if (!running) return;
      const dt = last ? Math.min(now - last, 48) : 16;
      last = now;

      ctx.clearRect(0, 0, w, h);
      drawGrid(now);
      drawMap(now);
      drawCandles(candlesL, now, 0);
      drawCandles(candlesR, now, 1.7);
      drawGraph(now);
      drawNetwork(now);
      drawTrails();
      drawParticles();
      drawGlyphs(dt);
      drawHud(now);

      glyphTimer += dt;
      if (glyphTimer > 200) {
        glyphTimer = 0;
        spawnGlyph();
      }

      raf = requestAnimationFrame(frame);
    };

    resize();
    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas);

    if (reduced) {
      // single static frame
      ctx.clearRect(0, 0, w, h);
      drawGrid(0);
      drawMap(0);
      drawCandles(candlesL, 0, 0);
      drawCandles(candlesR, 0, 1.7);
      drawGraph(0);
      drawNetwork(0);
      drawHud(0);
    } else {
      raf = requestAnimationFrame(frame);
    }

    const onVis = () => {
      if (reduced) return;
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <div
      aria-hidden
      className={`pointer-events-none overflow-hidden ${
        fullscreen ? "fixed inset-0 z-0" : "absolute inset-0 rounded-3xl"
      } ${className}`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_0%,oklch(0.24_0.002_106/0.9),oklch(0.19_0.002_106/0.95))]" />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div className="absolute inset-0 bg-[radial-gradient(65%_55%_at_50%_50%,oklch(0.16_0.002_106/0.45),transparent_80%)]" />
    </div>
  );
}
