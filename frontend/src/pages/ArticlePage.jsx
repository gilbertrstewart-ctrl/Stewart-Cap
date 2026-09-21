import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useModals } from "@/context/ModalContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import MarkdownView from "@/components/MarkdownView";
import ArticleEditor from "@/components/ArticleEditor";
import Comments from "@/components/Comments";
import { ArrowLeft, Pencil, Trash2, Lock, Globe, Clock, Loader2, Bookmark, BookmarkCheck } from "lucide-react";
import { fmtPrice, fmtPct, trendColor } from "@/utils/format";
import { toast } from "sonner";

export default function ArticlePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { openStockDetail } = useModals();
  const [article, setArticle] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);

  const load = () =>
    api.get(`/articles/${id}`).then((r) => setArticle(r.data)).catch((e) => setError(e?.response?.data?.detail || "Article not found"));

  useEffect(() => { load(); }, [id, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async () => {
    if (!window.confirm("Delete this article?")) return;
    try {
      await api.delete(`/articles/${id}`);
      toast.success("Deleted");
      navigate("/articles");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to delete");
    }
  };

  const toggleBookmark = async () => {
    if (!user) return toast.error("Sign in to save articles");
    try {
      if (article.bookmarked) await api.delete(`/articles/${id}/bookmark`);
      else await api.post(`/articles/${id}/bookmark`);
      setArticle((a) => ({ ...a, bookmarked: !a.bookmarked }));
      toast.success(article.bookmarked ? "Removed from reading list" : "Saved to reading list");
    } catch {
      toast.error("Could not update bookmark");
    }
  };

  if (error) return <div className="py-20 text-center text-muted-foreground" data-testid="article-error">{error}</div>;
  if (!article) return <div className="h-64 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <article data-testid="article-page" className="max-w-3xl mx-auto space-y-6">
      <button onClick={() => navigate("/articles")} data-testid="article-back-btn" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> All articles
      </button>

      {article.cover_url && <img src={article.cover_url} alt="" className="w-full aspect-[21/9] object-cover rounded-2xl border border-border" />}

      <header className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="gap-1 text-[10px]">
            {article.visibility === "public" ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
            {article.visibility === "public" ? "Published" : "Private note"}
          </Badge>
          {article.tags.map((t) => <Badge key={t} variant="outline" className="text-[10px]">#{t}</Badge>)}
        </div>
        <h1 data-testid="article-title" className="font-heading text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight">{article.title}</h1>
        {article.summary && <p className="text-muted-foreground text-lg">{article.summary}</p>}
        <div className="flex items-center justify-between gap-3 flex-wrap text-sm text-muted-foreground">
          <span className="font-num">By {article.author_name} · {new Date(article.created_at).toLocaleDateString()} · <Clock className="w-3.5 h-3.5 inline -mt-0.5" /> {article.reading_minutes} min read</span>
          <div className="flex gap-2">
            <Button size="sm" variant={article.bookmarked ? "default" : "secondary"} onClick={toggleBookmark} data-testid="article-bookmark-btn">
              {article.bookmarked ? <BookmarkCheck className="w-4 h-4 mr-1.5" /> : <Bookmark className="w-4 h-4 mr-1.5" />} {article.bookmarked ? "Saved" : "Save"}
            </Button>
            {article.can_edit && (
              <>
                <Button size="sm" variant="secondary" onClick={() => setEditing(true)} data-testid="article-edit-btn"><Pencil className="w-4 h-4 mr-1.5" /> Edit</Button>
                <Button size="sm" variant="ghost" onClick={remove} data-testid="article-delete-btn" className="text-red-600 hover:text-red-700"><Trash2 className="w-4 h-4 mr-1.5" /> Delete</Button>
              </>
            )}
          </div>
        </div>
      </header>

      {article.ticker_quotes?.length > 0 && (
        <div className="flex gap-2 flex-wrap" data-testid="article-tickers">
          {article.ticker_quotes.map((q) => (
            <button key={q.symbol} onClick={() => openStockDetail(q.symbol)} data-testid={`article-ticker-${q.symbol}`} className="rounded-lg border border-border bg-card px-3 py-2 text-left hover:border-primary/40 hover:bg-secondary transition-colors">
              <div className="flex items-center gap-2"><span className="font-heading font-bold text-sm">{q.symbol}</span><span className="font-num text-sm">{fmtPrice(q.price)}</span><span className={`font-num text-xs ${trendColor(q.change_percent)}`}>{fmtPct(q.change_percent)}</span></div>
              <div className="text-[11px] text-muted-foreground truncate max-w-[180px]">{q.name}</div>
            </button>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-6 sm:p-10">
        <MarkdownView source={article.body_md} />
      </div>

      {article.visibility === "public" && <Comments articleId={id} />}


      <ArticleEditor open={editing} onOpenChange={setEditing} article={article} onSaved={(a) => { setEditing(false); setArticle({ ...article, ...a }); load(); }} />
    </article>
  );
}
