const canvas = document.querySelector('canvas')
const c = canvas.getContext('2d')

canvas.width = 1024
canvas.height = 576

c.fillRect(0, 0, canvas.width, canvas.height)

const gravity = 0.7

// ─── Character Definitions ────────────────────────────────────────────────────
// Image dimensions & scale math:
//   death_adventure_time_updated-removebg-preview.png  500×500 → scale 0.43 → drawn 215×215
//   death regular.png                                   447×559 → scale 0.43 → drawn 192×240
//   Death grim.png                                      386×386 → scale 0.57 → drawn 220×220
//   ryuk_updated-removebg-preview.png                  500×500 → scale 0.43 → drawn 215×215
//
// offset.y = drawnH - 150  (aligns image bottom with ground)
// offset.x = (drawnW - 50) / 2  (centers image over hitbox)
const CHARACTERS = [
  {
    id: 'death-at',
    name: 'Death',
    subtitle: 'Adventure Time',
    imageSrc: './img/death_adventure_time_updated-removebg-preview.png',
    color: '#c4b5a0',
    scale: 0.43,
    offset: { x: 82, y: 65 },
    attackBox: { offset: { x: 55, y: 30 }, width: 120, height: 60 },
    attackStyle: 'body-swing',
    facesRight: true
  },
  {
    id: 'death-rs',
    name: 'Death',
    subtitle: 'Regular Show',
    imageSrc: './img/death-regular.png',
    color: '#7986cb',
    scale: 0.43,
    offset: { x: 71, y: 90 },
    attackBox: { offset: { x: 50, y: 40 }, width: 130, height: 60 },
    attackStyle: 'body-swing',
    facesRight: false
  },
  {
    id: 'grim',
    name: 'Grim',
    subtitle: 'Billy & Mandy',
    imageSrc: './img/Death-grim.png',
    color: '#e0e0e0',
    scale: 0.57,
    offset: { x: 85, y: 70 },
    attackBox: { offset: { x: 60, y: 40 }, width: 140, height: 60 },
    attackStyle: 'body-swing',
    facesRight: true
  },
  {
    id: 'ryuk',
    name: 'Ryuk',
    subtitle: 'Death Note',
    imageSrc: './img/ryuk_updated-removebg-preview.png',
    color: '#e74c3c',
    scale: 0.43,
    offset: { x: 82, y: 65 },
    attackBox: { offset: { x: 55, y: 30 }, width: 120, height: 60 },
    attackStyle: 'body-swing',
    facesRight: false
  }
]

// ─── Backgrounds ──────────────────────────────────────────────────────────────
const BACKGROUNDS = [
  { name: 'Dark Forest', imageSrc: './img/background.png' },
  { name: 'The Park',    imageSrc: './img/The-Park-background.png' },
  { name: 'Land of OOO', imageSrc: './img/Land-of-OOO-background.png' }
]
let bgCursor = 0

// ─── Game State ───────────────────────────────────────────────────────────────
let gameState = 'wallet'  // 'wallet' | 'intro' | 'lobby' | 'selecting' | 'waiting' | 'countdown' | 'fighting' | 'gameover'
let walletAddress = null
let walletUsername = null
let isGuest = false
let player = null
let enemy = null

let p1Cursor = 0
let p1Confirmed = false

// Multiplayer state
let socket = null
let myPlayerIndex = -1   // 0 or 1 — which player am I in the lobby?
let currentLobbyId = null
let selectMode = 'create' // 'create' or 'join'
let joiningLobbyId = null
let syncInterval = null

const keys = {
  a: { pressed: false },
  d: { pressed: false }
}

// ─── Background Sprite ────────────────────────────────────────────────────────
const background = new Sprite({
  position: { x: 0, y: 0 },
  imageSrc: './img/background.png'
})

// ─── Socket.IO Connection ─────────────────────────────────────────────────────
function initSocket() {
  socket = io()

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket.id)
  })

  socket.on('disconnect', () => {
    console.log('[Socket] Disconnected')
    if (gameState === 'fighting' || gameState === 'countdown') {
      handleOpponentLeft()
    }
  })

  // ── Lobby Events ────────────────────────────────────────
  socket.on('lobbies:list', (lobbies) => {
    renderLobbyList(lobbies)
  })

  socket.on('lobby:joined', ({ lobbyId, lobby, playerIndex }) => {
    currentLobbyId = lobbyId
    myPlayerIndex = playerIndex
    showWaitingRoom(lobby)
  })

  socket.on('lobby:error', (msg) => {
    alert(msg)
  })

  socket.on('lobby:playerJoined', ({ lobby }) => {
    updateWaitingRoom(lobby)
  })

  socket.on('lobby:updated', ({ lobby }) => {
    updateWaitingRoom(lobby)
  })

  // ── Game Events ─────────────────────────────────────────
  socket.on('game:countdown', ({ seconds }) => {
    gameState = 'countdown'
    document.getElementById('waitingRoom').style.display = 'none'
    document.getElementById('lobbyScreen').style.display = 'none'
    document.getElementById('selectScreen').style.display = 'none'

    const countdownEl = document.getElementById('countdownOverlay')
    countdownEl.style.display = 'flex'
    countdownEl.querySelector('.countdown-text').textContent = seconds
  })

  socket.on('game:countdownTick', ({ seconds }) => {
    const countdownEl = document.getElementById('countdownOverlay')
    countdownEl.querySelector('.countdown-text').textContent = seconds
  })

  socket.on('game:start', ({ lobby, players, backgroundId }) => {
    startMultiplayerGame(players, backgroundId)
  })

  socket.on('game:timer', ({ timer: t }) => {
    document.querySelector('#timer').innerHTML = t
    if (t <= 0 && gameState === 'fighting') {
      gameState = 'gameover'
      determineWinnerMultiplayer()
    }
  })

  socket.on('game:timeUp', () => {
    if (gameState === 'fighting') {
      gameState = 'gameover'
      determineWinnerMultiplayer()
    }
  })

  socket.on('game:opponentInput', (data) => {
    if (!enemy) return
    handleOpponentInput(data)
  })

  socket.on('game:opponentSync', (data) => {
    if (!enemy) return
    handleOpponentSync(data)
  })

  socket.on('game:playerHit', ({ attackerIndex, targetIndex }) => {
    handlePlayerHit(attackerIndex, targetIndex)
  })

  socket.on('game:finished', ({ winnerIndex, reason }) => {
    gameState = 'gameover'
    showGameResult(winnerIndex, reason)
  })

  socket.on('game:opponentLeft', () => {
    handleOpponentLeft()
  })

  socket.on('game:rematchVote', ({ votes, needed }) => {
    const btn = document.getElementById('rematchBtn')
    if (btn) btn.textContent = `REMATCH (${votes}/${needed})`
  })

  socket.on('game:rematchStart', ({ lobby }) => {
    // Both players voted rematch — restart
    resetForRematch()
  })
}

// ─── Lobby UI ─────────────────────────────────────────────────────────────────
function renderLobbyList(lobbies) {
  const list = document.getElementById('lobbyList')
  if (!list) return

  const waitingLobbies = lobbies.filter(l => l.status === 'waiting')

  if (waitingLobbies.length === 0) {
    list.innerHTML = '<div class="lobby-empty">No lobbies available — create one!</div>'
    return
  }

  list.innerHTML = waitingLobbies.map(lobby => `
    <div class="lobby-row">
      <span class="lobby-name">${lobby.name}</span>
      <span class="lobby-host">${lobby.hostName}</span>
      <span class="lobby-status-text ${lobby.players >= 2 ? 'full' : ''}">${lobby.players}/${lobby.maxPlayers}</span>
      <button class="lobby-join-btn" ${lobby.players >= 2 ? 'disabled' : ''} onclick="joinLobby('${lobby.id}')">
        ${lobby.players >= 2 ? 'FULL' : 'JOIN'}
      </button>
    </div>
  `).join('')
}

function showCreateLobby() {
  selectMode = 'create'
  document.getElementById('lobbyScreen').style.display = 'none'
  document.getElementById('selectScreen').style.display = 'flex'
  document.getElementById('selectTitle').textContent = '— choose your fighter —'
  document.getElementById('confirmSelectBtn').textContent = 'CONFIRM & CREATE LOBBY'
  p1Cursor = 0
  p1Confirmed = false
  bgCursor = 0
  renderSelectScreen()
}

function joinLobby(lobbyId) {
  selectMode = 'join'
  joiningLobbyId = lobbyId
  document.getElementById('lobbyScreen').style.display = 'none'
  document.getElementById('selectScreen').style.display = 'flex'
  document.getElementById('selectTitle').textContent = '— choose your fighter —'
  document.getElementById('confirmSelectBtn').textContent = 'CONFIRM & JOIN LOBBY'
  p1Cursor = 0
  p1Confirmed = false
  renderSelectScreen()
}

function confirmSelection() {
  if (p1Cursor < 0 || p1Cursor >= CHARACTERS.length) return
  playClick()

  if (selectMode === 'create') {
    socket.emit('lobby:create', {
      playerName: walletUsername || 'Player',
      characterId: p1Cursor,
      backgroundId: bgCursor
    })
  } else {
    socket.emit('lobby:join', {
      lobbyId: joiningLobbyId,
      playerName: walletUsername || 'Player',
      characterId: p1Cursor
    })
  }

  document.getElementById('selectScreen').style.display = 'none'
}

function backToLobbyBrowser() {
  document.getElementById('selectScreen').style.display = 'none'
  document.getElementById('lobbyScreen').style.display = 'flex'
}

function showWaitingRoom(lobby) {
  document.getElementById('lobbyScreen').style.display = 'none'
  document.getElementById('selectScreen').style.display = 'none'
  document.getElementById('waitingRoom').style.display = 'flex'
  document.getElementById('lobbyCodeDisplay').textContent = lobby.id

  gameState = 'waiting'
  updateWaitingRoom(lobby)
}

function updateWaitingRoom(lobby) {
  const p1 = lobby.players[0]
  const p2 = lobby.players[1]

  if (p1) {
    const char = CHARACTERS[p1.characterId] || CHARACTERS[0]
    document.getElementById('waitP1Img').src = char.imageSrc
    document.getElementById('waitP1Name').textContent = p1.name
    document.getElementById('waitP1Char').textContent = `${char.name} (${char.subtitle})`
    document.getElementById('waitP1Card').classList.add('filled')
  }

  const p2Card = document.getElementById('waitP2Card')
  if (p2) {
    const char = CHARACTERS[p2.characterId] || CHARACTERS[0]
    p2Card.classList.add('filled')
    p2Card.innerHTML = `
      <img src="${char.imageSrc}" alt="${char.name}" style="width:96px;height:112px;object-fit:contain;object-position:center bottom" />
      <div class="waiting-player-name">${p2.name}</div>
      <div class="waiting-player-char">${char.name} (${char.subtitle})</div>
    `
  } else {
    p2Card.classList.remove('filled')
    p2Card.innerHTML = '<div class="waiting-empty">WAITING...</div>'
  }
}

function leaveLobby() {
  if (socket) socket.emit('lobby:leave')
  currentLobbyId = null
  myPlayerIndex = -1
  document.getElementById('waitingRoom').style.display = 'none'
  document.getElementById('lobbyScreen').style.display = 'flex'
  gameState = 'lobby'
}

function refreshLobbies() {
  // The server broadcasts lobby list on changes, but we can also request it
  // Just reconnect briefly or the list auto-updates
  playClick()
}

// ─── Character Select UI ──────────────────────────────────────────────────────
function renderSelectScreen() {
  const grid = document.getElementById('charGrid')
  if (!grid) return
  grid.innerHTML = ''

  CHARACTERS.forEach((char, i) => {
    const card = document.createElement('div')
    card.className = 'char-card'
    if (p1Cursor === i) card.classList.add('p1-selected')

    card.innerHTML = `
      <img src="${char.imageSrc}" alt="${char.name}" />
      <div class="char-name">${char.name}</div>
      <div class="char-subtitle">${char.subtitle}</div>
    `

    card.addEventListener('click', () => {
      playClick()
      p1Cursor = i
      renderSelectScreen()
    })

    grid.appendChild(card)
  })

  const p1Status = document.getElementById('p1Status')
  if (p1Status) {
    const sel = CHARACTERS[p1Cursor]
    p1Status.textContent = `Selected: ${sel.name} (${sel.subtitle})`
  }

  const bgGrid = document.getElementById('bgGrid')
  if (bgGrid) {
    bgGrid.innerHTML = ''
    BACKGROUNDS.forEach((bg, i) => {
      const card = document.createElement('div')
      card.className = 'bg-card' + (bgCursor === i ? ' bg-selected' : '')
      card.innerHTML = `<img src="${bg.imageSrc}" /><div class="bg-name">${bg.name}</div>`

      card.addEventListener('click', () => {
        playClick()
        bgCursor = i
        renderSelectScreen()
      })

      bgGrid.appendChild(card)
    })
  }
}

// ─── Multiplayer Game Start ───────────────────────────────────────────────────
function startMultiplayerGame(players, backgroundId) {
  gameState = 'fighting'

  document.getElementById('waitingRoom').style.display = 'none'
  document.getElementById('lobbyScreen').style.display = 'none'
  document.getElementById('selectScreen').style.display = 'none'

  const countdownEl = document.getElementById('countdownOverlay')
  countdownEl.querySelector('.countdown-text').textContent = 'FIGHT!'
  countdownEl.style.display = 'flex'
  setTimeout(() => { countdownEl.style.display = 'none' }, 700)

  // Figure out who is player 0 (left) and player 1 (right)
  const myData = players[myPlayerIndex]
  const opData = players[myPlayerIndex === 0 ? 1 : 0]

  const myChar = CHARACTERS[myData.characterId] || CHARACTERS[0]
  const opChar = CHARACTERS[opData.characterId] || CHARACTERS[0]

  // Update labels
  document.getElementById('p1Label').textContent = myData.name
  document.getElementById('p2Label').textContent = opData.name

  // Create MY fighter (always on left for this client)
  player = new SingleImageFighter({
    position: { x: 100, y: 350 },
    velocity: { x: 0, y: 0 },
    color: myChar.color,
    imageSrc: myChar.imageSrc,
    scale: myChar.scale,
    offset: myChar.offset,
    attackBox: myChar.attackBox,
    attackStyle: myChar.attackStyle,
    facingRight: true,
    naturalFacesRight: myChar.facesRight
  })

  // Create ENEMY fighter (always on right for this client)
  enemy = new SingleImageFighter({
    position: { x: 750, y: 350 },
    velocity: { x: 0, y: 0 },
    color: opChar.color,
    imageSrc: opChar.imageSrc,
    scale: opChar.scale,
    offset: opChar.offset,
    attackBox: {
      offset: { x: -opChar.attackBox.offset.x - opChar.attackBox.width, y: opChar.attackBox.offset.y },
      width: opChar.attackBox.width,
      height: opChar.attackBox.height
    },
    attackStyle: opChar.attackStyle,
    facingRight: false,
    naturalFacesRight: opChar.facesRight
  })

  // Apply background
  background.image.src = BACKGROUNDS[backgroundId || 0].imageSrc

  // Reset health bars
  gsap.set('#playerHealth', { width: '100%' })
  gsap.set('#enemyHealth', { width: '100%' })
  document.querySelector('.hud').style.visibility = 'visible'
  document.querySelector('#timer').innerHTML = '60'

  document.getElementById('gameSoundtrack').play()

  // Start syncing position to opponent
  if (syncInterval) clearInterval(syncInterval)
  syncInterval = setInterval(sendPlayerSync, 50) // 20 times/sec
}

// ─── Network Sync ─────────────────────────────────────────────────────────────
function sendPlayerSync() {
  if (!socket || !player || gameState !== 'fighting') return

  socket.emit('game:sync', {
    x: player.position.x,
    y: player.position.y,
    vx: player.velocity.x,
    vy: player.velocity.y,
    health: player.health,
    facingRight: player.facingRight,
    sprite: player.currentSpriteName,
    dead: player.dead
  })
}

function handleOpponentInput(data) {
  if (!enemy) return

  if (data.type === 'keydown') {
    switch (data.key) {
      case 'left':
        enemy.velocity.x = -5
        enemy.lastKey = 'left'
        enemy.facingRight = false
        enemy.switchSprite('run')
        break
      case 'right':
        enemy.velocity.x = 5
        enemy.lastKey = 'right'
        enemy.facingRight = true
        enemy.switchSprite('run')
        break
      case 'jump':
        if (enemy.velocity.y === 0) enemy.velocity.y = -20
        break
      case 'attack':
        enemy.attack()
        break
    }
  } else if (data.type === 'keyup') {
    switch (data.key) {
      case 'left':
      case 'right':
        enemy.velocity.x = 0
        enemy.switchSprite('idle')
        break
    }
  }
}

function handleOpponentSync(data) {
  if (!enemy) return

  // Mirror the opponent's X position (they see themselves on left, we see them on right)
  // The opponent sends their "player" position which is on their left side (x~100)
  // We need to mirror it so they appear on our right side
  enemy.position.x = canvas.width - data.x - enemy.width
  enemy.position.y = data.y
  enemy.velocity.y = data.vy
  enemy.health = data.health
  enemy.dead = data.dead

  // Mirror facing direction
  enemy.facingRight = !data.facingRight

  if (data.sprite && !enemy.dead) {
    enemy.switchSprite(data.sprite)
  }
}

function handlePlayerHit(attackerIndex, targetIndex) {
  if (targetIndex === myPlayerIndex) {
    // I got hit
    player.takeHit()
    gsap.to('#playerHealth', { width: Math.max(0, player.health / 130 * 100) + '%' })
  } else {
    // Opponent got hit
    enemy.takeHit()
    gsap.to('#enemyHealth', { width: Math.max(0, enemy.health / 130 * 100) + '%' })
  }

  // Check for game over (only host reports)
  if (myPlayerIndex === 0 && gameState === 'fighting') {
    if (player.health <= 0) {
      socket.emit('game:over', { winnerIndex: myPlayerIndex === 0 ? 1 : 0, reason: 'death' })
    } else if (enemy.health <= 0) {
      socket.emit('game:over', { winnerIndex: myPlayerIndex, reason: 'death' })
    }
  }
}

function determineWinnerMultiplayer() {
  if (!player || !enemy) return

  const gs = document.getElementById('gameSoundtrack')
  gs.pause()
  gs.currentTime = 0

  const displayEl = document.querySelector('#displayText')
  displayEl.style.display = 'flex'

  const p1Name = document.getElementById('p1Label').textContent
  const p2Name = document.getElementById('p2Label').textContent

  if (player.health === enemy.health) {
    displayEl.innerHTML = 'TIE'
  } else if (player.health > enemy.health) {
    displayEl.innerHTML = p1Name + ' WINS'
  } else {
    displayEl.innerHTML = p2Name + ' WINS'
  }

  document.getElementById('rematchBtn').style.display = 'block'
  document.getElementById('rematchBtn').textContent = 'REMATCH (0/2)'

  if (syncInterval) clearInterval(syncInterval)

  // Report game over if host
  if (myPlayerIndex === 0) {
    let winnerIndex = -1
    if (player.health > enemy.health) winnerIndex = myPlayerIndex
    else if (enemy.health > player.health) winnerIndex = myPlayerIndex === 0 ? 1 : 0
    socket.emit('game:over', { winnerIndex, reason: 'timer' })
  }
}

function showGameResult(winnerIndex, reason) {
  gameState = 'gameover'

  const gs = document.getElementById('gameSoundtrack')
  gs.pause()
  gs.currentTime = 0

  const displayEl = document.querySelector('#displayText')
  displayEl.style.display = 'flex'

  if (syncInterval) clearInterval(syncInterval)

  const p1Name = document.getElementById('p1Label').textContent
  const p2Name = document.getElementById('p2Label').textContent

  if (winnerIndex === -1) {
    displayEl.innerHTML = 'TIE'
  } else if (winnerIndex === myPlayerIndex) {
    displayEl.innerHTML = 'YOU WIN!'
  } else {
    displayEl.innerHTML = 'YOU LOSE'
  }

  document.getElementById('rematchBtn').style.display = 'block'
  document.getElementById('rematchBtn').textContent = 'REMATCH (0/2)'
}

function handleOpponentLeft() {
  if (syncInterval) clearInterval(syncInterval)

  const gs = document.getElementById('gameSoundtrack')
  gs.pause()
  gs.currentTime = 0

  gameState = 'gameover'
  const displayEl = document.querySelector('#displayText')
  displayEl.style.display = 'flex'
  displayEl.innerHTML = 'OPPONENT LEFT'

  document.getElementById('rematchBtn').style.display = 'none'

  setTimeout(() => {
    backToLobbyFromGame()
  }, 2000)
}

function requestRematch() {
  if (!socket) return
  playClick()
  socket.emit('game:rematch')
}

function resetForRematch() {
  const gs = document.getElementById('gameSoundtrack')
  gs.pause()
  gs.currentTime = 0

  player = null
  enemy = null
  document.querySelector('#timer').innerHTML = '60'
  document.getElementById('displayText').style.display = 'none'
  document.getElementById('rematchBtn').style.display = 'none'
  document.querySelector('.hud').style.visibility = 'hidden'

  if (syncInterval) clearInterval(syncInterval)

  // Go back to waiting, server will auto-start countdown again
  gameState = 'waiting'
}

function backToLobbyFromGame() {
  if (socket) socket.emit('lobby:leave')
  currentLobbyId = null
  myPlayerIndex = -1
  player = null
  enemy = null

  if (syncInterval) clearInterval(syncInterval)

  document.querySelector('#timer').innerHTML = '60'
  document.getElementById('displayText').style.display = 'none'
  document.getElementById('rematchBtn').style.display = 'none'
  document.getElementById('countdownOverlay').style.display = 'none'
  document.getElementById('waitingRoom').style.display = 'none'
  document.querySelector('.hud').style.visibility = 'hidden'
  document.getElementById('lobbyScreen').style.display = 'flex'
  gameState = 'lobby'
}

// ─── Game Loop ────────────────────────────────────────────────────────────────
function animate() {
  window.requestAnimationFrame(animate)

  c.fillStyle = '#0a0a0f'
  c.fillRect(0, 0, canvas.width, canvas.height)
  background.update()
  c.fillStyle = 'rgba(0, 0, 0, 0.35)'
  c.fillRect(0, 0, canvas.width, canvas.height)

  if (gameState !== 'fighting' && gameState !== 'gameover') return
  if (!player || !enemy) return

  player.update()
  enemy.update()

  // Only process local player movement
  player.velocity.x = 0

  if (keys.a.pressed && player.lastKey === 'a') {
    player.velocity.x = -5
    player.switchSprite('run')
  } else if (keys.d.pressed && player.lastKey === 'd') {
    player.velocity.x = 5
    player.switchSprite('run')
  } else {
    player.switchSprite('idle')
  }

  if (player.velocity.y < 0) player.switchSprite('jump')
  else if (player.velocity.y > 0) player.switchSprite('fall')

  // Collision: my player hits enemy
  if (
    rectangularCollision({ rectangle1: player, rectangle2: enemy }) &&
    player.isAttacking
  ) {
    player.isAttacking = false
    // Notify server about the hit
    socket.emit('game:hit', { targetIndex: myPlayerIndex === 0 ? 1 : 0 })
  }

  // Missed attack reset
  if (player.isAttacking && player.attackTimer <= 0) {
    player.isAttacking = false
  }
}

animate()

// ─── Keyboard Handlers ────────────────────────────────────────────────────────
window.addEventListener('keydown', (event) => {
  if (gameState === 'wallet') return

  // Intro screen — Enter goes to lobby browser
  if (gameState === 'intro') {
    if (event.key === 'Enter') {
      event.preventDefault()
      playClick()
      document.getElementById('introScreen').style.display = 'none'
      document.getElementById('lobbyScreen').style.display = 'flex'
      gameState = 'lobby'
      initSocket()
    }
    return
  }

  // In-fight controls (only local player)
  if (gameState !== 'fighting') return
  if (!player || player.dead) return

  switch (event.key) {
    case 'd':
      keys.d.pressed = true
      player.lastKey = 'd'
      player.facingRight = true
      socket.emit('game:input', { type: 'keydown', key: 'right' })
      break
    case 'a':
      keys.a.pressed = true
      player.lastKey = 'a'
      player.facingRight = false
      socket.emit('game:input', { type: 'keydown', key: 'left' })
      break
    case 'w':
      if (player.velocity.y === 0) {
        player.velocity.y = -20
        socket.emit('game:input', { type: 'keydown', key: 'jump' })
      }
      break
    case ' ':
      player.attack()
      socket.emit('game:input', { type: 'keydown', key: 'attack' })
      break
  }
})

window.addEventListener('keyup', (event) => {
  if (gameState !== 'fighting') return

  switch (event.key) {
    case 'd':
      keys.d.pressed = false
      if (socket) socket.emit('game:input', { type: 'keyup', key: 'right' })
      break
    case 'a':
      keys.a.pressed = false
      if (socket) socket.emit('game:input', { type: 'keyup', key: 'left' })
      break
  }
})

// ─── Init ─────────────────────────────────────────────────────────────────────
renderSelectScreen()
