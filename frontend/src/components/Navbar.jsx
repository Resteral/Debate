import { Home, Swords, MessageSquare, Lightbulb, Trophy, User, Users, Award, LogOut } from 'lucide-react';

const AVATAR_COLORS = ['#7c3aed','#ec4899','#06b6d4','#10b981','#f59e0b','#ef4444','#8b5cf6','#14b8a6'];

export function getAvatarColor(username) {
  if (!username) return '#6366f1';
  let hash = 0;
  for (let i = 0; i < username.length; i++) hash = username.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function Avatar({ username, size = 36, color, className = '' }) {
  const bg = color || getAvatarColor(username);
  return (
    <div
      className={className}
      style={{
        width: size, height: size, borderRadius: '50%',
        background: bg, display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontWeight: 700,
        fontSize: size * 0.38,
        color: '#fff', flexShrink: 0,
        fontFamily: 'Outfit, sans-serif',
      }}
    >
      {(username || '?')[0].toUpperCase()}
    </div>
  );
}

const NAV_ITEMS = [
  { id: 'home',        label: 'Home',      icon: Home },
  { id: 'arena',       label: 'Arena',     icon: Swords },
  { id: 'tournaments', label: 'Tourney',   icon: Award },
  { id: 'forum',       label: 'Forum',     icon: MessageSquare },
  { id: 'topics',      label: 'Topics',    icon: Lightbulb },
  { id: 'leaderboard', label: 'Ranks',     icon: Trophy },
];

export default function Navbar({ user, screen, navigate, onLogout }) {
  return (
    <nav className="navbar">
      <div className="navbar-logo" onClick={() => navigate('home')}>
        UnitedOasis
      </div>

      <div className="nav-links">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`nav-link${screen === id ? ' active' : ''}`}
            onClick={() => navigate(id)}
          >
            <Icon size={15} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <button
        className="nav-link"
        onClick={() => navigate('profile', { username: user.username })}
        style={{ marginLeft: '0.25rem' }}
      >
        <Avatar username={user.username} size={28} />
        <span>{user.username}</span>
      </button>

      <button
        className="nav-link"
        onClick={onLogout}
        title="Log out"
        style={{ color: 'var(--text3)', marginLeft: '0.1rem' }}
      >
        <LogOut size={15} />
      </button>
    </nav>
  );
}
