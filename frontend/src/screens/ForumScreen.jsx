import { useState, useEffect } from 'react';
import { ThumbsUp, MessageCircle, Trash2, Send, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import socket from '../socket';
import { Avatar } from '../components/Navbar';

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function ForumPostDetail({ post, user, onBack }) {
  const [replyText, setReplyText] = useState('');

  const sendReply = (e) => {
    e.preventDefault();
    if (!replyText.trim()) return;
    socket.emit('forum-reply', { postId: post.id, body: replyText.trim(), author: user.username });
    setReplyText('');
  };

  return (
    <div>
      <button className="btn btn-ghost btn-sm mb-md" onClick={onBack}>← Back to Forum</button>
      <div className="card card-p mb-md">
        <h2 style={{ marginBottom: '0.5rem', lineHeight: 1.4 }}>{post.title}</h2>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem', fontSize: '0.8rem', color: 'var(--text3)' }}>
          <span>by <strong style={{ color: 'var(--text2)' }}>{post.author}</strong></span>
          <span>{timeAgo(post.createdAt)}</span>
          <span>{post.likes} likes</span>
        </div>
        <p style={{ lineHeight: 1.7, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{post.body}</p>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <button className="post-action-btn" onClick={() => socket.emit('forum-like-post', { postId: post.id })}>
            <ThumbsUp size={13} /> {post.likes}
          </button>
          {post.author === user.username && (
            <button className="post-action-btn" style={{ color: 'var(--red)' }}
              onClick={() => { socket.emit('forum-delete-post', { postId: post.id, author: user.username }); onBack(); }}>
              <Trash2 size={13} /> Delete
            </button>
          )}
        </div>
      </div>

      <div className="section-title">💬 {post.replies?.length || 0} Replies</div>
      {(post.replies || []).map(r => (
        <div key={r.id} className="reply card">
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
            <Avatar username={r.author} size={28} />
            <div style={{ flex: 1 }}>
              <div className="reply-author">{r.author} <span style={{ fontWeight: 400, color: 'var(--text3)', fontSize: '0.75rem' }}>{timeAgo(r.createdAt)}</span></div>
              <div className="reply-body">{r.body}</div>
              <button className="post-action-btn" style={{ marginTop: '0.3rem', padding: '0.1rem 0.4rem', fontSize: '0.75rem' }}
                onClick={() => socket.emit('forum-like-reply', { postId: post.id, replyId: r.id })}>
                <ThumbsUp size={11} /> {r.likes}
              </button>
            </div>
          </div>
        </div>
      ))}

      <div className="card card-p mt-md">
        <form onSubmit={sendReply} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
          <Avatar username={user.username} size={34} />
          <textarea className="textarea" style={{ flex: 1 }} placeholder="Write a reply..." rows={2}
            value={replyText} onChange={e => setReplyText(e.target.value)} />
          <button type="submit" className="btn btn-primary btn-sm" disabled={!replyText.trim()}>
            <Send size={13} /> Reply
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ForumScreen({ user, navigate }) {
  const [posts,       setPosts]       = useState([]);
  const [selected,    setSelected]    = useState(null);
  const [showForm,    setShowForm]    = useState(false);
  const [title,       setTitle]       = useState('');
  const [body,        setBody]        = useState('');
  const [loading,     setLoading]     = useState(true);
  const [sortBy,      setSortBy]      = useState('new'); // new | top

  useEffect(() => {
    fetch('/api/forum').then(r => r.json()).then(data => { setPosts(data); setLoading(false); }).catch(() => setLoading(false));

    socket.on('forum-post-created',  p  => setPosts(prev => [p, ...prev]));
    socket.on('forum-post-deleted',  ({ postId }) => { setPosts(prev => prev.filter(p => p.id !== postId)); setSelected(s => s?.id === postId ? null : s); });
    socket.on('forum-post-liked',    ({ postId, likes }) => setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes } : p)));
    socket.on('forum-reply-created', ({ postId, reply }) => {
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, replies: [...(p.replies||[]), reply] } : p));
      setSelected(s => s?.id === postId ? { ...s, replies: [...(s.replies||[]), reply] } : s);
    });
    socket.on('forum-reply-liked',   ({ postId, replyId, likes }) =>
      setPosts(prev => prev.map(p => p.id === postId ? {
        ...p, replies: (p.replies||[]).map(r => r.id === replyId ? { ...r, likes } : r),
      } : p)));

    return () => {
      socket.off('forum-post-created');
      socket.off('forum-post-deleted');
      socket.off('forum-post-liked');
      socket.off('forum-reply-created');
      socket.off('forum-reply-liked');
    };
  }, []);

  const submitPost = (e) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    socket.emit('forum-create-post', { title: title.trim(), body: body.trim(), author: user.username });
    setTitle(''); setBody(''); setShowForm(false);
  };

  const sorted = [...posts].sort((a, b) =>
    sortBy === 'top' ? (b.likes - a.likes) : (new Date(b.createdAt) - new Date(a.createdAt)));

  if (selected) {
    const live = posts.find(p => p.id === selected.id) || selected;
    return (
      <div className="page">
        <ForumPostDetail post={live} user={user} onBack={() => setSelected(null)} />
      </div>
    );
  }

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ marginBottom: '0.25rem' }}>💬 Forum</h2>
          <p className="text-muted text-small">Discuss, argue, and explore debate topics.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className={`btn btn-ghost btn-sm${sortBy === 'new' ? ' active' : ''}`}
            style={sortBy === 'new' ? { color: 'var(--primary2)', borderColor: 'var(--primary)' } : {}}
            onClick={() => setSortBy('new')}>🕐 New</button>
          <button className={`btn btn-ghost btn-sm${sortBy === 'top' ? ' active' : ''}`}
            style={sortBy === 'top' ? { color: 'var(--primary2)', borderColor: 'var(--primary)' } : {}}
            onClick={() => setSortBy('top')}>🔥 Top</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(v => !v)}>
            <Plus size={13} /> New Post
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card card-p mb-lg">
          <div className="section-title">✍️ Create Post</div>
          <form onSubmit={submitPost} className="modal-form">
            <input className="input" placeholder="Post title..." value={title}
              onChange={e => setTitle(e.target.value)} maxLength={150} />
            <textarea className="textarea" placeholder="What do you want to discuss?" rows={4}
              value={body} onChange={e => setBody(e.target.value)} maxLength={5000} />
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={!title.trim() || !body.trim()}>Post</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="empty-state"><div className="waiting-spinner" /></div>
      ) : sorted.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-icon">💬</div>
          <p>No posts yet. Start the conversation!</p>
        </div>
      ) : (
        sorted.map(post => (
          <div key={post.id} className="forum-post card" onClick={() => setSelected(post)}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
              <Avatar username={post.author} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="forum-post-title">{post.title}</div>
                <div className="forum-post-body">{post.body}</div>
                <div className="forum-post-meta">
                  <span style={{ fontWeight: 500, color: 'var(--text2)' }}>{post.author}</span>
                  <span>{timeAgo(post.createdAt)}</span>
                  <span><ThumbsUp size={11} style={{ display: 'inline' }} /> {post.likes}</span>
                  <span><MessageCircle size={11} style={{ display: 'inline' }} /> {post.replies?.length || 0}</span>
                </div>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
