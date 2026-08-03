import * as tus from "tus-js-client";
import { supabase } from "@/integrations/supabase/client";
import { uploadStore } from "@/lib/upload-store";

export type UploadStatus = "queued" | "uploading" | "paused" | "done" | "error";

export type UploadItem = {
  id: string;
  courseId: string;
  fileName: string;
  objectName: string;
  title: string;
  sortOrder: number;
  progress: number;
  sent: number;
  total: number;
  speed: string;
  status: UploadStatus;
  error?: string;
};

type Internal = {
  item: UploadItem;
  file: Blob;
  upload?: tus.Upload;
  startedAt: number;
  startBytes: number;
};

/**
 * مدير رفع عالمي (خارج React) — الرفع يكمل في الخلفية
 * حتى لو تم إغلاق النافذة أو الخروج من القسم، ويُستأنف تلقائياً
 * بعد تحديث الصفحة (الملفات محفوظة في IndexedDB).
 */
class UploadManager {
  private map = new Map<string, Internal>();
  private listeners = new Set<() => void>();
  private doneListeners = new Set<(courseId: string) => void>();
  private snapshot: UploadItem[] = [];
  private beforeUnloadBound = false;
  private restored = false;

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    void this.restore();
    return () => this.listeners.delete(cb);
  };

  getSnapshot = () => this.snapshot;

  onLessonAdded(cb: (courseId: string) => void) {
    this.doneListeners.add(cb);
    return () => this.doneListeners.delete(cb);
  }

  itemsFor(courseId: string) {
    return this.snapshot.filter((i) => i.courseId === courseId);
  }

  /** استعادة الرفعات غير المكتملة من IndexedDB واستئنافها تلقائياً */
  async restore() {
    if (this.restored || typeof window === "undefined") return;
    this.restored = true;
    const pending = await uploadStore.all();
    for (const rec of pending) {
      if (this.map.has(rec.id)) continue;
      this.map.set(rec.id, {
        file: rec.file,
        startedAt: Date.now(),
        startBytes: 0,
        item: {
          id: rec.id,
          courseId: rec.courseId,
          fileName: rec.fileName,
          objectName: rec.objectName,
          title: rec.title,
          sortOrder: rec.sortOrder,
          progress: 0,
          sent: 0,
          total: rec.file.size,
          speed: "",
          status: "queued",
        },
      });
      this.emit();
      void this.start(rec.id);
    }
  }

  private emit() {
    this.snapshot = Array.from(this.map.values()).map((r) => r.item);
    this.listeners.forEach((l) => l());
    this.guardUnload();
  }

  private guardUnload() {
    const active = this.snapshot.some((i) => i.status === "uploading" || i.status === "queued");
    if (active && !this.beforeUnloadBound) {
      window.addEventListener("beforeunload", this.warn);
      this.beforeUnloadBound = true;
    } else if (!active && this.beforeUnloadBound) {
      window.removeEventListener("beforeunload", this.warn);
      this.beforeUnloadBound = false;
    }
  }

  /** هل يوجد رفع جاري الآن؟ (يُستخدم لتأجيل التحديث التلقائي للصفحة) */
  hasActive() {
    return this.snapshot.some((i) => i.status === "uploading" || i.status === "queued");
  }

  private warn = (e: BeforeUnloadEvent) => {
    e.preventDefault();
    e.returnValue = "";
  };

  private patch(id: string, p: Partial<UploadItem>) {
    const rec = this.map.get(id);
    if (!rec) return;
    rec.item = { ...rec.item, ...p };
    this.emit();
  }

  add(courseId: string, file: File, objectName: string, nextOrder: () => number, title?: string) {
    const id = crypto.randomUUID();
    const finalTitle =
      (title ?? "").trim() || file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "درس";
    const sortOrder = nextOrder();
    this.map.set(id, {
      file,
      startedAt: Date.now(),
      startBytes: 0,
      item: {
        id,
        courseId,
        fileName: file.name,
        objectName,
        title: finalTitle,
        sortOrder,
        progress: 0,
        sent: 0,
        total: file.size,
        speed: "",
        status: "queued",
      },
    });
    void uploadStore.put({
      id,
      courseId,
      objectName,
      title: finalTitle,
      sortOrder,
      fileName: file.name,
      fileType: file.type || "video/mp4",
      file,
    });
    this.emit();
    void this.start(id);
    return id;
  }

  async start(id: string) {
    const rec = this.map.get(id);
    if (!rec) return;

    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    const baseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    if (!token || !baseUrl) {
      this.patch(id, { status: "error", error: "الجلسة غير صالحة — أعد تسجيل الدخول" });
      return;
    }

    rec.startedAt = Date.now();
    rec.startBytes = 0;

    const upload = new tus.Upload(rec.file, {
      endpoint: `${baseUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
      chunkSize: 6 * 1024 * 1024,
      parallelUploads: 1,
      removeFingerprintOnSuccess: true,
      uploadDataDuringCreation: true,
      // بصمة ثابتة حتى يُستأنف نفس الرفع بعد تحديث الصفحة
      fingerprint: async () => `magpro-${rec.item.objectName}-${rec.item.total}`,
      headers: { authorization: `Bearer ${token}`, "x-upsert": "true" },
      metadata: {
        bucketName: "course-videos",
        objectName: rec.item.objectName,
        contentType: rec.item.fileName.endsWith(".mp4") ? "video/mp4" : rec.file.type || "video/mp4",
        cacheControl: "3600",
      },
      onError: (err) => this.patch(id, { status: "error", error: err?.message || "فشل الرفع" }),
      onProgress: (sent, total) => {
        if (!rec.startBytes) rec.startBytes = sent;
        const secs = Math.max(0.5, (Date.now() - rec.startedAt) / 1000);
        const mbps = Math.max(0, (sent - rec.startBytes) / 1024 / 1024) / secs;
        this.patch(id, {
          status: "uploading",
          sent,
          total,
          progress: total ? Math.round((sent / total) * 100) : 0,
          speed: `${mbps.toFixed(2)} MB/s`,
        });
      },
      onSuccess: async () => {
        this.patch(id, { status: "done", progress: 100 });
        void uploadStore.remove(id);
        const duration = await probeDuration(rec.file);
        const { error } = await supabase.from("course_lessons").insert({
          course_id: rec.item.courseId,
          title: rec.item.title,
          video_path: rec.item.objectName,
          sort_order: rec.item.sortOrder,
          duration_sec: duration,
        });
        if (error) {
          this.patch(id, { status: "error", error: error.message });
          return;
        }
        this.doneListeners.forEach((l) => l(rec.item.courseId));
      },
    });

    rec.upload = upload;
    const previous = await upload.findPreviousUploads();
    if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
    upload.start();
    this.patch(id, { status: "uploading" });
  }

  pause(id: string) {
    const rec = this.map.get(id);
    void rec?.upload?.abort();
    this.patch(id, { status: "paused" });
  }

  resume(id: string) {
    void this.start(id);
  }

  cancel(id: string) {
    const rec = this.map.get(id);
    void rec?.upload?.abort(true);
    this.map.delete(id);
    void uploadStore.remove(id);
    this.emit();
  }

  clearFinished(courseId: string) {
    for (const [id, rec] of this.map) {
      if (rec.item.courseId === courseId && rec.item.status === "done") this.map.delete(id);
    }
    this.emit();
  }
}

function probeDuration(file: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    const done = (val: number | null) => {
      URL.revokeObjectURL(url);
      resolve(val);
    };
    v.onloadedmetadata = () =>
      done(isFinite(v.duration) && v.duration > 0 ? Math.round(v.duration) : null);
    v.onerror = () => done(null);
    v.src = url;
    setTimeout(() => done(null), 15000);
  });
}

export const uploadManager = new UploadManager();
