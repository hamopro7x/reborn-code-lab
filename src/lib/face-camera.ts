/**
 * Camera pipeline for Face Recognition (enrollment + verification).
 *
 * Goal: the frame sent to Face Recognition has EXACTLY the same upright
 * orientation and framing as what the employee sees in the preview box.
 *
 * Rules implemented here:
 * - front (user-facing) camera is selected explicitly, never a random device
 * - real stream dimensions (videoWidth/videoHeight) are used, never clientWidth
 * - device/screen rotation is compensated on the canvas (not with CSS only)
 * - the preview may be mirrored for comfort; the analysed frame is un-mirrored
 * - the canvas takes the same centered square crop the preview shows (object-cover)
 */

export type FrontCamera = { stream: MediaStream; deviceId: string | null };

/** Picks the front/user-facing camera explicitly and opens a square-ish stream. */
export async function openFrontCamera(): Promise<FrontCamera> {
  const base: MediaTrackConstraints = {
    facingMode: { ideal: "user" },
    width: { ideal: 1280 },
    height: { ideal: 1280 },
    aspectRatio: { ideal: 1 },
    // @ts-expect-error non-standard but widely supported hint
    resizeMode: "none",
  };

  let deviceId: string | null = null;
  try {
    // enumerateDevices only exposes labels after a permission grant, so we
    // probe with facingMode first, then pin the exact front device.
    const probe = await navigator.mediaDevices.getUserMedia({ video: base, audio: false });
    const settings = probe.getVideoTracks()[0]?.getSettings();
    deviceId = (settings?.deviceId as string) ?? null;
    if (!deviceId) {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === "videoinput");
      const front =
        cams.find((d) => /front|user|face|أمام/i.test(d.label)) ??
        (cams.length ? cams[0] : undefined);
      deviceId = front?.deviceId ?? null;
    }
    return { stream: probe, deviceId };
  } catch {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: false,
    });
    return { stream, deviceId: null };
  }
}

/** Waits until the stream really has decoded dimensions. */
export async function waitForVideoReady(video: HTMLVideoElement, timeoutMs = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) return true;
    await new Promise((r) => setTimeout(r, 80));
  }
  return video.videoWidth > 0;
}

/**
 * How much the raw camera frame must be rotated (degrees, clockwise) so the
 * face appears upright. Mobile sensors deliver frames in the sensor's own
 * orientation; the screen angle tells us how the device is held.
 */
export function uprightRotation(video: HTMLVideoElement): 0 | 90 | 180 | 270 {
  if (typeof window === "undefined") return 0;
  const angle = Number(
    (window.screen?.orientation as ScreenOrientation | undefined)?.angle ??
      (window as unknown as { orientation?: number }).orientation ??
      0,
  );
  const streamLandscape = video.videoWidth >= video.videoHeight;
  const viewLandscape = window.innerWidth >= window.innerHeight;

  // Frames already match how the user holds the device → nothing to do.
  if (streamLandscape === viewLandscape) return 0;

  // Mismatch: rotate against the screen angle to bring the face upright.
  const normalized = ((angle % 360) + 360) % 360;
  if (normalized === 90) return 270;
  if (normalized === 270) return 90;
  return 90; // portrait UI with a landscape stream (typical mobile portrait)
}

/**
 * Grabs one upright, un-mirrored JPEG frame matching the square preview crop.
 * Returns null when the stream is not ready yet.
 */
export function captureUprightFrame(
  video: HTMLVideoElement | null,
  opts: { mirroredPreview?: boolean; size?: number } = {},
): string | null {
  if (!video || !video.videoWidth || !video.videoHeight) return null;
  const size = opts.size ?? 720;
  const rotation = uprightRotation(video);

  // Step 1: draw the raw frame upright at full stream resolution.
  const swap = rotation === 90 || rotation === 270;
  const upW = swap ? video.videoHeight : video.videoWidth;
  const upH = swap ? video.videoWidth : video.videoHeight;
  const up = document.createElement("canvas");
  up.width = upW;
  up.height = upH;
  const uctx = up.getContext("2d")!;
  uctx.save();
  uctx.translate(upW / 2, upH / 2);
  if (rotation) uctx.rotate((rotation * Math.PI) / 180);
  // Preview may be mirrored via CSS for comfort; the analysed frame stays
  // in true (un-mirrored) orientation so recognition sees the real face.
  uctx.drawImage(video, -video.videoWidth / 2, -video.videoHeight / 2, video.videoWidth, video.videoHeight);
  uctx.restore();

  // Step 2: same centered square crop the preview shows with object-cover.
  const side = Math.min(upW, upH);
  const sx = (upW - side) / 2;
  const sy = (upH - side) / 2;
  const out = document.createElement("canvas");
  out.width = size;
  out.height = size;
  const octx = out.getContext("2d")!;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(up, sx, sy, side, side, 0, 0, size, size);
  return out.toDataURL("image/jpeg", 0.9);
}
