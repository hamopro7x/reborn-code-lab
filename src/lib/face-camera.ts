/**
 * Camera pipeline for Face Recognition (enrollment + verification).
 *
 * Design rule: PREVIEW FRAME == RECOGNITION FRAME.
 *
 * What was wrong before and is fixed here:
 * - the stream was forced to a square 1280x1280 with `resizeMode: "none"`,
 *   so mobile drivers letterboxed/stretched the sensor frame → faces looked
 *   skewed and off-centre compared to the native camera app.
 *   Now we request the camera's natural portrait-ish aspect and never force a
 *   square sensor output.
 * - `getUserMedia` was called twice (probe + real), leaving two streams and
 *   sometimes a different device than the one previewed.
 * - a manual "uprightRotation" heuristic rotated the canvas by 90° whenever the
 *   stream was landscape while the UI was portrait. Browsers already deliver
 *   display-oriented frames, so that rotation is what tilted/rotated the face
 *   in the analysed frame while the preview looked fine. It is removed.
 * - the capture cropped a centred square while the preview showed a different
 *   box, and the preview mirroring was not applied to the captured frame.
 *   Now the crop is computed from the video element's own rendered box using
 *   the exact `object-fit: cover` math, and the mirroring of the capture
 *   follows the preview's mirroring.
 */

export type FrontCamera = { stream: MediaStream; deviceId: string | null };

/** Opens the front/user-facing camera with its natural aspect ratio. */
export async function openFrontCamera(): Promise<FrontCamera> {
  const attempts: MediaStreamConstraints[] = [
    { video: { facingMode: { ideal: "user" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
    { video: { facingMode: "user" }, audio: false },
    { video: true, audio: false },
  ];
  let lastErr: unknown = null;
  for (const c of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(c);
      const deviceId = (stream.getVideoTracks()[0]?.getSettings().deviceId as string) ?? null;
      return { stream, deviceId };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("camera unavailable");
}

/** Waits until the stream really has decoded dimensions. */
export async function waitForVideoReady(video: HTMLVideoElement, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) return true;
    await new Promise((r) => setTimeout(r, 60));
  }
  return video.videoWidth > 0;
}

/**
 * The source rectangle of the video stream that the preview actually shows,
 * derived from the element box with `object-fit: cover` semantics.
 * This is what makes "what the employee sees" equal "what is analysed".
 */
function coverSourceRect(video: HTMLVideoElement) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const bw = video.clientWidth || vw;
  const bh = video.clientHeight || vh;
  const boxRatio = bw / bh;
  const vidRatio = vw / vh;
  let sw = vw;
  let sh = vh;
  if (vidRatio > boxRatio) {
    // video wider than box → sides are cropped away by object-cover
    sw = vh * boxRatio;
  } else {
    sh = vw / boxRatio;
  }
  return { sx: (vw - sw) / 2, sy: (vh - sh) / 2, sw, sh, boxRatio };
}

/**
 * Grabs exactly the region visible in the preview box.
 * `mirroredPreview: true` means the preview uses `scaleX(-1)`; the captured
 * frame is then mirrored the same way so both images are identical.
 * (Mirroring does not affect identity matching — a selfie mirror is symmetric
 * for recognition — but it keeps preview == recognition frame.)
 */
export function captureUprightFrame(
  video: HTMLVideoElement | null,
  opts: { mirroredPreview?: boolean; size?: number } = {},
): string | null {
  if (!video || !video.videoWidth || !video.videoHeight) return null;
  const longSide = opts.size ?? 720;
  const { sx, sy, sw, sh, boxRatio } = coverSourceRect(video);

  const outW = boxRatio >= 1 ? longSide : Math.round(longSide * boxRatio);
  const outH = boxRatio >= 1 ? Math.round(longSide / boxRatio) : longSide;

  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  if (opts.mirroredPreview) {
    ctx.translate(outW, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH);
  return out.toDataURL("image/jpeg", 0.92);
}

export type FrameQuality = {
  /** Laplacian-style sharpness score; higher is sharper. */
  sharpness: number;
  /** Mean luminance 0..255. */
  brightness: number;
  /** Convenience verdict used to drop obviously bad frames. */
  usable: boolean;
};

/**
 * Cheap local quality probe on the same region the preview shows, so a single
 * naturally-blurred frame can be skipped client-side instead of failing the
 * whole verification server-side.
 */
export function measureFrameQuality(video: HTMLVideoElement | null): FrameQuality | null {
  if (!video || !video.videoWidth || !video.videoHeight) return null;
  const { sx, sy, sw, sh } = coverSourceRect(video);
  const w = 128;
  const h = Math.max(1, Math.round((sh / sw) * w));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const gray = new Float32Array(w * h);
  let sum = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const g = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
    gray[p] = g;
    sum += g;
  }
  const brightness = sum / (w * h);

  // Variance of the Laplacian → focus/blur measure.
  let mean = 0;
  const lap: number[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = 4 * gray[i]! - gray[i - 1]! - gray[i + 1]! - gray[i - w]! - gray[i + w]!;
      lap.push(v);
      mean += v;
    }
  }
  mean /= Math.max(1, lap.length);
  let varSum = 0;
  for (const v of lap) varSum += (v - mean) * (v - mean);
  const sharpness = varSum / Math.max(1, lap.length);

  return {
    sharpness,
    brightness,
    usable: sharpness >= 25 && brightness >= 45 && brightness <= 245,
  };
}

/**
 * Collects frames over a short window and returns the best ones by sharpness.
 * Used for both enrollment and verification so no decision depends on a single
 * screenshot.
 */
export async function collectGoodFrames(
  video: HTMLVideoElement | null,
  opts: {
    want: number;
    tries?: number;
    intervalMs?: number;
    mirroredPreview?: boolean;
    onProgress?: (got: number, want: number) => void;
  },
): Promise<string[]> {
  const want = opts.want;
  const tries = opts.tries ?? want * 5;
  const interval = opts.intervalMs ?? 140;
  const scored: Array<{ frame: string; score: number }> = [];

  for (let i = 0; i < tries && scored.length < want * 2; i++) {
    const q = measureFrameQuality(video);
    const frame = captureUprightFrame(video, { mirroredPreview: opts.mirroredPreview });
    if (q && frame && q.usable) {
      scored.push({ frame, score: q.sharpness });
      opts.onProgress?.(Math.min(scored.length, want), want);
    }
    if (scored.length >= want && i >= want * 2) break;
    await new Promise((r) => setTimeout(r, interval));
  }

  // Fallback: if lighting is poor everywhere, still return the sharpest raws
  // so the server (not the client) makes the final identity decision.
  if (scored.length === 0) {
    for (let i = 0; i < want; i++) {
      const frame = captureUprightFrame(video, { mirroredPreview: opts.mirroredPreview });
      const q = measureFrameQuality(video);
      if (frame) scored.push({ frame, score: q?.sharpness ?? 0 });
      await new Promise((r) => setTimeout(r, interval));
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, want)
    .map((s) => s.frame);
}
