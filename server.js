const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*" },
    transports: ['polling', 'websocket'] // Forzar compatibilidad con plataformas en la nube
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

io.on('connection', (socket) => {
    console.log('Usuario conectado:', socket.id);

    socket.on('joinRoom', ({ channelId } = {}) => {
        const roomId = channelId || 'default-room';
        socket.join(roomId);

        if (!rooms[roomId]) {
            rooms[roomId] = { players: [], interval: null, timeLeft: 900 };
        }

        const room = rooms[roomId];
        
        // Evitar duplicados si el socket ya está registrado
        let existingPlayer = room.players.find(p => p.id === socket.id);
        if (!existingPlayer) {
            const role = room.players.length === 0 ? 'constructor' : 'selector';
            room.players.push({ id: socket.id, role, username: 'Jugador' });
            socket.emit('roleAssignment', role);
        }

        console.log(`Sala ${roomId} tiene ${room.players.length} jugadores.`);

        // Si hay 2 jugadores, iniciamos la partida
        if (room.players.length === 2 && !room.interval) {
            io.to(roomId).emit('gameStartReady', { players: room.players });
            io.to(roomId).emit('timerSync', room.timeLeft);
            
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
        console.log('Usuario desconectado:', socket.id);
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
server.listen(PORT, () => console.log(`Servidor ejecutándose en el puerto ${PORT}`));
