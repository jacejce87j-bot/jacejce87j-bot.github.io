import { getApiUrl } from "@/lib/api";
import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { AppLayout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, BookOpen, Plus, Search } from "lucide-react";

type Article = {
  id: number;
  title: string;
  summary: string;
  content: string;
  tags: string[];
  status: "draft" | "published" | "archived";
  sourceTicketId: number | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

type ArticleForm = Pick<Article, "title" | "summary" | "content" | "status"> & { tags: string };

const emptyForm: ArticleForm = { title: "", summary: "", content: "", status: "draft", tags: "" };

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("userToken") || localStorage.getItem("auth_token") || localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function readError(response: Response) {
  const payload = await response.json().catch(() => null);
  return payload?.error ?? `Request failed (${response.status})`;
}

export default function KnowledgeBasePage() {
  const [, detailParams] = useRoute("/knowledge-base/:id");
  const [, setLocation] = useLocation();
  const articleId = detailParams?.id ? Number(detailParams.id) : null;
  const [articles, setArticles] = useState<Article[]>([]);
  const [article, setArticle] = useState<Article | null>(null);
  const [form, setForm] = useState<ArticleForm>(emptyForm);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadArticles() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(getApiUrl(`/api/knowledge-base?q=${encodeURIComponent(search)}`), {
        credentials: "include",
        headers: authHeaders(),
      });
      if (!response.ok) throw new Error(await readError(response));
      setArticles(await response.json() as Article[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load knowledge articles.");
    } finally {
      setLoading(false);
    }
  }

  async function loadArticle(id: number) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(getApiUrl(`/api/knowledge-base/${id}`), {
        credentials: "include",
        headers: authHeaders(),
      });
      if (!response.ok) throw new Error(await readError(response));
      const loaded = await response.json() as Article;
      setArticle(loaded);
      setForm({ ...loaded, tags: loaded.tags.join(", ") });
    } catch (loadError) {
      setArticle(null);
      setError(loadError instanceof Error ? loadError.message : "Unable to load this article.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (articleId !== null && Number.isSafeInteger(articleId) && articleId > 0) {
      void loadArticle(articleId);
    } else if (articleId === null) {
      setArticle(null);
      void loadArticles();
    } else {
      setError("Invalid article id");
      setLoading(false);
    }
  }, [articleId, search]);

  async function saveArticle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(article ? `/api/knowledge-base/${article.id}` : "/api/knowledge-base", {
        method: article ? "PATCH" : "POST",
        credentials: "include",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          summary: form.summary,
          content: form.content,
          tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
          status: form.status,
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const saved = await response.json() as Article;
      if (!article) {
        setLocation(`/knowledge-base/${saved.id}`);
      }
      setArticle(saved);
      setForm({ ...saved, tags: saved.tags.join(", ") });
      setShowCreate(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save this article.");
    } finally {
      setSaving(false);
    }
  }

  const updateForm = (field: keyof ArticleForm, value: string) => setForm((current) => ({ ...current, [field]: value }));

  return (
    <AppLayout>
      <main className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {article ? (
                <Link href="/knowledge-base">
                  <Button variant="ghost" size="icon" aria-label="Back to knowledge base"><ArrowLeft className="h-4 w-4" /></Button>
                </Link>
              ) : <BookOpen className="h-7 w-7 text-primary" />}
              <div>
                <h1 className="text-2xl font-bold">{article ? "Edit knowledge article" : "Knowledge Base"}</h1>
                <p className="text-sm text-muted-foreground">Staff reference articles and ticket-derived solutions</p>
              </div>
            </div>
            {!article && (
              <Button onClick={() => { setForm(emptyForm); setShowCreate((current) => !current); }}>
                <Plus className="mr-2 h-4 w-4" /> Create article
              </Button>
            )}
          </header>

          {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

          {article || showCreate ? (
            <Card>
              <CardHeader><CardTitle>{article ? "Article details" : "New reference article"}</CardTitle></CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={saveArticle}>
                  <div className="space-y-2">
                    <Label htmlFor="article-title">Title</Label>
                    <Input id="article-title" maxLength={200} required value={form.title} onChange={(event) => updateForm("title", event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="article-summary">Summary</Label>
                    <Input id="article-summary" maxLength={500} value={form.summary} onChange={(event) => updateForm("summary", event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="article-content">Content</Label>
                    <Textarea id="article-content" className="min-h-64" maxLength={50000} required value={form.content} onChange={(event) => updateForm("content", event.target.value)} />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="article-tags">Tags (comma separated)</Label>
                      <Input id="article-tags" value={form.tags} onChange={(event) => updateForm("tags", event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="article-status">Status</Label>
                      <select id="article-status" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.status} onChange={(event) => updateForm("status", event.target.value as ArticleForm["status"])}>
                        <option value="draft">Draft</option>
                        <option value="published">Published</option>
                        <option value="archived">Archived</option>
                      </select>
                    </div>
                  </div>
                  {article?.sourceTicketId && (
                    <p className="text-sm text-muted-foreground">
                      Created from <Link className="underline" href={`/tickets/${article.sourceTicketId}`}>ticket #{article.sourceTicketId}</Link>
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button type="submit" disabled={saving}>{saving ? "Saving..." : article ? "Save changes" : "Create draft"}</Button>
                    {!article && <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>}
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search articles" value={search} onChange={(event) => setSearch(event.target.value)} />
              </div>
              {loading ? <p className="text-sm text-muted-foreground">Loading articles...</p> : articles.length === 0 ? (
                <Card><CardContent className="py-10 text-center text-muted-foreground">No articles yet. Create one manually or start from a ticket.</CardContent></Card>
              ) : (
                <div className="grid gap-3">
                  {articles.map((item) => (
                    <Link key={item.id} href={`/knowledge-base/${item.id}`}>
                      <Card className="cursor-pointer transition-colors hover:border-primary/50">
                        <CardContent className="flex items-start justify-between gap-4 p-5">
                          <div className="min-w-0">
                            <h2 className="font-semibold">{item.title}</h2>
                            {item.summary && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.summary}</p>}
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <Badge variant={item.status === "published" ? "default" : "secondary"}>{item.status}</Badge>
                              {item.sourceTicketId && <Badge variant="outline">Ticket #{item.sourceTicketId}</Badge>}
                              {item.tags.map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}
                            </div>
                          </div>
                          <span className="shrink-0 text-xs text-muted-foreground">{new Date(item.updatedAt).toLocaleDateString()}</span>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </AppLayout>
  );
}
