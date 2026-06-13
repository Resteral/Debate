import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Send } from 'lucide-react';
import socket from '../socket';
import { Avatar } from '../components/Navbar';

function SimStream({ username, size = 100 }) {
  return (
    <div className="simulated-stream">
      <div
        className="sim-avatar"
        style={{
          width: size, height: size,
          background: `hsl(${username?.charCodeAt(0) * 13 % 360},60%,45%)`,
        }}
      >
        {(username||'?')[0].toUpperCase()}
      </div>
      <span style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>{username}</span>
    </div>
  );
}

function formatTime(s) {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

export default function DebateRoom({ user, roomData, isSpectator = false, onLeave, navigate }) {
  const {
    roomId, topic,
    debaterA, debaterB,
    myRole,
    theme,
  } = roomData;

  const [phase,         setPhase]         = useState(roomData.phase || 'debating');
  const [timeLeft,      setTimeLeft]      = useState(300);
  const [messages,      setMessages]      = useState([]);
  const [chatInput,     setChatInput]     = useState('');
  const [votes,         setVotes]         = useState(roomData.votes || { [debaterA.id]: 0, [debaterB.id]: 0 });
  const [myVote,        setMyVote]        = useState(null);
  const [spectators,    setSpectators]    = useState(0);
  const [sideTab,       setSideTab]       = useState('chat'); // chat | vote | tip
  const [results,       setResults]       = useState(null);
  const [micOn,         setMicOn]         = useState(true);
  const [camOn,         setCamOn]         = useState(false);

  const localVideoRef  = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerRef        = useRef(null);
  const streamRef      = useRef(null);
  const chatBottomRef  = useRef(null);
  const timerRef       = useRef(null);

  const myDebater  = myRole === 'debaterA' ? debaterA : debaterB;
  const oppDebater = myRole === 'debaterA' ? debaterB : debaterA;

  // ── Timer ────────────────────────────────────
  useEffect(() => {
    timerRef.current = setInterval(() => setTimeLeft(t => Math.max(0, t - 1)), 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  // ── Socket events ────────────────────────────
  useEffect(() => {
    if (roomData.isTournament) {
      socket.emit('join-tournament-match', { tournamentId: roomData.tournamentId, matchId: roomData.matchId, username: user.username });
      
      if (!isSpectator) {
        socket.on('match-found', (data) => {
          addSysMsg(`🎙️ Opponent connected! Starting stream...`);
          socket.on('signal', handleSignal);
          initMedia();
        });
      }
    } else {
      if (isSpectator) {
        socket.emit('spectate-room', { roomId, username: user.username });
      } else {
        socket.on('signal', handleSignal);
        initMedia();
      }
    }

    socket.on('phase-change', ({ phase: p, duration }) => {
      setPhase(p);
      setTimeLeft(Math.floor(duration / 1000));
      clearInterval(timerRef.current);
      timerRef.current = setInterval(() => setTimeLeft(t => Math.max(0, t - 1)), 1000);
    });
    socket.on('vote-update',      ({ votes: v }) => setVotes(v));
    socket.on('spectator-count',  ({ count })    => setSpectators(count));
    socket.on('chat-message',     (msg)          => setMessages(prev => [...prev, msg].slice(-200)));
    socket.on('debate-ended',     (res)          => { setResults(res); clearInterval(timerRef.current); });
    socket.on('debater-disconnected', ({ username }) => {
      setMessages(prev => [...prev, { from: 'System', message: `${username} disconnected.`, timestamp: Date.now(), role: 'system' }]);
    });

    addSysMsg(`🎙️ Debate started! Topic: "${topic}"`);
    return () => {
      socket.off('phase-change');
      socket.off('vote-update');
      socket.off('spectator-count');
      socket.off('chat-message');
      socket.off('debate-ended');
      socket.off('debater-disconnected');
      socket.off('signal');
      socket.off('match-found');
      streamRef.current?.getTracks().forEach(t => t.stop());
      peerRef.current?.close();
      clearInterval(timerRef.current);
    };
  }, []);

  // auto-scroll chat
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function addSysMsg(text) {
    setMessages(prev => [...prev, { from: 'System', message: text, timestamp: Date.now(), role: 'system' }]);
  }

  async function initMedia() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      createPeer(stream);
    } catch {
      addSysMsg('⚠️ Camera/mic unavailable. Using simulated mode.');
    }
  }

  function createPeer(stream) {
    const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    peerRef.current = peer;
    stream.getTracks().forEach(t => peer.addTrack(t, stream));
    peer.ontrack = (e) => { if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0]; };
    peer.onicecandidate = (e) => {
      if (e.candidate) socket.emit('signal', { to: oppDebater.id, signal: { type: 'candidate', candidate: e.candidate } });
    };
    if (myRole === 'debaterA') {
      peer.createOffer().then(offer => {
        peer.setLocalDescription(offer);
        socket.emit('signal', { to: oppDebater.id, signal: { type: 'offer', sdp: offer } });
      });
    }
  }

  async function handleSignal({ signal }) {
    const peer = peerRef.current; if (!peer) return;
    if (signal.type === 'offer') {
      await peer.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket.emit('signal', { to: oppDebater.id, signal: { type: 'answer', sdp: answer } });
    } else if (signal.type === 'answer') {
      await peer.setRemoteDescription(new RTCSessionDescription(signal.sdp));
    } else if (signal.type === 'candidate') {
      peer.addIceCandidate(new RTCIceCandidate(signal.candidate));
    }
  }

  const sendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    socket.emit('chat-message', { roomId, message: chatInput.trim() });
    setChatInput('');
  };

  const castVote = (targetId) => {
    if (myVote || phase !== 'voting') return;
    socket.emit('cast-vote', { roomId, targetId });
    setMyVote(targetId);
  };

  const sendTip = (targetId, targetName, amount, tier) => {
    socket.emit('send-tip', { roomId, targetId, amount, tier });
  };

  const endDebate = () => socket.emit('end-debate', { roomId });

  const totalVotes = Object.values(votes).reduce((a, b) => a + b, 0);
  const getVotePct = (id) => totalVotes > 0 ? Math.round((votes[id] || 0) / totalVotes * 100) : 50;

  return (
    <div className={`debate-room-container debate-bg-${theme || 'default'}`} style={{ position: 'fixed', top: 'var(--nav-h)', left: 0, right: 0, bottom: 0, display: 'flex' }}>
      {/* ── Main stage ── */}
      <div className="debate-stage" style={{ flex: 1 }}>
        {/* Header */}
        <div className="debate-header">
          <div>
            <div className="debate-topic-label">Topic</div>
            <div className="debate-topic-text">"{topic}"</div>
          </div>
          <span className={`debate-phase-badge badge badge-${phase === 'voting' ? 'amber' : 'green'}`}>
            {phase === 'voting' ? '🗳️ Voting' : '🎙️ Live'}
          </span>
          <div className="spec-badge">
            <div className="spec-dot" />
            {spectators} watching
          </div>
          <div className="debate-timer">{formatTime(timeLeft)}</div>
        </div>

        {/* Video grid */}
        <div className="video-grid">
          {/* Debater A */}
          <div className="video-pane">
            {myRole === 'debaterA' && streamRef.current
              ? <video ref={localVideoRef} autoPlay muted className="video-el" />
              : myRole === 'debaterB' && remoteVideoRef
              ? <video ref={remoteVideoRef} autoPlay className="video-el" />
              : <SimStream username={debaterA.username} />}
            <div className="video-overlay">
              <div className="video-label">
                <div className="video-name">{debaterA.username}</div>
                {myRole === 'debaterA' && <div className="video-you">(You)</div>}
              </div>
              <div className="vote-bar-container">
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)', marginBottom: '3px' }}>
                  <span>Votes: {votes[debaterA.id] || 0}</span>
                  <span>{getVotePct(debaterA.id)}%</span>
                </div>
                <div className="vote-bar"><div className="vote-bar-fill a" style={{ width: `${getVotePct(debaterA.id)}%` }} /></div>
              </div>
            </div>
          </div>

          {/* Debater B */}
          <div className="video-pane">
            {myRole === 'debaterB' && streamRef.current
              ? <video ref={localVideoRef} autoPlay muted className="video-el" />
              : myRole === 'debaterA' && remoteVideoRef
              ? <video ref={remoteVideoRef} autoPlay className="video-el" />
              : <SimStream username={debaterB.username} />}
            <div className="video-overlay">
              <div className="video-label">
                <div className="video-name">{debaterB.username}</div>
                {myRole === 'debaterB' && <div className="video-you">(You)</div>}
              </div>
              <div className="vote-bar-container">
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)', marginBottom: '3px' }}>
                  <span>Votes: {votes[debaterB.id] || 0}</span>
                  <span>{getVotePct(debaterB.id)}%</span>
                </div>
                <div className="vote-bar"><div className="vote-bar-fill b" style={{ width: `${getVotePct(debaterB.id)}%` }} /></div>
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="debate-controls">
          {!isSpectator && <>
            <button
              className={`control-btn${!micOn ? ' active' : ''}`}
              onClick={() => {
                setMicOn(m => !m);
                streamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
              }}
              title="Toggle mic"
            >
              {micOn ? <Mic size={18} /> : <MicOff size={18} />}
            </button>
            <button
              className={`control-btn${!camOn ? ' active' : ''}`}
              onClick={() => setCamOn(c => !c)}
              title="Toggle camera"
            >
              {camOn ? <Video size={18} /> : <VideoOff size={18} />}
            </button>
            {phase === 'debating' && (
              <button className="control-btn end" onClick={endDebate}>
                <PhoneOff size={16} /> End Debate
              </button>
            )}
          </>}
          <button className="btn btn-ghost btn-sm" onClick={onLeave}>Leave</button>
        </div>
      </div>

      {/* ── Sidebar ── */}
      <div className="debate-sidebar" style={{ width: 300 }}>
        <div className="sidebar-tabs">
          {['chat','vote','tip'].map(t => (
            <button key={t} className={`sidebar-tab${sideTab === t ? ' active' : ''}`} onClick={() => setSideTab(t)}>
              {t === 'chat' ? '💬 Chat' : t === 'vote' ? '🗳️ Vote' : '💰 Tip'}
            </button>
          ))}
        </div>

        {sideTab === 'chat' && <>
          <div className="chat-messages">
            {messages.map((m, i) => (
              <div key={i} className="chat-msg">
                <span className={`chat-msg-author ${m.role}`}>{m.from}:</span>
                <span className="chat-msg-text"> {m.message}</span>
              </div>
            ))}
            <div ref={chatBottomRef} />
          </div>
          <form className="chat-input-row" onSubmit={sendChat}>
            <input
              className="input"
              style={{ fontSize: '0.82rem', padding: '0.4rem 0.65rem' }}
              placeholder="Say something..."
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
            />
            <button type="submit" className="btn btn-primary btn-sm btn-icon"><Send size={14} /></button>
          </form>
        </>}

        {sideTab === 'vote' && (
          <div className="vote-panel">
            <p style={{ fontSize: '0.85rem', color: 'var(--text2)', textAlign: 'center' }}>
              {phase === 'voting' ? 'Cast your vote!' : 'Voting opens when the debate ends.'}
            </p>
            {[debaterA, debaterB].map(d => (
              <div
                key={d.id}
                className={`vote-option${myVote === d.id ? ' voted' : ''}`}
                onClick={() => castVote(d.id)}
                style={{ cursor: phase === 'voting' && !myVote ? 'pointer' : 'default' }}
              >
                <Avatar username={d.username} size={40} style={{ margin: '0 auto 0.5rem' }} />
                <div className="vote-option-name">{d.username}</div>
                <div className="vote-option-count">{votes[d.id] || 0}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text3)' }}>votes</div>
              </div>
            ))}
          </div>
        )}

        {sideTab === 'tip' && (
          <div className="tip-panel">
            <p style={{ fontSize: '0.85rem', color: 'var(--text2)', textAlign: 'center', marginBottom: '0.5rem' }}>
              Support a debater with a tip!
            </p>
            {[debaterA, debaterB].map(d => (
              <div key={d.id}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text2)', marginBottom: '0.4rem' }}>
                  Tip {d.username}
                </div>
                {[
                  { tier: 'bronze', label: '🥉 Bronze', amount: 1 },
                  { tier: 'silver', label: '🥈 Silver', amount: 3 },
                  { tier: 'gold',   label: '🥇 Gold',   amount: 10 },
                ].map(({ tier, label, amount }) => (
                  <button
                    key={tier}
                    className={`tip-btn tip-btn-${tier}`}
                    onClick={() => sendTip(d.id, d.username, amount, tier)}
                  >
                    <span className="tip-icon">{label.split(' ')[0]}</span>
                    <div className="tip-info">
                      <div className="tip-name">{label.split(' ')[1]}</div>
                      <div className="tip-points">+{amount * 2} pts to them</div>
                    </div>
                  </button>
                ))}
                <div className="divider" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Results overlay */}
      {results && (
        <div className="results-overlay">
          <div className="results-card card card-glow">
            <div className="results-trophy">{results.isTie ? '🤝' : '🏆'}</div>
            <div className={`results-winner${results.isTie ? ' tie' : ''} gradient-text`}>
              {results.isTie ? "It's a Tie!" : `${results.winnerName} Wins!`}
            </div>
            <p style={{ color: 'var(--text2)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
              {results.isTie
                ? 'Both debaters fought equally hard.'
                : `${results.winnerName} won with ${results.votes?.[results.winnerId] || 0} votes.`}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginBottom: '1.5rem' }}>
              {[debaterA, debaterB].map(d => (
                <div key={d.id} style={{ textAlign: 'center' }}>
                  <Avatar username={d.username} size={48} style={{ margin: '0 auto 0.4rem' }} />
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{d.username}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>{results.votes?.[d.id] || 0} votes</div>
                </div>
              ))}
            </div>
            <button className="btn btn-primary w-full" onClick={onLeave}>Back to Arena</button>
          </div>
        </div>
      )}
    </div>
  );
}
