require('dotenv').config()
const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const path = require('path')

const app = express()
const server = http.createServer(app)
const io = new Server(server, {
  cors: { origin: '*' }
})

// Serve static files
app.use(express.static(path.join(__dirname)))

// Pass env vars to client (only public ones)
app.get('/api/config', (req, res) => {
  res.json({
    SUPABASE_URL: process.env.SUPABASE_URL || '',
    SUPABASE_KEY: process.env.SUPABASE_KEY || ''
  })
})

// ─── Lobby & Game State ─────────────────────────────────────────────────────

const lobbies = new Map()   // lobbyId -> lobby object
const playerLobby = new Map() // socketId -> lobbyId

function generateLobbyId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

function broadcastLobbies() {
  const list = []
  for (const [id, lobby] of lobbies) {
    list.push({
      id,
      name: lobby.name,
      hostName: lobby.hostName,
      players: lobby.players.length,
      maxPlayers: 2,
      status: lobby.status // 'waiting' | 'countdown' | 'playing'
    })
  }
  io.emit('lobbies:list', list)
}

function createGameState(lobby) {
  return {
    players: {},
    timer: 60,
    timerInterval: null,
    status: 'countdown' // 'countdown' | 'fighting' | 'gameover'
  }
}

io.on('connection', (socket) => {
  console.log(`[+] Player connected: ${socket.id}`)

  // Send current lobby list on connect
  broadcastLobbies()

  // ── Request Lobby List ────────────────────────────────────
  socket.on('lobby:requestList', () => {
    const list = []
    for (const [id, lobby] of lobbies) {
      list.push({
        id,
        name: lobby.name,
        hostName: lobby.hostName,
        players: lobby.players.length,
        maxPlayers: 2,
        status: lobby.status
      })
    }
    socket.emit('lobbies:list', list)
  })

  // ── Create Lobby ──────────────────────────────────────────
  socket.on('lobby:create', ({ playerName, characterId, backgroundId }) => {
    // Remove from any existing lobby first
    leaveLobby(socket)

    const lobbyId = generateLobbyId()
    const lobby = {
      id: lobbyId,
      name: `${playerName}'s Lobby`,
      hostName: playerName,
      hostId: socket.id,
      status: 'waiting',
      backgroundId: backgroundId || 0,
      players: [
        {
          socketId: socket.id,
          name: playerName,
          characterId: characterId || 0,
          ready: true
        }
      ],
      gameState: null
    }

    lobbies.set(lobbyId, lobby)
    playerLobby.set(socket.id, lobbyId)
    socket.join(lobbyId)

    socket.emit('lobby:joined', {
      lobbyId,
      lobby: sanitizeLobby(lobby),
      playerIndex: 0
    })

    broadcastLobbies()
    console.log(`[Lobby] Created: ${lobbyId} by ${playerName}`)
  })

  // ── Join Lobby ────────────────────────────────────────────
  socket.on('lobby:join', ({ lobbyId, playerName, characterId }) => {
    const lobby = lobbies.get(lobbyId)
    if (!lobby) {
      socket.emit('lobby:error', 'Lobby not found')
      return
    }
    if (lobby.players.length >= 2) {
      socket.emit('lobby:error', 'Lobby is full')
      return
    }
    if (lobby.status !== 'waiting') {
      socket.emit('lobby:error', 'Game already in progress')
      return
    }

    // Remove from any existing lobby first
    leaveLobby(socket)

    lobby.players.push({
      socketId: socket.id,
      name: playerName,
      characterId: characterId || 1,
      ready: true
    })

    playerLobby.set(socket.id, lobbyId)
    socket.join(lobbyId)

    socket.emit('lobby:joined', {
      lobbyId,
      lobby: sanitizeLobby(lobby),
      playerIndex: 1
    })

    // Notify existing players
    socket.to(lobbyId).emit('lobby:playerJoined', {
      lobby: sanitizeLobby(lobby)
    })

    broadcastLobbies()
    console.log(`[Lobby] ${playerName} joined ${lobbyId}`)

    // If 2 players, start countdown
    if (lobby.players.length === 2) {
      startCountdown(lobbyId)
    }
  })

  // ── Update Character Selection ─────────────────────────────
  socket.on('lobby:updateCharacter', ({ characterId }) => {
    const lobbyId = playerLobby.get(socket.id)
    if (!lobbyId) return
    const lobby = lobbies.get(lobbyId)
    if (!lobby || lobby.status !== 'waiting') return

    const p = lobby.players.find(p => p.socketId === socket.id)
    if (p) {
      p.characterId = characterId
      io.to(lobbyId).emit('lobby:updated', { lobby: sanitizeLobby(lobby) })
    }
  })

  // ── Update Background Selection ────────────────────────────
  socket.on('lobby:updateBackground', ({ backgroundId }) => {
    const lobbyId = playerLobby.get(socket.id)
    if (!lobbyId) return
    const lobby = lobbies.get(lobbyId)
    if (!lobby || lobby.status !== 'waiting') return
    // Only host can change background
    if (lobby.hostId !== socket.id) return

    lobby.backgroundId = backgroundId
    io.to(lobbyId).emit('lobby:updated', { lobby: sanitizeLobby(lobby) })
  })

  // ── Leave Lobby ───────────────────────────────────────────
  socket.on('lobby:leave', () => {
    leaveLobby(socket)
    broadcastLobbies()
  })

  // ── Game Input ────────────────────────────────────────────
  socket.on('game:input', (inputData) => {
    const lobbyId = playerLobby.get(socket.id)
    if (!lobbyId) return
    const lobby = lobbies.get(lobbyId)
    if (!lobby || lobby.status !== 'playing') return

    // Determine player index
    const playerIndex = lobby.players.findIndex(p => p.socketId === socket.id)
    if (playerIndex === -1) return

    // Broadcast input to opponent
    socket.to(lobbyId).emit('game:opponentInput', {
      playerIndex,
      ...inputData
    })
  })

  // ── Game: Player state sync (position, health, etc.) ──────
  socket.on('game:sync', (stateData) => {
    const lobbyId = playerLobby.get(socket.id)
    if (!lobbyId) return
    const lobby = lobbies.get(lobbyId)
    if (!lobby) return

    const playerIndex = lobby.players.findIndex(p => p.socketId === socket.id)
    if (playerIndex === -1) return

    socket.to(lobbyId).emit('game:opponentSync', {
      playerIndex,
      ...stateData
    })
  })

  // ── Game: Attack hit confirmation ─────────────────────────
  socket.on('game:hit', ({ targetIndex }) => {
    const lobbyId = playerLobby.get(socket.id)
    if (!lobbyId) return
    const lobby = lobbies.get(lobbyId)
    if (!lobby || lobby.status !== 'playing') return

    // Broadcast hit to all in lobby
    io.to(lobbyId).emit('game:playerHit', {
      attackerIndex: lobby.players.findIndex(p => p.socketId === socket.id),
      targetIndex
    })
  })

  // ── Game Over ─────────────────────────────────────────────
  socket.on('game:over', ({ winnerIndex, reason }) => {
    const lobbyId = playerLobby.get(socket.id)
    if (!lobbyId) return
    const lobby = lobbies.get(lobbyId)
    if (!lobby || lobby.status !== 'playing') return

    // Only accept game over from player 0 (host) to prevent duplicates
    const senderIndex = lobby.players.findIndex(p => p.socketId === socket.id)
    if (senderIndex !== 0) return

    lobby.status = 'gameover'
    if (lobby.gameState && lobby.gameState.timerInterval) {
      clearInterval(lobby.gameState.timerInterval)
    }

    io.to(lobbyId).emit('game:finished', { winnerIndex, reason })
    console.log(`[Game] ${lobbyId} finished — winner: ${winnerIndex}, reason: ${reason}`)
  })

  // ── Rematch ───────────────────────────────────────────────
  socket.on('game:rematch', () => {
    const lobbyId = playerLobby.get(socket.id)
    if (!lobbyId) return
    const lobby = lobbies.get(lobbyId)
    if (!lobby) return

    const playerIndex = lobby.players.findIndex(p => p.socketId === socket.id)
    if (playerIndex === -1) return

    if (!lobby.rematchVotes) lobby.rematchVotes = new Set()
    lobby.rematchVotes.add(socket.id)

    io.to(lobbyId).emit('game:rematchVote', {
      votes: lobby.rematchVotes.size,
      needed: 2
    })

    if (lobby.rematchVotes.size >= 2) {
      lobby.rematchVotes = new Set()
      lobby.status = 'waiting'
      lobby.gameState = null
      io.to(lobbyId).emit('game:rematchStart', { lobby: sanitizeLobby(lobby) })
      // Auto-start countdown again since both players are still in
      if (lobby.players.length === 2) {
        startCountdown(lobbyId)
      }
    }
  })

  // ── Disconnect ────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`[-] Player disconnected: ${socket.id}`)
    leaveLobby(socket)
    broadcastLobbies()
  })
})

// ─── Helper Functions ───────────────────────────────────────────────────────

function startCountdown(lobbyId) {
  const lobby = lobbies.get(lobbyId)
  if (!lobby) return

  lobby.status = 'countdown'
  broadcastLobbies()

  io.to(lobbyId).emit('game:countdown', { seconds: 3 })

  let count = 3
  const countInterval = setInterval(() => {
    count--
    if (count > 0) {
      io.to(lobbyId).emit('game:countdownTick', { seconds: count })
    } else {
      clearInterval(countInterval)
      lobby.status = 'playing'
      lobby.gameState = createGameState(lobby)
      broadcastLobbies()

      io.to(lobbyId).emit('game:start', {
        lobby: sanitizeLobby(lobby),
        players: lobby.players.map((p, i) => ({
          index: i,
          name: p.name,
          characterId: p.characterId
        })),
        backgroundId: lobby.backgroundId
      })
      console.log(`[Game] ${lobbyId} started!`)

      // Server-side timer
      let gameTimer = 60
      lobby.gameState.timerInterval = setInterval(() => {
        gameTimer--
        io.to(lobbyId).emit('game:timer', { timer: gameTimer })
        if (gameTimer <= 0) {
          clearInterval(lobby.gameState.timerInterval)
          io.to(lobbyId).emit('game:timeUp')
        }
      }, 1000)
    }
  }, 1000)
}

function leaveLobby(socket) {
  const lobbyId = playerLobby.get(socket.id)
  if (!lobbyId) return

  const lobby = lobbies.get(lobbyId)
  if (!lobby) {
    playerLobby.delete(socket.id)
    return
  }

  // Remove player from lobby
  lobby.players = lobby.players.filter(p => p.socketId !== socket.id)
  playerLobby.delete(socket.id)
  socket.leave(lobbyId)

  if (lobby.players.length === 0) {
    // Clean up empty lobby
    if (lobby.gameState && lobby.gameState.timerInterval) {
      clearInterval(lobby.gameState.timerInterval)
    }
    lobbies.delete(lobbyId)
    console.log(`[Lobby] Deleted empty lobby: ${lobbyId}`)
  } else {
    // Notify remaining player
    if (lobby.status === 'playing' || lobby.status === 'countdown') {
      lobby.status = 'waiting'
      if (lobby.gameState && lobby.gameState.timerInterval) {
        clearInterval(lobby.gameState.timerInterval)
      }
      lobby.gameState = null
      io.to(lobbyId).emit('game:opponentLeft')
    }

    // Transfer host if needed
    if (lobby.hostId === socket.id && lobby.players.length > 0) {
      lobby.hostId = lobby.players[0].socketId
      lobby.hostName = lobby.players[0].name
    }

    io.to(lobbyId).emit('lobby:updated', { lobby: sanitizeLobby(lobby) })
  }

  broadcastLobbies()
}

function sanitizeLobby(lobby) {
  return {
    id: lobby.id,
    name: lobby.name,
    hostName: lobby.hostName,
    status: lobby.status,
    backgroundId: lobby.backgroundId,
    players: lobby.players.map(p => ({
      name: p.name,
      characterId: p.characterId,
      ready: p.ready
    }))
  }
}

// ─── Start Server ───────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`⚔️  Death Wars server running on http://localhost:${PORT}`)
})
