import { useEffect, useState } from "react";

function formatBlogDate(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "Unscheduled";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function BlogsPage({
  coreApi,
  onOpenHome,
  onOpenTerms,
  onOpenApp,
  onOpenPost,
}) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    window.scrollTo(0, 0);

    (async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`${coreApi}/v1/blogs`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data?.error || `HTTP_${response.status}`);
        }
        if (!cancelled) setPosts(Array.isArray(data.posts) ? data.posts : []);
      } catch (err) {
        if (!cancelled) {
          setPosts([]);
          setError(err instanceof Error ? err.message : "Failed to load blogs.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [coreApi]);

  const featuredPost = posts[0] || null;
  const otherPosts = featuredPost ? posts.slice(1) : [];

  return (
    <div className="blogs-shell">
      <header className="blogs-topbar">
        <button type="button" className="blogs-brand" onClick={onOpenHome}>
          <img src="/logo.png" alt="OpenCom" />
          <span>OpenCom</span>
        </button>
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
        <section className="blogs-hero">
          <p className="blogs-kicker">OpenCom Journal</p>
          <h1>Product notes, platform updates, and rollout details.</h1>
          <p>
            Everything published here is available publicly at opencom.online/blogs,
            with each post living on its own clean URL.
          </p>
        </section>

        {loading && (
          <section className="blogs-state-card">
            <h2>Loading posts</h2>
            <p>Fetching the latest published entries.</p>
          </section>
        )}

        {!loading && error && (
          <section className="blogs-state-card">
            <h2>Blog feed unavailable</h2>
            <p>{error}</p>
          </section>
        )}

        {!loading && !error && featuredPost && (
          <section className="blogs-featured">
            <article className="blogs-featured-card">
              <div className="blogs-meta-row">
                <span>{formatBlogDate(featuredPost.publishedAt)}</span>
                <span>{featuredPost.readingMinutes} min read</span>
                <span>{featuredPost.authorName}</span>
              </div>
              <h2>{featuredPost.title}</h2>
              <p>{featuredPost.summary}</p>
              <div className="blogs-card-actions">
                <button
                  type="button"
                  onClick={() => onOpenPost(featuredPost.slug)}
                >
                  Read featured post
                </button>
              </div>
            </article>
          </section>
        )}

        {!loading && !error && posts.length === 0 && (
          <section className="blogs-state-card">
            <h2>No posts published yet</h2>
            <p>The creator portal is ready, but nothing has been published.</p>
          </section>
        )}

        {!loading && !error && otherPosts.length > 0 && (
          <section className="blogs-grid">
            {otherPosts.map((post) => (
              <article key={post.id} className="blogs-card">
                <div className="blogs-meta-row">
                  <span>{formatBlogDate(post.publishedAt)}</span>
                  <span>{post.readingMinutes} min</span>
                </div>
                <h3>{post.title}</h3>
                <p>{post.summary}</p>
                <button type="button" className="ghost" onClick={() => onOpenPost(post.slug)}>
                  Open post
                </button>
              </article>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
