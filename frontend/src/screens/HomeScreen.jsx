import { useState, useEffect, useRef } from 'react';
import { Heart, MessageCircle, Trash2, Send } from 'lucide-react';
import socket from '../socket';
import { Avatar, getAvatarColor } from '../components/Navbar';

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function PostCard({ post, user, navigate }) {
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText]   = useState('');
  const liked = post.likes > 0; // we track count not ids client-side

  const likePost = () => socket.emit('social-like-post', { postId: post.id });
  const deletePost = () => {
    if (window.confirm('Delete this post?')) socket.emit('social-delete-post', { postId: post.id, author: user.username });
  };
  const sendComment = (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    socket.emit('social-comment', { postId: post.id, author: user.username, body: commentText.trim() });
    setCommentText('');
  };
  const likeComment = (commentId) => socket.emit('social-like-comment', { postId: post.id, commentId });

  return (
    <div className="post-card card">
      <div className="post-header">
        <Avatar
          username={post.author}
          size={40}
          className="post-avatar"
          style={{ cursor: 'pointer' }}
        />
        <div className="post-meta" style={{ flex: 1 }}>
          <div
            className="post-author"
            onClick={() => navigate('profile', { username: post.author })}
          >
            {post.author}
          </div>
          <div className="post-time">{timeAgo(post.createdAt)}</div>
        </div>
        {post.author === user.username && (
          <button className="btn btn-ghost btn-sm btn-icon" onClick={deletePost} title="Delete">
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <div className="post-body">{post.body}</div>

      <div className="post-actions">
        <button
          className={`post-action-btn${post.likedByMe ? ' liked' : ''}`}
          onClick={likePost}
        >
          <Heart size={14} fill={post.likedByMe ? 'var(--pink)' : 'none'} />
          {post.likes}
        </button>
        <button
          className="post-action-btn"
          onClick={() => setShowComments(v => !v)}
        >
          <MessageCircle size={14} />
          {post.comments?.length || 0}
        </button>
      </div>

      {showComments && (
        <div className="comments-section">
          {(post.comments || []).map(c => (
            <div key={c.id} className="comment">
              <Avatar username={c.author} size={28} className="comment-avatar" />
              <div className="comment-body">
                <div className="comment-author"
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate('profile', { username: c.author })}>
                  {c.author}
                </div>
                <div className="comment-text">{c.body}</div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.3rem', fontSize: '0.75rem', color: 'var(--text3)' }}>
                  <button className="post-action-btn" style={{ padding: '0.1rem 0.4rem', fontSize: '0.75rem' }}
                    onClick={() => likeComment(c.id)}>
                    <Heart size={11} /> {c.likes}
                  </button>
                  <span>{timeAgo(c.createdAt)}</span>
                </div>
              </div>
            </div>
          ))}

          <form className="comment-input-row" onSubmit={sendComment}>
            <Avatar username={user.username} size={28} />
            <input
              className="input"
              style={{ fontSize: '0.85rem', padding: '0.4rem 0.75rem' }}
              placeholder="Write a comment..."
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
            />
            <button type="submit" className="btn btn-primary btn-sm btn-icon">
              <Send size={13} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default function HomeScreen({ user, navigate }) {
  const [posts, setPosts]       = useState([]);
  const [body, setBody]         = useState('');
  const [loading, setLoading]   = useState(true);
  const mySocketId              = useRef(socket.id);

  useEffect(() => {
    fetch('/api/social').then(r => r.json()).then(data => {
      setPosts(data);
      setLoading(false);
    }).catch(() => setLoading(false));

    socket.on('social-post-created',  p  => setPosts(prev => [p, ...prev].slice(0, 100)));
    socket.on('social-post-deleted',  ({ postId }) => setPosts(prev => prev.filter(p => p.id !== postId)));
    socket.on('social-post-liked',    ({ postId, likes }) => setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes } : p)));
    socket.on('social-comment-created', ({ postId, comment }) =>
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, comments: [...(p.comments||[]), comment] } : p)));
    socket.on('social-comment-liked', ({ postId, commentId, likes }) =>
      setPosts(prev => prev.map(p => p.id === postId ? {
        ...p,
        comments: (p.comments||[]).map(c => c.id === commentId ? { ...c, likes } : c),
      } : p)));

    return () => {
      socket.off('social-post-created');
      socket.off('social-post-deleted');
      socket.off('social-post-liked');
      socket.off('social-comment-created');
      socket.off('social-comment-liked');
    };
  }, []);

  const submitPost = (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    socket.emit('social-create-post', { author: user.username, body: body.trim() });
    setBody('');
  };

  return (
    <div className="page">
      <div className="feed-layout">
        {/* Main feed */}
        <div>
          {/* Composer */}
          <div className="post-composer card mb-lg">
            <form onSubmit={submitPost}>
              <div className="composer-row">
                <Avatar username={user.username} size={38} className="composer-avatar" />
                <div className="composer-input-area">
                  <textarea
                    className="textarea"
                    placeholder={`What's on your mind, ${user.username}?`}
                    value={body}
                    onChange={e => setBody(e.target.value)}
                    rows={3}
                    maxLength={1000}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="text-small text-muted">{body.length}/1000</span>
                    <button id="post-submit-btn" type="submit" className="btn btn-primary btn-sm" disabled={!body.trim()}>
                      <Send size={13} /> Post
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>

          {loading ? (
            <div className="empty-state"><div className="waiting-spinner" /></div>
          ) : posts.length === 0 ? (
            <div className="empty-state card">
              <div className="empty-icon">🌴</div>
              <p>No posts yet. Be the first!</p>
            </div>
          ) : (
            posts.map(post => (
              <PostCard key={post.id} post={post} user={user} navigate={navigate} />
            ))
          )}
        </div>

        {/* Sidebar */}
        <div className="feed-sidebar">
          {/* Profile quick card */}
          <div
            className="sidebar-card card"
            style={{ cursor: 'pointer' }}
            onClick={() => navigate('profile', { username: user.username })}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Avatar username={user.username} size={48} />
              <div>
                <div style={{ fontWeight: 700, fontFamily: 'Outfit, sans-serif' }}>{user.username}</div>
                <div className="text-small text-muted">View your profile →</div>
              </div>
            </div>
          </div>

          {/* Quick links */}
          <div className="sidebar-card card">
            <div className="section-title">🔥 Jump In</div>
            {[
              { icon: '⚔️', label: 'Find a Debate', screen: 'arena' },
              { icon: '💬', label: 'Browse Forum',   screen: 'forum' },
              { icon: '💡', label: 'Vote on Topics', screen: 'topics' },
              { icon: '🏆', label: 'Leaderboard',    screen: 'leaderboard' },
            ].map(({ icon, label, screen: s }) => (
              <button
                key={s}
                className="btn btn-ghost w-full"
                style={{ justifyContent: 'flex-start', marginBottom: '0.4rem', gap: '0.6rem' }}
                onClick={() => navigate(s)}
              >
                <span>{icon}</span> {label}
              </button>
            ))}
          </div>

          {/* About card */}
          <div className="sidebar-card card" style={{ fontSize: '0.8rem', color: 'var(--text2)', lineHeight: 1.6 }}>
            <div className="section-title">🌴 About UnitedOasis</div>
            <p>The live debate platform where ideas clash, voices rise, and the best arguments win.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
