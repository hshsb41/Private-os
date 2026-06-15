const socket = io();
let localStream, myName = "", myAvatar = "https://www.pngall.com/wp-content/uploads/5/User-Profile-PNG.png";
let peers = {};

// Google STUN Servers (कल जोड्नको लागि अनिवार्य)
const iceConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Avatar Preview
document.getElementById('avatar-input').onchange = (e) => {
    const reader = new FileReader();
    reader.onload = () => {
        myAvatar = reader.result;
        document.getElementById('avatar-preview').src = myAvatar;
    };
    reader.readAsDataURL(e.target.files[0]);
};

// Join Room
document.getElementById('join-btn').onclick = async () => {
    myName = document.getElementById('username').value.trim();
    if (!myName) return;

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        document.getElementById('join-screen').classList.add('hidden');
        document.getElementById('main-app').classList.remove('hidden');
        
        socket.emit('join-room', { username: myName, avatar: myAvatar, room: 'GLOBAL' });
        addCard('me', myName, myAvatar, true);
        startTimer();
        monitorVoice(localStream);
    } catch (e) {
        alert("Please enable Microphone access!");
    }
};

socket.on('all-participants', users => {
    users.forEach(u => {
        const peer = createPeer(u.socketId, socket.id, localStream);
        peers[u.socketId] = { peer, name: u.username, avatar: u.avatar };
        addCard(u.socketId, u.username, u.avatar);
    });
    updateCount();
});

socket.on('user-joined', data => {
    const peer = addPeer(data.signal, data.callerID, localStream);
    peers[data.callerID] = { peer, name: data.username, avatar: data.avatar };
    addCard(data.callerID, data.username, data.avatar);
    updateCount();
});

socket.on('receiving-returned-signal', d => {
    if(peers[d.id]) peers[d.id].peer.signal(d.signal);
});

socket.on('user-left', id => {
    if(peers[id]) {
        peers[id].peer.destroy();
        delete peers[id];
    }
    document.getElementById(`card-${id}`)?.remove();
    updateCount();
});

// Peer Functions
function createPeer(userToSignal, callerID, stream) {
    const peer = new SimplePeer({
        initiator: true,
        trickle: false,
        config: iceConfig,
        stream
    });
    peer.on('signal', signal => {
        socket.emit('sending-signal', { userToSignal, callerID, signal, username: myName, avatar: myAvatar });
    });
    peer.on('stream', s => playRemote(s, userToSignal));
    return peer;
}

function addPeer(incomingSignal, callerID, stream) {
    const peer = new SimplePeer({
        initiator: false,
        trickle: false,
        config: iceConfig,
        stream
    });
    peer.on('signal', signal => {
        socket.emit('returning-signal', { signal, callerID });
    });
    peer.on('stream', s => playRemote(s, callerID));
    peer.signal(incomingSignal);
    return peer;
}

function playRemote(stream, id) {
    let a = document.getElementById(`audio-${id}`);
    if(!a) {
        a = document.createElement('audio');
        a.id = `audio-${id}`;
        a.autoplay = true;
        document.getElementById('audio-container').appendChild(a);
    }
    a.srcObject = stream;
}

// Messaging Logic (Fixed)
const msgInput = document.getElementById('chat-msg-input');
const chatImg = document.getElementById('chat-img');

document.getElementById('send-msg-btn').onclick = () => {
    if(msgInput.value.trim()) {
        socket.emit('send-msg', { text: msgInput.value, img: null, name: myName });
        msgInput.value = "";
    }
};

chatImg.onchange = (e) => {
    const reader = new FileReader();
    reader.onload = () => socket.emit('send-msg', { text: "", img: reader.result, name: myName });
    reader.readAsDataURL(e.target.files[0]);
};

socket.on('new-msg', data => {
    const area = document.getElementById('chat-messages');
    const isMe = data.name === myName;
    const div = document.createElement('div');
    div.className = `msg ${isMe ? 'me' : 'other'}`;
    div.innerHTML = `
        <span class="u">${data.name}</span>
        ${data.text ? `<div>${data.text}</div>` : ''}
        ${data.img ? `<img src="${data.img}" style="max-width:200px; border-radius:10px;">` : ''}
    `;
    area.appendChild(div);
    area.scrollTop = area.scrollHeight;
});

// UI & Voice Helpers
function addCard(id, name, avatar, isMe = false) {
    if(document.getElementById(`card-${id}`)) return;
    const grid = document.getElementById('user-grid');
    const div = document.createElement('div');
    div.className = 'u-card'; div.id = `card-${id}`;
    div.innerHTML = `<img src="${avatar}"><p>${isMe ? 'YOU' : name}</p>`;
    grid.appendChild(div);
}

function switchTab(tab) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`${tab}-section`).classList.remove('hidden');
    event.currentTarget.classList.add('active');
}

function updateCount() {
    document.getElementById('user-count').innerText = Object.keys(peers).length + 1;
}

function monitorVoice(stream) {
    const ctx = new AudioContext(), ana = ctx.createAnalyser();
    ctx.createMediaStreamSource(stream).connect(ana);
    const data = new Uint8Array(ana.frequencyBinCount);
    const check = () => {
        ana.getByteFrequencyData(data);
        const speaking = (data.reduce((a,b)=>a+b)/data.length) > 15;
        socket.emit('speak', speaking);
        const card = document.getElementById('card-me');
        if(card) speaking ? card.classList.add('speaking') : card.classList.remove('speaking');
        requestAnimationFrame(check);
    };
    check();
}

socket.on('user-speak', d => {
    const el = document.getElementById(`card-${d.id}`);
    if(el) d.talk ? el.classList.add('speaking') : el.classList.remove('speaking');
});

document.getElementById('mute-btn').onclick = function() {
    const active = localStream.getAudioTracks()[0].enabled;
    localStream.getAudioTracks()[0].enabled = !active;
    this.classList.toggle('muted');
    this.innerHTML = active ? '<i class="fas fa-microphone-slash"></i>' : '<i class="fas fa-microphone"></i>';
};

document.getElementById('leave-btn').onclick = () => location.reload();

function startTimer() {
    let s = 0;
    setInterval(() => {
        s++;
        let m = Math.floor(s/60).toString().padStart(2,'0'), sec = (s%60).toString().padStart(2,'0');
        document.getElementById('call-timer').innerText = `${m}:${sec}`;
    }, 1000);
}