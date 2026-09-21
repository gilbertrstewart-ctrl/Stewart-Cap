import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Activity, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function AuthModal() {
  const { authOpen, setAuthOpen, authMode, setAuthMode, login, register, loginWithGoogle, formatApiErrorDetail } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isLogin = authMode === "login";

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isLogin) await login(email, password);
      else await register(name, email, password);
      toast.success(isLogin ? "Welcome back!" : "Account created!");
      setAuthOpen(false);
      setPassword("");
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={authOpen} onOpenChange={setAuthOpen}>
      <DialogContent className="sm:max-w-md" data-testid="auth-modal">
        <DialogHeader>
          <div className="w-11 h-11 rounded-xl bg-primary grid place-items-center mb-2 shadow-lg shadow-primary/30">
            <Activity className="w-6 h-6 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <DialogTitle className="font-heading text-2xl">
            {isLogin ? "Sign in to STEWART CAP" : "Create your account"}
          </DialogTitle>
          <DialogDescription>
            {isLogin ? "Access your portfolio and watchlist." : "Track holdings, watch stocks, and get AI insights."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4 mt-2">
          <button
            type="button"
            data-testid="auth-google-btn"
            onClick={loginWithGoogle}
            className="w-full flex items-center justify-center gap-3 rounded-lg border border-border bg-secondary/40 hover:bg-secondary py-2.5 text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.5 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.3-.4-3.5z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.5 4.5 24 4.5 16.3 4.5 9.7 8.9 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 43.5c5.4 0 10.3-2 14-5.3l-6.5-5.3C29.6 34.5 26.9 35.5 24 35.5c-5.2 0-9.6-3.3-11.2-7.9l-6.5 5C9.6 39 16.2 43.5 24 43.5z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.4l6.5 5.3c-.5.4 6.8-4.9 6.8-14.7 0-1.2-.1-2.3-.4-3.5z" />
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> or {isLogin ? "sign in" : "sign up"} with email <div className="h-px flex-1 bg-border" />
          </div>

          {!isLogin && (
            <div className="space-y-1.5">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" data-testid="auth-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Investor" required />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" data-testid="auth-email-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" data-testid="auth-password-input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
          </div>

          {error && (
            <p data-testid="auth-error" className="text-sm text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={loading} data-testid="auth-submit-btn">
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isLogin ? "Sign in" : "Create account"}
          </Button>
        </form>

        <p className="text-sm text-center text-muted-foreground">
          {isLogin ? "New here?" : "Already have an account?"}{" "}
          <button
            data-testid="auth-switch-mode"
            className="text-primary font-medium hover:underline"
            onClick={() => {
              setError("");
              setAuthMode(isLogin ? "register" : "login");
            }}
          >
            {isLogin ? "Create an account" : "Sign in"}
          </button>
        </p>
      </DialogContent>
    </Dialog>
  );
}
