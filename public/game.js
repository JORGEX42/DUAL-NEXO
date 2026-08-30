let socket = null;
let myRole = null;
let currentBoard = [];
let currentBlock = null;
let currentBlockX = 0;
let currentBlockY = 0;
let gameActive = false;
let gameMode = null;
let gameInterval = null;

let DOM = {}; 

const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 20;

const SHAPES = {
    'I': [[1,1,1,1]], 'J': [[1,0,0],[1,1,1]], 'L': [[0,0,1],[1,1,1]],
    'O': [[1,1],[1,1]], 'S': [[0,1,1],[1,1,0]], 'T': [[0,1,0],[1,1,1]], 'Z': [[1,1,0],[0,1,1]]
};

const COLORS = {
    'I': '#00f0f0', 'J': '#0000f0', 'L': '#f0a000',
    'O': '#f0f000', 'S': '#00f000', 'T': '#a000f0', 'Z': '#f00000'
};

document.addEventListener('DOMContentLoaded', () => {
    document.body.focus();
    DOM = {
        startScreen: document.getElementById('start-screen'),
        playerRoleDisplay: document.getElementById('player-role-display'),
        statusMessage: document.getElementById('status-message'),
        gameContent: document.getElementById('game-content'),
        gameBoard: document.getElementById('game-board'),
        timerDisplay: document.getElementById('timer'),
        blockSelectionDiv: document.getElementById('block-selection'),
        currentFallingBlockInfo: document.getElementById('current-falling-block-info'),
        gameOverOverlay: document.getElementById('game-over-overlay'),
        gameOverMessage: document.getElementById('game-over-message'),
        restartButton: document.getElementById('restart-button'),
        selectorSection: document.getElementById('selector-section'),
        constructorControls: document.getElementById('constructor-controls'),
        singlePlayerControls: document.getElementById('single-player-controls'),
        singlePlayerButton: document.getElementById('single-player-button'),
        onlineMultiplayerButton: document.getElementById('online-multiplayer-button')
    };

    initializeSocketConnection();
    addEventListeners();
});

function initializeSocketConnection() {
    socket = io();

    socket.on('connect', () => {
        if (DOM.statusMessage) DOM.statusMessage.textContent = 'Conectado. Elige un modo.';
    });

    socket.on('roleAssignment', (role) => myRole = role);

    socket.on('gameStartReady', () => {
        gameMode = 'multiplayer';
        gameActive = true;

        DOM.startScreen.style.display = 'none';
        DOM.gameContent.style.display = 'flex';
        
        if (myRole === 'constructor') {
            DOM.constructorControls.style.display = 'flex';
            DOM.singlePlayerControls.style.display = 'none';
            DOM.selectorSection.style.display = 'none';
            DOM.playerRoleDisplay.textContent = "Rol: Constructor";
            startGameLoop(); // El Constructor es el anfitrión del tablero
        } else if (myRole === 'selector') {
            DOM.constructorControls.style.display = 'none';
            DOM.singlePlayerControls.style.display = 'none';
            DOM.selectorSection.style.display = 'block';
            DOM.playerRoleDisplay.textContent = "Rol: Selector";
            populateSelectorBlocks(getRandomShapes(3)); // 3 Piezas aleatorias iniciales
        }
    });

    socket.on('gameStateUpdate', (data) => {
        if (myRole === 'selector') { // El selector solo dibuja lo que recibe
            currentBoard = data.board;
            currentBlock = data.currentBlock;
            currentBlockX = data.x;
            currentBlockY = data.y;
            drawBoard(); 
        }
    });

    socket.on('receiveNextBlock', (type) => {
        if (myRole === 'constructor') {
            window.constructorNextPiece = type;
        }
    });

    socket.on('timerSync', (timeLeft) => {
        const mins = Math.floor(timeLeft / 60).toString().padStart(2, '0');
        const secs = (timeLeft % 60).toString().padStart(2, '0');
        if (DOM.timerDisplay) DOM.timerDisplay.textContent = `Tiempo: ${mins}:${secs}`;
    });

    socket.on('gameOver', (data) => {
        gameActive = false;
        if (gameInterval) clearInterval(gameInterval);
        
        DOM.gameOverOverlay.style.display = 'flex';
        let msg = data.winner === myRole ? "¡HAS GANADO! 🏆" : "Has Perdido 💀";
        let reason = data.reason === 'time' ? "El Constructor sobrevivió 15 minutos." : "El tablero se llenó.";
        DOM.gameOverMessage.innerHTML = `${msg}<br><span style='font-size:16px; font-weight:normal'>${reason}</span>`;
    });
}

function addEventListeners() {
    DOM.restartButton.addEventListener('click', () => location.reload());
    DOM.singlePlayerButton.addEventListener('click', () => {
        gameMode = 'single';
        gameActive = true;
        DOM.startScreen.style.display = 'none';
        DOM.gameContent.style.display = 'flex';
        DOM.singlePlayerControls.style.display = 'flex';
        DOM.playerRoleDisplay.textContent = "Modo: Individual";
        startGameLoop();
    });

    DOM.onlineMultiplayerButton.addEventListener('click', () => {
        if (socket.connected) socket.emit('joinRoom', { channelId: 'default-room' });
    });

    window.addEventListener('click', () => window.focus());
    window.addEventListener('keydown', (e) => {
        if (!gameActive) return;
        window.focus();
        
        const code = e.code || '';
        const key = e.key ? e.key.toLowerCase() : '';
        let mappedKey = null;

        if (code === 'KeyA' || key === 'a' || code === 'ArrowLeft') mappedKey = 'ArrowLeft';
        else if (code === 'KeyD' || key === 'd' || code === 'ArrowRight') mappedKey = 'ArrowRight';
        else if (code === 'KeyS' || key === 's' || code === 'ArrowDown') mappedKey = 'ArrowDown';
        else if (code === 'KeyW' || key === 'w' || code === 'ArrowUp') mappedKey = 'ArrowUp';
        else if (code === 'Space' || key === ' ') mappedKey = ' ';

        if (mappedKey) {
            e.preventDefault(); e.stopPropagation();
            // Solo el Constructor o un jugador en modo Single procesan inputs
            if ((gameMode === 'multiplayer' && myRole === 'constructor') || gameMode === 'single') {
                handleInput({ key: mappedKey });
            }
        }
    }, true);
}

// ==========================================
// FUNCIONES DEL SELECTOR
// ==========================================
function getRandomShapes(count) {
    const types = Object.keys(SHAPES);
    const selected = [];
    for(let i=0; i<count; i++) {
        selected.push(types[Math.floor(Math.random() * types.length)]);
    }
    return selected;
}

function populateSelectorBlocks(options) {
    if (!DOM.blockSelectionDiv) return;
    DOM.blockSelectionDiv.innerHTML = '';
    options.forEach(type => {
        const btn = document.createElement('button');
        btn.className = 'block-option';
        btn.textContent = type;
        btn.style.width = '50px';
        btn.style.height = '50px';
        btn.style.fontSize = '24px';
        
        btn.onclick = () => {
            if (socket) socket.emit('sendNextBlock', type);
            if (DOM.currentFallingBlockInfo) {
                DOM.currentFallingBlockInfo.innerHTML = `<p style="color:#00f000">Enviada: <strong>${type}</strong></p>`;
            }
            populateSelectorBlocks(getRandomShapes(3)); // Generar 3 piezas nuevas
        };
        DOM.blockSelectionDiv.appendChild(btn);
    });
}

// ==========================================
// LÓGICA DEL CONSTRUCTOR / INDIVIDUAL
// ==========================================
function startGameLoop() {
    currentBoard = Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(0));
    spawnBlock();
    
    if (gameInterval) clearInterval(gameInterval);
    gameInterval = setInterval(() => {
        if (gameActive) moveBlockDown();
    }, 1000);
    drawBoard();
}

function spawnBlock() {
    let typeToSpawn;
    // Si el Selector envió una pieza, la usamos y limpiamos el buffer
    if (gameMode === 'multiplayer' && window.constructorNextPiece) {
        typeToSpawn = window.constructorNextPiece;
        window.constructorNextPiece = null; 
    } else {
        const types = Object.keys(SHAPES);
        typeToSpawn = types[Math.floor(Math.random() * types.length)];
    }
    
    currentBlock = { type: typeToSpawn, matrix: SHAPES[typeToSpawn], color: COLORS[typeToSpawn] };
    currentBlockX = Math.floor((BOARD_WIDTH - currentBlock.matrix[0].length) / 2);
    currentBlockY = 0;
    
    // Comprobar si el tablero se llenó (Derrota del Constructor)
    if (checkCollision(currentBlockX, currentBlockY, currentBlock.matrix)) {
        gameActive = false;
        clearInterval(gameInterval);
        if (gameMode === 'multiplayer' && socket) {
            socket.emit('constructorLost'); // Avisar al servidor para que el Selector gane
        } else {
            DOM.gameOverOverlay.style.display = 'flex';
            DOM.gameOverMessage.textContent = "¡Fin del Juego!";
        }
    }
    syncStateToServer();
}

function moveBlockDown() {
    if (!checkCollision(currentBlockX, currentBlockY + 1, currentBlock.matrix)) {
        currentBlockY++;
    } else {
        lockBlock();
        clearLines();
        spawnBlock();
    }
    drawBoard();
    syncStateToServer();
}

function checkCollision(nextX, nextY, matrix) {
    for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
            if (matrix[r][c]) {
                let bx = nextX + c; let by = nextY + r;
                if (bx < 0 || bx >= BOARD_WIDTH || by >= BOARD_HEIGHT) return true;
                if (by >= 0 && currentBoard[by][bx]) return true;
            }
        }
    }
    return false;
}

function lockBlock() {
    for (let r = 0; r < currentBlock.matrix.length; r++) {
        for (let c = 0; c < currentBlock.matrix[r].length; c++) {
            if (currentBlock.matrix[r][c] && (currentBlockY + r) >= 0) {
                currentBoard[currentBlockY + r][currentBlockX + c] = currentBlock.color;
            }
        }
    }
}

function clearLines() {
    currentBoard = currentBoard.filter(row => row.some(cell => cell === 0));
    while (currentBoard.length < BOARD_HEIGHT) {
        currentBoard.unshift(Array(BOARD_WIDTH).fill(0));
    }
}

function rotateBlock() {
    const n = currentBlock.matrix.length;
    const m = currentBlock.matrix[0].length;
    let rotated = Array.from({ length: m }, () => Array(n).fill(0));
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < m; c++) {
            rotated[c][n - 1 - r] = currentBlock.matrix[r][c];
        }
    }
    if (!checkCollision(currentBlockX, currentBlockY, rotated)) currentBlock.matrix = rotated;
}

function handleInput(e) {
    if (!gameActive || !currentBlock) return;
    
    switch (e.key) {
        case 'ArrowLeft': if (!checkCollision(currentBlockX - 1, currentBlockY, currentBlock.matrix)) currentBlockX--; break;
        case 'ArrowRight': if (!checkCollision(currentBlockX + 1, currentBlockY, currentBlock.matrix)) currentBlockX++; break;
        case 'ArrowDown': moveBlockDown(); return; 
        case 'ArrowUp': rotateBlock(); break;
        case ' ': 
            while (!checkCollision(currentBlockX, currentBlockY + 1, currentBlock.matrix)) currentBlockY++;
            moveBlockDown();
            return;
    }
    drawBoard();
    syncStateToServer();
}

function syncStateToServer() {
    if (gameMode === 'multiplayer' && myRole === 'constructor' && socket) {
        socket.emit('syncGameState', { board: currentBoard, currentBlock, x: currentBlockX, y: currentBlockY });
    }
}

function drawBoard() {
    if (!DOM.gameBoard) return;
    DOM.gameBoard.innerHTML = '';
    
    for (let r = 0; r < BOARD_HEIGHT; r++) {
        for (let c = 0; c < BOARD_WIDTH; c++) {
            if (currentBoard[r] && currentBoard[r][c]) createCell(c, r, currentBoard[r][c]);
        }
    }
    if (currentBlock && currentBlock.matrix) {
        for (let r = 0; r < currentBlock.matrix.length; r++) {
            for (let c = 0; c < currentBlock.matrix[r].length; c++) {
                if (currentBlock.matrix[r][c]) createCell(currentBlockX + c, currentBlockY + r, currentBlock.color);
            }
        }
    }
}

function createCell(x, y, color) {
    const cell = document.createElement('div');
    cell.style.position = 'absolute';
    cell.style.width = '10%';
    cell.style.height = '5%';
    cell.style.left = `${x * 10}%`;
    cell.style.top = `${y * 5}%`;
    cell.style.backgroundColor = color;
    cell.style.boxShadow = 'inset 0 0 4px rgba(0,0,0,0.5)';
    DOM.gameBoard.appendChild(cell);
}
