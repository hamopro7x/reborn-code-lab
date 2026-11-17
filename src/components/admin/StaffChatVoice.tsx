import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Pause, Play } from "lucide-react";

const fmt = (s: number) => !Number.isFinite(s) || s < 0 ? "0:00" : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function StaffChatVoice({ src, sender, seed }: { src: string; sender: string; seed: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const bars = useMemo(() => { let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return Array.from({ length: 32 }, () => { h = (h * 1103515245 + 12345) >>> 0; return 25 + (h % 75); }); }, [seed]);
  useEffect(() => { const a = audio.current; if (!a) return;
    const onMeta = () => { if (Number.isFinite(a.duration)) setDuration(a.duration); else { a.currentTime = 1e9; a.ontimeupdate = () => { a.ontimeupdate = null; setDuration(a.duration); a.currentTime = 0; }; } };
    a.addEventListener("loadedmetadata", onMeta); return () => a.removeEventListener("loadedmetadata", onMeta); }, []);
  const progress = duration ? Math.min(1, time / duration) : 0;
  const toggle = () => { const a = audio.current; if (!a) return; if (a.paused) void a.play(); else a.pause(); };
  const seek = (e: React.MouseEvent<HTMLDivElement>) => { const a = audio.current; if (!a || !duration) return; const r = e.currentTarget.getBoundingClientRect(); a.currentTime = ((e.clientX - r.left) / r.width) * duration; };
  return <div className="staff-chat-voice" dir="ltr">
    <audio ref={audio} preload="metadata" src={src} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setTime(0); }} onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)} />
    <div className="staff-chat-voice-avatar" aria-hidden="true">{sender.trim().charAt(0) || "؟"}<Mic className="staff-chat-voice-mic" /></div>
    <button type="button" className="staff-chat-voice-play" onClick={toggle} aria-label={playing ? "إيقاف مؤقت" : "تشغيل الرسالة الصوتية"}>{playing ? <Pause className="size-5" fill="currentColor" /> : <Play className="size-5" fill="currentColor" />}</button>
    <div className="staff-chat-voice-body">
      <div className="staff-chat-voice-wave" onClick={seek} role="slider" aria-label="موضع التشغيل" aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(time)} tabIndex={0}>
        {bars.map((h, i) => <span key={i} className={i / bars.length < progress ? "is-played" : ""} style={{ height: `${h}%` }} />)}
        <i className="staff-chat-voice-dot" style={{ left: `${progress * 100}%` }} />
      </div>
      <span className="staff-chat-voice-time">{fmt(playing || time ? time : duration)}</span>
    </div>
  </div>;
}
