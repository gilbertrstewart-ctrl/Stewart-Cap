import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import MarkdownView from "@/components/MarkdownView";
import { Sparkles, Loader2, Globe, Lock, Eye, PenLine } from "lucide-react";
import { toast } from "sonner";

const empty = { title: "", summary: "", body_md: "", tags: "", tickers: "", cover_url: "", visibility: "private" };

export default function ArticleEditor({ open, onOpenChange, article, onSaved }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [form, setForm] = useState(empty);
  const [tab, setTab] = useState("write");
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [provider, setProvider] = useState("openai");

  useEffect(() => {
    if (!open) return;
    setTab("write");
    setForm(
      article
        ? { title: article.title, summary: article.summary || "", body_md: article.body_md, tags: article.tags.join(", "), tickers: article.tickers.join(", "), cover_url: article.cover_url || "", visibility: article.visibility }
        : { ...empty, visibility: isAdmin ? "public" : "private" }
    );
  }, [open, article, isAdmin]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const split = (s) => s.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);

  const draft = async () => {
    if (!form.title.trim()) return toast.error("Give the article a title first");
    setDrafting(true);
    try {
      const symbol = split(form.tickers)[0] || "";
      const { data } = await api.post("/articles/ai-draft", { title: form.title, symbol, provider, angle: form.summary });
      setForm((f) => ({ ...f, body_md: data.body_md, tickers: f.tickers || data.tickers.join(", ") }));
      toast.success(`Draft written by ${provider === "openai" ? "ChatGPT" : "Claude"} — edit away`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "AI draft failed");
    } finally {
      setDrafting(false);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.body_md.trim()) return toast.error("Title and body are required");
    setSaving(true);
    const payload = { ...form, tags: split(form.tags), tickers: split(form.tickers) };
    try {
      const { data } = article ? await api.put(`/articles/${article.id}`, payload) : await api.post("/articles", payload);
      toast.success(article ? "Saved" : form.visibility === "public" ? "Published" : "Note saved");
      onSaved?.(data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto" data-testid="article-editor">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">{article ? "Edit article" : "New article"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <Input data-testid="article-title-input" value={form.title} onChange={set("title")} placeholder="Headline" className="font-heading text-lg font-bold h-12" />
          <Input data-testid="article-summary-input" value={form.summary} onChange={set("summary")} placeholder="One-line summary / angle (also guides the AI draft)" />
          <div className="grid sm:grid-cols-3 gap-3">
            <Input data-testid="article-tickers-input" value={form.tickers} onChange={set("tickers")} placeholder="Tickers: TD.TO, AAPL" className="font-num" />
            <Input data-testid="article-tags-input" value={form.tags} onChange={set("tags")} placeholder="Tags: banks, dividends" />
            <Input data-testid="article-cover-input" value={form.cover_url} onChange={set("cover_url")} placeholder="Cover image URL (https://…)" />
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="inline-flex rounded-lg border border-border p-0.5">
              {[["write", "Write", PenLine], ["preview", "Preview", Eye]].map(([k, l, Icon]) => (
                <button key={k} type="button" data-testid={`editor-tab-${k}`} onClick={() => setTab(k)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}>
                  <Icon className="w-3.5 h-3.5" /> {l}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg border border-border p-0.5">
                {[["openai", "ChatGPT"], ["anthropic", "Claude"]].map(([k, l]) => (
                  <button key={k} type="button" data-testid={`draft-provider-${k}`} onClick={() => setProvider(k)} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${provider === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}>{l}</button>
                ))}
              </div>
              <Button type="button" size="sm" onClick={draft} disabled={drafting} data-testid="ai-draft-btn" className="bg-red-600 hover:bg-red-700 text-white">
                {drafting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />} {drafting ? "Writing…" : "AI draft"}
              </Button>
            </div>
          </div>

          {tab === "write" ? (
            <Textarea data-testid="article-body-input" value={form.body_md} onChange={set("body_md")} placeholder={"Write in Markdown…\n\n## Heading\nYour analysis here. **Bold**, _italic_, - bullets, [links](https://…)"} className="min-h-[360px] font-mono text-sm leading-relaxed" />
          ) : (
            <div data-testid="article-preview" className="min-h-[360px] rounded-lg border border-border bg-card p-6">
              {form.body_md.trim() ? <MarkdownView source={form.body_md} /> : <p className="text-muted-foreground text-sm">Nothing to preview yet.</p>}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
            <div className="inline-flex rounded-lg border border-border p-0.5">
              {[["private", "Private note", Lock], ["public", "Publish to everyone", Globe]].map(([k, l, Icon]) => (
                <button key={k} type="button" data-testid={`visibility-${k}`} disabled={k === "public" && !isAdmin} title={k === "public" && !isAdmin ? "Only admins can publish" : ""} onClick={() => setForm((f) => ({ ...f, visibility: k }))} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-40 ${form.visibility === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}>
                  <Icon className="w-3.5 h-3.5" /> {l}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} data-testid="article-cancel-btn">Cancel</Button>
              <Button type="submit" disabled={saving} data-testid="article-save-btn">{saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}{article ? "Save changes" : form.visibility === "public" ? "Publish" : "Save note"}</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
