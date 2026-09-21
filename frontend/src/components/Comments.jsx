import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

const timeAgo = (iso) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export default function Comments({ articleId }) {
  const { user, openAuth } = useAuth();
  const [comments, setComments] = useState(null);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    api.get(`/articles/${articleId}/comments`).then((r) => setComments(r.data.comments)).catch(() => setComments([]));
  }, [articleId, user]);

  const post = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setPosting(true);
    try {
      const { data } = await api.post(`/articles/${articleId}/comments`, { body });
      setComments((c) => [...c, data]);
      setBody("");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not post comment");
    } finally {
      setPosting(false);
    }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/articles/${articleId}/comments/${id}`);
      setComments((c) => c.filter((x) => x.id !== id));
    } catch {
      toast.error("Could not delete comment");
    }
  };

  return (
    <section data-testid="comments-section" className="space-y-4">
      <h3 className="font-heading font-bold text-lg flex items-center gap-2">
        <MessageSquare className="w-5 h-5 text-red-600" /> Discussion
        {comments && <span className="text-sm font-num text-muted-foreground" data-testid="comment-count">({comments.length})</span>}
      </h3>

      {user ? (
        <form onSubmit={post} className="rounded-xl border border-border bg-card p-3 space-y-2">
          <Textarea data-testid="comment-input" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Share your take…" className="min-h-[80px] resize-none" maxLength={2000} />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground font-num">Commenting as {user.name}</span>
            <Button type="submit" size="sm" disabled={posting || !body.trim()} data-testid="comment-submit-btn">
              {posting && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Post comment
            </Button>
          </div>
        </form>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground flex items-center justify-between gap-3">
          Sign in to join the discussion.
          <Button size="sm" variant="secondary" onClick={() => openAuth("login")} data-testid="comment-signin-btn">Sign in</Button>
        </div>
      )}

      {comments === null ? (
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="comments-empty">No comments yet — be the first.</p>
      ) : (
        <div className="space-y-3">
          {comments.map((c) => (
            <div key={c.id} data-testid={`comment-${c.id}`} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-primary/15 text-primary grid place-items-center text-xs font-bold">{(c.user_name || "?")[0].toUpperCase()}</span>
                  <span className="text-sm font-semibold">{c.user_name}</span>
                  <span className="text-[11px] text-muted-foreground font-num">{timeAgo(c.created_at)}</span>
                </div>
                {c.can_delete && (
                  <button onClick={() => remove(c.id)} data-testid={`comment-delete-${c.id}`} className="text-muted-foreground hover:text-red-600 p-1"><Trash2 className="w-4 h-4" /></button>
                )}
              </div>
              <p className="text-sm mt-2 whitespace-pre-wrap leading-relaxed">{c.body}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
