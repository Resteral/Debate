import { useState, useEffect } from 'react';
import { Swords, Eye, Mic } from 'lucide-react';
import socket from '../socket';

export default function ArenaScreen({ user, navigate, isWaiting, setIsWaiting }) {
  const [rooms, setRooms] = useState([]);

  useEffect(() => {
    socket.emit('get-rooms');
    socket.on('rooms-list',  setRooms);
    socket.on('room-opened', (room) => setRooms(prev => {
      if (prev.find(r => r.roomId === room.roomId)) return prev;
      return [...prev, { ...room, spectatorCount: 0, phase: 'debating' }];
    }));
    socket.on('room-closed', ({ roomId }) => setRooms(prev => prev.filter(r => r.roomId !== roomId)));
    socket.on('spectate-joined', (data) => {
      navigate('spectate', { room: { ...data, myRole: 'spectator' } });
    });
    return () => {
      socket.off('rooms-list');
      socket.off('room-opened');
      socket.off('room-closed');
      socket.off('spectate-joined');
    };
  }, []);

  const joinQueue = () => {
    socket.emit('join-queue', { username: user.username });
  };
  const leaveQueue = () => {
    socket.emit('leave-queue');
    setIsWaiting(false);
  };
  const spectate = (roomId) => {
    socket.emit('spectate-room', { roomId, username: user.username });
  };

  return (
    <div className="page">
      <div className="arena-hero">
        <h1 className="gradient-text">⚔️ Debate Arena</h1>
        <p>Challenge a random opponent to a live debate. Spectators watch, vote, and tip.</p>

        {isWaiting ? (
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div className="waiting-spinner" />
            <p style={{ color: 'var(--text2)', marginBottom: '1rem' }}>Searching for an opponent…</p>
            <button className="btn btn-ghost" onClick={leaveQueue}>Cancel</button>
          </div>
        ) : (
          <div className="arena-actions">
            <div className="debate-card-action card" onClick={joinQueue} id="find-debate-btn">
              <div className="debate-card-icon">🎤</div>
              <div className="debate-card-title">Start Debating</div>
              <div className="debate-card-desc">Get matched with a random opponent on a surprise topic.</div>
              <button className="btn btn-primary mt-md w-full">Find Match</button>
            </div>
            <div className="debate-card-action card">
              <div className="debate-card-icon">👁️</div>
              <div className="debate-card-title">Spectate</div>
              <div className="debate-card-desc">Watch live debates below. Vote for the best debater and send tips!</div>
              <span className="btn btn-ghost mt-md w-full" style={{ cursor: 'default' }}>
                {rooms.length} live room{rooms.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Live rooms */}
      <div>
        <div className="section-title">🔴 Live Debates ({rooms.length})</div>
        {rooms.length === 0 ? (
          <div className="empty-state card">
            <div className="empty-icon">⚔️</div>
            <p>No live debates right now. Be the first to start one!</p>
          </div>
        ) : (
          <div className="rooms-grid">
            {rooms.map(room => (
              <div key={room.roomId} className="room-card card">
                <div className="room-topic">"{room.topic}"</div>
                <div className="room-vs">
                  <span className="room-vs-name">{room.debaterA?.username}</span>
                  <span className="room-vs-sep">vs</span>
                  <span className="room-vs-name">{room.debaterB?.username}</span>
                </div>
                <div className="room-meta">
                  <span className={`room-phase ${room.phase}`}>{room.phase}</span>
                  <span>👁 {room.spectatorCount || 0} watching</span>
                </div>
                <button
                  className="btn btn-ghost btn-sm w-full mt-sm"
                  style={{ marginTop: '0.75rem' }}
                  onClick={() => spectate(room.roomId)}
                >
                  <Eye size={13} /> Watch Live
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
