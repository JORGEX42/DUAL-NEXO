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
let touchStartX = 0;
let touchStartY = 0;

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

let gameInterval = null;

// ==========================================
// 2. CONTROLADOR DE CARGA INICIAL
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    console.log("Cargando juego...");
    
    // Forzar el foco de entrada inmediatamente
    if (document.body) {
        document.body.focus();
    }

    DOM = {
        startScreen: document.getElementById('start-screen'),
        playerRoleDisplay: document.getElementById('player-role-display'),
        statusMessage: document.getElementById('status-message'),
        gameContent: document.getElementById('game-content'),
        gameBoardContainer: document.getElementById('game-board-container'),
        gameBoard: document.getElementById('game-board'),
        timerDisplay: document.getElementById('timer'),
        blockSelectionDiv: document.getElementById('block-selection'),
        currentFallingBlockInfo: document.getElementById('current-falling-block-info'),
        rotateButton: document.getElementById('rotate-button'),
        hardDropButton: document.getElementById('hard-drop-button'),
        pauseOverlay: document.getElementById('pause-overlay'),
        backgroundMusic: document.getElementById('background-music'),
        gameOverOverlay: document.getElementById('game-over-overlay'),
        gameOverMessage: document.getElementById('game-over-message'),
        restartButton: document.getElementById('restart-button'),
        selectorSection: document.getElementById('selector-section'),
        constructorControls: document.getElementById('constructor-controls'),
        singlePlayerControls: document.getElementById('single-player-controls'),
        singlePlayerButton: document.getElementById('single-player-button'),
        onlineMultiplayerButton: document.getElementById('online-multiplayer-button'),
        spRotateButton: document.getElementById('sp-rotate-button'),
        spHardDropButton: document.getElementById('sp-hard-drop-button')
    };

    initializeSocketConnection();
    addEventListeners();
});

// ==========================================
// 3. CONEXIÓN DEL SOCKET Y EVENTOS DE RED
// ==========================================
function initializeSocketConnection() {
    if (typeof io === 'undefined') {
        console.warn('Socket.io no está disponible globalmente.');
        return;
    }

    socket = io({
        transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
        console.log('Conectado al servidor con ID:', socket.id);
        if (DOM.statusMessage) {
            DOM.statusMessage.textContent = 'Conectado. Elige un modo de juego.';
        }
    });

    socket.on('roleAssignment', (role) => {
        myRole = role;
    });

    socket.on('gameStartReady', () => {
        console.log("¡Servidor confirma sala llena! Iniciando multijugador...");
        gameMode = 'multiplayer';
        gameActive = true;

        if (DOM.startScreen) DOM.startScreen.style.display = 'none';
        if (DOM.gameContent) DOM.gameContent.style.display = 'flex';
        
        if (myRole === 'constructor') {
            if (DOM.constructorControls) DOM.constructorControls.style.display = 'flex';
            if (DOM.singlePlayerControls) DOM.singlePlayerControls.style.display = 'none';
            if (DOM.selectorSection) DOM.selectorSection.style.display = 'none';
            if (DOM.playerRoleDisplay) DOM.playerRoleDisplay.textContent = "Rol: Constructor";
        } else if (myRole === 'selector') {
            if (DOM.constructorControls) DOM.constructorControls.style.display = 'none';
            if (DOM.singlePlayerControls) DOM.singlePlayerControls.style.display = 'none';
            if (DOM.selectorSection) DOM.selectorSection.style.display = 'block';
            if (DOM.playerRoleDisplay) DOM.playerRoleDisplay.textContent = "Rol: Selector";
            populateSelectorBlocks(['I', 'J', 'L', 'O', 'S', 'T', 'Z']);
        }
    });

    socket.on('gameStateUpdate', (data) => {
        if (!data) return;

        currentBoard = data.board || currentBoard;
        currentBlock = data.currentBlock || null;
        window.nextBlock = data.nextBlock || null; 

        currentBlockX = data.x !== undefined ? data.x : (data.currentBlockX || 0);
        currentBlockY = data.y !== undefined ? data.y : (data.currentBlockY || 0);

        drawBoard(); 
    });
  
    socket.on('disconnect', () => {
        console.log('Te has desconectado del servidor.');
    });

    socket.on('roomCreated', (roomCode) => {
        console.log("Sala creada con éxito. Código:", roomCode);
        if (DOM.statusMessage) {
            DOM.statusMessage.innerHTML = `Sala creada con éxito.<br><strong style="color: #f0a000; font-size: 20px;">CÓDIGO: ${roomCode}</strong><br>Esperando al segundo jugador...`;
        }
    });
}

// ==========================================
// 4. CONFIGURACIÓN DE LISTENERS DE EVENTOS
// ==========================================
function addEventListeners() {
    const safeListen = (element, elementName, event, callback, options = {}) => {
        if (element) {
            element.addEventListener(event, callback, options);
        } else {
            console.warn(`[Falta ID]: El elemento 'DOM.${elementName}' no se encontró.`);
        }
    };

    safeListen(DOM.restartButton, 'restartButton', 'click', () => {
        location.reload();
    });

    safeListen(DOM.singlePlayerButton, 'singlePlayerButton', 'click', () => {
        console.log("Iniciando modo un jugador...");
        gameMode = 'single';
        gameActive = true;
        startSinglePlayerGame();
    });

    safeListen(DOM.onlineMultiplayerButton, 'onlineMultiplayerButton', 'click', () => {
        console.log("Iniciando modo multijugador...");
        if (socket && socket.connected) {
            if (DOM.statusMessage) DOM.statusMessage.textContent = 'Creando/buscando sala...';
            socket.emit('joinRoom', { channelId: 'default-room', user: { username: 'Jugador' } });
        } else {
            alert("El servidor no está conectado, espera un segundo.");
        }
    });

    // Mantener foco activo al hacer clic en cualquier parte de la pantalla
    window.addEventListener('click', () => window.focus());
    document.addEventListener('click', () => window.focus());

    // Capturador de Teclado (WASD + Flechas) en Fase de Captura (true)
    window.addEventListener('keydown', (e) => {
        if (!gameActive) return;

        window.focus();

        const code = e.code || '';
        const key = e.key ? e.key.toLowerCase() : '';
        let mappedKey = null;

        if (code === 'KeyA' || key === 'a' || code === 'ArrowLeft' || key === 'arrowleft') {
            mappedKey = 'ArrowLeft';
        } else if (code === 'KeyD' || key === 'd' || code === 'ArrowRight' || key === 'arrowright') {
            mappedKey = 'ArrowRight';
        } else if (code === 'KeyS' || key === 's' || code === 'ArrowDown' || key === 'arrowdown') {
            mappedKey = 'ArrowDown';
        } else if (code === 'KeyW' || key === 'w' || code === 'ArrowUp' || key === 'arrowup') {
            mappedKey = 'ArrowUp';
        } else if (code === 'Space' || key === ' ') {
            mappedKey = ' ';
        }

        if (mappedKey) {
            e.preventDefault();
            e.stopPropagation();

            if (gameMode === 'multiplayer' && myRole === 'constructor') {
                if (socket) socket.emit('playerAction', mappedKey);
            } else if (gameMode === 'single') {
                handleSinglePlayerInput({ key: mappedKey });
            }
        }
    }, true);

    safeListen(DOM.rotateButton, 'rotateButton', 'click', () => sendPlayerAction('rotate'));
    safeListen(DOM.spRotateButton, 'spRotateButton', 'click', () => handleSinglePlayerInput({ key: 'ArrowUp' }));
    safeListen(DOM.hardDropButton, 'hardDropButton', 'click', () => sendPlayerAction('hardDrop'));
    safeListen(DOM.spHardDropButton, 'spHardDropButton', 'click', () => handleSinglePlayerInput({ key: ' ' }));

    safeListen(DOM.gameBoardContainer, 'gameBoardContainer', 'touchstart', handleTouchStart, { passive: false });
    safeListen(DOM.gameBoardContainer, 'gameBoardContainer', 'touchmove', handleTouchMove, { passive: false });
}

// ==========================================
// 5. FUNCIONES AUXILIARES Y DE CONTROL
// ==========================================
function sendPlayerAction(action) {
    if (gameMode === 'multiplayer' && socket) {
        socket.emit('playerAction', action);
    } else if (gameMode === 'single') {
        if (action === 'rotate') handleSinglePlayerInput({ key: 'ArrowUp' });
        if (action === 'hardDrop') handleSinglePlayerInput({ key: ' ' });
    }
}

function populateSelectorBlocks(options) {
    if (!DOM.blockSelectionDiv) return;
    DOM.blockSelectionDiv.innerHTML = '';
    options.forEach(type => {
        const btn = document.createElement('button');
        btn.className = 'block-option';
        btn.textContent = type;
        btn.onclick = () => {
            if (socket) socket.emit('selectBlock', type);
        };
        DOM.blockSelectionDiv.appendChild(btn);
    });
}

function handleTouchStart(e) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
}

function handleTouchMove(e) {
    if (!gameActive) return;
    e.preventDefault();
    
    const touchEndX = e.touches[0].clientX;
    const touchEndY = e.touches[0].clientY;
    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;

    if (Math.abs(deltaX) > 30) {
        const key = deltaX > 0 ? 'ArrowRight' : 'ArrowLeft';
        if (gameMode === 'multiplayer' && socket) socket.emit('playerAction', key);
        else if (gameMode === 'single') handleSinglePlayerInput({ key });
        touchStartX = touchEndX;
    }
    
    if (deltaY > 30) {
        const key = 'ArrowDown';
        if (gameMode === 'multiplayer' && socket) socket.emit('playerAction', key);
        else if (gameMode === 'single') handleSinglePlayerInput({ key });
        touchStartY = touchEndY;
    }
}

// ==========================================
// 6. LÓGICA DE JUGABILIDAD (MODO INDIVIDUAL)
// ==========================================
function startSinglePlayerGame() {
    if (DOM.startScreen) DOM.startScreen.style.display = 'none';
    if (DOM.gameContent) DOM.gameContent.style.display = 'flex';
    
    if (DOM.singlePlayerControls) DOM.singlePlayerControls.style.display = 'flex';
    if (DOM.constructorControls) DOM.constructorControls.style.display = 'none';
    if (DOM.selectorSection) DOM.selectorSection.style.display = 'none';
    if (DOM.playerRoleDisplay) DOM.playerRoleDisplay.textContent = "Modo: Individual";
    
    currentBoard = Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(0));
    
    spawnBlock();
    
    if (gameInterval) clearInterval(gameInterval);
    gameInterval = setInterval(() => {
        if (gameActive) {
            moveBlockDown();
        }
    }, 1000);
    
    drawBoard();
}

function spawnBlock() {
    const types = Object.keys(SHAPES);
    const randomType = types[Math.floor(Math.random() * types.length)];
    
    currentBlock = {
        type: randomType,
        matrix: SHAPES[randomType],
        color: COLORS[randomType]
    };
    
    currentBlockX = Math.floor((BOARD_WIDTH - currentBlock.matrix[0].length) / 2);
    currentBlockY = 0;
    
    if (checkCollision(currentBlockX, currentBlockY, currentBlock.matrix)) {
        gameActive = false;
        clearInterval(gameInterval);
        if (DOM.gameOverOverlay) DOM.gameOverOverlay.style.display = 'flex';
        if (DOM.gameOverMessage) DOM.gameOverMessage.textContent = "¡Fin del Juego!";
    }
}

// ==========================================
// 7. MOVIMIENTOS Y COLISIONES
// ==========================================
function moveBlockDown() {
    if (!checkCollision(currentBlockX, currentBlockY + 1, currentBlock.matrix)) {
        currentBlockY++;
    } else {
        lockBlock();
        clearLines();
        spawnBlock();
    }
    drawBoard();
}

function checkCollision(nextX, nextY, matrix) {
    for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
            if (matrix[r][c]) {
                let boardX = nextX + c;
                let boardY = nextY + r;
                
                if (boardX < 0 || boardX >= BOARD_WIDTH || boardY >= BOARD_HEIGHT) {
                    return true;
                }
                if (boardY >= 0 && currentBoard[boardY][boardX]) {
                    return true;
                }
            }
        }
    }
    return false;
}

function lockBlock() {
    for (let r = 0; r < currentBlock.matrix.length; r++) {
        for (let c = 0; c < currentBlock.matrix[r].length; c++) {
            if (currentBlock.matrix[r][c]) {
                let boardY = currentBlockY + r;
                let boardX = currentBlockX + c;
                if (boardY >= 0) {
                    currentBoard[boardY][boardX] = currentBlock.color;
                }
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
    if (!currentBlock) return;
    
    const n = currentBlock.matrix.length;
    const m = currentBlock.matrix[0].length;
    let rotated = Array.from({ length: m }, () => Array(n).fill(0));
    
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < m; c++) {
            rotated[c][n - 1 - r] = currentBlock.matrix[r][c];
        }
    }
    
    if (!checkCollision(currentBlockX, currentBlockY, rotated)) {
        currentBlock.matrix = rotated;
    }
}

// ==========================================
// 8. PROCESADOR DE ENTRADAS (INPUTS)
// ==========================================
function handleSinglePlayerInput(e) {
    if (!gameActive || !currentBlock) return;
    
    const key = e.key;
    
    switch (key) {
        case 'ArrowLeft':
            if (!checkCollision(currentBlockX - 1, currentBlockY, currentBlock.matrix)) currentBlockX--;
            break;
        case 'ArrowRight':
            if (!checkCollision(currentBlockX + 1, currentBlockY, currentBlock.matrix)) currentBlockX++;
            break;
        case 'ArrowDown':
            moveBlockDown();
            break;
        case 'ArrowUp':
            rotateBlock();
            break;
        case ' ': 
            while (!checkCollision(currentBlockX, currentBlockY + 1, currentBlock.matrix)) {
                currentBlockY++;
            }
            moveBlockDown();
            break;
    }
    drawBoard();
}

// ==========================================
// 9. FUNCIÓN DE DIBUJO / RENDERIZADO
// ==========================================
function drawBoard() {
    if (!DOM.gameBoard) return;
    
    DOM.gameBoard.innerHTML = '';
    
    for (let r = 0; r < BOARD_HEIGHT; r++) {
        for (let c = 0; c < BOARD_WIDTH; c++) {
            if (currentBoard[r] && currentBoard[r][c]) {
                createCell(c, r, currentBoard[r][c]);
            }
        }
    }
    
    if (currentBlock && currentBlock.matrix) {
        for (let r = 0; r < currentBlock.matrix.length; r++) {
            for (let c = 0; c < currentBlock.matrix[r].length; c++) {
                if (currentBlock.matrix[r][c]) {
                    createCell(currentBlockX + c, currentBlockY + r, currentBlock.color);
                }
            }
        }
    }

    if (DOM.currentFallingBlockInfo && window.nextBlock && window.nextBlock.matrix) {
        let miniBoardHTML = `<p style="margin: 5px 0; color: white;"><strong>Siguiente Pieza:</strong></p>`;
        miniBoardHTML += `<div style="display: grid; grid-template-columns: repeat(${window.nextBlock.matrix[0].length}, 20px); gap: 2px; justify-content: center; margin-bottom: 10px;">`;
        
        for (let r = 0; r < window.nextBlock.matrix.length; r++) {
            for (let c = 0; c < window.nextBlock.matrix[r].length; c++) {
                const isSolid = window.nextBlock.matrix[r][c];
                const color = isSolid ? window.nextBlock.color : 'transparent';
                const shadow = isSolid ? 'inset 0 0 4px rgba(0,0,0,0.5)' : 'none';
                miniBoardHTML += `<div style="width: 20px; height: 20px; background-color: ${color}; box-shadow: ${shadow};"></div>`;
            }
        }
        miniBoardHTML += `</div>`;
        DOM.currentFallingBlockInfo.innerHTML = miniBoardHTML;
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
