import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ArticleEditor from "@/components/ArticleEditor";
import NewsletterCard from "@/components/NewsletterCard";
import { Newspaper, Plus, Search, Lock, Globe, Clock, Loader2, MessageSquare, BookmarkCheck } from "lucide-react";

const SCOPES = [["all", "All"], ["public", "Published"], ["mine", "My notes"], ["saved", "Saved"]];

export default function ArticlesPage() {
  const { user, openAuth } = useAuth();
  const navigate = useNavigate();
  const [articles, setArticles] = useState(null);
  const [tags, setTags] = useState([]);
  const [scope, setScope] = useState("all");
  const [tag, setTag] = useState("");
  const [q, setQ] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);

  const load = () => {
    api.get("/articles", { params: { scope, tag, q } }).then((r) => setArticles(r.data.articles)).catch(() => setArticles([]));
    api.get("/articles/tags").then((r) => setTags(r.data.tags)).catch(() => {});
  };

  useEffect(() => {
    if ((scope === "mine" || scope === "saved") && !user) { setScope("all"); return; }
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [scope, tag, q, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const startWriting = () => (user ? setEditorOpen(true) : openAuth("login"));

  return (
    <div data-testid="articles-page" className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight">Articles</h1>
          <p className="text-muted-foreground mt-1">Research from STEWART CAP and your own private investing notes.</p>
        </div>
        <Button onClick={startWriting} data-testid="new-article-btn"><Plus className="w-4 h-4 mr-2" /> {user?.role === "admin" ? "Write article" : "Write a note"}</Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
          {SCOPES.map(([k, l]) => (
            <button key={k} data-testid={`articles-scope-${k}`} onClick={() => setScope(k)} disabled={(k === "mine" || k === "saved") && !user} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-40 ${scope === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}>{l}</button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input data-testid="articles-search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search articles…" className="pl-9" />
        </div>
        {tags.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {tags.slice(0, 8).map(([t, n]) => (
              <button key={t} data-testid={`tag-filter-${t}`} onClick={() => setTag(tag === t ? "" : t)} className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${tag === t ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary"}`}>#{t} <span className="font-num text-muted-foreground">{n}</span></button>
            ))}
          </div>
        )}
      </div>

      <NewsletterCard />

      {articles === null ? (
        <div className="h-64 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : articles.length === 0 ? (
        <div data-testid="articles-empty" className="rounded-xl border border-dashed border-border py-16 grid place-items-center text-center">
          <Newspaper className="w-10 h-10 text-muted-foreground mb-3" />
          <h3 className="font-heading font-semibold text-lg">No articles yet</h3>
          <p className="text-muted-foreground text-sm mb-4">{scope === "mine" ? "Your private notes will show up here." : scope === "saved" ? "Articles you save will show up here." : "Be the first to write one."}</p>
          <Button onClick={startWriting} data-testid="empty-new-article-btn"><Plus className="w-4 h-4 mr-2" /> Start writing</Button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {articles.map((a, i) => (
            <button
              key={a.id}
              data-testid={`article-card-${a.id}`}
              onClick={() => navigate(`/articles/${a.id}`)}
              className={`group text-left rounded-2xl border border-border bg-card overflow-hidden hover:border-primary/40 hover:-translate-y-0.5 transition-all ${i === 0 && scope !== "mine" ? "sm:col-span-2 lg:col-span-2" : ""}`}
            >
              {a.cover_url ? (
                <img src={a.cover_url} alt="" className={`w-full object-cover ${i === 0 ? "aspect-[21/9]" : "aspect-[16/9]"}`} />
              ) : (
                <div className={`w-full ${i === 0 ? "aspect-[21/6]" : "aspect-[16/5]"} bg-[#0B2A6F] relative overflow-hidden`}>
                  <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "repeating-linear-gradient(135deg, #DC2626 0 2px, transparent 2px 22px)" }} />
                  <Newspaper className="absolute right-4 bottom-3 w-8 h-8 text-white/30" />
                </div>
              )}
              <div className="p-5 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="gap-1 text-[10px]">{a.visibility === "public" ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}{a.visibility === "public" ? "Published" : "Private"}</Badge>
                  {a.tickers.slice(0, 3).map((t) => <Badge key={t} variant="outline" className="font-num text-[10px]">{t}</Badge>)}
                </div>
                <h3 className={`font-heading font-bold leading-snug group-hover:text-primary transition-colors ${i === 0 ? "text-2xl" : "text-lg"}`}>{a.title}</h3>
                <p className="text-sm text-muted-foreground line-clamp-2">{a.summary || a.body_md.replace(/[#*_>`-]/g, "").slice(0, 160)}</p>
                <div className="text-[11px] text-muted-foreground font-num pt-1 flex items-center gap-1.5 flex-wrap">
                  {a.author_name} · {new Date(a.created_at).toLocaleDateString()} · <Clock className="w-3 h-3" /> {a.reading_minutes} min
                  {a.visibility === "public" && <span className="inline-flex items-center gap-0.5" data-testid={`card-comments-${a.id}`}>· <MessageSquare className="w-3 h-3" /> {a.comment_count}</span>}
                  {a.bookmarked && <span className="inline-flex items-center gap-0.5 text-primary" data-testid={`card-saved-${a.id}`}>· <BookmarkCheck className="w-3 h-3" /> Saved</span>}
                  {a.tags.slice(0, 3).map((t) => <span key={t} className="ml-1">#{t}</span>)}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <ArticleEditor open={editorOpen} onOpenChange={setEditorOpen} onSaved={(a) => { setEditorOpen(false); navigate(`/articles/${a.id}`); }} />
    </div>
  );
}
