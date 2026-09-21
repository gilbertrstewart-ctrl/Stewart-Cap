import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Activity, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function AuthModal() {
  const { authOpen, setAuthOpen, authMode, setAuthMode, login, register, formatApiErrorDetail } = useAuth();
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
