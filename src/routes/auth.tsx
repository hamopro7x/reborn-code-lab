import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ShieldCheck, Lock } from "lucide-react";

function safeNext(value: unknown) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : undefined;
}

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  validateSearch: (s: Record<string, unknown>): { next?: string } => {
    const next = safeNext(s.next);
    return next ? { next } : {};
  },
  head: () => ({
    meta: [
      { title: "تسجيل الدخول | لوحة إدارة المتجر" },
      { name: "description", content: "صفحة تسجيل دخول مخصصة لإدارة المتجر فقط." },
      { property: "og:title", content: "تسجيل الدخول | لوحة إدارة المتجر" },
      { property: "og:description", content: "صفحة تسجيل دخول مخصصة لإدارة المتجر فقط." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mag-pro1.com/auth" },
      { name: "twitter:title", content: "تسجيل الدخول | لوحة إدارة المتجر" },
      { name: "twitter:description", content: "صفحة تسجيل دخول مخصصة لإدارة المتجر فقط." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { next } = Route.useSearch();

  function goAfterAuth() {
    if (next) { window.location.href = next; return; }
    navigate({ to: "/admin" });
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) goAfterAuth();
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const normalized = email.trim().toLowerCase();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error: upErr } = await supabase.auth.signUp({
          email: normalized,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName.trim() || normalized.split("@")[0] },
          },
        });
        if (upErr) throw upErr;
        const { error: inErr } = await supabase.auth.signInWithPassword({ email: normalized, password });
        if (inErr) throw inErr;
        toast.success("تم إنشاء حساب الأدمن وتسجيل الدخول");
        goAfterAuth();
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email: normalized, password });
      if (error) throw error;
      toast.success("تم تسجيل الدخول");
      goAfterAuth();
    } catch (err: any) {
      toast.error(err.message ?? "خطأ في العملية");
    } finally {
      setLoading(false);
    }
  }


  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center px-4 py-12 bg-background">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="size-14 rounded-2xl gradient-primary mx-auto flex items-center justify-center glow-purple mb-3">
            <ShieldCheck className="size-7 text-white" />
          </div>
          <h1 className="text-2xl font-black text-gradient">لوحة التحكم</h1>
          <p className="text-xs text-muted-foreground mt-1">دخول الأدمن والموظفين</p>
        </div>

        <div className="card-surface rounded-3xl p-8 glow-purple animate-slide-up">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
            <Lock className="size-3.5" />
            <span>الوصول مقيّد ومؤمّن</span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <Label>البريد الإلكتروني</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <div>
              <Label>كلمة المرور</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required autoComplete="current-password" />
            </div>
            <Button type="submit" disabled={loading} className="gradient-primary text-white w-full h-11">
              {loading ? "..." : "دخول"}
            </Button>
          </form>

        </div>

        <div className="text-center mt-6">
          <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">← العودة للموقع</Link>
        </div>
      </div>
    </div>
  );
}
