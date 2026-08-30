const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;

// ==========================================
// 1. CONFIGURACIÓN DE MIDDLEWARES Y CORS
// ==========================================
app.use(express.json());

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
});

// ==========================================
// 2. PIEZAS Y MOTOR DEL JUEGO EN EL SERVIDOR
// ==========================================
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

const rooms = new Map();

function createRoomState(roomId) {
    return {
        id: roomId,
        players: [],
        board: Array.from({ length: 20 }, () => Array(10).fill(0)),
        currentBlock: null,
        nextBlock: null,
        currentBlockX: 3,
        currentBlockY: 0,
        gameActive: false,
        timer: null
    };
}

function checkCollisionServer(board, x, y, matrix) {
    for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
            if (matrix[r][c]) {
                let boardX = x + c;
                let boardY = y + r;
                if (boardX < 0 || boardX >= 10 || boardY >= 20) return true;
                if (boardY >= 0 && board[boardY][boardX]) return true;
            }
        }
    }
    return false;
}

function rotateMatrix(matrix) {
    const n = matrix.length;
    const m = matrix[0].length;
    let rotated = Array.from({ length: m }, () => Array(n).fill(0));
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < m; c++) {
            rotated[c][n - 1 - r] = matrix[r][c];
        }
    }
    return rotated;
}

function spawnBlockServer(room) {
    const types = Object.keys(SHAPES);
    let type = room.nextBlock ? room.nextBlock.type : types[Math.floor(Math.random() * types.length)];
    
    room.currentBlock = {
        type: type,
        matrix: SHAPES[type],
        color: COLORS[type]
    };
    room.nextBlock = null;
    room.currentBlockX = Math.floor((10 - room.currentBlock.matrix[0].length) / 2);
    room.currentBlockY = 0;

    if (checkCollisionServer(room.board, room.currentBlockX, room.currentBlockY, room.currentBlock.matrix)) {
        room.gameActive = false;
        if (room.timer) clearInterval(room.timer);
        io.to(room.id).emit('gameOver');
    }
}

function lockBlockServer(room) {
    const matrix = room.currentBlock.matrix;
    for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
            if (matrix[r][c]) {
                let bY = room.currentBlockY + r;
                let bX = room.currentBlockX + c;
                if (bY >= 0) {
                    room.board[bY][bX] = room.currentBlock.color;
                }
            }
        }
    }
}

function clearLinesServer(room) {
    room.board = room.board.filter(row => row.some(cell => cell === 0));
    while (room.board.length < 20) {
        room.board.unshift(Array(10).fill(0));
    }
}

function broadcastState(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;
    io.to(roomId).emit('gameStateUpdate', {
        board: room.board,
        currentBlock: room.currentBlock,
        nextBlock: room.nextBlock,
        x: room.currentBlockX,
        y: room.currentBlockY
    });
}

function startRoomGameLoop(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    spawnBlockServer(room);
    broadcastState(roomId);

    if (room.timer) clearInterval(room.timer);

    room.timer = setInterval(() => {
        if (!room.gameActive || !room.currentBlock) return;
        
        if (!checkCollisionServer(room.board, room.currentBlockX, room.currentBlockY + 1, room.currentBlock.matrix)) {
            room.currentBlockY++;
        } else {
            lockBlockServer(room);
            clearLinesServer(room);
            spawnBlockServer(room);
        }
        broadcastState(roomId);
    }, 1000);
}

// ==========================================
// 3. RUTA OAUTH2 DE DISCORD (/api/token)
// ==========================================
app.post('/api/token', async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Falta el parámetro "code".' });

    try {
        const response = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: DISCORD_CLIENT_ID,
                client_secret: DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
            }),
        });

        const data = await response.json();
        if (!response.ok) return res.status(response.status).json({ error: data.error_description || 'Error al obtener token' });

        res.json({ access_token: data.access_token });
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// ==========================================
// 4. EVENTOS DE SOCKET.IO
// ==========================================
io.on('connection', (socket) => {
    console.log(`Jugador conectado: ${socket.id}`);

    const handleJoin = (data) => {
        const roomId = (typeof data === 'string' ? data : data?.channelId) || 'default-room';
        const user = data?.user || { username: 'Jugador' };

        socket.join(roomId);
        socket.roomId = roomId;

        if (!rooms.has(roomId)) {
            rooms.set(roomId, createRoomState(roomId));
        }

        const room = rooms.get(roomId);

        let player = room.players.find(p => p.id === socket.id);
        if (!player) {
            const role = room.players.length === 0 ? 'constructor' : (room.players.length === 1 ? 'selector' : 'spectator');
            player = { id: socket.id, username: user.username, role };
            room.players.push(player);
        }

        socket.emit('roleAssignment', player.role);
        console.log(`Jugador ${player.username} unido a sala ${roomId} como ${player.role}`);

        if (room.players.length === 1) {
            socket.emit('roomCreated', roomId);
        } else if (room.players.length >= 2 && !room.gameActive) {
            room.gameActive = true;
            io.to(roomId).emit('gameStartReady');
            startRoomGameLoop(roomId);
        }
    };

    socket.on('joinRoom', handleJoin);
    socket.on('joinOnlineGame', (roomCode) => handleJoin({ channelId: roomCode }));

    socket.on('playerAction', (action) => {
        const roomId = socket.roomId;
        if (!roomId || !rooms.has(roomId)) return;

        const room = rooms.get(roomId);
        const player = room.players.find(p => p.id === socket.id);

        if (!player || player.role !== 'constructor' || !room.gameActive || !room.currentBlock) return;

        let key = action;
        if (key === 'rotate') key = 'ArrowUp';
        if (key === 'hardDrop') key = ' ';

        switch (key) {
            case 'ArrowLeft':
                if (!checkCollisionServer(room.board, room.currentBlockX - 1, room.currentBlockY, room.currentBlock.matrix)) {
                    room.currentBlockX--;
                }
                break;
            case 'ArrowRight':
                if (!checkCollisionServer(room.board, room.currentBlockX + 1, room.currentBlockY, room.currentBlock.matrix)) {
                    room.currentBlockX++;
                }
                break;
            case 'ArrowDown':
                if (!checkCollisionServer(room.board, room.currentBlockX, room.currentBlockY + 1, room.currentBlock.matrix)) {
                    room.currentBlockY++;
                }
                break;
            case 'ArrowUp':
                let rotated = rotateMatrix(room.currentBlock.matrix);
                if (!checkCollisionServer(room.board, room.currentBlockX, room.currentBlockY, rotated)) {
                    room.currentBlock.matrix = rotated;
                }
                break;
            case ' ':
                while (!checkCollisionServer(room.board, room.currentBlockX, room.currentBlockY + 1, room.currentBlock.matrix)) {
                    room.currentBlockY++;
                }
                lockBlockServer(room);
                clearLinesServer(room);
                spawnBlockServer(room);
                break;
        }
        broadcastState(roomId);
    });

    socket.on('selectBlock', (blockType) => {
        const roomId = socket.roomId;
        if (!roomId || !rooms.has(roomId)) return;

        const room = rooms.get(roomId);
        const player = room.players.find(p => p.id === socket.id);

        if (!player || player.role !== 'selector') return;

        room.nextBlock = { type: blockType, matrix: SHAPES[blockType], color: COLORS[blockType] };
        broadcastState(roomId);
    });

    socket.on('disconnect', () => {
        console.log(`Jugador desconectado: ${socket.id}`);
        const roomId = socket.roomId;
        if (roomId && rooms.has(roomId)) {
            const room = rooms.get(roomId);
            room.players = room.players.filter(p => p.id !== socket.id);
            if (room.players.length === 0) {
                if (room.timer) clearInterval(room.timer);
                rooms.delete(roomId);
            }
        }
    });
});

// ==========================================
// 5. INICIALIZACIÓN Y TIMEOUTS
// ==========================================
server.listen(PORT, () => {
    console.log(`Servidor Tetris Dual Nexo listo en el puerto ${PORT}`);
});

server.keepAliveTimeout = 61000;
server.headersTimeout = 65000;