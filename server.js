const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }, maxHttpBufferSize: 1e7 });

app.use(express.static(__dirname));

const users = {};
let chats = [];

io.on('connection', (socket) => {
    socket.on('join', (data) => {
        // युजरको डाटा सर्भरमा सेभ गर्ने
        users[socket.id] = { name: data.name, avatar: data.avatar };
        
        // अरूलाई नयाँ युजर आएको जानकारी दिने
        socket.broadcast.emit('user-connected', {
            id: socket.id,
            name: data.name,
            avatar: data.avatar
        });

        // नयाँ युजरलाई अहिले भएका सबैको लिष्ट र पुराना च्याट पठाउने
        chats.forEach(c => socket.emit('msg', c));
        const list = Object.keys(users)
            .filter(id => id !== socket.id)
            .map(id => ({ id, name: users[id].name, avatar: users[id].avatar }));
        socket.emit('users', list);
    });

    socket.on('signal', d => {
        // सिग्नलमा अब फोटो पठाइँदैन (यसले गर्दा जोइन छिटो हुन्छ)
        io.to(d.to).emit('signal', { sig: d.sig, from: socket.id });
    });

    socket.on('msg', d => {
        const m = { ...d, time: Date.now() };
        chats.push(m);
        io.emit('msg', m);
    });

    socket.on('talk', s => {
        if(users[socket.id]) socket.broadcast.emit('talk', { id: socket.id, talk: s });
    });

    socket.on('disconnect', () => {
        if (users[socket.id]) {
            io.emit('left', socket.id);
            delete users[socket.id];
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Live: ${PORT}`));