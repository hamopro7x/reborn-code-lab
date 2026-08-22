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
  void mirrored;
  if (!landmarker || !video || !video.videoWidth) return EMPTY;
  let res: any;
  try {
    res = landmarker.detectForVideo(video, performance.now());
  } catch {
    return EMPTY;
  }
  const marks = res?.faceLandmarks?.[0];
  if (!marks || marks.length < 400) return EMPTY;

  /**
   * Head yaw from THREE independent signals on the RAW camera pixels
   * (mirroring the preview never changes the pixels the detector sees):
   *
   * 1. cheek asymmetry — nose tip distance to the left/right face edges
   *    (landmarks 234 / 454). This is the strongest, most reliable signal.
   * 2. nose offset against the eye-corner midpoint.
   * 3. the 4x4 facial transformation matrix, when the model emits it.
   *
   * Sign convention: negative = the person turned to their OWN right. In an
   * unmirrored camera image the person's own right side sits on the image's
   * left (smaller x), so turning right pulls the nose toward smaller x.
   */
  const nose = marks[1];
  const eyeL = marks[33];
  const eyeR = marks[263];
  const chin = marks[152];
  const brow = marks[10];
  const edgeL = marks[234];
  const edgeR = marks[454];

  const dL = Math.abs(nose.x - edgeL.x);
  const dR = Math.abs(edgeR.x - nose.x);
  const cheek = (dL - dR) / (dL + dR || 1); // >0 => nose toward image right => own left

  const mid = (eyeL.x + eyeR.x) / 2;
  const span = Math.abs(eyeR.x - eyeL.x) || 1;
  const offset = (nose.x - mid) / span;

  // Both normalised signals map to degrees with their own sensitivity, then we
  // keep the larger magnitude (a real turn shows up strongly in at least one).
  const yawCheek = cheek * 95;
  const yawOffset = offset * 130;
  let yaw = Math.abs(yawCheek) >= Math.abs(yawOffset) ? yawCheek : yawOffset;

  const m: number[] | undefined = res?.facialTransformationMatrixes?.[0]?.data;
  if (m && m.length === 16) {
    // Column-major 4x4; yaw around the vertical axis.
    const matYaw = (Math.atan2(-m[8]!, m[10]!) * 180) / Math.PI;
    // Trust the matrix magnitude only when it agrees with the geometric sign.
    if (Math.sign(matYaw) === Math.sign(yaw) && Math.abs(matYaw) > Math.abs(yaw)) yaw = matYaw;
  }
  yaw = Math.max(-90, Math.min(90, yaw));

  const vSpan = Math.abs(chin.y - brow.y) || 1;
  const vMid = (brow.y + chin.y) / 2;
  const pitch = Math.max(-60, Math.min(60, ((nose.y - vMid) / vSpan) * 120));

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
