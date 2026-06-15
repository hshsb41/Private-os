const socket = io();
let localStream, myName = "", myAvatar = "https://www.pngall.com/wp-content/uploads/5/User-Profile-PNG.png";
let peers = {};
let aCtx;

const iceConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };

document.getElementById('avatar-input').onchange = (e) => {
    const r = new FileReader();
    r.onload = () => { myAvatar = r.result; document.getElementById('avatar-preview').src = r.result; };
    r.readAsDataURL(e.target.files[0]);
};

document.getElementById('join-btn').onclick = async () => {
    myName = document.getElementById('username').value.trim();
    if (!myName) return;
    try {
        // iPhone Audio Fix
        aCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (aCtx.state === 'suspended') aCtx.resume();

        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        document.getElementById('join-screen').classList.add('hidden');
        document.getElementById('main-app').classList.remove('hidden');
        
        socket.emit('join-room', { username: myName, avatar: myAvatar, room: 'GLOBAL' });
        addUI('me', myName, myAvatar, true);
        startTimer();
        voiceTracker();
    } catch (e) { alert("Mic required!"); }
};

socket.on('all-participants', users => {
    users.forEach(u => {
        const p = startPeer(u.socketId, true);
        peers[u.socketId] = { p, name: u.username, avatar: u.avatar };
        addUI(u.socketId, u.username, u.avatar);
    });
    updateCount();
});

socket.on('user-joined', d => {
    const p = startPeer(d.callerID, false, d.signal);
    peers[d.callerID] = { p, name: d.username, avatar: d.avatar };
    addUI(d.callerID, d.username, d.avatar);
    updateCount();
});

socket.on('receiving-returned-signal', d => {
    if(peers[d.id]) peers[d.id].p.signal(d.signal);
});

socket.on('user-left', id => {
    if(peers[id]) { peers[id].p.destroy(); delete peers[id]; }
    document.getElementById(`card-${id}`)?.remove();
    updateCount();
});

function startPeer(to, isInit, sig = null) {
    const p = new SimplePeer({ initiator: isInit, trickle: false, config: iceConfig, stream: localStream });
    p.on('signal', s => {
        if(isInit) socket.emit('sending-signal', { userToSignal: to, callerID: socket.id, signal: s, username: myName, avatar: myAvatar });
        else socket.emit('returning-signal', { signal: s, callerID: to });
    });
    p.on('stream', s => {
        let a = document.createElement('audio');
        a.srcObject = s; a.autoplay = true;
        a.setAttribute('playsinline', 'true');
        document.getElementById('audio-container').appendChild(a);
        a.play().catch(() => {});
    });
    if(sig) p.signal(sig);
    return p;
}

// Chat logic
const chatForm = document.getElementById('chat-form');
const chatInp = document.getElementById('chat-msg-input');

chatForm.onsubmit = (e) => {
    e.preventDefault();
    if(chatInp.value.trim()) {
        socket.emit('send-msg', { text: chatInp.value, img: null, name: myName });
        chatInp.value = "";
    }
};

document.getElementById('chat-img').onchange = (e) => {
    const r = new FileReader();
    r.onload = () => socket.emit('send-msg', { text: "", img: r.result, name: myName });
    r.readAsDataURL(e.target.files[0]);
};

socket.on('new-msg', d => {
    const box = document.getElementById('chat-messages');
    const isMe = d.name === myName;
    const div = document.createElement('div');
    div.className = `msg ${isMe ? 'me' : 'other'}`;
    div.innerHTML = `<span class="msg-u">${d.name}</span>${d.text ? `<div>${d.text}</div>` : ''}${d.img ? `<img src="${d.img}">` : ''}`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
});

function addUI(id, n, a, isMe = false) {
    if(document.getElementById(`card-${id}`)) return;
    const g = document.getElementById('user-grid');
    const d = document.createElement('div');
    d.className = 'u-card'; d.id = `card-${id}`;
    d.innerHTML = `<img src="${a}"><span>${isMe ? 'You' : n}</span>`;
    g.appendChild(d);
}

function switchTab(t) {
    document.querySelectorAll('.tab-view').forEach(v => v.classList.add('hidden'));
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.getElementById(`${t}-section`).classList.remove('hidden');
    event.currentTarget.classList.add('active');
    if(aCtx) aCtx.resume();
}

function updateCount() { document.getElementById('user-count').innerText = Object.keys(peers).length + 1; }

function voiceTracker() {
    const ana = aCtx.createAnalyser();
    aCtx.createMediaStreamSource(localStream).connect(ana);
    const data = new Uint8Array(ana.frequencyBinCount);
    const check = () => {
        ana.getByteFrequencyData(data);
        const talk = (data.reduce((a,b)=>a+b)/data.length) > 15;
        socket.emit('speak', talk);
        const card = document.getElementById('card-me');
        if(card) talk ? card.classList.add('speaking') : card.classList.remove('speaking');
        requestAnimationFrame(check);
    };
    check();
}

socket.on('user-speak', d => {
    const el = document.getElementById(`card-${d.id}`);
    if(el) d.talk ? el.classList.add('speaking') : el.classList.remove('speaking');
});

document.getElementById('mute-btn').onclick = function() {
    const act = localStream.getAudioTracks()[0].enabled;
    localStream.getAudioTracks()[0].enabled = !act;
    this.classList.toggle('muted');
    this.innerHTML = act ? '<i class="fas fa-microphone-slash"></i>' : '<i class="fas fa-microphone"></i>';
};

function startTimer() {
    let s = 0; setInterval(() => {
        s++; let m = Math.floor(s/60).toString().padStart(2,'0'), sec = (s%60).toString().padStart(2,'0');
        document.getElementById('call-timer').innerText = `${m}:${sec}`;
    }, 1000);
}
document.getElementById('leave-btn').onclick = () => location.reload();