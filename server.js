const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  transports: ['websocket', 'polling']
});

// MongoDB Atlas Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://xox:xoxadmin@xox.er1hgnl.mongodb.net/xox_game?retryWrites=true&w=majority';
const JWT_SECRET = process.env.JWT_SECRET || 'xox-super-secret-key-2026-render';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB Atlas baglantisi basarili'))
.catch(err => {
  console.error('MongoDB hatasi:', err);
  process.exit(1);
});

// Schemas
const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  avatar: { type: String, default: 'https://cdn-icons-png.flaticon.com/512/149/149071.png' },
  rating: { type: Number, default: 1200 },
  points: { type: Number, default: 0 },
  winStreak: { type: Number, default: 0 },
  gamesPlayed: { type: Number, default: 0 },
  gamesWon: { type: Number, default: 0 },
  gamesLost: { type: Number, default: 0 },
  gamesDraw: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const GameSchema = new mongoose.Schema({
  roomCode: String,
  players: [{ username: String, rating: Number, symbol: String }],
  moves: [{ player: String, position: Number, timestamp: Date }],
  winner: String,
  rounds: { total: Number, current: Number },
  scores: { X: Number, O: Number },
  ratingChanges: [{ username: String, change: Number }],
  createdAt: { type: Date, default: Date.now }
});

const RoomSchema = new mongoose.Schema({
  code: { type: String, unique: true },
  host: String,
  players: [{ username: String, socketId: String, ready: Boolean, symbol: String }],
  status: { type: String, enum: ['waiting', 'playing', 'finished'], default: 'waiting' },
  totalRounds: { type: Number, default: 1 },
  currentRound: { type: Number, default: 1 },
  scores: { X: Number, O: Number },
  board: [{ type: String, default: '' }],
  currentTurn: { type: String, default: 'X' },
  messages: [{ username: String, text: String, timestamp: Date }],
  chatEnabled: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Game = mongoose.model('Game', GameSchema);
const Room = mongoose.model('Room', RoomSchema);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// JWT Middleware
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token gerekli' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Gecersiz token' });
  }
};

// ELO Rating Calculation
function calculateElo(winnerRating, loserRating, isDraw = false) {
  const K = winnerRating < 2100 ? 32 : winnerRating < 2400 ? 24 : 16;
  const expectedWinner = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
  const expectedLoser = 1 / (1 + Math.pow(10, (winnerRating - loserRating) / 400));

  let winnerChange, loserChange;

  if (isDraw) {
    winnerChange = K * (0.5 - expectedWinner);
    loserChange = K * (0.5 - expectedLoser);
  } else {
    winnerChange = K * (1 - expectedWinner);
    loserChange = K * (0 - expectedLoser);
  }

  return { winnerChange, loserChange };
}

// Win Streak Bonus
function calculateWinStreakBonus(basePoints, winStreak) {
  const multiplier = Math.min(1 + (winStreak * 0.1), 1.5);
  return Math.round(basePoints * multiplier);
}

// Random Room Code
function generateRoomCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

// Winner Check
function checkWinner(board) {
  const lines = [
    [0,1,2], [3,4,5], [6,7,8],
    [0,3,6], [1,4,7], [2,5,8],
    [0,4,8], [2,4,6]
  ];
  for (let [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return board.includes('') ? null : 'draw';
}

// Auth Routes
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, avatar } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ 
      username, 
      password: hashedPassword,
      avatar: avatar || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'
    });
    await user.save();
    const token = jwt.sign({ userId: user._id, username }, JWT_SECRET);
    res.json({ token, user: { username, rating: 1200, points: 0, avatar: user.avatar } });
  } catch (err) {
    res.status(400).json({ error: 'Kullanici adi alinmis' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(401).json({ error: 'Gecersiz bilgiler' });
    }
    const token = jwt.sign({ userId: user._id, username }, JWT_SECRET);
    res.json({ 
      token, 
      user: { 
        username, 
        rating: user.rating, 
        points: user.points,
        avatar: user.avatar,
        winStreak: user.winStreak,
        stats: {
          played: user.gamesPlayed,
          won: user.gamesWon,
          lost: user.gamesLost,
          draw: user.gamesDraw
        }
      } 
    });
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatasi' });
  }
});

app.get('/api/me', authenticate, async (req, res) => {
  const user = await User.findById(req.user.userId);
  res.json({
    username: user.username,
    rating: user.rating,
    points: user.points,
    avatar: user.avatar,
    winStreak: user.winStreak,
    stats: {
      played: user.gamesPlayed,
      won: user.gamesWon,
      lost: user.gamesLost,
      draw: user.gamesDraw
    }
  });
});

app.get('/api/leaderboard', async (req, res) => {
  const users = await User.find().sort({ rating: -1 }).limit(50);
  res.json(users.map(u => ({
    username: u.username,
    rating: u.rating,
    points: u.points,
    avatar: u.avatar,
    winStreak: u.winStreak
  })));
});

// Socket.IO Events
const activeUsers = new Map();
const matchmakingQueue = [];

io.on('connection', (socket) => {
  console.log('Yeni baglanti:', socket.id);

  socket.on('authenticate', async (token) => {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.userId);
      if (user) {
        activeUsers.set(socket.id, {
          username: user.username,
          rating: user.rating,
          avatar: user.avatar,
          socketId: socket.id
        });
        socket.username = user.username;
        socket.emit('authenticated', {
          username: user.username,
          rating: user.rating,
          points: user.points,
          avatar: user.avatar
        });

        socket.join('global');
        io.to('global').emit('userJoined', {
          username: user.username,
          avatar: user.avatar,
          rating: user.rating
        });
      }
    } catch (err) {
      socket.emit('authError', 'Gecersiz token');
    }
  });

  socket.on('createRoom', async ({ totalRounds }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return socket.emit('error', 'Giris yapmalisiniz');

    const code = generateRoomCode();
    const room = new Room({
      code,
      host: user.username,
      players: [{
        username: user.username,
        socketId: socket.id,
        ready: false,
        symbol: 'X'
      }],
      totalRounds: totalRounds || 1,
      scores: { X: 0, O: 0 },
      board: Array(9).fill(''),
      messages: []
    });
    await room.save();

    socket.join(code);
    socket.emit('roomCreated', { code, room: await getRoomData(code) });
  });

  socket.on('joinRoom', async (code) => {
    const user = activeUsers.get(socket.id);
    if (!user) return socket.emit('error', 'Giris yapmalisiniz');

    const room = await Room.findOne({ code, status: 'waiting' });
    if (!room) return socket.emit('error', 'Oda bulunamadi veya dolu');
    if (room.players.length >= 2) return socket.emit('error', 'Oda dolu');

    room.players.push({
      username: user.username,
      socketId: socket.id,
      ready: false,
      symbol: 'O'
    });
    await room.save();

    socket.join(code);
    socket.to(code).emit('playerJoined', {
      username: user.username,
      avatar: user.avatar,
      rating: user.rating
    });

    io.to(code).emit('roomUpdate', await getRoomData(code));
  });

  socket.on('toggleReady', async (code) => {
    const room = await Room.findOne({ code });
    if (!room) return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (player) {
      player.ready = !player.ready;
      await room.save();
      io.to(code).emit('roomUpdate', await getRoomData(code));

      if (room.players.length === 2 && room.players.every(p => p.ready)) {
        room.status = 'playing';
        room.currentTurn = 'X';
        await room.save();
        io.to(code).emit('gameStart', {
          room: await getRoomData(code),
          message: 'Oyun basliyor! X baslar.'
        });
      }
    }
  });

  socket.on('makeMove', async ({ code, position }) => {
    const room = await Room.findOne({ code, status: 'playing' });
    if (!room) return;

    const user = activeUsers.get(socket.id);
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || player.symbol !== room.currentTurn) return;
    if (room.board[position] !== '') return;

    room.board[position] = player.symbol;
    const winner = checkWinner(room.board);

    if (winner) {
      if (winner !== 'draw') {
        room.scores[winner]++;
      }

      const maxScore = Math.ceil(room.totalRounds / 2);
      const gameWinner = room.scores.X >= maxScore ? 'X' : 
                        room.scores.O >= maxScore ? 'O' : null;

      if (gameWinner || room.currentRound >= room.totalRounds) {
        await finishGame(room, gameWinner || winner);
      } else {
        room.currentRound++;
        room.board = Array(9).fill('');
        room.currentTurn = 'X';
        await room.save();
        io.to(code).emit('roundEnd', {
          winner: winner === 'draw' ? 'Berabere' : winner,
          scores: room.scores,
          currentRound: room.currentRound,
          totalRounds: room.totalRounds,
          message: `Tur ${room.currentRound} basliyor!`
        });
      }
    } else {
      room.currentTurn = room.currentTurn === 'X' ? 'O' : 'X';
      await room.save();
      io.to(code).emit('moveMade', {
        position,
        symbol: player.symbol,
        nextTurn: room.currentTurn,
        board: room.board
      });
    }
  });

  socket.on('sendMessage', async ({ code, text }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;

    const message = {
      username: user.username,
      text,
      timestamp: new Date()
    };

    if (code) {
      const room = await Room.findOne({ code });
      if (room) {
        room.messages.push(message);
        await room.save();
        io.to(code).emit('newMessage', message);
      }
    } else {
      io.to('global').emit('newMessage', {
        ...message,
        time: new Date().toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul' })
      });
    }
  });

  socket.on('quickMatch', async ({ totalRounds }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;

    let opponent = null;
    let searchRange = 200;

    while (!opponent && searchRange <= 1000) {
      opponent = matchmakingQueue.find(p => 
        p.socketId !== socket.id && 
        Math.abs(p.rating - user.rating) <= searchRange &&
        p.totalRounds === totalRounds
      );
      if (!opponent) searchRange += 100;
    }

    if (opponent) {
      matchmakingQueue.splice(matchmakingQueue.indexOf(opponent), 1);
      const code = generateRoomCode();
      const room = new Room({
        code,
        host: user.username,
        players: [
          { username: user.username, socketId: socket.id, ready: true, symbol: 'X' },
          { username: opponent.username, socketId: opponent.socketId, ready: true, symbol: 'O' }
        ],
        status: 'playing',
        totalRounds,
        currentRound: 1,
        scores: { X: 0, O: 0 },
        board: Array(9).fill(''),
        currentTurn: 'X',
        messages: []
      });
      await room.save();

      socket.join(code);
      io.sockets.sockets.get(opponent.socketId)?.join(code);

      io.to(code).emit('matchFound', {
        code,
        opponent: opponent.username,
        room: await getRoomData(code)
      });

      io.to(code).emit('gameStart', {
        room: await getRoomData(code),
        message: 'Eslesme bulundu! Oyun basliyor.'
      });
    } else {
      matchmakingQueue.push({
        socketId: socket.id,
        username: user.username,
        rating: user.rating,
        totalRounds,
        timestamp: Date.now()
      });
      socket.emit('searchingMatch', 'Eslesme araniyor...');
    }
  });

  socket.on('cancelMatch', () => {
    const index = matchmakingQueue.findIndex(p => p.socketId === socket.id);
    if (index !== -1) {
      matchmakingQueue.splice(index, 1);
      socket.emit('matchCancelled', 'Eslesme aramasi iptal edildi');
    }
  });

  socket.on('leaveRoom', async (code) => {
    const room = await Room.findOne({ code });
    if (room) {
      room.players = room.players.filter(p => p.socketId !== socket.id);
      if (room.players.length === 0) {
        await Room.deleteOne({ code });
      } else {
        await room.save();
        socket.to(code).emit('playerLeft', socket.username);
        io.to(code).emit('roomUpdate', await getRoomData(code));
      }
    }
    socket.leave(code);
  });

  socket.on('disconnect', async () => {
    const user = activeUsers.get(socket.id);
    if (user) {
      const rooms = await Room.find({ 'players.socketId': socket.id });
      for (const room of rooms) {
        room.players = room.players.filter(p => p.socketId !== socket.id);
        if (room.players.length === 0) {
          await Room.deleteOne({ _id: room._id });
        } else {
          await room.save();
          io.to(room.code).emit('playerLeft', user.username);
          io.to(room.code).emit('roomUpdate', await getRoomData(room.code));
        }
      }

      const matchIndex = matchmakingQueue.findIndex(p => p.socketId === socket.id);
      if (matchIndex !== -1) matchmakingQueue.splice(matchIndex, 1);

      activeUsers.delete(socket.id);
      io.to('global').emit('userLeft', user.username);
    }
  });
});

async function finishGame(room, winner) {
  const gameRecord = new Game({
    roomCode: room.code,
    players: room.players.map(p => ({
      username: p.username,
      rating: activeUsers.get(p.socketId)?.rating || 1200,
      symbol: p.symbol
    })),
    winner: winner === 'draw' ? 'Berabere' : winner,
    rounds: { total: room.totalRounds, current: room.currentRound },
    scores: room.scores
  });

  const playerX = room.players.find(p => p.symbol === 'X');
  const playerO = room.players.find(p => p.symbol === 'O');
  const userX = await User.findOne({ username: playerX.username });
  const userO = await User.findOne({ username: playerO.username });

  let ratingChangeX = 0, ratingChangeO = 0;

  if (winner === 'X') {
    const { winnerChange, loserChange } = calculateElo(userX.rating, userO.rating);
    ratingChangeX = winnerChange;
    ratingChangeO = loserChange;

    userX.winStreak++;
    userO.winStreak = 0;

    const basePoints = 10 * room.totalRounds;
    const bonusPoints = calculateWinStreakBonus(basePoints, userX.winStreak);

    userX.points += bonusPoints;
    userX.gamesWon++;
    userO.gamesLost++;

    gameRecord.ratingChanges = [
      { username: userX.username, change: Math.round(ratingChangeX) },
      { username: userO.username, change: Math.round(ratingChangeO) }
    ];

  } else if (winner === 'O') {
    const { winnerChange, loserChange } = calculateElo(userO.rating, userX.rating);
    ratingChangeO = winnerChange;
    ratingChangeX = loserChange;

    userO.winStreak++;
    userX.winStreak = 0;

    const basePoints = 10 * room.totalRounds;
    const bonusPoints = calculateWinStreakBonus(basePoints, userO.winStreak);

    userO.points += bonusPoints;
    userO.gamesWon++;
    userX.gamesLost++;

    gameRecord.ratingChanges = [
      { username: userO.username, change: Math.round(ratingChangeO) },
      { username: userX.username, change: Math.round(ratingChangeX) }
    ];

  } else {
    const { winnerChange: drawX, loserChange: drawO } = calculateElo(userX.rating, userO.rating, true);
    ratingChangeX = drawX;
    ratingChangeO = drawO;

    userX.winStreak = 0;
    userO.winStreak = 0;
    userX.gamesDraw++;
    userO.gamesDraw++;

    gameRecord.ratingChanges = [
      { username: userX.username, change: Math.round(ratingChangeX) },
      { username: userO.username, change: Math.round(ratingChangeO) }
    ];
  }

  userX.rating += Math.round(ratingChangeX);
  userO.rating += Math.round(ratingChangeO);
  userX.gamesPlayed++;
  userO.gamesPlayed++;

  await userX.save();
  await userO.save();
  await gameRecord.save();

  room.status = 'finished';
  await room.save();

  const activeX = activeUsers.get(playerX.socketId);
  const activeO = activeUsers.get(playerO.socketId);
  if (activeX) activeX.rating = userX.rating;
  if (activeO) activeO.rating = userO.rating;

  io.to(room.code).emit('gameOver', {
    winner: winner === 'draw' ? 'Berabere' : winner,
    scores: room.scores,
    ratingChanges: gameRecord.ratingChanges,
    pointsEarned: winner === 'X' ? calculateWinStreakBonus(10 * room.totalRounds, userX.winStreak) :
                  winner === 'O' ? calculateWinStreakBonus(10 * room.totalRounds, userO.winStreak) : 0,
    finalStats: {
      X: { rating: userX.rating, points: userX.points, winStreak: userX.winStreak },
      O: { rating: userO.rating, points: userO.points, winStreak: userO.winStreak }
    }
  });
}

async function getRoomData(code) {
  const room = await Room.findOne({ code });
  if (!room) return null;

  return {
    code: room.code,
    host: room.host,
    players: room.players.map(p => ({
      username: p.username,
      ready: p.ready,
      symbol: p.symbol,
      avatar: activeUsers.get(p.socketId)?.avatar || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'
    })),
    status: room.status,
    totalRounds: room.totalRounds,
    currentRound: room.currentRound,
    scores: room.scores,
    board: room.board,
    currentTurn: room.currentTurn,
    messages: room.messages.slice(-50)
  };
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`XOX Server ${PORT} portunda calisiyor`);
  console.log(`Render.com deploy icin hazir`);
});
