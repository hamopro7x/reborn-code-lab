// جلسات بث دائمة: الاتصال بجهاز الموظف يُنشأ مرة واحدة ويبقى حياً
// طالما الصفحة مفتوحة — الخروج من القسم أو الرجوع إليه لا يقطع البث.
import { RTC_CONFIG, makeViewerId, openSignaling, type Signal } from "@/lib/screenshare";

export type SessionState = { live: boolean; failed: boolean; canControl: boolean };

type Signaling = ReturnType<typeof openSignaling>;

class ScreenSession {
  readonly deviceId: string;
  stream: MediaStream | null = null;
  state: SessionState = { live: false, failed: false, canControl: false };
  private listeners = new Set<() => void>();
  private refs = 0;
  private pc: RTCPeerConnection | null = null;
  private sig: Signaling | null = null;
  private ctl: RTCDataChannel | null = null;
  private timers: Array<ReturnType<typeof setInterval>> = [];
  private recoverTimer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  private moveQueued: { x: number; y: number } | null = null;
  private raf: number | null = null;

  constructor(deviceId: string) {
    this.deviceId = deviceId;
  }

  subscribe(cb: () => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit() {
    for (const cb of this.listeners) cb();
  }

  private set(patch: Partial<SessionState>) {
    const next = { ...this.state, ...patch };
    if (
      next.live === this.state.live &&
      next.failed === this.state.failed &&
      next.canControl === this.state.canControl
    )
      return;
    this.state = next;
    this.emit();
  }

  acquire() {
    this.refs += 1;
    this.connect();
  }

  release() {
    this.refs = Math.max(0, this.refs - 1);
    // لا نغلق الاتصال أبداً عند الخروج من القسم: يظل متصلاً بدون انقطاع.
  }

  sendInput = (cmd: Record<string, unknown>) => {
    const ch = this.ctl;
    if (!ch || ch.readyState !== "open") return;
    const limit = cmd.t === "move" ? 4_096 : 65_536;
    if (ch.bufferedAmount > limit) return;
    try {
      ch.send(JSON.stringify(cmd));
    } catch {
      /* القناة أُغلقت */
    }
  };

  sendMove = (p: { x: number; y: number }) => {
    this.moveQueued = p;
    if (this.raf != null) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = null;
      const m = this.moveQueued;
      this.moveQueued = null;
      if (m) this.sendInput({ t: "move", x: m.x, y: m.y });
    });
  };

  /** يهدم مسار WebRTC الحالي فقط (بدون هدم الجلسة) */
  private dropTransport() {
    this.generation += 1;
    if (this.recoverTimer) clearTimeout(this.recoverTimer);
    this.recoverTimer = undefined;
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    this.ctl = null;
    try {
      this.sig?.close();
    } catch {
      /* تجاهل */
    }
    this.sig = null;
    try {
      this.pc?.close();
    } catch {
      /* تجاهل */
    }
    this.pc = null;
  }

  private scheduleReconnect(delay: number, gen: number) {
    if (gen !== this.generation || this.recoverTimer) return;
    this.recoverTimer = setTimeout(() => {
      this.recoverTimer = undefined;
      if (gen !== this.generation) return;
      this.dropTransport();
      this.connect();
    }, delay);
  }

  connect() {
    if (this.pc) return;
    const viewerId = makeViewerId();
    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.pc = pc;
    const gen = this.generation;
    const alive = () => gen === this.generation;
    this.set({ live: false, failed: false });

    pc.onconnectionstatechange = () => {
      if (!alive()) return;
      if (pc.connectionState === "connected") {
        if (this.recoverTimer) clearTimeout(this.recoverTimer);
        this.recoverTimer = undefined;
        this.set({ failed: false });
        return;
      }
      if (pc.connectionState === "disconnected") {
        try {
          pc.restartIce();
        } catch {
          /* غير مدعوم */
        }
        this.scheduleReconnect(4000, gen);
      } else if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        this.set({ live: false });
        this.scheduleReconnect(1200, gen);
      }
    };

    const pendingIce: RTCIceCandidateInit[] = [];
    let acceptedOfferSdp: string | undefined;

    try {
      pc.addTransceiver("video", { direction: "recvonly" });
    } catch {
      /* غير مدعوم */
    }

    pc.ontrack = (e) => {
      if (!alive()) return;
      try {
        (e.receiver as unknown as { jitterBufferTarget?: number }).jitterBufferTarget = 0;
        (e.receiver as unknown as { playoutDelayHint?: number }).playoutDelayHint = 0;
      } catch {
        /* غير مدعوم */
      }
      e.track.addEventListener("ended", () => {
        if (!alive()) return;
        this.set({ live: false });
        this.scheduleReconnect(1000, gen);
      });
      e.track.addEventListener("mute", () => {
        if (alive()) this.set({ live: false });
      });
      e.track.addEventListener("unmute", () => {
        if (alive()) this.set({ failed: false });
      });
      this.stream = e.streams[0] ?? new MediaStream([e.track]);
      this.set({ failed: false });
      this.emit();
    };

    pc.ondatachannel = (e) => {
      if (e.channel.label !== "ctl") return;
      this.ctl = e.channel;
      e.channel.onopen = () => {
        if (alive()) this.set({ canControl: true });
      };
      e.channel.onclose = () => {
        if (alive()) this.set({ canControl: false });
      };
      if (e.channel.readyState === "open") this.set({ canControl: true });
    };

    const sig = openSignaling(
      this.deviceId,
      async (s: Signal) => {
        if (!alive()) return;
        const to = (s as { to?: string }).to;
        if (to && to !== viewerId) return;
        if (s.type === "offer") {
          const offerSdp = s.sdp.sdp;
          if (!offerSdp || acceptedOfferSdp === offerSdp || pc.remoteDescription?.sdp === offerSdp) return;
          if (pc.signalingState !== "stable") return;
          acceptedOfferSdp = offerSdp;
          try {
            await pc.setRemoteDescription(s.sdp);
            for (const candidate of pendingIce.splice(0)) {
              await pc.addIceCandidate(candidate).catch(() => {});
            }
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            if (pc.iceGatheringState !== "complete") {
              await new Promise<void>((resolve) => {
                let settled = false;
                const finish = () => {
                  if (settled) return;
                  settled = true;
                  clearTimeout(timeout);
                  pc.removeEventListener("icegatheringstatechange", onChange);
                  resolve();
                };
                const onChange = () => {
                  if (pc.iceGatheringState === "complete") finish();
                };
                const timeout = setTimeout(finish, 1800);
                pc.addEventListener("icegatheringstatechange", onChange);
              });
            }
            const completeAnswer = pc.localDescription;
            if (!completeAnswer) throw new Error("تعذّر إنشاء إجابة الاتصال");
            await sig.send({ type: "answer", sdp: completeAnswer, viewer: viewerId });
          } catch {
            acceptedOfferSdp = undefined;
            this.scheduleReconnect(400, gen);
          }
        } else if (s.type === "ice" && s.from === "host") {
          if (pc.remoteDescription) await pc.addIceCandidate(s.candidate).catch(() => {});
          else pendingIce.push(s.candidate);
        }
      },
      { raw: true, viewerId },
    );
    this.sig = sig;

    pc.onicecandidate = (e) => {
      if (e.candidate)
        void sig.send({
          type: "ice",
          from: "viewer",
          viewer: viewerId,
          candidate: e.candidate.toJSON(),
        });
    };

    let tries = 0;
    sig.ready
      .then(() => {
        if (!alive()) return;
        void sig.send({ type: "join", viewer: viewerId });
        const joinTimer = setInterval(() => {
          if (!alive() || pc.remoteDescription) {
            clearInterval(joinTimer);
            return;
          }
          tries += 1;
          if (tries > 30) {
            clearInterval(joinTimer);
            this.set({ failed: true });
            this.scheduleReconnect(3000, gen);
            return;
          }
          void sig.send({ type: "join", viewer: viewerId });
        }, 350);
        this.timers.push(joinTimer);
      })
      .catch(() => {
        if (!alive()) return;
        this.set({ failed: true });
        this.scheduleReconnect(8000, gen);
      });

    // مراقب توقّف الصورة
    let lastFrames = -1;
    let stalled = 0;
    const watchdog = setInterval(() => {
      if (!alive() || !this.stream) return;
      void pc
        .getStats()
        .then((stats) => {
          if (!alive()) return;
          let frames = -1;
          stats.forEach((r: any) => {
            if (r.type === "inbound-rtp" && r.kind === "video" && typeof r.framesDecoded === "number") {
              frames = r.framesDecoded;
            }
          });
          if (frames < 0) return;
          if (frames === lastFrames) {
            stalled += 1;
            this.set({ live: false });
            if (stalled === 2) {
              try {
                pc.restartIce();
              } catch {
                /* غير مدعوم */
              }
            } else if (stalled >= 4) {
              stalled = 0;
              this.scheduleReconnect(400, gen);
            }
          } else {
            stalled = 0;
            lastFrames = frames;
            this.set({ live: true });
          }
        })
        .catch(() => {});
    }, 1500);
    this.timers.push(watchdog);
  }
}

const sessions = new Map<string, ScreenSession>();

export function getScreenSession(deviceId: string): ScreenSession {
  let s = sessions.get(deviceId);
  if (!s) {
    s = new ScreenSession(deviceId);
    sessions.set(deviceId, s);
  }
  return s;
}

export type { ScreenSession };
