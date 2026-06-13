import { useState, useEffect } from 'react';
import { Newspaper, ExternalLink, Swords, RefreshCw } from 'lucide-react';
import socket from '../socket';

const CATEGORIES = [
  { id: 'all', name: 'All News' },
  { id: 'world', name: 'World News' },
  { id: 'local', name: 'US Local News' },
  { id: 'streamers', name: 'Streamers & Web' },
  { id: 'theory', name: 'Popular Theories' },
  { id: 'life', name: 'Day-to-Day Life' }
];

export default function NewsScreen({ user, navigate, setIsWaiting }) {
  const [activeCategory, setActiveCategory] = useState('all');
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchNews = async (cat) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/news?category=${cat}`);
      if (!res.ok) throw new Error('Failed to load news');
      const data = await res.json();
      setNews(data);
    } catch (err) {
      console.error(err);
      setError('Could not retrieve RSS news feeds. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNews(activeCategory);
  }, [activeCategory]);

  const handleDebate = (title) => {
    socket.emit('join-queue', { username: user.username, theme: 'news', customTopic: title });
    setIsWaiting(true);
    navigate('arena');
  };

  const getSourceBadgeColor = (source) => {
    const s = source.toLowerCase();
    if (s.includes('bbc')) return 'badge-blue';
    if (s.includes('nyt')) return 'badge-neutral';
    if (s.includes('npr')) return 'badge-amber';
    if (s.includes('livestreamfail')) return 'badge-violet';
    if (s.includes('conspiracy')) return 'badge-red';
    if (s.includes('askreddit')) return 'badge-pink';
    if (s.includes('asshole')) return 'badge-green';
    if (s.includes('relationship')) return 'badge-rose';
    return 'badge-primary';
  };

  return (
    <div className="page">
      <div className="news-hero" style={{ marginBottom: '2.5rem' }}>
        <h1 className="gradient-text" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Newspaper size={32} /> Real-Time News Feed
        </h1>
        <p style={{ color: 'var(--text2)', marginTop: '0.25rem' }}>
          Scrubbed directly from RSS feeds and social hubs. Find a topic, read up, and click <strong>Debate This</strong> to challenge others in real-time.
        </p>
      </div>

      {/* Categories Tabs */}
      <div className="news-tabs-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', marginBottom: '2rem', gap: '1rem', flexWrap: 'wrap', paddingBottom: '0.5rem' }}>
        <div className="news-tabs" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              className={`news-tab-btn btn btn-sm ${activeCategory === cat.id ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveCategory(cat.id)}
            >
              {cat.name}
            </button>
          ))}
        </div>
        <button
          className="btn btn-ghost btn-sm btn-icon"
          onClick={() => fetchNews(activeCategory)}
          disabled={loading}
          title="Refresh feeds"
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem 0' }}>
          <div className="waiting-spinner" style={{ margin: '0 auto 1.5rem' }} />
          <p style={{ color: 'var(--text2)' }}>Aggregating live news streams...</p>
        </div>
      ) : error ? (
        <div className="empty-state card" style={{ padding: '3rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📡</div>
          <p style={{ color: 'var(--red)', marginBottom: '1.5rem', fontWeight: 600 }}>{error}</p>
          <button className="btn btn-primary" onClick={() => fetchNews(activeCategory)}>
            Retry Fetching
          </button>
        </div>
      ) : news.length === 0 ? (
        <div className="empty-state card" style={{ padding: '3rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
          <p style={{ color: 'var(--text2)' }}>No news found in this category right now.</p>
        </div>
      ) : (
        <div className="news-grid-cards">
          {news.map((item) => (
            <div key={item.id} className="news-card card card-glow" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="news-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', gap: '1rem' }}>
                <span className={`badge ${getSourceBadgeColor(item.source)}`}>
                  {item.source}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text3)' }}>
                  {new Date(item.pubDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {' - '}
                  {new Date(item.pubDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                </span>
              </div>

              <h3 className="news-card-title" style={{ fontSize: '1.05rem', fontWeight: 700, lineHeight: 1.4, marginBottom: '0.75rem', color: 'var(--text)' }}>
                {item.title}
              </h3>

              {item.contentSnippet && (
                <p className="news-card-snippet" style={{ fontSize: '0.85rem', color: 'var(--text2)', lineHeight: 1.5, marginBottom: '1.25rem', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                  {item.contentSnippet}
                </p>
              )}

              <div className="news-card-footer" style={{ marginTop: 'auto', display: 'flex', gap: '0.75rem', justifyContent: 'space-between', alignItems: 'center' }}>
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem' }}
                >
                  <ExternalLink size={12} /> Source Article
                </a>
                <button
                  className="btn btn-primary btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}
                  onClick={() => handleDebate(item.title)}
                >
                  <Swords size={12} /> Debate This
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
