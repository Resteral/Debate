import { useState, useEffect } from 'react';
import { ThumbsUp, ThumbsDown, Send, Plus, Check, X } from 'lucide-react';
import socket from '../socket';

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const APPROVAL_THRESHOLD = 5;

export default function TopicsScreen({ user }) {
  const [topics,      setTopics]      = useState([]);
  const [newText,     setNewText]     = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState('');
  const [success,     setSuccess]     = useState('');
  const [filter,      setFilter]      = useState('all'); // all | pending | approved | rejected
  const [votedTopics, setVotedTopics] = useState(new Set());

  useEffect(() => {
    fetch('/api/topics').then(r => r.json()).then(setTopics).catch(() => {});

    socket.on('topic-submitted',      t    => setTopics(prev => [t, ...prev]));
    socket.on('topic-vote-update',    data => setTopics(prev =>
      prev.map(t => t.id === data.topicId ? { ...t, upvotes: data.upvotes, downvotes: data.downvotes, status: data.status } : t)));
    socket.on('topic-status-changed', data => setTopics(prev =>
      prev.map(t => t.id === data.topicId ? { ...t, status: data.status } : t)));
    socket.on('topic-submission-success', () => { setSubmitting(false); setSuccess('Topic submitted!'); setTimeout(() => setSuccess(''), 3000); });
    socket.on('topic-submission-error',   ({ message }) => { setSubmitting(false); setError(message); });
    socket.on('topic-vote-error',         ({ message }) => alert(message));

    return () => {
      socket.off('topic-submitted');
      socket.off('topic-vote-update');
      socket.off('topic-status-changed');
      socket.off('topic-submission-success');
      socket.off('topic-submission-error');
      socket.off('topic-vote-error');
    };
  }, []);

  const submitTopic = (e) => {
    e.preventDefault();
    const t = newText.trim();
    if (!t) return;
    setError(''); setSubmitting(true);
    socket.emit('submit-topic', { text: t, submittedBy: user.username });
    setNewText('');
  };

  const voteTopic = (topicId, vote) => {
    if (votedTopics.has(topicId)) return;
    socket.emit('vote-topic', { topicId, vote });
    setVotedTopics(prev => new Set([...prev, topicId]));
  };

  const filtered = topics.filter(t => filter === 'all' || t.status === filter);

  return (
    <div className="page">
      <h2 style={{ marginBottom: '0.4rem' }}>💡 Debate Topics</h2>
      <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
        Submit topic ideas. Community votes push them to approved — and into the arena!
      </p>

      {/* Submit form */}
      <div className="card card-p mb-lg">
        <div className="section-title">✏️ Submit a Topic</div>
        <form onSubmit={submitTopic} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <textarea
              className="textarea"
              placeholder="e.g. Should universities be free worldwide?"
              value={newText}
              onChange={e => { setNewText(e.target.value); setError(''); }}
              rows={2}
              maxLength={200}
            />
            {error   && <div style={{ color: 'var(--red)',   fontSize: '0.8rem', marginTop: '0.3rem' }}>{error}</div>}
            {success && <div style={{ color: 'var(--green)', fontSize: '0.8rem', marginTop: '0.3rem' }}>{success}</div>}
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting || !newText.trim()}
            style={{ flexShrink: 0 }}
          >
            <Plus size={14} /> Submit
          </button>
        </form>
        <div style={{ fontSize: '0.75rem', color: 'var(--text3)', marginTop: '0.5rem' }}>
          Topics need {APPROVAL_THRESHOLD} upvotes to get approved for the arena.
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {['all','pending','approved','rejected'].map(f => (
          <button
            key={f}
            className={`btn btn-ghost btn-sm${filter === f ? ' btn-primary' : ''}`}
            style={filter === f ? { background: 'rgba(99,102,241,0.2)', color: 'var(--primary2)', borderColor: 'var(--primary)' } : {}}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)} ({topics.filter(t => f === 'all' || t.status === f).length})
          </button>
        ))}
      </div>

      {/* Topics list */}
      {filtered.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-icon">💡</div>
          <p>No topics in this category yet.</p>
        </div>
      ) : (
        filtered.map(topic => {
          const total = topic.upvotes + topic.downvotes;
          const pct   = APPROVAL_THRESHOLD > 0 ? Math.min(100, Math.round(topic.upvotes / APPROVAL_THRESHOLD * 100)) : 0;
          const voted = votedTopics.has(topic.id);
          return (
            <div key={topic.id} className="topic-card card">
              <div className="topic-text">{topic.text}</div>
              <div className="topic-meta">
                <div className="topic-vote-row">
                  <button
                    className="topic-vote-btn up"
                    onClick={() => voteTopic(topic.id, 'up')}
                    disabled={voted || topic.status !== 'pending'}
                    style={voted ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                  >
                    <ThumbsUp size={13} /> {topic.upvotes}
                  </button>
                  <button
                    className="topic-vote-btn down"
                    onClick={() => voteTopic(topic.id, 'down')}
                    disabled={voted || topic.status !== 'pending'}
                    style={voted ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                  >
                    <ThumbsDown size={13} /> {topic.downvotes}
                  </button>
                </div>

                <span className={`topic-status ${topic.status}`}>
                  {topic.status === 'approved' ? <><Check size={10} /> Approved</> :
                   topic.status === 'rejected' ? <><X size={10} /> Rejected</> : '⏳ Pending'}
                </span>

                {topic.status === 'pending' && (
                  <div className="topic-progress">
                    <div style={{ fontSize: '0.7rem', color: 'var(--text3)' }}>{topic.upvotes}/{APPROVAL_THRESHOLD} needed</div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}

                <span style={{ fontSize: '0.72rem', color: 'var(--text3)', marginLeft: 'auto' }}>
                  by {topic.submittedBy} · {timeAgo(topic.createdAt)}
                </span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
