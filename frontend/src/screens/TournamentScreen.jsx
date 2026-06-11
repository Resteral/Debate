import { useState, useEffect, useCallback } from 'react';
import { Award, Coins, Users, Check, Play, ArrowRight, Lock, Plus, X, Shield, Activity, HelpCircle } from 'lucide-react';
import socket from '../socket';
import { Avatar } from '../components/Navbar';
import confetti from 'canvas-confetti';

const isUuid = (val) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(val);
};

const formatPlayerName = (val) => {
  if (!val) return 'TBD';
  if (isUuid(val)) return `Winner of Match ${val.slice(0, 4)}`;
  return val;
};

export default function TournamentScreen({ user, navigate }) {
  const [tournaments,    setTournaments]    = useState([]);
  const [selectedId,     setSelectedId]     = useState(null);
  const [wallet,         setWallet]         = useState(null);
  const [showHostModal,  setShowHostModal]  = useState(false);
  const [showBetModal,   setShowBetModal]   = useState(null); // match object or null
  const [tab,            setTab]            = useState('all'); // all | open | active | complete

  // Host form states
  const [tourneyName,    setTourneyName]    = useState('');
  const [tourneyTopic,   setTourneyTopic]   = useState('');
  const [maxPlayers,     setMaxPlayers]     = useState(8);
  const [entryFee,       setEntryFee]       = useState(50);

  // Bet form states
  const [betAmount,      setBetAmount]      = useState(10);
  const [betTarget,      setBetTarget]      = useState(''); // target username

  const [errorMsg,       setErrorMsg]       = useState('');
  const [successMsg,     setSuccessMsg]     = useState('');

  // Fetch initial list
  useEffect(() => {
    socket.emit('get-tournaments');
    socket.emit('get-wallet', { username: user.username });

    const handleTournamentsList = (list) => setTournaments(list);
    const handleWalletData = (data) => setWallet(data);
    const handleTournamentCreated = (t) => {
      setTournaments(prev => [t, ...prev.filter(x => x.id !== t.id)]);
      showToast(`🏆 Tournament "${t.name}" hosted!`);
    };
    const handleTournamentUpdated = (t) => {
      setTournaments(prev => prev.map(x => x.id === t.id ? t : x));
    };
    const handleTournamentStarted = (t) => {
      setTournaments(prev => prev.map(x => x.id === t.id ? t : x));
      showToast(`🔥 Tournament "${t.name}" has started!`);
    };
    const handleTournamentComplete = ({ tournament: t, winner }) => {
      setTournaments(prev => prev.map(x => x.id === t.id ? t : x));
      if (winner === user.username) {
        confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
        showToast(`👑 Congratulations! You won "${t.name}"!`);
      } else {
        showToast(`🏆 "${winner}" won the tournament "${t.name}"!`);
      }
    };
    const handleBetPlaced = ({ matchId, amount, targetName }) => {
      setSuccessMsg(`Bet of ${amount} OC on ${targetName} placed!`);
      setErrorMsg('');
      setTimeout(() => {
        setShowBetModal(null);
        setSuccessMsg('');
      }, 1500);
      socket.emit('get-wallet', { username: user.username });
    };
    const handleBetError = ({ message }) => {
      setErrorMsg(message);
      setSuccessMsg('');
    };
    const handleTournamentError = ({ message }) => {
      alert(message);
    };

    socket.on('tournaments-list',       handleTournamentsList);
    socket.on('wallet-data',            handleWalletData);
    socket.on('tournament-created',     handleTournamentCreated);
    socket.on('tournament-updated',     handleTournamentUpdated);
    socket.on('tournament-started',     handleTournamentStarted);
    socket.on('tournament-complete',    handleTournamentComplete);
    socket.on('bet-placed',             handleBetPlaced);
    socket.on('bet-error',              handleBetError);
    socket.on('tournament-error',       handleTournamentError);

    return () => {
      socket.off('tournaments-list',     handleTournamentsList);
      socket.off('wallet-data',            handleWalletData);
      socket.off('tournament-created',     handleTournamentCreated);
      socket.off('tournament-updated',     handleTournamentUpdated);
      socket.off('tournament-started',     handleTournamentStarted);
      socket.off('tournament-complete',    handleTournamentComplete);
      socket.off('bet-placed',             handleBetPlaced);
      socket.off('bet-error',              handleBetError);
      socket.off('tournament-error',       handleTournamentError);
    };
  }, [user.username]);

  const showToast = (msg) => {
    // Basic browser notification if permitted, or alert
    console.log(msg);
  };

  const handleHost = (e) => {
    e.preventDefault();
    if (!tourneyName.trim()) return alert('Name required');
    if (wallet && wallet.balance < entryFee) {
      return alert(`Insufficient balance to host. Hosting requires having enough coins if you want to join, or entry fee validation.`);
    }

    socket.emit('create-tournament', {
      name: tourneyName.trim(),
      topic: tourneyTopic.trim() || undefined,
      maxPlayers: Number(maxPlayers),
      entryFee: Number(entryFee),
      createdBy: user.username,
    });
    setTourneyName('');
    setTourneyTopic('');
    setShowHostModal(false);
  };

  const handleJoin = (t) => {
    if (wallet && wallet.balance < t.entryFee) {
      return alert(`Need ${t.entryFee} OC to join this tournament.`);
    }
    socket.emit('join-tournament', { tournamentId: t.id, username: user.username });
  };

  const handleStart = (t) => {
    socket.emit('start-tournament', { tournamentId: t.id, username: user.username });
  };

  const handlePlaceBet = (e) => {
    e.preventDefault();
    if (!betTarget) return setErrorMsg('Select a player to bet on.');
    const amt = Number(betAmount);
    if (!amt || amt < 1) return setErrorMsg('Bet amount must be at least 1 OC.');
    if (wallet && wallet.balance < amt) return setErrorMsg('Insufficient balance.');

    socket.emit('place-bet', {
      tournamentId: selectedId,
      matchId: showBetModal.id,
      targetId: betTarget,
      targetName: betTarget,
      amount: amt,
      bettor: user.username,
    });
  };

  const selectedTournament = tournaments.find(t => t.id === selectedId);

  const filteredTournaments = tournaments.filter(t => {
    if (tab === 'open') return t.status === 'open';
    if (tab === 'active') return t.status === 'in_progress';
    if (tab === 'complete') return t.status === 'complete';
    return true;
  });

  const enterArena = (match, t) => {
    navigate('debate', {
      room: {
        roomId: match.roomId || `tournament_match_${match.id}`,
        topic: t.topic,
        debaterA: { username: match.playerA },
        debaterB: { username: match.playerB },
        myRole: user.username === match.playerA ? 'debaterA' : 'debaterB',
        isTournament: true,
        tournamentId: t.id,
        matchId: match.id,
        phase: 'debating'
      }
    });
  };

  const watchMatch = (match, t) => {
    navigate('spectate', {
      room: {
        roomId: match.roomId,
        topic: t.topic,
        debaterA: { username: match.playerA },
        debaterB: { username: match.playerB },
        myRole: 'spectator',
        isTournament: true,
        tournamentId: t.id,
        matchId: match.id,
        phase: 'debating'
      }
    });
  };

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Award style={{ color: 'var(--primary2)' }} /> Debate Tournaments
          </h2>
          <p className="text-muted text-small">Host debates, compete in brackets, and bet on matches using OASIS Coins.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {wallet && (
            <div className="card card-p" style={{ padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', borderRadius: 'var(--radius-sm)' }}>
              <Coins size={14} style={{ color: 'var(--amber)' }} />
              <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--amber)' }}>{wallet.balance} OC</span>
            </div>
          )}
          <button className="btn btn-primary btn-sm" onClick={() => setShowHostModal(true)}>
            <Plus size={14} /> Host Tournament
          </button>
        </div>
      </div>

      {selectedTournament ? (
        // ── Detail View ──
        <div>
          <button className="btn btn-ghost btn-sm mb-md" onClick={() => setSelectedId(null)}>
            ← Back to Tournaments
          </button>

          <div className="grid-2col" style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '1.5rem', alignItems: 'start' }}>
            {/* Sidebar Details */}
            <div className="card card-p">
              <span className={`badge mb-md badge-${
                selectedTournament.status === 'complete' ? 'green' : selectedTournament.status === 'in_progress' ? 'amber' : 'primary'
              }`}>
                {selectedTournament.status.replace('_', ' ').toUpperCase()}
              </span>
              <h3 style={{ fontSize: '1.3rem', margin: '0.25rem 0 0.75rem' }}>{selectedTournament.name}</h3>
              
              <div style={{ fontSize: '0.82rem', color: 'var(--text2)', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
                <span className="text-muted">Topic:</span>
                <p style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.9rem', marginTop: '0.2rem' }}>"{selectedTournament.topic}"</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="text-muted">Host:</span>
                  <span style={{ fontWeight: 600 }}>{selectedTournament.createdBy}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="text-muted">Entry Fee:</span>
                  <span style={{ fontWeight: 600, color: 'var(--amber)' }}>{selectedTournament.entryFee} OC</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="text-muted">Prize Pool:</span>
                  <span style={{ fontWeight: 700, color: 'var(--green)' }}>💰 {selectedTournament.prizePool} OC</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="text-muted">Players:</span>
                  <span>{selectedTournament.players.length} / {selectedTournament.maxPlayers}</span>
                </div>
              </div>

              <div className="divider" />

              {selectedTournament.status === 'open' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {!selectedTournament.players.includes(user.username) ? (
                    <button className="btn btn-primary w-full" onClick={() => handleJoin(selectedTournament)}>
                      Join Tournament (-{selectedTournament.entryFee} OC)
                    </button>
                  ) : (
                    <div className="text-center text-muted text-small py-sm" style={{ background: 'rgba(16,185,129,0.06)', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--green)', color: 'var(--green)', padding: '0.4rem' }}>
                      ✓ Joined
                    </div>
                  )}

                  {selectedTournament.createdBy === user.username && selectedTournament.players.length >= 2 && (
                    <button className="btn btn-pink w-full mt-sm" onClick={() => handleStart(selectedTournament)}>
                      Start Tournament Now
                    </button>
                  )}
                </div>
              )}

              {selectedTournament.status === 'complete' && (
                <div style={{ padding: '0.75rem', background: 'rgba(16,185,129,0.08)', borderRadius: 'var(--radius)', border: '1px solid rgba(16,185,129,0.2)', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.8rem' }}>👑</div>
                  <div style={{ fontWeight: 700, color: 'var(--green)', fontSize: '0.95rem' }}>Winner</div>
                  <div style={{ fontWeight: 800, fontSize: '1.2rem', fontFamily: 'Outfit, sans-serif' }}>{selectedTournament.winner}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text3)', marginTop: '0.2rem' }}>Claimed {selectedTournament.prizePool} OC</div>
                </div>
              )}

              <h4 style={{ fontSize: '0.85rem', color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '1.25rem 0 0.5rem' }}>Participants</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {selectedTournament.players.map(p => (
                  <div key={p} className="badge badge-primary" style={{ padding: '0.25rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Avatar username={p} size={16} />
                    {p}
                  </div>
                ))}
              </div>
            </div>

            {/* Bracket Visualization */}
            <div className="card card-p" style={{ overflowX: 'auto' }}>
              <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>⚔️ Bracket Tree</h3>

              {selectedTournament.status === 'open' ? (
                <div className="empty-state" style={{ padding: '3rem 1rem' }}>
                  <Activity size={32} className="text-muted" style={{ marginBottom: '0.75rem' }} />
                  <p>Bracket will generate once the tournament starts.</p>
                </div>
              ) : (
                <div className="bracket-container" style={{ display: 'flex', gap: '2rem', padding: '1rem 0' }}>
                  {selectedTournament.bracket.map((round, rIndex) => (
                    <div key={rIndex} className="bracket-round-col" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: '240px' }}>
                      <div className="round-title" style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                        {rIndex === selectedTournament.bracket.length - 1 ? '🏆 Finals' : rIndex === selectedTournament.bracket.length - 2 ? '🥈 Semifinals' : `Round ${rIndex + 1}`}
                      </div>

                      <div className="round-matches-list" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', flex: 1, gap: '2rem' }}>
                        {round.map((match) => {
                          const isPlayer = user.username === match.playerA || user.username === match.playerB;
                          const hasWinner = !!match.winner;
                          const isReadyToPlay = match.playerA && match.playerB && !isUuid(match.playerA) && !isUuid(match.playerB);
                          const isActive = match.roomId && !hasWinner;
                          const myBet = selectedTournament.bets.find(b => b.matchId === match.id && b.bettor === user.username);

                          return (
                            <div
                              key={match.id}
                              className={`match-card card${isActive ? ' active' : ''}`}
                              style={{
                                padding: '0.85rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.4rem',
                                borderLeft: isActive ? '3px solid var(--primary)' : '1px solid var(--border)',
                              }}
                            >
                              <div style={{ fontSize: '0.65rem', color: 'var(--text3)', display: 'flex', justifyContent: 'space-between' }}>
                                <span>Match {match.id.slice(0, 4)}</span>
                                {isActive && <span style={{ color: 'var(--green)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}><span className="spec-dot" style={{ width: 5, height: 5 }} /> LIVE</span>}
                              </div>

                              {/* Player A */}
                              <div
                                className={`match-player-row${match.winner === match.playerA ? ' winner' : ''}`}
                                style={{
                                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                  padding: '0.25rem 0.4rem', borderRadius: 'var(--radius-sm)',
                                  background: match.winner === match.playerA ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.01)',
                                  fontSize: '0.85rem',
                                  fontWeight: match.winner === match.playerA ? 600 : 400,
                                }}
                              >
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {!isUuid(match.playerA) && match.playerA ? <Avatar username={match.playerA} size={18} /> : null}
                                  {formatPlayerName(match.playerA)}
                                </span>
                                {match.winner === match.playerA && <Check size={12} style={{ color: 'var(--green)' }} />}
                              </div>

                              <div className="match-vs" style={{ textAlign: 'center', fontSize: '0.65rem', color: 'var(--text3)', fontWeight: 700 }}>VS</div>

                              {/* Player B */}
                              <div
                                className={`match-player-row${match.winner === match.playerB ? ' winner' : ''}`}
                                style={{
                                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                  padding: '0.25rem 0.4rem', borderRadius: 'var(--radius-sm)',
                                  background: match.winner === match.playerB ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.01)',
                                  fontSize: '0.85rem',
                                  fontWeight: match.winner === match.playerB ? 600 : 400,
                                }}
                              >
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {!isUuid(match.playerB) && match.playerB ? <Avatar username={match.playerB} size={18} /> : null}
                                  {formatPlayerName(match.playerB)}
                                </span>
                                {match.winner === match.playerB && <Check size={12} style={{ color: 'var(--green)' }} />}
                              </div>

                              {/* My Active Bet */}
                              {myBet && (
                                <div className="bet-badge" style={{ alignSelf: 'flex-start', marginTop: '0.2rem' }}>
                                  🎯 {myBet.amount} OC on {myBet.targetName}
                                </div>
                              )}

                              {/* Match Actions */}
                              {!hasWinner && selectedTournament.status === 'in_progress' && (
                                <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.4rem' }}>
                                  {isPlayer && isReadyToPlay && (
                                    <button
                                      className="btn btn-primary btn-sm w-full"
                                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', justifyContent: 'center' }}
                                      onClick={() => enterArena(match, selectedTournament)}
                                    >
                                      <Play size={10} /> Enter Arena
                                    </button>
                                  )}

                                  {!isPlayer && isActive && (
                                    <button
                                      className="btn btn-green btn-sm w-full"
                                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', justifyContent: 'center' }}
                                      onClick={() => watchMatch(match, selectedTournament)}
                                    >
                                      Watch Live
                                    </button>
                                  )}

                                  {!isPlayer && isReadyToPlay && !myBet && (
                                    <button
                                      className="btn btn-ghost btn-sm w-full"
                                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', justifyContent: 'center' }}
                                      onClick={() => {
                                        setBetTarget(match.playerA);
                                        setShowBetModal(match);
                                      }}
                                    >
                                      Place Bet
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        // ── List View ──
        <div>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
            {[
              { id: 'all',      label: '🏆 All' },
              { id: 'open',     label: '📬 Open' },
              { id: 'active',   label: '🔥 In Progress' },
              { id: 'complete', label: '👑 Complete' },
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

          {filteredTournaments.length === 0 ? (
            <div className="empty-state card">
              <Award size={48} className="text-muted" style={{ marginBottom: '1rem' }} />
              <h3>No tournaments found</h3>
              <p className="text-muted" style={{ fontSize: '0.85rem' }}>Be the first to host one and stake some OASIS Coins!</p>
              <button className="btn btn-primary mt-md" onClick={() => setShowHostModal(true)}>
                <Plus size={14} /> Host Tournament
              </button>
            </div>
          ) : (
            <div className="rooms-grid">
              {filteredTournaments.map(t => (
                <div key={t.id} className="room-card card" onClick={() => setSelectedId(t.id)} style={{ position: 'relative' }}>
                  <span
                    className={`room-phase ${t.status}`}
                    style={{ position: 'absolute', top: '1rem', right: '1rem', fontSize: '0.65rem' }}
                  >
                    {t.status.replace('_', ' ')}
                  </span>
                  
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'Outfit, sans-serif', paddingRight: '4.5rem' }}>
                    {t.name}
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text2)', margin: '0.5rem 0 1rem', fontStyle: 'italic' }}>
                    Topic: "{t.topic}"
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text2)', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '0.75rem' }}>
                    <div>👥 Players: <strong style={{ color: 'var(--text)' }}>{t.players.length} / {t.maxPlayers}</strong></div>
                    <div>💰 Pool: <strong style={{ color: 'var(--green)' }}>{t.prizePool} OC</strong></div>
                    <div>👤 Host: <strong style={{ color: 'var(--text)' }}>{t.createdBy}</strong></div>
                    <div>🔑 Entry: <strong style={{ color: 'var(--amber)' }}>{t.entryFee} OC</strong></div>
                  </div>

                  <button className="btn btn-ghost btn-sm w-full mt-md" style={{ marginTop: '1rem', justifyContent: 'center' }}>
                    View Bracket <ArrowRight size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Host Modal ── */}
      {showHostModal && (
        <div className="modal-backdrop" onClick={() => setShowHostModal(false)}>
          <div className="modal card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">🏆 Host Debate Tournament</h3>
              <button className="modal-close" onClick={() => setShowHostModal(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleHost} className="modal-form">
              <div className="input-group">
                <label className="input-label">Tournament Name</label>
                <input
                  className="input"
                  placeholder="e.g. Oasis Champions Bracket"
                  value={tourneyName}
                  onChange={e => setTourneyName(e.target.value)}
                  required
                />
              </div>
              <div className="input-group">
                <label className="input-label">Debate Topic (Optional)</label>
                <input
                  className="input"
                  placeholder="e.g. Is pineapple on pizza acceptable? (Defaults to random)"
                  value={tourneyTopic}
                  onChange={e => setTourneyTopic(e.target.value)}
                />
              </div>
              <div className="input-group">
                <label className="input-label">Max Competitors</label>
                <select
                  className="select"
                  value={maxPlayers}
                  onChange={e => setMaxPlayers(Number(e.target.value))}
                >
                  <option value={4}>4 players (2 Rounds)</option>
                  <option value={8}>8 players (3 Rounds)</option>
                  <option value={16}>16 players (4 Rounds)</option>
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Entry Fee (OASIS Coins)</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  placeholder="Fee to enter"
                  value={entryFee}
                  onChange={e => setEntryFee(Number(e.target.value))}
                  required
                />
                <span className="text-small text-muted">All entry fees accumulate into the tournament winner's prize pool.</span>
              </div>
              <button type="submit" className="btn btn-primary w-full mt-md">
                Create & Publish Bracket
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Bet Modal ── */}
      {showBetModal && (
        <div className="modal-backdrop" onClick={() => setShowBetModal(null)}>
          <div className="modal card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">🎲 Place Bet on Match</h3>
              <button className="modal-close" onClick={() => setShowBetModal(null)}><X size={16} /></button>
            </div>
            <form onSubmit={handlePlaceBet} className="modal-form">
              <div className="input-group">
                <label className="input-label">Select Winner</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {[showBetModal.playerA, showBetModal.playerB].map(p => (
                    <button
                      key={p}
                      type="button"
                      className="btn w-full"
                      style={{
                        background: betTarget === p ? 'var(--primary)' : 'var(--surface2)',
                        border: betTarget === p ? '2px solid var(--primary2)' : '2px solid transparent',
                        color: '#fff',
                        justifyContent: 'center',
                      }}
                      onClick={() => setBetTarget(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">Bet Amount (OASIS Coins)</label>
                <input
                  className="input"
                  type="number"
                  min="1"
                  value={betAmount}
                  onChange={e => setBetAmount(Number(e.target.value))}
                  required
                />
              </div>

              {errorMsg && <div style={{ color: 'var(--red)', fontSize: '0.8rem' }}>{errorMsg}</div>}
              {successMsg && <div style={{ color: 'var(--green)', fontSize: '0.8rem' }}>{successMsg}</div>}

              <button type="submit" className="btn btn-primary w-full mt-md">
                Lock Bet Escrow
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
