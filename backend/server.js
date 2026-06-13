const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const cors   = require('cors');
const { v4: uuidv4 } = require('uuid');
const fs     = require('fs');
const path   = require('path');
const fetch  = require('node-fetch');
const Parser = require('rss-parser');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

app.use(cors());
app.use(express.json());

// ─── Data ──────────────────────────────────────
// On Vercel, the filesystem is ephemeral (read-only in prod).
// We persist to disk only when running locally.
const IS_VERCEL = process.env.VERCEL === '1' || process.env.VERCEL_ENV !== undefined;
const DATA_DIR  = path.join(__dirname, 'data');

if (!IS_VERCEL && !fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const FILES = {
  leaderboard:     path.join(DATA_DIR, 'leaderboard.json'),
  topics:          path.join(DATA_DIR, 'topics.json'),
  forum:           path.join(DATA_DIR, 'forum.json'),
  profiles:        path.join(DATA_DIR, 'profiles.json'),
  social:          path.join(DATA_DIR, 'social.json'),
  friends:         path.join(DATA_DIR, 'friends.json'),
  profileComments: path.join(DATA_DIR, 'profileComments.json'),
  wallets:         path.join(DATA_DIR, 'wallets.json'),
  transactions:    path.join(DATA_DIR, 'transactions.json'),
  tournaments:     path.join(DATA_DIR, 'tournaments.json'),
};

function load(key, def) {
  if (IS_VERCEL) return def;
  try { if (fs.existsSync(FILES[key])) return JSON.parse(fs.readFileSync(FILES[key], 'utf8')); } catch {}
  return def;
}
function save(key, data) {
  if (IS_VERCEL) return; // no-op on Vercel — data lives in-memory for this instance
  try { fs.writeFileSync(FILES[key], JSON.stringify(data, null, 2)); } catch {}
}

// ─── State ─────────────────────────────────────
const leaderboard     = load('leaderboard', {});
const topics          = load('topics', []);
const forumPosts      = load('forum', []);
const profiles        = load('profiles', {});
const socialPosts     = load('social', []);
const friends         = load('friends', {});
const profileComments = load('profileComments', {});
// OASIS Coin wallets: { username: { balance, address, txCount } }
const wallets         = load('wallets', {});
// Transaction ledger: [{ id, from, to, amount, type, timestamp, memo }]
const transactions    = load('transactions', []);
// Tournaments: [{ id, name, status, bracket, bets, prizePool, ... }]
const tournaments     = load('tournaments', []);

const waitingQueue    = [];
const rooms           = {};

// ─── OASIS Coin helpers ─────────────────────────
const STARTING_BALANCE = 500;  // every new user gets 500 OC

function ensureWallet(username) {
  if (!wallets[username]) {
    // Generate a deterministic-looking hex address for aesthetics
    const addr = '0x' + Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    wallets[username] = { balance: STARTING_BALANCE, address: addr, txCount: 0 };
    save('wallets', wallets);
    addTx({ from: 'GENESIS', to: username, amount: STARTING_BALANCE, type: 'genesis', memo: 'Welcome bonus' });
  }
  return wallets[username];
}

function addTx({ from, to, amount, type, memo = '' }) {
  const tx = { id: uuidv4(), from, to, amount, type, memo, timestamp: new Date().toISOString() };
  transactions.unshift(tx);
  if (transactions.length > 5000) transactions.pop();
  save('transactions', transactions);
  return tx;
}

function transfer(from, to, amount, type, memo = '') {
  const wFrom = wallets[from];
  const wTo   = ensureWallet(to);
  if (!wFrom || wFrom.balance < amount) return { ok: false, error: 'Insufficient OASIS Coins' };
  wFrom.balance -= amount;
  wFrom.txCount++;
  wTo.balance   += amount;
  wTo.txCount++;
  save('wallets', wallets);
  const tx = addTx({ from, to, amount, type, memo });
  return { ok: true, tx };
}

function mint(to, amount, memo = '') {
  const w = ensureWallet(to);
  w.balance += amount;
  w.txCount++;
  save('wallets', wallets);
  return addTx({ from: 'MINT', to, amount, type: 'mint', memo });
}

// ─── Seed topics ─────────────────────────────────
const SEED_TOPICS = [
  'Is pineapple on pizza acceptable?',
  'Should remote work be the global standard?',
  'Is social media doing more harm than good?',
  'Should AI replace human judges in courts?',
  'Is space exploration worth the cost?',
  'Should voting be mandatory?',
  'Is cancel culture helpful or harmful?',
  'Should fast food be taxed like cigarettes?',
  'Is nuclear energy the future of clean power?',
  'Should college education be free for all?',
];

function getApprovedTopics() {
  const approved = topics.filter(t => t.status === 'approved');
  return approved.length > 0 ? approved : SEED_TOPICS.map(t => ({ id: uuidv4(), text: t }));
}
function pickRandomTopic() {
  const pool = getApprovedTopics();
  return pool[Math.floor(Math.random() * pool.length)];
}

// ─── Leaderboard ──────────────────────────────────
function getLeaderboard() {
  return Object.entries(leaderboard)
    .map(([username, stats]) => ({ username, ...stats, balance: wallets[username]?.balance || 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);
}
function updateLeaderboard(username, delta) {
  if (!leaderboard[username]) leaderboard[username] = { wins: 0, losses: 0, tips: 0, score: 0 };
  if (delta.win)       { leaderboard[username].wins++;   leaderboard[username].score += 10; }
  if (delta.loss)      { leaderboard[username].losses++; leaderboard[username].score = Math.max(0, leaderboard[username].score - 3); }
  if (delta.tipAmount) { leaderboard[username].tips += delta.tipAmount; leaderboard[username].score += delta.tipAmount * 2; }
  save('leaderboard', leaderboard);
}

// ─── Profile helpers ──────────────────────────────
const AVATAR_COLORS  = ['#7c3aed','#ec4899','#06b6d4','#10b981','#f59e0b','#ef4444','#8b5cf6','#14b8a6'];
const BANNER_COLORS  = ['#1e1b4b','#1a1a2e','#0f2027','#0d1b2a','#1a0a2e','#2d1b69','#0a1628','#1b0a2e'];
function ensureProfile(username) {
  if (!profiles[username]) {
    profiles[username] = {
      bio: '', badge: null, status: "Hey, I'm on UnitedOasis!",
      avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
      bannerColor: BANNER_COLORS[Math.floor(Math.random() * BANNER_COLORS.length)],
      joinedAt: new Date().toISOString(),
    };
    save('profiles', profiles);
  }
  return profiles[username];
}
function ensureFriends(username) {
  if (!friends[username]) { friends[username] = { friends: [], pending: [], received: [] }; save('friends', friends); }
  return friends[username];
}

// ─── Tournament helpers ───────────────────────────
function getTournament(id) { return tournaments.find(t => t.id === id); }

function createTournament({ name, topic, maxPlayers, entryFee, createdBy }) {
  const t = {
    id: uuidv4(), name, topic: topic || pickRandomTopic().text, maxPlayers: maxPlayers || 8, entryFee: entryFee || 0,
    createdBy, status: 'open',  // open | in_progress | complete
    players: [], bracket: [], bets: [],
    prizePool: 0, winner: null,
    createdAt: new Date().toISOString(),
  };
  tournaments.unshift(t);
  save('tournaments', tournaments);
  return t;
}

function buildBracket(players) {
  // Shuffle and pair players for round-robin style bracket
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  const rounds = [];
  let current = shuffled;
  while (current.length > 1) {
    const matches = [];
    for (let i = 0; i < current.length; i += 2) {
      if (current[i + 1]) {
        matches.push({ id: uuidv4(), playerA: current[i], playerB: current[i + 1], winner: null, roomId: null });
      }
    }
    rounds.push(matches);
    current = matches.map(m => m.id); // next round uses match IDs as placeholders
  }
  return rounds;
}

function settleBets(tournament, roomId, winnerId, winnerName) {
  const roomBets = tournament.bets.filter(b => b.matchId === roomId);
  if (!roomBets.length) return;

  const winBets  = roomBets.filter(b => b.targetId === winnerName);
  const totalWagered = roomBets.reduce((s, b) => s + b.amount, 0);
  const totalWin     = winBets.reduce((s, b) => s + b.amount, 0);

  winBets.forEach(bet => {
    if (totalWin === 0) return;
    const payout = Math.floor((bet.amount / totalWin) * totalWagered);
    mint(bet.bettor, payout, `Won bet on ${winnerName} in ${tournament.name}`);
    io.emit('wallet-update', { username: bet.bettor, balance: wallets[bet.bettor]?.balance });
    io.emit('bet-settled', { bettor: bet.bettor, won: true, payout, matchId: roomId });
  });
  // Losers just lose their stake (already transferred to prizePool on bet)
  roomBets.filter(b => b.targetId !== winnerName).forEach(bet => {
    io.emit('bet-settled', { bettor: bet.bettor, won: false, payout: 0, matchId: roomId });
  });
}

const parser = new Parser();

const FEEDS = {
  world: [
    { name: 'BBC News', url: 'http://feeds.bbci.co.uk/news/rss.xml' },
    { name: 'NYT Home', url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml' }
  ],
  local: [
    { name: 'NPR News', url: 'https://feeds.npr.org/1001/rss.xml' }
  ],
  streamers: [
    { name: 'r/LivestreamFail', url: 'https://www.reddit.com/r/LivestreamFail/.rss' },
    { name: 'r/OutOfTheLoop', url: 'https://www.reddit.com/r/OutOfTheLoop/.rss' }
  ],
  theory: [
    { name: 'r/conspiracy', url: 'https://www.reddit.com/r/conspiracy/.rss' },
    { name: 'r/AskReddit', url: 'https://www.reddit.com/r/AskReddit/.rss' }
  ],
  life: [
    { name: 'r/AmItheAsshole', url: 'https://www.reddit.com/r/AmItheAsshole/.rss' },
    { name: 'r/relationship_advice', url: 'https://www.reddit.com/r/relationship_advice/.rss' }
  ]
};

const NEWS_CACHE = {};
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function fetchAndParseRSS(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) UnitedOasisDebate/1.0'
    },
    timeout: 5000
  });
  if (!response.ok) throw new Error(`HTTP error ${response.status}`);
  const xml = await response.text();
  return await parser.parseString(xml);
}

async function getCachedNews(category) {
  const now = Date.now();
  
  if (category === 'all') {
    const categories = Object.keys(FEEDS);
    const results = await Promise.all(categories.map(cat => getCachedNews(cat)));
    return results.flat().sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  }
  
  const sources = FEEDS[category];
  if (!sources) return [];
  
  const cached = NEWS_CACHE[category];
  if (cached && (now - cached.lastFetched) < CACHE_TTL) {
    return cached.data;
  }
  
  const feedPromises = sources.map(async (src) => {
    try {
      const parsed = await fetchAndParseRSS(src.url);
      return (parsed.items || []).map(item => ({
        id: item.id || item.guid || item.link,
        title: item.title,
        link: item.link,
        source: src.name,
        pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
        category,
        contentSnippet: (item.contentSnippet || item.content || '').slice(0, 300)
      }));
    } catch (err) {
      console.error(`Failed to fetch RSS source ${src.name}:`, err.message);
      return [];
    }
  });
  
  const allResults = await Promise.all(feedPromises);
  const items = allResults.flat().sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  
  NEWS_CACHE[category] = {
    data: items,
    lastFetched: now
  };
  
  return items;
}

const THEME_TOPICS = {
  politics: [
    "Should wealthy nations provide universal basic income?",
    "Is a two-party system detrimental to democracy?",
    "Should voting be mandatory in democratic countries?",
    "Should political advertising on social media be banned?",
    "Is globalization doing more harm than good to local economies?"
  ],
  science: [
    "Should AI development be heavily regulated to prevent extinction risks?",
    "Is colonizing Mars a wise use of humanity's resources?",
    "Should gene editing (CRISPR) be allowed on human embryos?",
    "Is social media technology designed to be addictive, and should it be banned for minors?",
    "Will quantum computing render all current cryptography obsolete?"
  ],
  gaming: [
    "Are microtransactions ruining the video game industry?",
    "Is cloud gaming the inevitable future of the medium?",
    "Should video games be officially recognized as an Olympic sport?",
    "Is single-player narrative storytelling superior to multiplayer games?",
    "Do violent video games contribute to real-world aggression?"
  ],
  sports: [
    "Should college athletes be paid salaries like professionals?",
    "Is the use of technology (like VAR/Replay) ruining the flow of sports?",
    "Should transgender athletes compete in categories matching their gender identity?",
    "Are esports equal in athletic validity to traditional sports?",
    "Should performance-enhancing drugs be legalized and regulated in sports?"
  ],
  culture: [
    "Is cancel culture holding public figures accountable or silencing free speech?",
    "Has streaming killed the traditional cinema/movie theater experience?",
    "Is modern art more about status and money than actual talent?",
    "Should physical books be completely replaced by digital formats?",
    "Are influencer careers viable long-term professions?"
  ],
  news: [
    "Should governments restrict the use of facial recognition technology in public?",
    "Is the transition to electric vehicles happening too fast for current infrastructure?",
    "Should central banks launch digital-only national currencies (CBDCs)?",
    "Should work weeks be shortened to four days globally?"
  ],
  theory: [
    "Are we living in a computer simulation?",
    "Did advanced ancient civilizations exist before recorded history?",
    "Is there intelligent alien life currently visiting Earth?",
    "Will artificial general intelligence surpass human intelligence in this decade?",
    "Is the Mandela Effect proof of parallel universes?"
  ],
  streamer: [
    "Should platforms ban streamers who engage in high-risk real-life stunts?",
    "Is subathon/marathon streaming unhealthy and exploitative?",
    "Should VTubing replace traditional face-cam streaming?",
    "Are parasocial relationships with content creators harmful to viewers?",
    "Is Kick a viable competitor to Twitch in the long run?"
  ],
  life: [
    "Is it acceptable to ghost someone after a first date?",
    "Should partners have access to each other's cell phones?",
    "Is it okay to remain close friends with an ex-partner?",
    "Should couples split all expenses 50/50 regardless of income disparity?",
    "Is telling white lies necessary to maintain a healthy relationship?"
  ]
};

async function pickThemeTopic(theme) {
  if (theme === 'news') {
    try {
      const items = await getCachedNews('world');
      const validItems = items.filter(item => item.title && item.title.length > 15 && item.title.length < 150);
      if (validItems.length > 0) {
        const randomItem = validItems[Math.floor(Math.random() * validItems.length)];
        return `Is this true or false: "${randomItem.title}"? Let's debate!`;
      }
    } catch (e) {
      console.error("Failed to fetch news for debate topic:", e);
    }
  }
  
  const pool = THEME_TOPICS[theme];
  if (pool && pool.length > 0) {
    return pool[Math.floor(Math.random() * pool.length)];
  }
  return pickRandomTopic().text;
}

// ─── REST API ─────────────────────────────────────
app.get('/api/news', async (req, res) => {
  const category = req.query.category || 'all';
  try {
    const data = await getCachedNews(category);
    res.json(data);
  } catch (error) {
    console.error('Error fetching news:', error);
    res.status(500).json({ error: 'Failed to fetch news feed.' });
  }
});

app.get('/api/leaderboard',  (_, res) => res.json(getLeaderboard()));
app.get('/api/topics',       (_, res) => res.json([...topics].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))));
app.get('/api/forum',        (req, res) => {
  let p = [...forumPosts].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  if (req.query.topicId) p = p.filter(x=>x.topicId===req.query.topicId);
  res.json(p);
});
app.get('/api/social',       (req, res) => {
  let p = [...socialPosts].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  if (req.query.author) p = p.filter(x=>x.author===req.query.author);
  res.json(p.slice(0, 50));
});
app.get('/api/profile/:username', (req, res) => {
  const u  = req.params.username;
  const p  = ensureProfile(u);
  const lb = leaderboard[u] || { wins:0, losses:0, tips:0, score:0 };
  const fr = ensureFriends(u);
  const w  = ensureWallet(u);
  res.json({ username: u, ...p, ...lb, friendCount: fr.friends.length, wallet: w });
});
app.get('/api/friends/:username',          (req, res) => res.json(ensureFriends(req.params.username)));
app.get('/api/profile-comments/:username', (req, res) => res.json((profileComments[req.params.username]||[]).slice(0,100)));
app.get('/api/wallet/:username', (req, res) => {
  const w  = ensureWallet(req.params.username);
  const txs = transactions.filter(t => t.from === req.params.username || t.to === req.params.username).slice(0, 50);
  res.json({ ...w, transactions: txs });
});
app.get('/api/tournaments', (_, res) => res.json([...tournaments].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))));

// ─── Socket.IO ────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] ${socket.id}`);

  // ── Auth ─────────────────────────────────────
  socket.on('set-user', ({ username }) => {
    socket.username = username;
    ensureProfile(username);
    ensureFriends(username);
    const w = ensureWallet(username);
    socket.emit('profile-data', { username, profile: profiles[username] });
    socket.emit('wallet-data', { ...w, transactions: transactions.filter(t=>t.from===username||t.to===username).slice(0,30) });
  });

  socket.on('update-profile', ({ username, bio, avatarColor, bannerColor, status, badge }) => {
    const p = ensureProfile(username);
    if (bio         !== undefined) p.bio         = bio.slice(0,300);
    if (avatarColor !== undefined) p.avatarColor = avatarColor;
    if (bannerColor !== undefined) p.bannerColor = bannerColor;
    if (status      !== undefined) p.status      = status.slice(0,100);
    if (badge       !== undefined) p.badge       = badge;
    save('profiles', profiles);
    io.emit('profile-updated', { username, profile: p });
    socket.emit('profile-data', { username, profile: p });
  });

  // ── OASIS Coins ──────────────────────────────
  socket.on('get-wallet', ({ username }) => {
    const w  = ensureWallet(username);
    const txs = transactions.filter(t=>t.from===username||t.to===username).slice(0,30);
    socket.emit('wallet-data', { ...w, transactions: txs });
  });

  socket.on('send-coins', ({ from, to, amount, memo }) => {
    if (!wallets[to] && !profiles[to]) return socket.emit('coin-error', { message: `User "${to}" not found.` });
    ensureWallet(to);
    const amt = Math.floor(Number(amount));
    if (!amt || amt < 1) return socket.emit('coin-error', { message: 'Invalid amount.' });
    const result = transfer(from, to, amt, 'transfer', memo || `Sent from ${from}`);
    if (!result.ok) return socket.emit('coin-error', { message: result.error });
    socket.emit('wallet-data', { ...wallets[from], transactions: transactions.filter(t=>t.from===from||t.to===from).slice(0,30) });
    io.emit('wallet-update', { username: from, balance: wallets[from].balance });
    io.emit('wallet-update', { username: to,   balance: wallets[to].balance });
    io.emit('coin-transfer', { from, to, amount: amt, tx: result.tx });
  });

  // ── Tournaments ───────────────────────────────
  socket.on('create-tournament', ({ name, topic, maxPlayers, entryFee, createdBy }) => {
    const fee = Math.max(0, Math.floor(Number(entryFee) || 0));
    const max = [4, 8, 16].includes(Number(maxPlayers)) ? Number(maxPlayers) : 8;
    if (!name?.trim()) return socket.emit('tournament-error', { message: 'Name required.' });
    const t = createTournament({ name: name.trim(), topic: topic?.trim(), maxPlayers: max, entryFee: fee, createdBy });
    io.emit('tournament-created', t);
    console.log(`[Tournament] Created: "${t.name}" by ${createdBy}`);
  });

  socket.on('join-tournament', ({ tournamentId, username }) => {
    const t = getTournament(tournamentId);
    if (!t) return socket.emit('tournament-error', { message: 'Tournament not found.' });
    if (t.status !== 'open') return socket.emit('tournament-error', { message: 'Tournament not open.' });
    if (t.players.includes(username)) return socket.emit('tournament-error', { message: 'Already joined.' });
    if (t.players.length >= t.maxPlayers) return socket.emit('tournament-error', { message: 'Tournament full.' });

    // Collect entry fee
    if (t.entryFee > 0) {
      const w = ensureWallet(username);
      if (w.balance < t.entryFee) return socket.emit('tournament-error', { message: `Need ${t.entryFee} OC to enter.` });
      transfer(username, 'TOURNAMENT_POOL', t.entryFee, 'tournament-entry', `Entry: ${t.name}`);
      t.prizePool += t.entryFee;
    }

    t.players.push(username);
    save('tournaments', tournaments);
    io.emit('tournament-updated', t);
    socket.emit('tournament-joined', t);

    // Auto-start when full
    if (t.players.length >= t.maxPlayers) {
      startTournament(t);
    }
  });

  socket.on('start-tournament', ({ tournamentId, username }) => {
    const t = getTournament(tournamentId);
    if (!t) return;
    if (t.createdBy !== username) return socket.emit('tournament-error', { message: 'Only the creator can start.' });
    if (t.players.length < 2)    return socket.emit('tournament-error', { message: 'Need at least 2 players.' });
    startTournament(t);
  });

  socket.on('get-tournaments', () => {
    socket.emit('tournaments-list', [...tournaments].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)));
  });

  socket.on('join-tournament-match', ({ tournamentId, matchId, username }) => {
    const t = tournaments.find(x => x.id === tournamentId);
    if (!t) return socket.emit('tournament-error', { message: 'Tournament not found.' });

    const match = t.bracket.flat().find(m => m.id === matchId);
    if (!match) return socket.emit('tournament-error', { message: 'Match not found.' });
    if (match.winner) return socket.emit('tournament-error', { message: 'Match already finished.' });

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(match.playerA) || uuidRegex.test(match.playerB)) {
      return socket.emit('tournament-error', { message: 'Previous round matches must finish first.' });
    }

    let room = Object.values(rooms).find(r => r.tournamentMatchId === matchId);
    if (!room) {
      const roomId = uuidv4();
      room = {
        id: roomId, topic: t.topic, debaters: [], spectators: [],
        votes: { [match.playerA]: 0, [match.playerB]: 0 },
        votedSockets: new Set(), phase: 'debating',
        startedAt: Date.now(), debaterNames: {}, timerHandle: null,
        tournamentMatchId: matchId, tournamentId: t.id
      };
      rooms[roomId] = room;
      match.roomId = roomId;
      save('tournaments', tournaments);
      io.emit('tournament-updated', t);

      io.emit('room-opened', {
        roomId, topic: t.topic,
        debaterA: { username: match.playerA },
        debaterB: { username: match.playerB },
        isTournament: true
      });
    }

    socket.username = username;

    if (username === match.playerA || username === match.playerB) {
      socket.role = 'debater';
      socket.join(room.id);

      if (!room.debaters.some(d => d.id === socket.id)) {
        room.debaters.push(socket);
        room.debaterNames[socket.id] = username;
        room.votes[socket.id] = 0;
      }

      const socketA = room.debaters.find(d => room.debaterNames[d.id] === match.playerA);
      const socketB = room.debaters.find(d => room.debaterNames[d.id] === match.playerB);

      if (socketA && socketB) {
        socketA.emit('match-found', {
          roomId: room.id, topic: room.topic,
          debaterA: { id: socketA.id, username: match.playerA },
          debaterB: { id: socketB.id, username: match.playerB },
          myRole: 'debaterA', isTournament: true, tournamentId
        });
        socketB.emit('match-found', {
          roomId: room.id, topic: room.topic,
          debaterA: { id: socketA.id, username: match.playerA },
          debaterB: { id: socketB.id, username: match.playerB },
          myRole: 'debaterB', isTournament: true, tournamentId
        });
        startDebateTimer(room.id);
      } else {
        socket.emit('waiting-for-opponent');
      }
    } else {
      socket.role = 'spectator';
      socket.join(room.id);
      if (!room.spectators.some(s => s.id === socket.id)) {
        room.spectators.push(socket);
      }

      const socketA = room.debaters.find(d => room.debaterNames[d.id] === match.playerA);
      const socketB = room.debaters.find(d => room.debaterNames[d.id] === match.playerB);

      socket.emit('spectate-joined', {
        roomId: room.id, topic: room.topic,
        debaterA: { id: socketA ? socketA.id : 'debaterA_placeholder', username: match.playerA },
        debaterB: { id: socketB ? socketB.id : 'debaterB_placeholder', username: match.playerB },
        votes: room.votes, phase: room.phase, isTournament: true, tournamentId
      });
      io.to(room.id).emit('spectator-count', { count: room.spectators.length });
    }
  });

  // ── Tournament Betting ────────────────────────
  socket.on('place-bet', ({ tournamentId, matchId, targetId, targetName, amount, bettor }) => {
    const t = getTournament(tournamentId);
    if (!t) return socket.emit('bet-error', { message: 'Tournament not found.' });
    if (t.status !== 'in_progress') return socket.emit('bet-error', { message: 'Betting closed.' });

    const amt = Math.floor(Number(amount));
    if (!amt || amt < 1) return socket.emit('bet-error', { message: 'Invalid bet amount.' });

    // Prevent double-betting same match
    if (t.bets.find(b => b.bettor === bettor && b.matchId === matchId)) {
      return socket.emit('bet-error', { message: 'Already bet on this match.' });
    }

    const w = ensureWallet(bettor);
    if (w.balance < amt) return socket.emit('bet-error', { message: 'Insufficient OASIS Coins.' });

    // Lock bet coins
    transfer(bettor, 'BET_ESCROW', amt, 'bet-locked', `Bet on ${targetName} - ${t.name}`);
    t.bets.push({ id: uuidv4(), tournamentId, matchId, bettor, targetId, targetName, amount: amt, timestamp: new Date().toISOString() });
    t.prizePool += 0; // bet prize handled separately
    save('tournaments', tournaments);

    socket.emit('bet-placed', { matchId, amount: amt, targetName });
    socket.emit('wallet-data', { ...wallets[bettor], transactions: transactions.filter(x=>x.from===bettor||x.to===bettor).slice(0,30) });
    io.emit('tournament-updated', t);
    io.emit('wallet-update', { username: bettor, balance: wallets[bettor]?.balance });
    console.log(`[Bet] ${bettor} bet ${amt} OC on ${targetName}`);
  });

  // ── Social Posts ──────────────────────────────
  socket.on('social-create-post', ({ author, body }) => {
    const tb = (body||'').trim();
    if (!tb || tb.length > 1000) return socket.emit('social-error', { message: 'Post must be 1–1000 chars.' });
    const post = { id:uuidv4(), author, body:tb, likes:0, comments:[], createdAt:new Date().toISOString() };
    socialPosts.unshift(post);
    if (socialPosts.length > 500) socialPosts.pop();
    save('social', socialPosts);
    io.emit('social-post-created', post);
  });
  socket.on('social-like-post', ({ postId }) => {
    const p = socialPosts.find(x=>x.id===postId); if (!p) return;
    p.likes = (p.likes||0) + 1;
    save('social', socialPosts);
    io.emit('social-post-liked', { postId, likes: p.likes });
  });
  socket.on('social-comment', ({ postId, author, body }) => {
    const p = socialPosts.find(x=>x.id===postId); if (!p) return;
    const tb = (body||'').trim(); if (!tb) return;
    const c = { id:uuidv4(), author, body:tb, likes:0, createdAt:new Date().toISOString() };
    p.comments.push(c); save('social', socialPosts);
    io.emit('social-comment-created', { postId, comment: c });
  });
  socket.on('social-like-comment', ({ postId, commentId }) => {
    const p = socialPosts.find(x=>x.id===postId); if (!p) return;
    const c = p.comments.find(x=>x.id===commentId); if (!c) return;
    c.likes = (c.likes||0) + 1; save('social', socialPosts);
    io.emit('social-comment-liked', { postId, commentId, likes: c.likes });
  });
  socket.on('social-delete-post', ({ postId, author }) => {
    const i = socialPosts.findIndex(p=>p.id===postId&&p.author===author); if (i===-1) return;
    socialPosts.splice(i,1); save('social', socialPosts);
    io.emit('social-post-deleted', { postId });
  });

  // ── Friends ───────────────────────────────────
  socket.on('friend-request', ({ from, to }) => {
    const fF=ensureFriends(from), fT=ensureFriends(to);
    if (!fF.friends.includes(to) && !fF.pending.includes(to)) {
      fF.pending.push(to); fT.received.push(from); save('friends', friends);
      io.emit('friend-request-sent', { from, to });
    }
  });
  socket.on('friend-accept', ({ username, from }) => {
    const fU=ensureFriends(username), fF=ensureFriends(from);
    fU.received=fU.received.filter(u=>u!==from); fF.pending=fF.pending.filter(u=>u!==username);
    if (!fU.friends.includes(from)) fU.friends.push(from);
    if (!fF.friends.includes(username)) fF.friends.push(username);
    save('friends', friends); io.emit('friend-accepted', { username, from });
  });
  socket.on('friend-reject', ({ username, from }) => {
    const fU=ensureFriends(username), fF=ensureFriends(from);
    fU.received=fU.received.filter(u=>u!==from); fF.pending=fF.pending.filter(u=>u!==username);
    save('friends', friends);
  });
  socket.on('friend-remove', ({ username, other }) => {
    const fU=ensureFriends(username), fO=ensureFriends(other);
    fU.friends=fU.friends.filter(u=>u!==other); fO.friends=fO.friends.filter(u=>u!==username);
    save('friends', friends); io.emit('friend-removed', { username, other });
  });
  socket.on('get-friends', ({ username }) => socket.emit('friends-data', ensureFriends(username)));

  // ── Profile Comments ──────────────────────────
  socket.on('profile-comment-add', ({ targetUsername, author, body }) => {
    const tb=(body||'').trim();
    if (!tb||tb.length>500) return socket.emit('profile-comment-error', { message: 'Comment must be 1–500 chars.' });
    if (!profileComments[targetUsername]) profileComments[targetUsername]=[];
    const c={ id:uuidv4(), author:author||'Anon', body:tb, likes:[], createdAt:new Date().toISOString() };
    profileComments[targetUsername].unshift(c);
    if (profileComments[targetUsername].length>200) profileComments[targetUsername].pop();
    save('profileComments', profileComments);
    io.emit('profile-comment-added', { targetUsername, comment: c });
  });
  socket.on('profile-comment-like', ({ targetUsername, commentId }) => {
    const list=profileComments[targetUsername]||[];
    const c=list.find(x=>x.id===commentId); if (!c) return;
    const i=c.likes.indexOf(socket.id);
    if (i>-1) c.likes.splice(i,1); else c.likes.push(socket.id);
    save('profileComments', profileComments);
    io.emit('profile-comment-liked', { targetUsername, commentId, likes: c.likes.length });
  });
  socket.on('profile-comment-delete', ({ targetUsername, commentId, author }) => {
    if (!profileComments[targetUsername]) return;
    const i=profileComments[targetUsername].findIndex(c=>c.id===commentId&&c.author===author);
    if (i===-1) return;
    profileComments[targetUsername].splice(i,1); save('profileComments', profileComments);
    io.emit('profile-comment-deleted', { targetUsername, commentId });
  });

  // ── Matchmaking ───────────────────────────────
  socket.on('join-queue', async ({ username, theme, customTopic }) => {
    socket.username = username;
    socket.role = 'debater';
    socket.theme = theme || 'default';
    socket.customTopic = customTopic || null;
    socket.queueJoinedAt = Date.now();

    if (waitingQueue.find(s => s.id === socket.id)) return;

    let oppIndex = -1;

    // 1. Match on exact custom topic if provided
    if (socket.customTopic) {
      oppIndex = waitingQueue.findIndex(s => s.customTopic === socket.customTopic);
    }

    // 2. Match on same theme (and no custom topic, unless it falls back)
    if (oppIndex === -1) {
      oppIndex = waitingQueue.findIndex(s => s.theme === socket.theme && !s.customTopic);
    }

    // 3. Fallback: match with anyone who has been waiting in queue for more than 5 seconds
    if (oppIndex === -1) {
      const now = Date.now();
      oppIndex = waitingQueue.findIndex(s => (now - s.queueJoinedAt) > 5000);
    }

    if (oppIndex > -1) {
      const opp = waitingQueue.splice(oppIndex, 1)[0];
      const roomId = uuidv4();
      
      const finalTheme = opp.theme === socket.theme ? socket.theme : (opp.theme || socket.theme || 'default');
      
      let finalTopic = '';
      if (opp.customTopic && socket.customTopic && opp.customTopic === socket.customTopic) {
        finalTopic = socket.customTopic;
      } else if (opp.customTopic) {
        finalTopic = opp.customTopic;
      } else if (socket.customTopic) {
        finalTopic = socket.customTopic;
      } else {
        finalTopic = await pickThemeTopic(finalTheme);
      }

      rooms[roomId] = {
        id: roomId,
        topic: finalTopic,
        debaters: [opp, socket],
        spectators: [],
        votes: { [opp.id]: 0, [socket.id]: 0 },
        votedSockets: new Set(),
        phase: 'debating',
        startedAt: Date.now(),
        debaterNames: { [opp.id]: opp.username, [socket.id]: socket.username },
        timerHandle: null,
        tournamentMatchId: null,
        theme: finalTheme
      };

      opp.join(roomId);
      socket.join(roomId);

      const rd = {
        roomId,
        topic: finalTopic,
        debaterA: { id: opp.id, username: opp.username },
        debaterB: { id: socket.id, username: socket.username },
        theme: finalTheme
      };

      opp.emit('match-found', { ...rd, myRole: 'debaterA' });
      socket.emit('match-found', { ...rd, myRole: 'debaterB' });
      io.emit('room-opened', rd);
      startDebateTimer(roomId);
    } else {
      waitingQueue.push(socket);
      socket.emit('waiting-for-opponent');
    }
  });
  socket.on('leave-queue', () => {
    const i=waitingQueue.indexOf(socket); if (i>-1) waitingQueue.splice(i,1);
    socket.emit('left-queue');
  });
  socket.on('spectate-room', ({ roomId, username }) => {
    socket.username=username; socket.role='spectator';
    const room=rooms[roomId]; if (!room) return socket.emit('room-not-found');
    room.spectators.push(socket); socket.join(roomId);
    socket.emit('spectate-joined',{
      roomId, topic:room.topic,
      debaterA:{id:room.debaters[0].id,username:room.debaters[0].username},
      debaterB:{id:room.debaters[1].id,username:room.debaters[1].username},
      votes:room.votes, phase:room.phase,
      theme:room.theme || 'default',
    });
    io.to(roomId).emit('spectator-count',{count:room.spectators.length});
  });
  socket.on('get-rooms', () => {
    socket.emit('rooms-list', Object.values(rooms).filter(r=>r.phase!=='closed').map(r=>({
      roomId:r.id, topic:r.topic,
      debaterA:{id:r.debaters[0].id,username:r.debaters[0].username},
      debaterB:{id:r.debaters[1].id,username:r.debaters[1].username},
      spectatorCount:r.spectators.length, phase:r.phase,
      theme:r.theme || 'default',
    })));
  });
  socket.on('signal', ({ to, signal }) => io.to(to).emit('signal', { from:socket.id, signal }));
  socket.on('chat-message', ({ roomId, message }) => {
    const room=rooms[roomId]; if (!room) return;
    io.to(roomId).emit('chat-message',{from:socket.username||'Anon',message,timestamp:Date.now(),role:socket.role});
  });
  socket.on('cast-vote', ({ roomId, targetId }) => {
    const room=rooms[roomId];
    if (!room||room.phase!=='voting'||room.votedSockets.has(socket.id)) return;
    room.votedSockets.add(socket.id);
    if (room.votes[targetId]!==undefined) room.votes[targetId]++;
    io.to(roomId).emit('vote-update',{votes:room.votes});
  });
  socket.on('send-tip', ({ roomId, targetId, amount, tier }) => {
    const room=rooms[roomId]; if (!room) return;
    const targetName=room.debaterNames[targetId];
    // Deduct OC from tipper, add to target
    if (socket.username && targetName) {
      const tipOC = tier==='gold' ? 50 : tier==='silver' ? 20 : 5;
      const w = ensureWallet(socket.username);
      if (w.balance >= tipOC) {
        transfer(socket.username, targetName, tipOC, 'tip', `Tip in debate: ${room.topic}`);
        io.emit('wallet-update', { username: socket.username, balance: wallets[socket.username]?.balance });
        io.emit('wallet-update', { username: targetName,      balance: wallets[targetName]?.balance });
      }
      updateLeaderboard(targetName, { tipAmount: amount });
    }
    io.to(roomId).emit('tip-received',{from:socket.username||'Anon',targetId,targetName,amount,tier});
    io.emit('leaderboard-update', getLeaderboard());
  });
  socket.on('end-debate', ({ roomId }) => {
    const room=rooms[roomId];
    if (room&&room.phase==='debating') transitionToVoting(roomId);
  });

  // ── Topics ────────────────────────────────────
  socket.on('submit-topic', ({ text, submittedBy }) => {
    const t=(text||'').trim();
    if (!t||t.length<10||t.length>200) return socket.emit('topic-submission-error',{message:'Topic must be 10–200 chars.'});
    const topic={ id:uuidv4(), text:t, submittedBy:submittedBy||'Anon', upvotes:0, downvotes:0, voters:[], status:'pending', createdAt:new Date().toISOString() };
    topics.unshift(topic); save('topics', topics);
    io.emit('topic-submitted', topic);
    socket.emit('topic-submission-success',{topic});
  });
  socket.on('vote-topic', ({ topicId, vote }) => {
    const topic=topics.find(t=>t.id===topicId); if (!topic) return;
    if (topic.voters.includes(socket.id)) return socket.emit('topic-vote-error',{message:'Already voted.'});
    topic.voters.push(socket.id);
    if (vote==='up') topic.upvotes++; else topic.downvotes++;
    if (topic.upvotes>=5&&topic.status==='pending')  { topic.status='approved'; io.emit('topic-status-changed',{topicId,status:'approved',topic}); }
    if (topic.downvotes>=10&&topic.status==='pending') { topic.status='rejected'; io.emit('topic-status-changed',{topicId,status:'rejected',topic}); }
    save('topics', topics);
    io.emit('topic-vote-update',{topicId,upvotes:topic.upvotes,downvotes:topic.downvotes,status:topic.status});
  });

  // ── Forum ─────────────────────────────────────
  socket.on('forum-create-post', ({ topicId, title, body, author }) => {
    const tt=(title||'').trim(), tb=(body||'').trim();
    if (!tt||tt.length<3) return socket.emit('forum-error',{message:'Title too short.'});
    if (!tb||tb.length<10) return socket.emit('forum-error',{message:'Body too short.'});
    const post={ id:uuidv4(), topicId:topicId||null, title:tt, body:tb, author:author||'Anon', likes:0, replies:[], createdAt:new Date().toISOString() };
    forumPosts.unshift(post); save('forum', forumPosts);
    io.emit('forum-post-created', post);
  });
  socket.on('forum-like-post', ({ postId }) => {
    const p=forumPosts.find(x=>x.id===postId); if (!p) return;
    p.likes=(p.likes||0)+1; save('forum', forumPosts);
    io.emit('forum-post-liked',{postId,likes:p.likes});
  });
  socket.on('forum-reply', ({ postId, body, author }) => {
    const p=forumPosts.find(x=>x.id===postId); if (!p) return;
    const tb=(body||'').trim(); if (!tb) return;
    const r={ id:uuidv4(), author:author||'Anon', body:tb, likes:0, createdAt:new Date().toISOString() };
    p.replies.push(r); save('forum', forumPosts);
    io.emit('forum-reply-created',{postId,reply:r});
  });
  socket.on('forum-like-reply', ({ postId, replyId }) => {
    const p=forumPosts.find(x=>x.id===postId); if (!p) return;
    const r=p.replies.find(x=>x.id===replyId); if (!r) return;
    r.likes=(r.likes||0)+1; save('forum', forumPosts);
    io.emit('forum-reply-liked',{postId,replyId,likes:r.likes});
  });
  socket.on('forum-delete-post', ({ postId, author }) => {
    const i=forumPosts.findIndex(p=>p.id===postId&&p.author===author); if (i===-1) return;
    forumPosts.splice(i,1); save('forum', forumPosts);
    io.emit('forum-post-deleted',{postId});
  });

  // ── Disconnect ────────────────────────────────
  socket.on('disconnect', () => {
    const qi=waitingQueue.indexOf(socket); if (qi>-1) waitingQueue.splice(qi,1);
    for (const [roomId,room] of Object.entries(rooms)) {
      if (room.debaters.find(d=>d.id===socket.id)) {
        io.to(roomId).emit('debater-disconnected',{username:socket.username});
        if (room.timerHandle) clearTimeout(room.timerHandle);

        // For tournament matches, award win to the remaining player
        if (room.tournamentMatchId) {
          const remainingDebater = room.debaters.find(d => d.id !== socket.id);
          const winnerName = remainingDebater ? remainingDebater.username : null;
          const winnerId = remainingDebater ? remainingDebater.id : null;
          const t = tournaments.find(x => x.bracket.flat().find(m => m.id === room.tournamentMatchId));
          if (t && winnerName) {
            advanceTournament(t, room.tournamentMatchId, winnerId, winnerName);
          }
        }

        closeRoom(roomId); break;
      }
      const si=room.spectators.findIndex(s=>s.id===socket.id);
      if (si>-1) { room.spectators.splice(si,1); io.to(roomId).emit('spectator-count',{count:room.spectators.length}); }
    }
  });
});

// ─── Room lifecycle ────────────────────────────
function startDebateTimer(roomId) {
  const room=rooms[roomId]; if (!room) return;
  room.timerHandle=setTimeout(()=>transitionToVoting(roomId,60000), 5*60*1000);
}
function transitionToVoting(roomId, dur=60000) {
  const room=rooms[roomId]; if (!room) return;
  room.phase='voting';
  io.to(roomId).emit('phase-change',{phase:'voting',duration:dur});
  setTimeout(()=>endDebate(roomId), dur);
}
function endDebate(roomId) {
  const room=rooms[roomId]; if (!room) return;
  room.phase='results';
  const [dA,dB]=room.debaters;
  const vA=room.votes[dA.id]||0, vB=room.votes[dB.id]||0;
  let winnerId=null, loserId=null;
  if (vA>vB) { winnerId=dA.id; loserId=dB.id; }
  else if (vB>vA) { winnerId=dB.id; loserId=dA.id; }
  else if (room.tournamentMatchId) {
    // Tiebreaker for tournament matches to avoid getting stuck
    if (Math.random() > 0.5) { winnerId=dA.id; loserId=dB.id; }
    else { winnerId=dB.id; loserId=dA.id; }
  }
  const winnerName=winnerId?room.debaterNames[winnerId]:null;
  const loserName =loserId ?room.debaterNames[loserId] :null;
  if (winnerName) {
    updateLeaderboard(winnerName,{win:true});
    mint(winnerName, 25, `Won debate: ${room.topic}`);
    io.emit('wallet-update',{username:winnerName,balance:wallets[winnerName]?.balance});
  }
  if (loserName)  updateLeaderboard(loserName,{loss:true});
  [dA,dB].forEach(d=>{ if (!leaderboard[d.username]) { leaderboard[d.username]={wins:0,losses:0,tips:0,score:0}; save('leaderboard',leaderboard); }});

  // Handle tournament match outcome
  if (room.tournamentMatchId) {
    const t=tournaments.find(x=>x.bracket.flat().find(m=>m.id===room.tournamentMatchId));
    if (t) advanceTournament(t, room.tournamentMatchId, winnerId, winnerName);
  }

  io.to(roomId).emit('debate-ended',{winnerId,winnerName,loserId,loserName,votes:room.votes,isTie:!winnerId});
  io.emit('leaderboard-update', getLeaderboard());
  io.emit('room-closed',{roomId});
  setTimeout(()=>closeRoom(roomId), 10000);
}
function closeRoom(roomId) {
  const room=rooms[roomId]; if (!room) return;
  room.phase='closed'; delete rooms[roomId];
}

// ─── Tournament lifecycle ──────────────────────
function startTournament(t) {
  t.status='in_progress';
  t.bracket=buildBracket(t.players);
  save('tournaments', tournaments);
  io.emit('tournament-started', t);
  console.log(`[Tournament] Started: "${t.name}"`);
}

function advanceTournament(t, matchId, winnerId, winnerName) {
  let matchRoundIndex = -1;
  let matchIndex = -1;

  // Find match and mark winner
  for (let r = 0; r < t.bracket.length; r++) {
    const idx = t.bracket[r].findIndex(m => m.id === matchId);
    if (idx !== -1) {
      t.bracket[r][idx].winner = winnerName;
      matchRoundIndex = r;
      matchIndex = idx;
      break;
    }
  }

  // If found, propagate winner to the next round's match
  if (matchRoundIndex !== -1 && matchRoundIndex + 1 < t.bracket.length) {
    const nextRound = t.bracket[matchRoundIndex + 1];
    const nextMatch = nextRound.find(m => m.playerA === matchId || m.playerB === matchId);
    if (nextMatch) {
      if (nextMatch.playerA === matchId) nextMatch.playerA = winnerName;
      if (nextMatch.playerB === matchId) nextMatch.playerB = winnerName;
    }
  }

  // Settle bets for this match
  if (winnerId) settleBets(t, matchId, winnerId, winnerName);

  // Check if final round's match is done
  const finalRound = t.bracket[t.bracket.length - 1];
  const finalMatch = finalRound ? finalRound[0] : null;

  if (finalMatch && finalMatch.winner) {
    // Tournament complete
    t.status = 'complete';
    t.winner = finalMatch.winner;
    // Award prize pool to winner
    if (t.winner && t.prizePool > 0) {
      mint(t.winner, t.prizePool, `Tournament winner: ${t.name}`);
      io.emit('wallet-update', { username: t.winner, balance: wallets[t.winner]?.balance });
    }
    io.emit('tournament-complete', { tournament: t, winner: t.winner });
    console.log(`[Tournament] Complete: "${t.name}" winner: ${t.winner}`);
  }
  save('tournaments', tournaments);
  io.emit('tournament-updated', t);
}

// ─── Start ──────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`\n🌴 UnitedOasis Server → http://localhost:${PORT}  [${IS_VERCEL ? 'Vercel/in-memory' : 'Local/disk'}]\n`));
