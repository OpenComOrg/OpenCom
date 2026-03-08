import { useEffect, useMemo, useState } from "react";

function formatBlogDate(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "Unscheduled";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function parseBlogBlocks(content = "") {
  return String(content || "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block, index) => {
      if (/^```[\s\S]*```$/.test(block)) {
        return {
          id: `code-${index}`,
          type: "code",
          value: block.replace(/^```/, "").replace(/```$/, "").trim(),
        };
      }

      const lines = block.split("\n").map((line) => line.trimEnd());
      if (lines.every((line) => /^- /.test(line))) {
        return {
          id: `list-${index}`,
          type: "list",
          items: lines.map((line) => line.replace(/^- /, "").trim()),
        };
      }

      if (/^### /.test(block)) {
        return {
          id: `h3-${index}`,
          type: "heading3",
          value: block.replace(/^### /, "").trim(),
        };
      }

      if (/^## /.test(block)) {
        return {
          id: `h2-${index}`,
          type: "heading2",
          value: block.replace(/^## /, "").trim(),
        };
      }

      if (/^> /.test(block)) {
        return {
          id: `quote-${index}`,
          type: "quote",
          value: block
            .split("\n")
            .map((line) => line.replace(/^> /, "").trim())
            .join(" "),
        };
      }

      return {
        id: `p-${index}`,
        type: "paragraph",
        lines,
      };
    });
}

function renderBlock(block) {
  if (block.type === "heading2") return <h2 key={block.id}>{block.value}</h2>;
  if (block.type === "heading3") return <h3 key={block.id}>{block.value}</h3>;
  if (block.type === "quote") return <blockquote key={block.id}>{block.value}</blockquote>;
  if (block.type === "code") return <pre key={block.id}><code>{block.value}</code></pre>;
  if (block.type === "list") {
    return (
      <ul key={block.id}>
        {block.items.map((item, index) => (
          <li key={`${block.id}-${index}`}>{item}</li>
        ))}
      </ul>
    );
  }
  return (
    <p key={block.id}>
      {block.lines.map((line, index) => (
        <span key={`${block.id}-${index}`}>
          {index > 0 && <br />}
          {line}
        </span>
      ))}
    </p>
  );
}

export function BlogPostPage({
  coreApi,
  slug,
  onOpenHome,
  onOpenBlogs,
  onOpenTerms,
  onOpenApp,
}) {
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    window.scrollTo(0, 0);

    (async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `${coreApi}/v1/blogs/${encodeURIComponent(slug)}`,
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data?.error || `HTTP_${response.status}`);
        }
        if (!cancelled) setPost(data.post || null);
      } catch (err) {
        if (!cancelled) {
          setPost(null);
          setError(err instanceof Error ? err.message : "Failed to load post.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [coreApi, slug]);

  const blocks = useMemo(() => parseBlogBlocks(post?.content || ""), [post]);

  return (
    <div className="blogs-shell">
      <header className="blogs-topbar">
        <div className="blogs-topbar-actions">
          <button type="button" className="ghost" onClick={onOpenBlogs}>
            All blogs
          </button>
          <button type="button" className="ghost" onClick={onOpenHome}>
            Home
          </button>
        </div>
        <div className="blogs-topbar-actions">
          <button type="button" className="ghost" onClick={onOpenTerms}>
            Terms
          </button>
          <button type="button" onClick={onOpenApp}>
            Open app
          </button>
        </div>
      </header>

      <main className="blogs-main">
        {loading && (
          <section className="blogs-state-card">
            <h2>Loading post</h2>
            <p>Pulling the published article from the OpenCom API.</p>
          </section>
        )}

        {!loading && error && (
          <section className="blogs-state-card">
            <h2>Post unavailable</h2>
            <p>{error}</p>
            <button type="button" onClick={onOpenBlogs}>
              Back to all blogs
            </button>
          </section>
        )}

        {!loading && !error && post && (
          <article className="blog-post-card">
            <div className="blogs-meta-row">
              <span>{formatBlogDate(post.publishedAt)}</span>
              <span>{post.readingMinutes} min read</span>
              <span>{post.authorName}</span>
            </div>
            <h1>{post.title}</h1>
            <p className="blog-post-summary">{post.summary}</p>
            <div className="blog-post-content">
              {blocks.map((block) => renderBlock(block))}
            </div>
          </article>
        )}
      </main>
    </div>
  );
}
