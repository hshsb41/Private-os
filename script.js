const socket = io();
let localStream, myName = "", myAvatar = "https://i.ibb.co/Y4KjTgvP/Picsart-26-02-07-02-21-57-621.jpg";
let peers = {};

const iceSettings = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };

// Image Preview
document.getElementById('avatar-input').onchange = (e) => {
    const reader = new FileReader();
    reader.onload = () => {
        myAvatar = reader.result;
        document.getElementById('avatar-preview').src = myAvatar;
    };
    reader.readAsDataURL(e.target.files[0]);
};

// Start Experience
document.getElementById('join-btn').onclick = async () => {
    myName = document.getElementById('username').value.trim();
    if (!myName) return;
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        document.getElementById('join-screen').classList.add('hidden');
        document.getElementById('main-app').classList.remove('hidden');
        socket.emit('join-room', { username: myName, avatar: myAvatar, room: 'GLOBAL' });
        createCard('me', myName, myAvatar, true);
        initTimer();
        voiceTracker(localStream);
    } catch (e) { alert("Enable Microphone Access"); }
};

// Signaling Logic
socket.on('all-participants', users => {
    users.forEach(u => {
        const peer = startPeer(u.socketId, true);
        peers[u.socketId] = { peer, name: u.username, avatar: u.avatar };
        createCard(u.socketId, u.username, u.avatar);
    });
    refreshCounter();
});

socket.on('user-joined', data => {
    const peer = startPeer(data.callerID, false, data.signal);
    peers[data.callerID] = { peer, name: data.username, avatar: data.avatar };
    createCard(data.callerID, data.username, data.avatar);
    refreshCounter();
});

socket.on('receiving-returned-signal', d => { if(peers[d.id]) peers[d.id].peer.signal(d.signal); });

socket.on('user-left', id => {
    if(peers[id]) { peers[id].peer.destroy(); delete peers[id]; }
    document.getElementById(`card-${id}`)?.remove();
    refreshCounter();
});

function startPeer(target, isInit, sig = null) {
    const p = new SimplePeer({ initiator: isInit, trickle: false, config: iceSettings, stream: localStream });
    p.on('signal', s => {
        if(isInit) socket.emit('sending-signal', { userToSignal: target, callerID: socket.id, signal: s, username: myName, avatar: myAvatar });
        else socket.emit('returning-signal', { signal: s, callerID: target });
    });
    p.on('stream', s => {
        let a = document.createElement('audio');
        a.srcObject = s; a.autoplay = true;
        document.getElementById('audio-dump').appendChild(a);
    });
    if(sig) p.signal(sig);
    return p;
}

// Messaging Logic
const chatInput = document.getElementById('chat-input');
const sendMsg = (txt = "", img = null) => {
    if(!txt && !img) return;
    socket.emit('send-msg', { text: txt, img: img, name: myName });
    chatInput.value = "";
};

document.getElementById('send-btn').onclick = () => sendMsg(chatInput.value);
chatInput.onkeypress = (e) => { if(e.key === 'Enter') sendMsg(chatInput.value); };
document.getElementById('chat-img').onchange = (e) => {
    const reader = new FileReader();
    reader.onload = () => sendMsg("", reader.result);
    reader.readAsDataURL(e.target.files[0]);
};

socket.on('new-msg', d => {
    const area = document.getElementById('chat-messages');
    const isMe = d.name === myName;
    const div = document.createElement('div');
    div.className = `msg-bubble ${isMe ? 'me' : 'other'}`;
    div.innerHTML = `<span class="msg-info">${d.name}</span>${d.text ? `<div>${d.text}</div>` : ''}${d.img ? `<img src="${d.img}">` : ''}`;
    area.appendChild(div);
    area.scrollTop = area.scrollHeight;
});

// Helpers
function createCard(id, name, avatar, isMe = false) {
    if(document.getElementById(`card-${id}`)) return;
    const grid = document.getElementById('user-grid');
    const div = document.createElement('div');
    div.className = 'u-card'; div.id = `card-${id}`;
    div.innerHTML = `<img src="${avatar}"><span>${isMe ? 'You' : name}</span>`;
    grid.appendChild(div);
}

function showTab(tab) {
    document.querySelectorAll('.tab-view').forEach(v => v.classList.add('hidden'));
    document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
    document.getElementById(`${tab}-view`).classList.remove('hidden');
    event.currentTarget.classList.add('active');
}

function refreshCounter() { document.getElementById('user-count').innerText = Object.keys(peers).length + 1; }

function voiceTracker(stream) {
    const ctx = new AudioContext(), ana = ctx.createAnalyser();
    ctx.createMediaStreamSource(stream).connect(ana);
    const data = new Uint8Array(ana.frequencyBinCount);
    const check = () => {
        ana.getByteFrequencyData(data);
        const talk = (data.reduce((a,b)=>a+b)/data.length) > 15;
        socket.emit('speak', talk);
        const el = document.getElementById('card-me');
        if(el) talk ? el.classList.add('is-talking') : el.classList.remove('is-talking');
        requestAnimationFrame(check);
    };
    check();
}

socket.on('user-speak', d => {
    const el = document.getElementById(`card-${d.id}`);
    if(el) d.talk ? el.classList.add('is-talking') : el.classList.remove('is-talking');
});

document.getElementById('mute-btn').onclick = function() {
    const active = localStream.getAudioTracks()[0].enabled;
    localStream.getAudioTracks()[0].enabled = !active;
    this.classList.toggle('muted');
    this.innerHTML = active ? '<i class="fas fa-microphone-slash"></i>' : '<i class="fas fa-microphone"></i>';
};
document.getElementById('leave-btn').onclick = () => location.reload();

function initTimer() {
    let s = 0;
    setInterval(() => {
        s++;
        let m = Math.floor(s/60).toString().padStart(2,'0'), sec = (s%60).toString().padStart(2,'0');
        document.getElementById('call-timer').innerText = `${m}:${sec}`;
    }, 1000);
}