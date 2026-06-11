import { useState } from 'react';
import { Mic, Video, MessageSquare, Trophy, Swords } from 'lucide-react';

export default function LandingScreen({ onLogin }) {
  const [username, setUsername] = useState('');
  const [error, setError]       = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const u = username.trim();
    if (!u || u.length < 2) { setError('Username must be at least 2 characters.'); return; }
    if (u.length > 30)       { setError('Username must be 30 characters or fewer.'); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(u)) { setError('Only letters, numbers and underscores.'); return; }
    onLogin(u);
  };

  return (
    <div className="landing">
      <div className="landing-bg-orb" />
      <div className="landing-bg-orb" />

      <div className="landing-card card card-glow">
        <div className="landing-logo gradient-text">UnitedOasis</div>
        <p className="landing-tagline">
          The live debate arena — argue, spectate, vote &amp; connect.
        </p>

        <form className="landing-form" onSubmit={handleSubmit}>
          <div className="input-group">
            <label className="input-label">Choose your username</label>
            <input
              id="username-input"
              className="input"
              placeholder="e.g. DebateMaster99"
              value={username}
              onChange={e => { setUsername(e.target.value); setError(''); }}
              maxLength={30}
              autoFocus
            />
            {error && <span style={{ color: 'var(--red)', fontSize: '0.8rem' }}>{error}</span>}
          </div>

          <button id="join-btn" type="submit" className="btn btn-primary btn-lg w-full">
            Enter the Oasis 🌴
          </button>
        </form>

        <div className="landing-features">
          {[
            { icon: '🎤', text: 'Live mic debates' },
            { icon: '📷', text: 'Camera optional' },
            { icon: '👥', text: 'Spectate & vote' },
            { icon: '💰', text: 'Tip debaters' },
            { icon: '🏆', text: 'Climb the ranks' },
            { icon: '💬', text: 'Forum & social' },
          ].map(({ icon, text }) => (
            <div key={text} className="landing-feature">
              <span className="landing-feature-icon">{icon}</span>
              <span>{text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
