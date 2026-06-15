const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }, maxHttpBufferSize: 1e7 });

app.use(express.static(__dirname));

const users = {};
let chats = [];

// Clean chats older than 1 hour
setInterval(() => {
    const now = Date.now();
    chats = chats.filter(c => now - c.time < 3600000);
}, 60000);

io.on('connection', (socket) => {
    socket.on('join-room', (data) => {
        users[socket.id] = { username: data.username, avatar: data.avatar, room: data.room };
        socket.join(data.room);
        chats.forEach(c => socket.emit('new-msg', c));

        const participants = Object.keys(users)
            .filter(id => users[id].room === data.room && id !== socket.id)
            .map(id => ({ socketId: id, username: users[id].username, avatar: users[id].avatar }));
        socket.emit('all-participants', participants);
    });

    socket.on('sending-signal', p => {
        io.to(p.userToSignal).emit('user-joined', { signal: p.signal, callerID: p.callerID, username: p.username, avatar: p.avatar });
    });

    socket.on('returning-signal', p => {
        io.to(p.callerID).emit('receiving-returned-signal', { signal: p.signal, id: socket.id });
    });

    socket.on('send-msg', (data) => {
        const msg = { ...data, time: Date.now() };
        chats.push(msg);
        io.emit('new-msg', msg);
    });

    socket.on('speak', (s) => {
        if(users[socket.id]) socket.to(users[socket.id].room).emit('user-speak', { id: socket.id, talk: s });
    });

    socket.on('disconnect', () => {
        if (users[socket.id]) {
            socket.to(users[socket.id].room).emit('user-left', socket.id);
            delete users[socket.id];
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server started on ${PORT}`));