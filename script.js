const socket = io();
let localStream, myName = "", myAvatar = "https://www.pngall.com/wp-content/uploads/5/User-Profile-PNG.png";
let peers = {};

// Handle Avatar Upload Preview
document.getElementById('avatar-input').onchange = function(e) {
    const reader = new FileReader();
    reader.onload = () => {
        myAvatar = reader.result;
        document.getElementById('avatar-preview').src = myAvatar;
    };
    reader.readAsDataURL(e.target.files[0]);
};

// Join Call
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
    } catch (e) { alert("Mic Access Required"); }
};

// Socket Events
socket.on('all-participants', users => {
    users.forEach(u => {
        const peer = connectPeer(u.socketId, true);
        peers[u.socketId] = { peer, name: u.username, avatar: u.avatar };
        addCard(u.socketId, u.username, u.avatar);
    });
    updateCount();
});

socket.on('user-joined', data => {
    const peer = connectPeer(data.callerID, false, data.signal);
    peers[data.callerID] = { peer, name: data.username, avatar: data.avatar };
    addCard(data.callerID, data.username, data.avatar);
    updateCount();
});

socket.on('receiving-returned-signal', d => peers[d.id].peer.signal(d.signal));

socket.on('user-left', id => {
    if(peers[id]) { peers[id].peer.destroy(); delete peers[id]; }
    document.getElementById(`card-${id}`)?.remove();
    updateCount();
});

// Chat Logic
const msgInput = document.getElementById('chat-msg-input');
const sendBtn = document.getElementById('send-msg-btn');
const chatImg = document.getElementById('chat-img');

function sendMsg(text = "", img = null) {
    if (!text && !img) return;
    socket.emit('send-msg', { text, img, name: myName });
    msgInput.value = "";
}

sendBtn.onclick = () => sendMsg(msgInput.value);
msgInput.onkeypress = (e) => { if(e.key === 'Enter') sendMsg(msgInput.value); };

chatImg.onchange = (e) => {
    const reader = new FileReader();
    reader.onload = () => sendMsg("", reader.result);
    reader.readAsDataURL(e.target.files[0]);
};

socket.on('new-msg', data => {
    const area = document.getElementById('chat-messages');
    const div = document.createElement('div');
    const isMe = data.name === myName;
    div.className = `msg ${isMe ? 'me' : 'other'}`;
    div.innerHTML = `
        <span class="u">${isMe ? 'You' : data.name}</span>
        ${data.text ? `<div>${data.text}</div>` : ''}
        ${data.img ? `<img src="${data.img}">` : ''}
    `;
    area.appendChild(div);
    area.scrollTop = area.scrollHeight;
});

// WebRTC & UI Helpers
function connectPeer(target, isInit, sig = null) {
    const p = new SimplePeer({ initiator: isInit, trickle: false, stream: localStream });
    p.on('signal', s => {
        if(isInit) socket.emit('sending-signal', { userToSignal: target, callerID: socket.id, signal: s, username: myName, avatar: myAvatar });
        else socket.emit('returning-signal', { signal: s, callerID: target });
    });
    p.on('stream', s => {
        let a = document.createElement('audio');
        a.srcObject = s; a.autoplay = true;
        document.getElementById('audio-container').appendChild(a);
    });
    if(sig) p.signal(sig);
    return p;
}

function addCard(id, name, avatar, isMe = false) {
    const grid = document.getElementById('user-grid');
    const div = document.createElement('div');
    div.className = 'u-card'; div.id = `card-${id}`;
    div.innerHTML = `<img src="${avatar}"><p>${isMe ? 'YOU' : name.toUpperCase()}</p>`;
    grid.appendChild(div);
}

function switchTab(tab) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`${tab}-section`).classList.remove('hidden');
    event.currentTarget.classList.add('active');
}

function updateCount() { document.getElementById('user-count').innerText = Object.keys(peers).length + 1; }

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