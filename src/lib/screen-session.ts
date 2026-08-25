// جلسات بث دائمة: الاتصال بجهاز الموظف يُنشأ مرة واحدة ويبقى حياً
// طالما الصفحة مفتوحة — الخروج من القسم أو الرجوع إليه لا يقطع البث.
import { RTC_CONFIG, makeViewerId, openSignaling, warmIceServers, type Signal } from "@/lib/screenshare";

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
  private ctlRel: RTCDataChannel | null = null;

  private timers: Array<ReturnType<typeof setInterval>> = [];
  private recoverTimer: ReturnType<typeof setTimeout> | undefined;
  private recoverAt = 0;
  private muteTimer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  private connecting = false;
  private moveQueued: { x: number; y: number } | null = null;
  private raf: number | null = null;
  // بيانات تشخيصية يستخدمها روبوت الإصلاح في لوحة الإدارة
  lastFrameAt = 0;
  offerAt = 0;
  sigFailed = false;
  startedAt = Date.now();
  // هوية ثابتة طوال عمر الصفحة. تغييرها في كل محاولة كان يترك البرنامج
  // محتفظاً بعشرات الاتصالات القديمة ويستهلك المشفّر قبل اكتمال الاتصال.
  private readonly viewerId = makeViewerId();

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
    // الحركة على القناة غير الموثوقة (الأحدث يفوز، لا طابور يتراكم)،
    // والنقر/المفاتيح/العجلة/النص على القناة الموثوقة فلا تُفقد أبداً.
    const isMove = cmd.t === "move";
    const ch = isMove ? (this.ctl ?? this.ctlRel) : (this.ctlRel ?? this.ctl);
    if (!ch || ch.readyState !== "open") return;
    const limit = isMove ? 4_096 : 65_536;
    if (ch.bufferedAmount > limit) return;
    try {
      ch.send(JSON.stringify(cmd));
    } catch {
      /* القناة أُغلقت */
    }
  };

  sendMove = (p: { x: number; y: number }) => {
    // نضغط الحركات إلى آخر موضع فقط لكل إطار عرض: التحكم يصل فوراً ولا
    // يتأخر خلف مواضع قديمة، ومساره منفصل تماماً عن إطارات الفيديو.
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
    this.recoverAt = 0;
    if (this.muteTimer) clearTimeout(this.muteTimer);
    this.muteTimer = undefined;
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    this.ctl = null;
    this.ctlRel = null;

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
    this.offerAt = 0;
    this.sigFailed = false;
    this.lastFrameAt = 0;
    // نُبقي آخر إطار مربوطاً بعنصر الفيديو أثناء إعادة التفاوض. تصفير المسار
    // هنا كان يحول الشاشة إلى أسود عند أي تذبذب لحظي في الإنترنت.
    this.set({ live: false, canControl: false });
  }

  private scheduleReconnect(delay: number, gen: number) {
    if (gen !== this.generation) return;
    const dueAt = Date.now() + delay;
    if (this.recoverTimer) {
      if (this.recoverAt <= dueAt) return;
      clearTimeout(this.recoverTimer);
    }
    this.recoverAt = dueAt;
    this.recoverTimer = setTimeout(() => {
      this.recoverTimer = undefined;
      this.recoverAt = 0;
      if (gen !== this.generation) return;
      this.dropTransport();
      this.connect();
    }, delay);
  }

  /** حالة الاتصال الحقيقية لتشخيص سبب توقف الصورة */
  get connState(): RTCPeerConnectionState | "none" {
    return this.pc?.connectionState ?? "none";
  }

  /** يهدم المسار الحالي ويبني اتصالاً جديداً من الصفر (إصلاح من جهة الأدمن) */
  hardReset() {
    this.dropTransport();
    this.startedAt = Date.now();
    this.connect();
  }

  /**
   * أمر تشغيلي يُرسل لبرنامج الموظف عبر قناة الإشارات (يعمل حتى لو مسار
   * WebRTC ميت تماماً): renew = تجديد التقاط الشاشة، reload = إعادة تشغيل
   * خدمة البث، update = تنزيل آخر إصدار وتثبيته ثم إعادة التشغيل.
   */
  async sendCommand(action: "renew" | "reload" | "update"): Promise<boolean> {
    const sig = this.sig;
    const viewer = this.viewerId;
    if (!sig || !viewer) return false;
    try {
      await sig.send({ type: "cmd", action, viewer } as unknown as Signal);
      return true;
    } catch {
      return false;
    }
  }

  connect() {
    if (this.pc || this.connecting) return;
    this.connecting = true;
    const gen = this.generation;
    // يجب تحميل TURN قبل إنشاء PeerConnection. تعديل RTC_CONFIG بعد إنشائه
    // لا يضيف الخوادم للاتصال الحالي، وكان ذلك يترك الشاشة على «جاري الاتصال»
    // في الشبكات التي لا تنجح فيها وصلة STUN المباشرة.
    void warmIceServers().finally(() => {
      this.connecting = false;
      if (gen !== this.generation) {
        this.connect();
        return;
      }
      if (!this.pc) this.openTransport();
    });
  }

  private openTransport() {
    const viewerId = this.viewerId;
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
        this.recoverAt = 0;
        this.set({ failed: false });
        return;
      }
      if (pc.connectionState === "disconnected") {
        // disconnected غالباً تذبذب لحظي. نُبقي آخر إطار ظاهراً ونمنح ICE
        // وقتاً كافياً للتعافي بدلاً من هدم جلسة سليمة بعد أربع ثوانٍ.
        this.scheduleReconnect(20_000, gen);
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
        if (!alive() || this.muteTimer) return;
        // ضعف الشبكة قد يعمل mute مؤقتاً للمسار. نُبقي آخر صورة ظاهرة
        // ونعطي WebRTC فرصة للتعافي بدل تحويل الشاشة إلى أسود فوراً.
        this.muteTimer = setTimeout(() => {
          this.muteTimer = undefined;
          if (!alive() || !e.track.muted) return;
          this.scheduleReconnect(8_000, gen);
        }, 6000);
      });
      e.track.addEventListener("unmute", () => {
        if (this.muteTimer) clearTimeout(this.muteTimer);
        this.muteTimer = undefined;
        if (alive()) this.set({ live: true, failed: false });
      });
      this.offerAt = this.offerAt || Date.now();
      this.lastFrameAt = Date.now();
      this.stream = e.streams[0] ?? new MediaStream([e.track]);
      this.set({ failed: false });
      this.emit();
    };

    pc.ondatachannel = (e) => {
      if (e.channel.label === "ctl-rel") this.ctlRel = e.channel;
      else if (e.channel.label === "ctl") this.ctl = e.channel;
      else return;

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
          if (pc.signalingState !== "stable") {
            this.scheduleReconnect(1_500, gen);
            return;
          }
          acceptedOfferSdp = offerSdp;
          this.offerAt = Date.now();
          this.sigFailed = false;
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
        }).catch(() => {
          // عرض ICE الكامل يحتوي مرشحات احتياطية؛ لا نترك رفضاً غير معالج.
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
        }, 2_000);
        this.timers.push(joinTimer);
      })
      .catch(() => {
        if (!alive()) return;
        this.sigFailed = true;
        this.set({ failed: true });
        this.scheduleReconnect(8000, gen);
      });

    // مراقب وصول الوسائط. سطح المكتب الثابت قد لا ينتج بايتات جديدة لفترة؛
    // لذلك لا نهدم اتصالاً سليماً لمجرد ثبات الصورة. حالات ICE وmute/ended
    // أعلاه هي الإشارات الموثوقة لإصلاح الشبكة أو التقاط الشاشة.
    let lastBytes = -1;
    const watchdog = setInterval(() => {
      if (!alive() || !this.stream) return;
      void pc
        .getStats()
        .then((stats) => {
          if (!alive()) return;
          let bytes = -1;
          stats.forEach((r: any) => {
            if (r.type === "inbound-rtp" && r.kind === "video" && typeof r.bytesReceived === "number") {
              bytes = r.bytesReceived;
            }
          });
          if (bytes < 0) return;
          if (bytes !== lastBytes) {
            lastBytes = bytes;
            this.lastFrameAt = Date.now();
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

/** الجلسات المفتوحة حالياً — يستخدمها روبوت التشخيص في لوحة الإدارة */
export function getOpenScreenSession(deviceId: string): ScreenSession | undefined {
  return sessions.get(deviceId);
}
