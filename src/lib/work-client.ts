/**
 * Browser helpers for «جدول بيانات الشغل»:
 * - device biometric (WebAuthn platform authenticator: Face ID / Touch ID / Android Biometric)
 * - live camera frame capture for face verification
 * No biometric data leaves the device; only a signed challenge is sent.
 */

const toB64url = (buf: ArrayBuffer) => {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromB64url = (s: string) => {
  const b = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b.length % 4 ? "=".repeat(4 - (b.length % 4)) : "";
  const raw = atob(b + pad);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

export function biometricSupported(): boolean {
  return typeof window !== "undefined" && !!window.PublicKeyCredential && !!navigator.credentials;
}

export async function registerBiometric(opts: { challenge: string; userId: string; name: string }) {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: fromB64url(opts.challenge) as unknown as BufferSource,
      rp: { name: "Mag Pro", id: window.location.hostname },
      user: {
        id: new TextEncoder().encode(opts.userId) as unknown as BufferSource,
        name: opts.name,
        displayName: opts.name,
      },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
      attestation: "none",
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("تم إلغاء تسجيل الجهاز");
  const res = cred.response as AuthenticatorAttestationResponse;
  const spki = res.getPublicKey?.();
  if (!spki) throw new Error("هذا الجهاز لا يدعم المصادقة البيومترية المطلوبة");
  return { credentialId: toB64url(cred.rawId), publicKey: toB64url(spki) };
}

export async function assertBiometric(opts: { challenge: string; credentialIds: string[] }) {
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: fromB64url(opts.challenge) as unknown as BufferSource,
      rpId: window.location.hostname,
      allowCredentials: opts.credentialIds.map((id) => ({
        type: "public-key" as const,
        id: fromB64url(id) as unknown as BufferSource,
      })),
      userVerification: "required",
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("تم إلغاء مصادقة الجهاز");
  const r = cred.response as AuthenticatorAssertionResponse;
  return {
    credentialId: toB64url(cred.rawId),
    clientDataJSON: toB64url(r.clientDataJSON),
    authenticatorData: toB64url(r.authenticatorData),
    signature: toB64url(r.signature),
  };
}

/** Grabs one JPEG frame from the front camera. */
export async function captureFace(): Promise<string> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } },
    audio: false,
  });
  try {
    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    await new Promise((r) => setTimeout(r, 700)); // let exposure settle
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
    video.pause();
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}
