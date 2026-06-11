import { useState, useEffect, useRef } from 'react';
import { Edit3, UserPlus, UserMinus, Check, X, Send, Heart, Trash2 } from 'lucide-react';
import socket from '../socket';
import { Avatar } from '../components/Navbar';

const AVATAR_COLORS  = ['#7c3aed','#ec4899','#06b6d4','#10b981','#f59e0b','#ef4444','#8b5cf6','#14b8a6','#f97316','#06b6d4'];
const BANNER_COLORS  = ['#1e1b4b','#1a1a2e','#0f2027','#0d1b2a','#1a0a2e','#2d1b69','#0a1628','#1b0a2e','#0c1a1a','#1a0f0a'];
const BADGES         = ['🔥','⭐','💎','🎤','🏆','👑','🌴','⚡','🎯','🦅'];

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function ProfileScreen({ user, targetUsername, navigate }) {
  const isOwn = user.username === targetUsername;

  const [profile,          setProfile]          = useState(null);
  const [posts,            setPosts]            = useState([]);
  const [profileComments,  setProfileComments]  = useState([]);
  const [friendsData,      setFriendsData]      = useState({ friends: [], pending: [], received: [] });
  const [wallet,           setWallet]           = useState(null);
  const [tab,              setTab]              = useState('posts');     // posts | comments | wallet | friends
  const [editing,          setEditing]          = useState(false);
  const [editBio,          setEditBio]          = useState('');
  const [editStatus,       setEditStatus]       = useState('');
  const [editAvatar,       setEditAvatar]       = useState('');
  const [editBanner,       setEditBanner]       = useState('');
  const [editBadge,        setEditBadge]        = useState('');
  const [commentText,      setCommentText]      = useState('');
  const [sendCoinsTo,      setSendCoinsTo]      = useState('');
  const [sendCoinsAmt,     setSendCoinsAmt]     = useState('');
  const [coinError,        setCoinError]        = useState('');
  const [coinSuccess,      setCoinSuccess]      = useState('');

  useEffect(() => {
    // Fetch profile
    fetch(`/api/profile/${targetUsername}`).then(r => r.json()).then(data => {
      setProfile(data);
      setEditBio(data.bio || '');
      setEditStatus(data.status || '');
      setEditAvatar(data.avatarColor || '');
      setEditBanner(data.bannerColor || '');
      setEditBadge(data.badge || '');
    });
    // Fetch posts
    fetch(`/api/social?author=${targetUsername}`).then(r => r.json()).then(setPosts);
    // Fetch profile comments
    fetch(`/api/profile-comments/${targetUsername}`).then(r => r.json()).then(setProfileComments);
    // Fetch friends
    fetch(`/api/friends/${targetUsername}`).then(r => r.json()).then(setFriendsData);
    // Fetch wallet if own profile
    if (isOwn) fetch(`/api/wallet/${targetUsername}`).then(r => r.json()).then(setWallet);

    // Socket events
    socket.on('profile-updated',       ({ username, profile: p }) => { if (username === targetUsername) setProfile(prev => ({ ...prev, ...p })); });
    socket.on('profile-comment-added', ({ targetUsername: tu, comment }) => { if (tu === targetUsername) setProfileComments(prev => [comment, ...prev]); });
    socket.on('profile-comment-liked', ({ targetUsername: tu, commentId, likes }) => {
      if (tu === targetUsername) setProfileComments(prev => prev.map(c => c.id === commentId ? { ...c, likes: Array(likes).fill('') } : c));
    });
    socket.on('profile-comment-deleted', ({ targetUsername: tu, commentId }) => {
      if (tu === targetUsername) setProfileComments(prev => prev.filter(c => c.id !== commentId));
    });
    socket.on('wallet-data',    setWallet);
    socket.on('wallet-update',  ({ username, balance }) => {
      if (username === user.username) setWallet(prev => prev ? { ...prev, balance } : prev);
    });
    socket.on('coin-error',     ({ message }) => { setCoinError(message); setCoinSuccess(''); });
    socket.on('coin-transfer',  ({ from }) => {
      if (from === user.username) { setCoinSuccess('Coins sent! ✓'); setCoinError(''); setSendCoinsTo(''); setSendCoinsAmt(''); }
    });
    socket.on('friend-accepted',      () => fetch(`/api/friends/${targetUsername}`).then(r=>r.json()).then(setFriendsData));
    socket.on('friend-request-sent',  () => fetch(`/api/friends/${targetUsername}`).then(r=>r.json()).then(setFriendsData));
    socket.on('social-post-deleted',  ({ postId }) => setPosts(prev => prev.filter(p => p.id !== postId)));

    return () => {
      socket.off('profile-updated');
      socket.off('profile-comment-added');
      socket.off('profile-comment-liked');
      socket.off('profile-comment-deleted');
      socket.off('wallet-data');
      socket.off('wallet-update');
      socket.off('coin-error');
      socket.off('coin-transfer');
      socket.off('friend-accepted');
      socket.off('friend-request-sent');
      socket.off('social-post-deleted');
    };
  }, [targetUsername]);

  const saveProfile = () => {
    socket.emit('update-profile', {
      username: user.username,
      bio: editBio, status: editStatus,
      avatarColor: editAvatar, bannerColor: editBanner,
      badge: editBadge,
    });
    setEditing(false);
  };

  const sendProfileComment = (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    socket.emit('profile-comment-add', { targetUsername, author: user.username, body: commentText.trim() });
    setCommentText('');
  };

  const likeProfileComment = (commentId) => socket.emit('profile-comment-like', { targetUsername, commentId });
  const deleteProfileComment = (commentId) => socket.emit('profile-comment-delete', { targetUsername, commentId, author: user.username });

  const sendFriendRequest = () => socket.emit('friend-request', { from: user.username, to: targetUsername });
  const acceptFriend      = () => socket.emit('friend-accept',  { username: user.username, from: targetUsername });
  const removeFriend      = () => socket.emit('friend-remove',  { username: user.username, other: targetUsername });

  const isFriend    = friendsData.friends.includes(targetUsername) || (targetUsername !== user.username && friendsData.friends.includes(targetUsername));
  const isPending   = friendsData.pending.includes(targetUsername);
  const hasReceived = friendsData.received.includes(targetUsername);

  const myFriendData = { friends: [], pending: [], received: [] };

  const sendCoins = (e) => {
    e.preventDefault();
    const amt = parseInt(sendCoinsAmt);
    if (!sendCoinsTo.trim() || !amt || amt < 1) return setCoinError('Enter a valid username and amount.');
    socket.emit('send-coins', { from: user.username, to: sendCoinsTo.trim(), amount: amt, memo: `Gift from ${user.username}` });
  };

  if (!profile) return <div className="page"><div className="waiting-spinner" style={{ margin: '4rem auto' }} /></div>;

  const stats = [
    { val: profile.score || 0,   label: 'Score' },
    { val: profile.wins || 0,    label: 'Wins' },
    { val: profile.losses || 0,  label: 'Losses' },
    { val: profile.friendCount || 0, label: 'Friends' },
  ];

  return (
    <div className="page" style={{ maxWidth: 800, margin: '0 auto' }}>
      {/* Banner */}
      <div className="card" style={{ overflow: 'hidden', marginBottom: '1rem' }}>
        <div className="profile-banner" style={{ background: editing ? editBanner : (profile.bannerColor || '#1e1b4b') }}>
          {editing && (
            <div style={{ position: 'absolute', bottom: '0.75rem', left: '0.75rem', zIndex: 2 }}>
              <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)', marginBottom: '0.35rem' }}>Banner Color</div>
              <div className="swatch-grid">
                {BANNER_COLORS.map(c => (
                  <div key={c} className={`swatch${editBanner === c ? ' selected' : ''}`}
                    style={{ background: c }} onClick={() => setEditBanner(c)} />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="profile-info-section">
          <div style={{ position: 'relative' }}>
            <div
              className="profile-avatar-large"
              style={{ background: editing ? editAvatar : (profile.avatarColor || '#7c3aed') }}
            >
              {(targetUsername || '?')[0].toUpperCase()}
            </div>
            {profile.badge && !editing && (
              <div style={{ position: 'absolute', bottom: -4, right: -4, fontSize: '1.2rem' }}>{profile.badge}</div>
            )}
          </div>

          <div className="profile-details">
            {editing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text3)', marginBottom: '0.25rem' }}>Avatar Color</div>
                  <div className="swatch-grid">
                    {AVATAR_COLORS.map(c => (
                      <div key={c} className={`swatch${editAvatar === c ? ' selected' : ''}`}
                        style={{ background: c }} onClick={() => setEditAvatar(c)} />
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text3)', marginBottom: '0.25rem' }}>Badge</div>
                  <div className="swatch-grid" style={{ gap: '0.35rem' }}>
                    {BADGES.map(b => (
                      <div
                        key={b}
                        onClick={() => setEditBadge(b === editBadge ? '' : b)}
                        style={{
                          width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', borderRadius: 8, fontSize: '1.2rem',
                          border: editBadge === b ? '2px solid var(--primary)' : '2px solid transparent',
                          background: editBadge === b ? 'rgba(99,102,241,0.2)' : 'var(--surface2)',
                        }}
                      >{b}</div>
                    ))}
                  </div>
                </div>
                <input className="input" placeholder="Status..." value={editStatus} onChange={e=>setEditStatus(e.target.value)} maxLength={100} style={{ fontSize: '0.85rem' }} />
                <textarea className="textarea" placeholder="Bio..." value={editBio} onChange={e=>setEditBio(e.target.value)} maxLength={300} rows={2} style={{ fontSize: '0.85rem' }} />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-primary btn-sm" onClick={saveProfile}>Save</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <div className="profile-username">{targetUsername}</div>
                  {profile.badge && <span style={{ fontSize: '1.1rem' }}>{profile.badge}</span>}
                </div>
                {profile.status && <div className="profile-status">💬 {profile.status}</div>}
                {profile.bio    && <div className="profile-bio">{profile.bio}</div>}
                <div className="profile-stats">
                  {stats.map(({ val, label }) => (
                    <div key={label} className="profile-stat">
                      <div className="profile-stat-val">{val}</div>
                      <div className="profile-stat-label">{label}</div>
                    </div>
                  ))}
                  {wallet && isOwn && (
                    <div className="profile-stat">
                      <div className="profile-stat-val" style={{ color: 'var(--amber)' }}>{wallet.balance}</div>
                      <div className="profile-stat-label">OC Coins</div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Action buttons */}
          {!editing && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flexShrink: 0 }}>
              {isOwn ? (
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
                  <Edit3 size={13} /> Edit Profile
                </button>
              ) : (
                <>
                  {hasReceived ? (
                    <button className="btn btn-green btn-sm" onClick={acceptFriend}>
                      <Check size={13} /> Accept Request
                    </button>
                  ) : isFriend ? (
                    <button className="btn btn-danger btn-sm" onClick={removeFriend}>
                      <UserMinus size={13} /> Remove Friend
                    </button>
                  ) : isPending ? (
                    <button className="btn btn-ghost btn-sm" disabled>
                      Pending…
                    </button>
                  ) : (
                    <button className="btn btn-primary btn-sm" onClick={sendFriendRequest}>
                      <UserPlus size={13} /> Add Friend
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Wallet address display */}
      {profile.wallet && (
        <div className="card card-p mb-md" style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '1rem' }}>💳</span>
          <div>
            <div style={{ color: 'var(--text2)', fontWeight: 600, marginBottom: '0.1rem' }}>OASIS Wallet Address</div>
            <div style={{ color: 'var(--primary2)' }}>{profile.wallet.address}</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="profile-tabs">
        {[
          { id: 'posts',    label: `📝 Posts (${posts.length})` },
          { id: 'comments', label: `💬 Wall (${profileComments.length})` },
          isOwn ? { id: 'wallet', label: '💰 Wallet' } : null,
          { id: 'friends',  label: `👥 Friends (${friendsData.friends.length})` },
        ].filter(Boolean).map(({ id, label }) => (
          <button key={id} className={`profile-tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {/* Posts */}
      {tab === 'posts' && (
        <div>
          {posts.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">📝</div><p>No posts yet.</p></div>
          ) : posts.map(p => (
            <div key={p.id} className="post-card card">
              <div className="post-body">{p.body}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text3)' }}>{timeAgo(p.createdAt)}</span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>❤️ {p.likes || 0}</span>
                  {isOwn && (
                    <button className="btn btn-danger btn-sm" style={{ padding: '0.15rem 0.4rem' }}
                      onClick={() => socket.emit('social-delete-post', { postId: p.id, author: user.username })}>
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Profile Wall / Comments */}
      {tab === 'comments' && (
        <div>
          <form onSubmit={sendProfileComment} style={{ display: 'flex', gap: '0.65rem', marginBottom: '1rem', alignItems: 'flex-end' }}>
            <Avatar username={user.username} size={34} />
            <textarea
              className="textarea"
              style={{ flex: 1, minHeight: 60 }}
              placeholder={`Leave a comment on ${targetUsername}'s wall...`}
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              maxLength={500}
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={!commentText.trim()}>
              <Send size={13} />
            </button>
          </form>

          {profileComments.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">💬</div><p>No wall posts yet.</p></div>
          ) : profileComments.map(c => (
            <div key={c.id} className="profile-comment card">
              <Avatar username={c.author} size={36} style={{ cursor: 'pointer', flexShrink: 0 }}
                onClick={() => navigate('profile', { username: c.author })} />
              <div className="profile-comment-body">
                <div className="profile-comment-author"
                  onClick={() => navigate('profile', { username: c.author })}
                  style={{ cursor: 'pointer' }}>
                  {c.author}
                </div>
                <div className="profile-comment-text">{c.body}</div>
                <div className="profile-comment-meta">
                  <span>{timeAgo(c.createdAt)}</span>
                  <button className="post-action-btn" style={{ padding: '0.1rem 0.35rem', fontSize: '0.75rem' }}
                    onClick={() => likeProfileComment(c.id)}>
                    <Heart size={11} fill={c.likedByMe ? 'var(--pink)' : 'none'} /> {c.likes?.length || 0}
                  </button>
                  {(c.author === user.username || isOwn) && (
                    <button className="post-action-btn" style={{ color: 'var(--red)', padding: '0.1rem 0.35rem', fontSize: '0.75rem' }}
                      onClick={() => deleteProfileComment(c.id)}>
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Wallet */}
      {tab === 'wallet' && isOwn && (
        <div>
          <div className="card card-p mb-md" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(236,72,153,0.08))', border: '1px solid rgba(99,102,241,0.2)' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text2)', marginBottom: '0.25rem' }}>OASIS Coin Balance</div>
            <div style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 800, fontSize: '2.5rem', color: 'var(--amber)' }}>
              {wallet?.balance || 0} <span style={{ fontSize: '1rem', color: 'var(--text2)' }}>OC</span>
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--text3)', marginTop: '0.5rem' }}>
              {wallet?.address}
            </div>
          </div>

          {/* Send coins */}
          <div className="card card-p mb-md">
            <div className="section-title">💸 Send OASIS Coins</div>
            <form onSubmit={sendCoins} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <input className="input" placeholder="Recipient username" value={sendCoinsTo} onChange={e=>setSendCoinsTo(e.target.value)} />
              <input className="input" type="number" min="1" placeholder="Amount (OC)" value={sendCoinsAmt} onChange={e=>setSendCoinsAmt(e.target.value)} />
              {coinError   && <div style={{ color: 'var(--red)',   fontSize: '0.8rem' }}>{coinError}</div>}
              {coinSuccess && <div style={{ color: 'var(--green)', fontSize: '0.8rem' }}>{coinSuccess}</div>}
              <button type="submit" className="btn btn-primary btn-sm" disabled={!sendCoinsTo || !sendCoinsAmt}>
                <Send size={13} /> Send Coins
              </button>
            </form>
          </div>

          {/* Transaction history */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid var(--border)' }} className="section-title">
              📜 Transaction History
            </div>
            {(wallet?.transactions || []).length === 0 ? (
              <div className="empty-state" style={{ padding: '1.5rem' }}><p>No transactions yet.</p></div>
            ) : (wallet?.transactions || []).map(tx => (
              <div key={tx.id} style={{
                display: 'flex', gap: '0.75rem', alignItems: 'center',
                padding: '0.65rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.03)',
                fontSize: '0.82rem',
              }}>
                <div style={{ fontSize: '1rem' }}>
                  {tx.type === 'mint' ? '🎁' : tx.type === 'tip' ? '💰' : tx.type === 'bet-locked' ? '🎲' : tx.from === user.username ? '📤' : '📥'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{tx.memo || tx.type}</div>
                  <div style={{ color: 'var(--text3)', fontSize: '0.75rem' }}>{tx.from} → {tx.to}</div>
                </div>
                <div style={{
                  fontWeight: 700, fontFamily: 'Outfit,sans-serif',
                  color: tx.to === user.username ? 'var(--green)' : 'var(--red)',
                }}>
                  {tx.to === user.username ? '+' : '-'}{tx.amount} OC
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Friends */}
      {tab === 'friends' && (
        <div>
          {friendsData.received?.length > 0 && isOwn && (
            <div className="card card-p mb-md" style={{ border: '1px solid rgba(245,158,11,0.3)' }}>
              <div className="section-title">📬 Friend Requests ({friendsData.received.length})</div>
              {friendsData.received.map(fr => (
                <div key={fr} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <Avatar username={fr} size={36} />
                  <span style={{ flex: 1, fontWeight: 500 }}>{fr}</span>
                  <button className="btn btn-green btn-sm" onClick={() => socket.emit('friend-accept', { username: user.username, from: fr })}>
                    <Check size={13} /> Accept
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => socket.emit('friend-reject', { username: user.username, from: fr })}>
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {friendsData.friends.length === 0 ? (
            <div className="empty-state card"><div className="empty-icon">👥</div><p>No friends yet.</p></div>
          ) : (
            <div className="friends-grid">
              {friendsData.friends.map(f => (
                <div key={f} className="friend-card card" onClick={() => navigate('profile', { username: f })}>
                  <Avatar username={f} size={56} className="friend-avatar" />
                  <div className="friend-name">{f}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
