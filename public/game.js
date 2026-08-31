// ==========================================
// 1. VARIABLES DE ESTADO GLOBALES
// ==========================================
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
    'I': [[1,1,1,1]],
    'J': [[1,0,0],[1,1,1]],
    'L': [[0,0,1],[1,1,1]],
    'O': [[1,1],[1,1]],
    'S': [[0,1,1],[1,1,0]],
    'T': [[0,1,0],[1,1,1]],
    'Z': [[1,1,0],[0,1,1]]
};

const COLORS = {
    'I': '#00f0f0', 'J': '#0000f0', 'L': '#f0a000',
    'O': '#f0f000', 'S': '#00f000', 'T': '#a000f0', 'Z': '#f00000'
};

// ==========================================
// 2. INICIALIZACIÓN Y EVENTOS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    if (document.body) document.body.focus();

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
        onlineMultiplayerButton: document.getElementById('online-multiplayer-button'),
        rotateButton: document.getElementById('rotate-button'),
        hardDropButton: document.getElementById('hard-drop-button'),
        spRotateButton: document.getElementById('sp-rotate-button'),
        spHardDropButton: document.getElementById('sp-hard-drop-button')
    };

    initializeSocketConnection();
    addEventListeners();
});

function addEventListeners() {
    DOM.restartButton.addEventListener('click', () => location.reload());
    
   // Función segura y mejorada para arrancar la música dinámicamente
    const startBackgroundMusic = () => {
        let bgMusic = document.getElementById('background-music');
        if (!bgMusic) {
            bgMusic = document.createElement('audio');
            bgMusic.id = 'background-music';
            bgMusic.src = '/musica.mp3'; // Usamos barra al inicio para asegurar que la busque en la raíz pública
            bgMusic.loop = true;
            bgMusic.volume = 0.3; // Subimos ligeramente al 30% por si acaso
            document.body.appendChild(bgMusic);
        }
        
        // Forzamos la reproducción controlando la promesa del navegador
        const playPromise = bgMusic.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                console.log("¡Música sonando correctamente!");
            }).catch(error => {
                console.log("El navegador bloqueó la reproducción automática o falta el archivo:", error);
            });
        }
    };

    window.addEventListener('click', () => window.focus());
    document.addEventListener('click', () => window.focus());

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
            e.preventDefault(); 
            e.stopPropagation();
            if ((gameMode === 'multiplayer' && myRole === 'constructor') || gameMode === 'single') {
                handleInput({ key: mappedKey });
            }
        }
    }, true);

    if (DOM.rotateButton) DOM.rotateButton.addEventListener('click', () => handleInput({ key: 'ArrowUp' }));
    if (DOM.spRotateButton) DOM.spRotateButton.addEventListener('click', () => handleInput({ key: 'ArrowUp' }));
    if (DOM.hardDropButton) DOM.hardDropButton.addEventListener('click', () => handleInput({ key: ' ' }));
    if (DOM.spHardDropButton) DOM.spHardDropButton.addEventListener('click', () => handleInput({ key: ' ' }));
}

// ==========================================
// 3. CONEXIÓN SOCKET
// ==========================================
function initializeSocketConnection() {
    socket = io();

    socket.on('connect', () => {
        if (DOM.statusMessage) {
            DOM.statusMessage.textContent = 'Conectado. Elige un modo.';
        }
    });

    socket.on('connect_error', (err) => {
        console.error('Error de conexión:', err);
        if (DOM.statusMessage) {
            DOM.statusMessage.textContent = 'Error conectando al servidor. Comprueba Render.';
        }
    });

    socket.on('roleAssignment', (role) => {
        myRole = role;
    });

    socket.on('gameStartReady', (data) => {
        gameMode = 'multiplayer';
        gameActive = true;

        if (data && data.players) {
            const me = data.players.find(p => p.id === socket.id);
            if (me) myRole = me.role;
        }

        DOM.startScreen.style.display = 'none';
        DOM.gameContent.style.display = 'flex';
        
        if (myRole === 'constructor') {
            DOM.constructorControls.style.display = 'flex';
            DOM.singlePlayerControls.style.display = 'none';
            DOM.selectorSection.style.display = 'none';
            DOM.playerRoleDisplay.textContent = "Rol: Constructor";
            startGameLoop(); 
        } else if (myRole === 'selector') {
            DOM.constructorControls.style.display = 'none';
            DOM.singlePlayerControls.style.display = 'none';
            DOM.selectorSection.style.display = 'block';
            DOM.playerRoleDisplay.textContent = "Rol: Selector";
            populateSelectorBlocks(getRandomShapes(3));
        }
    });

    socket.on('gameStateUpdate', (data) => {
        if (myRole === 'selector') {
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
        DOM.gameOverMessage.innerHTML = `${msg}<br><span style='font-size:16px; font-weight:normal; margin-top:10px; display:block;'>${reason}</span>`;
    });
}

// ==========================================
// 4. FUNCIONES DEL SELECTOR
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
        
        btn.style.width = '60px';
        btn.style.height = '60px';
        btn.style.fontSize = '28px';
        btn.style.fontWeight = 'bold';
        btn.style.backgroundColor = COLORS[type];
        btn.style.color = '#000';
        btn.style.border = '3px solid #fff';
        btn.style.borderRadius = '8px';
        btn.style.cursor = 'pointer';
        
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (socket) socket.emit('sendNextBlock', type);
            if (DOM.currentFallingBlockInfo) {
                DOM.currentFallingBlockInfo.innerHTML = `<h3 style="margin-top:15px; color:#fff;">Pieza enviada: <span style="color:${COLORS[type]};">${type}</span></h3>`;
            }
            populateSelectorBlocks(getRandomShapes(3)); 
        });
        
        DOM.blockSelectionDiv.appendChild(btn);
    });
}

// ==========================================
// 5. LÓGICA DEL CONSTRUCTOR / INDIVIDUAL
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
    
    if (checkCollision(currentBlockX, currentBlockY, currentBlock.matrix)) {
        gameActive = false;
        clearInterval(gameInterval);
        if (gameMode === 'multiplayer' && socket) {
            socket.emit('constructorLost'); 
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

// ==========================================
// 6. RENDERIZADO
// ==========================================
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
