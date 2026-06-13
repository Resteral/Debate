import { useState, useEffect, useCallback } from 'react';
import socket from './socket';
import Navbar from './components/Navbar';
import LandingScreen from './screens/LandingScreen';
import HomeScreen from './screens/HomeScreen';
import ArenaScreen from './screens/ArenaScreen';
import DebateRoom from './screens/DebateRoom';
import ForumScreen from './screens/ForumScreen';
import TopicsScreen from './screens/TopicsScreen';
import LeaderboardScreen from './screens/LeaderboardScreen';
import ProfileScreen from './screens/ProfileScreen';
import TournamentScreen from './screens/TournamentScreen';
import NewsScreen from './screens/NewsScreen';
import TipToast from './components/TipToast';

export default function App() {
  const [user, setUser]           = useState(null);       // { username }
  const [screen, setScreen]       = useState('home');
  const [profileTarget, setProfileTarget] = useState(null);
  const [debateRoom, setDebateRoom]       = useState(null);  // active debate room data
  const [spectateRoom, setSpectateRoom]   = useState(null);  // room being spectated
  const [leaderboard, setLeaderboard]     = useState([]);
  const [tipToast, setTipToast]           = useState(null);
  const [isWaiting, setIsWaiting]         = useState(false);
  const [sessionRestored, setSessionRestored] = useState(false); // prevents landing flicker

  // ── Restore session from localStorage on mount ──
  useEffect(() => {
    try {
      const stored = localStorage.getItem('unitedoasis_user');
      if (stored) {
        const u = JSON.parse(stored);
        setUser(u);
        socket.emit('set-user', { username: u.username });
      }
    } catch (e) {
      console.error('Failed to restore session:', e);
    } finally {
      setSessionRestored(true);
    }
  }, []);

  // ── Socket global listeners ────────────────
  useEffect(() => {
    socket.on('leaderboard-update', setLeaderboard);
    socket.on('match-found', (data) => {
      setIsWaiting(false);
      setDebateRoom(data);
      setScreen('debate');
    });
    socket.on('waiting-for-opponent', () => setIsWaiting(true));
    socket.on('left-queue', () => setIsWaiting(false));
    socket.on('tip-received', (data) => {
      setTipToast(data);
      setTimeout(() => setTipToast(null), 3500);
    });
    return () => {
      socket.off('leaderboard-update');
      socket.off('match-found');
      socket.off('waiting-for-opponent');
      socket.off('left-queue');
      socket.off('tip-received');
    };
  }, []);

  // ── Fetch leaderboard on mount ─────────────
  useEffect(() => {
    fetch('/api/leaderboard').then(r => r.json()).then(setLeaderboard).catch(() => {});
  }, []);

  // ── Login ──────────────────────────────────
  const handleLogin = useCallback((username) => {
    const u = { username };
    setUser(u);
    try {
      localStorage.setItem('unitedoasis_user', JSON.stringify(u));
    } catch {}
    socket.emit('set-user', { username });
    setScreen('home');
  }, []);

  // ── Navigate ───────────────────────────────
  const navigate = useCallback((s, extra = {}) => {
    if (s === 'profile' && extra.username) setProfileTarget(extra.username);
    if (s === 'spectate' && extra.room)    setSpectateRoom(extra.room);
    setScreen(s);
  }, []);

  // ── Leave debate ───────────────────────────
  const leaveDebate = useCallback(() => {
    setDebateRoom(null);
    setSpectateRoom(null);
    setIsWaiting(false);
    setScreen('arena');
  }, []);

  // ── Logout ─────────────────────────────────
  const handleLogout = useCallback(() => {
    try { localStorage.removeItem('unitedoasis_user'); } catch {}
    setUser(null);
    setScreen('home');
    setDebateRoom(null);
    setSpectateRoom(null);
    setIsWaiting(false);
  }, []);

  // While restoring session, show nothing to avoid flicker
  if (!sessionRestored) return null;

  if (!user) return <LandingScreen onLogin={handleLogin} />;

  return (
    <div className="app-layout">
      <Navbar
        user={user}
        screen={screen}
        navigate={navigate}
        leaderboard={leaderboard}
        onLogout={handleLogout}
      />

      <div className="main-content">
        {screen === 'home' && (
          <HomeScreen user={user} navigate={navigate} />
        )}
        {screen === 'arena' && (
          <ArenaScreen
            user={user}
            navigate={navigate}
            isWaiting={isWaiting}
            setIsWaiting={setIsWaiting}
          />
        )}
        {screen === 'debate' && debateRoom && (
          <DebateRoom
            user={user}
            roomData={debateRoom}
            onLeave={leaveDebate}
            navigate={navigate}
          />
        )}
        {screen === 'spectate' && spectateRoom && (
          <DebateRoom
            user={user}
            roomData={spectateRoom}
            isSpectator
            onLeave={leaveDebate}
            navigate={navigate}
          />
        )}
        {screen === 'forum' && (
          <ForumScreen user={user} navigate={navigate} />
        )}
        {screen === 'topics' && (
          <TopicsScreen user={user} navigate={navigate} />
        )}
        {screen === 'leaderboard' && (
          <LeaderboardScreen
            user={user}
            leaderboard={leaderboard}
            navigate={navigate}
          />
        )}
        {screen === 'tournaments' && (
          <TournamentScreen
            user={user}
            navigate={navigate}
          />
        )}
        {screen === 'news' && (
          <NewsScreen
            user={user}
            navigate={navigate}
            setIsWaiting={setIsWaiting}
          />
        )}
        {screen === 'profile' && (
          <ProfileScreen
            user={user}
            targetUsername={profileTarget || user.username}
            navigate={navigate}
          />
        )}
      </div>

      {tipToast && <TipToast data={tipToast} />}
    </div>
  );
}
