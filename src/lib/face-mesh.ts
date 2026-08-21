/**
 * Real-time head-pose + eye-openness measurement for the face verification gate.
 *
 * Uses MediaPipe FaceLandmarker (browser-only, WASM) so the decisions
 * ("is the head really turned right?", "are the eyes open?") are measured
 * geometrically per frame instead of being guessed from a single screenshot.
 * Runs fully client-side, works on mobile Chrome cameras.
 */

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

type Landmarker = {
  detectForVideo: (v: HTMLVideoElement, ts: number) => any;
};

let landmarkerPromise: Promise<Landmarker | null> | null = null;

export function loadFaceLandmarker(): Promise<Landmarker | null> {
  if (landmarkerPromise) return landmarkerPromise;
  landmarkerPromise = (async () => {
    try {
      const vision = await import("@mediapipe/tasks-vision");
      const files = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
      const lm = await vision.FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      });
      return lm as unknown as Landmarker;
    } catch {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const files = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
        const lm = await vision.FaceLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
        });
        return lm as unknown as Landmarker;
      } catch {
        return null;
      }
    }
  })();
  return landmarkerPromise;
}

export type FaceReading = {
  /** A face was found in this frame. */
  face: boolean;
  /** Head rotation in degrees; negative = person turned to their own right. */
  yaw: number;
  /** Head pitch in degrees (up/down). */
  pitch: number;
  /** 0..1 eye-open score (1 = wide open) — average of both eyes. */
  eyeOpen: number;
};

const EMPTY: FaceReading = { face: false, yaw: 0, pitch: 0, eyeOpen: 0 };

function blend(shapes: any[], name: string): number {
  const c = shapes.find((s: any) => s.categoryName === name);
  return c ? Number(c.score) || 0 : 0;
}

/**
 * Reads one video frame. `mirrored` tells whether the preview is mirrored;
 * yaw is reported in the *person's own* frame of reference either way.
 */
export function readFace(
  landmarker: Landmarker | null,
  video: HTMLVideoElement | null,
  mirrored: boolean,
): FaceReading {
  if (!landmarker || !video || !video.videoWidth) return EMPTY;
  let res: any;
  try {
    res = landmarker.detectForVideo(video, performance.now());
  } catch {
    return EMPTY;
  }
  const marks = res?.faceLandmarks?.[0];
  if (!marks || marks.length < 400) return EMPTY;

  // Yaw from the facial transformation matrix when available (most stable),
  // otherwise from nose/eye-corner geometry.
  let yaw = 0;
  let pitch = 0;
  const m = res?.facialTransformationMatrixes?.[0]?.data as number[] | undefined;
  if (m && m.length === 16) {
    // column-major 4x4
    yaw = (Math.atan2(-m[8]!, m[10]!) * 180) / Math.PI;
    pitch = (Math.asin(Math.max(-1, Math.min(1, m[9]!))) * 180) / Math.PI;
  } else {
    const nose = marks[1];
    const left = marks[33];
    const right = marks[263];
    const mid = (left.x + right.x) / 2;
    const span = Math.abs(right.x - left.x) || 1;
    yaw = ((nose.x - mid) / span) * 120;
    pitch = 0;
  }
  // Mediapipe operates on the raw (unmirrored) video pixels; the sign is
  // already in the person's own reference. Mirroring the *preview* does not
  // change the underlying pixels, so no flip is needed — kept explicit here.
  if (mirrored) yaw = yaw;

  const shapes = res?.faceBlendshapes?.[0]?.categories as any[] | undefined;
  let eyeOpen = 1;
  if (shapes?.length) {
    const blinkL = blend(shapes, "eyeBlinkLeft");
    const blinkR = blend(shapes, "eyeBlinkRight");
    const squintL = blend(shapes, "eyeSquintLeft");
    const squintR = blend(shapes, "eyeSquintRight");
    // Squint alone must not read as "closed": weight it lightly.
    const closed = Math.min(1, (blinkL + blinkR) / 2 + 0.15 * ((squintL + squintR) / 2));
    eyeOpen = 1 - closed;
  } else {
    // Eye aspect ratio fallback.
    const ear = (top: number, bottom: number, l: number, r: number) => {
      const h = Math.hypot(marks[top].x - marks[bottom].x, marks[top].y - marks[bottom].y);
      const w = Math.hypot(marks[l].x - marks[r].x, marks[l].y - marks[r].y) || 1;
      return h / w;
    };
    const avg = (ear(159, 145, 33, 133) + ear(386, 374, 362, 263)) / 2;
    eyeOpen = Math.max(0, Math.min(1, (avg - 0.12) / 0.18));
  }

  return { face: true, yaw, pitch, eyeOpen };
}

/** Yaw threshold (degrees) that counts as "really turned" toward a side. */
export const YAW_TARGET = 18;
/** Tolerance band: once in pose, the head may drift back to this angle. */
export const YAW_HOLD = 12;
/** Below this the eyes are considered closed (blink-tolerant when smoothed). */
export const EYE_CLOSED = 0.35;

/** Direction of a reading relative to the person's own left/right. */
export function yawDir(yaw: number, threshold = YAW_TARGET): "right" | "left" | null {
  if (yaw <= -threshold) return "right";
  if (yaw >= threshold) return "left";
  return null;
}
