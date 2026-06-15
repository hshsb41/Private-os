const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*" },
    maxHttpBufferSize: 1e7 // १०MB सम्मको फोटो पठाउन मिल्ने
});

app.use(express.static(__dirname));

const users = {};
let messages = [];

io.on('connection', (socket) => {
    socket.on('join-room', (data) => {
        users[socket.id] = { 
            username: data.username, 
            avatar: data.avatar, 
            room: data.room 
        };
        socket.join(data.room);
        
        // पुराना म्यासेज नयाँ युजरलाई पठाउने
        messages.forEach(m => socket.emit('new-msg', m));

        // नयाँ युजर आएको अरूलाई जानकारी दिने
        const participants = Object.keys(users)
            .filter(id => users[id].room === data.room && id !== socket.id)
            .map(id => ({ 
                socketId: id, 
                username: users[id].username, 
                avatar: users[id].avatar 
            }));
        
        socket.emit('all-participants', participants);
    });

    socket.on('sending-signal', p => {
        io.to(p.userToSignal).emit('user-joined', { 
            signal: p.signal, 
            callerID: p.callerID, 
            username: p.username, 
            avatar: p.avatar 
        });
    });

    socket.on('returning-signal', p => {
        io.to(p.callerID).emit('receiving-returned-signal', { 
            signal: p.signal, 
            id: socket.id 
        });
    });

    socket.on('send-msg', (data) => {
        const msg = { ...data, time: Date.now(), id: socket.id };
        messages.push(msg);
        // सबैलाई म्यासेज पठाउने (पठाउने व्यक्तिलाई पनि)
        io.emit('new-msg', msg);
        
        // १ घण्टा पछि मेसेज डिले गर्ने
        setTimeout(() => {
            messages = messages.filter(m => m !== msg);
        }, 3600000);
    });

    socket.on('speak', (status) => {
        if(users[socket.id]) {
            socket.to(users[socket.id].room).emit('user-speak', { 
                id: socket.id, 
                talk: status 
            });
        }
    });

    socket.on('disconnect', () => {
        if (users[socket.id]) {
            io.emit('user-left', socket.id);
            delete users[socket.id];
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server live on port ${PORT}`));