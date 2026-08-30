const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

io.on('connection', (socket) => {
    socket.on('joinRoom', ({ channelId, user }) => {
        const roomId = channelId || 'default-room';
        socket.join(roomId);

        if (!rooms[roomId]) {
            rooms[roomId] = { players: [], interval: null, timeLeft: 900 }; // 15 minutos
        }

        const room = rooms[roomId];
        
        if (!room.players.find(p => p.id === socket.id)) {
            const role = room.players.length === 0 ? 'constructor' : 'selector';
            room.players.push({ id: socket.id, role, username: user ? user.username : 'Jugador' });
            socket.emit('roleAssignment', role);
        }

        // Iniciar partida con envío seguro de datos
        if (room.players.length === 2 && !room.interval) {
            io.to(roomId).emit('gameStartReady', { players: room.players });
            io.to(roomId).emit('timerSync', room.timeLeft); // Fuerza el timer al instante
            
            room.interval = setInterval(() => {
                room.timeLeft--;
                io.to(roomId).emit('timerSync', room.timeLeft);
                
                if (room.timeLeft <= 0) {
                    clearInterval(room.interval);
                    room.interval = null;
                    io.to(roomId).emit('gameOver', { winner: 'constructor', reason: 'time' });
                }
            }, 1000);
        }
    });

    socket.on('syncGameState', (data) => {
        let roomId = Array.from(socket.rooms).find(r => r !== socket.id);
        if (roomId) socket.to(roomId).emit('gameStateUpdate', data);
    });

    socket.on('sendNextBlock', (type) => {
        let roomId = Array.from(socket.rooms).find(r => r !== socket.id);
        if (roomId) socket.to(roomId).emit('receiveNextBlock', type);
    });

    socket.on('constructorLost', () => {
        let roomId = Array.from(socket.rooms).find(r => r !== socket.id);
        if (roomId && rooms[roomId]) {
            clearInterval(rooms[roomId].interval);
            rooms[roomId].interval = null;
            io.to(roomId).emit('gameOver', { winner: 'selector', reason: 'board_full' });
        }
    });

    socket.on('disconnect', () => {
        for (const roomId in rooms) {
            rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
            if (rooms[roomId].players.length === 0) {
                if (rooms[roomId].interval) clearInterval(rooms[roomId].interval);
                delete rooms[roomId];
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));
