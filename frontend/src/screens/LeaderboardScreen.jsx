import { useState, useEffect } from 'react';
import { Trophy, Medal, Star, Coins } from 'lucide-react';
import { Avatar } from '../components/Navbar';

export default function LeaderboardScreen({ user, leaderboard, navigate }) {
  const [tab, setTab] = useState('score'); // score | wins | tips

  const sorted = [...leaderboard].sort((a, b) => {
    if (tab === 'wins') return b.wins - a.wins;
    if (tab === 'tips') return b.tips - a.tips;
    return b.score - a.score;
  });

  const rankIcon = (i) => {
    if (i === 0) return <span style={{ fontSize: '1.3rem' }}>🥇</span>;
    if (i === 1) return <span style={{ fontSize: '1.2rem' }}>🥈</span>;
    if (i === 2) return <span style={{ fontSize: '1.1rem' }}>🥉</span>;
    return <span className="lb-rank" style={{ color: 'var(--text3)', minWidth: 24, display: 'inline-block', textAlign: 'center' }}>#{i + 1}</span>;
  };

  return (
    <div className="page">
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ marginBottom: '0.25rem' }}>🏆 Leaderboard</h2>
        <p className="text-muted text-small">Top debaters ranked by score, wins, and tips received.</p>
      </div>

      {/* Your rank */}
      {user && (() => {
        const myRank = sorted.findIndex(e => e.username === user.username);
        const me     = sorted[myRank];
        if (!me) return null;
        return (
          <div className="card card-p mb-lg" style={{ border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary2)', minWidth: 36 }}>#{myRank + 1}</div>
              <Avatar username={user.username} size={40} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{user.username} <span style={{ color: 'var(--text3)', fontWeight: 400, fontSize: '0.8rem' }}>(You)</span></div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>{me.score} pts · {me.wins}W · {me.losses}L</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 700, color: 'var(--amber)', fontSize: '1rem' }}>{me.balance || 0} OC</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text3)' }}>OASIS Coins</div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Sort tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {[
          { id: 'score', label: '⭐ Score' },
          { id: 'wins',  label: '🏅 Wins' },
          { id: 'tips',  label: '💰 Tips' },
        ].map(({ id, label }) => (
          <button
            key={id}
            className="btn btn-ghost btn-sm"
            style={tab === id ? { color: 'var(--primary2)', borderColor: 'var(--primary)', background: 'rgba(99,102,241,0.1)' } : {}}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="lb-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Debater</th>
              <th>Score</th>
              <th>W / L</th>
              <th>Tips</th>
              <th>OC Balance</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text3)' }}>No debaters yet. Be the first!</td></tr>
            ) : (
              sorted.map((entry, i) => (
                <tr key={entry.username} style={entry.username === user?.username ? { background: 'rgba(99,102,241,0.05)' } : {}}>
                  <td>{rankIcon(i)}</td>
                  <td>
                    <div
                      className="lb-user"
                      onClick={() => navigate('profile', { username: entry.username })}
                    >
                      <Avatar username={entry.username} size={34} className="lb-avatar" />
                      <span className="lb-username">{entry.username}</span>
                    </div>
                  </td>
                  <td><span className="lb-score">{entry.score}</span></td>
                  <td style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--green)' }}>{entry.wins}W</span>
                    {' / '}
                    <span style={{ color: 'var(--red)' }}>{entry.losses}L</span>
                  </td>
                  <td style={{ color: 'var(--amber)', fontSize: '0.85rem' }}>{entry.tips || 0}</td>
                  <td>
                    <span style={{ color: 'var(--amber)', fontWeight: 600, fontFamily: 'Outfit,sans-serif' }}>
                      {entry.balance || 0} OC
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
