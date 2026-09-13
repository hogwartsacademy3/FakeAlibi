const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();

const cases = [
  { scenario: "Kucing Anggora tetangga dicukur sampai botak jam 10 malam.", words: ["jas hujan","onde-onde","knalpot"] },
  { scenario: "Patung taman kompleks ditemukan memakai sandal jepit milik satpam.", words: ["popcorn","payung","kalkulator"] },
  { scenario: "Sepeda tetangga hilang, tetapi belnya ditemukan di dalam kulkas.", words: ["sushi","parfum","charger"] },
  { scenario: "Tanaman hias ketua RT tiba-tiba dipindahkan ke halte bus.", words: ["donat","kacamata","ember"] },
  { scenario: "Jam dinding sekolah berhenti tepat saat seseorang menaruh mi instan di ruang guru.", words: ["layangan","senter","bakso"] }
];

function makeCode() {
  let code;
  do code = Math.random().toString(36).slice(2, 6).toUpperCase();
  while (rooms.has(code));
  return code;
}

function publicRoom(room) {
  return {
    code: room.code,
    players: room.players.map(p => ({ id: p.id, name: p.name, score: p.score })),
    phase: room.phase,
    scenario: room.scenario,
    suspectId: room.suspectId,
    timeLeft: room.timeLeft
  };
}

function sendState(room) {
  io.to(room.code).emit("state", publicRoom(room));
  room.players.forEach(p => {
    io.to(p.id).emit("private", {
      role: p.id === room.suspectId ? "suspect" : "detective",
      secretWords: p.id === room.suspectId ? room.secretWords : []
    });
  });
}

function clearTimer(room) {
  if (room.timer) clearInterval(room.timer);
  room.timer = null;
}

function startPhase(room, phase, seconds) {
  clearTimer(room);
  room.phase = phase;
  room.timeLeft = seconds;
  sendState(room);
  room.timer = setInterval(() => {
    room.timeLeft--;
    io.to(room.code).emit("tick", room.timeLeft);
    if (room.timeLeft <= 0) {
      clearTimer(room);
      if (room.phase === "prep") {
        startPhase(room, "interrogation", 90);
      } else if (room.phase === "interrogation") {
        room.phase = "guess";
        room.timeLeft = 0;
        sendState(room);
      }
    }
  }, 1000);
}

function newRound(room) {
  if (room.players.length < 2) return;
  const c = cases[Math.floor(Math.random() * cases.length)];
  room.scenario = c.scenario;
  room.secretWords = [...c.words];
  room.suspectId = room.players[Math.floor(Math.random() * room.players.length)].id;
  room.messages = [];
  room.guesses = {};
  startPhase(room, "prep", 20);
}

io.on("connection", socket => {
  socket.on("createRoom", ({ name }) => {
    const code = makeCode();
    const room = { code, players: [], phase: "lobby", scenario: "", secretWords: [], suspectId: null, messages: [], guesses: {}, timeLeft: 0, timer: null };
    rooms.set(code, room);
    room.players.push({ id: socket.id, name: String(name || "Player").slice(0, 20), score: 0 });
    socket.join(code);
    socket.emit("joined", code);
    sendState(room);
  });

  socket.on("joinRoom", ({ code, name }) => {
    const room = rooms.get(String(code || "").toUpperCase());
    if (!room || room.phase !== "lobby" || room.players.length >= 8) return socket.emit("errorMsg", "Room tidak tersedia atau sudah dimulai.");
    room.players.push({ id: socket.id, name: String(name || "Player").slice(0, 20), score: 0 });
    socket.join(room.code);
    socket.emit("joined", room.code);
    sendState(room);
  });

  socket.on("startGame", code => {
    const room = rooms.get(code);
    if (room && room.players.length >= 2 && room.phase === "lobby") newRound(room);
  });

  socket.on("chat", ({ code, text }) => {
    const room = rooms.get(code);
    if (!room || room.phase !== "interrogation") return;
    const p = room.players.find(x => x.id === socket.id);
    if (!p || !String(text).trim()) return;
    const message = { name: p.name, text: String(text).slice(0, 400), at: Date.now() };
    room.messages.push(message);
    io.to(code).emit("chat", message);
  });

  socket.on("submitGuess", ({ code, guesses }) => {
    const room = rooms.get(code);
    if (!room || room.phase !== "guess") return;
    if (socket.id === room.suspectId) return;
    room.guesses[socket.id] = guesses.map(x => String(x || "").trim().toLowerCase());
    const detectives = room.players.filter(p => p.id !== room.suspectId);
    if (Object.keys(room.guesses).length >= detectives.length) {
      let found = 0;
      detectives.forEach(p => {
        const gs = room.guesses[p.id] || [];
        const score = room.secretWords.reduce((n, w) => n + (gs.includes(w.toLowerCase()) ? 1 : 0), 0);
        p.score += score;
        found += score;
      });
      const suspect = room.players.find(p => p.id === room.suspectId);
      if (suspect) suspect.score += room.secretWords.length * detectives.length - found;
      room.phase = "reveal";
      sendState(room);
      io.to(code).emit("reveal", { words: room.secretWords, guesses: room.guesses, suspectId: room.suspectId });
    }
  });

  socket.on("nextRound", code => {
    const room = rooms.get(code);
    if (room && room.phase === "reveal") newRound(room);
  });

  socket.on("disconnect", () => {
    for (const [code, room] of rooms) {
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        room.players.splice(idx, 1);
        if (room.players.length < 2) clearTimer(room);
        if (room.players.length === 0) rooms.delete(code);
        else {
          if (room.suspectId === socket.id) room.suspectId = null;
          sendState(room);
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Fake Alibi running on port ${PORT}`));
