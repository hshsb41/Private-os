const socket = io();
let localStream, myName = "", myAvatar = "https://i.ibb.co/Y4KjTgvP/Picsart-26-02-07-02-21-57-621.jpg";
let peers = {};
let aCtx;

const ice = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };

// Preview Image
document.getElementById('avatar-input').onchange = (e) => {
    const r = new FileReader();
    r.onload = () => { myAvatar = r.result; document.getElementById('preview').src = r.result; };
    r.readAsDataURL(e.target.files[0]);
};

// JOIN ACTION
document.getElementById('join-btn').onclick = async () => {
    myName = document.getElementById('username').value.trim();
    if (!myName) return;
    try {
        // iPhone Audio Fix: Unlock context
        aCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (aCtx.state === 'suspended') aCtx.resume();

        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        document.getElementById('join-page').classList.add('hidden');
        document.getElementById('main-app').classList.remove('hidden');
        
        socket.emit('join', { name: myName, avatar: myAvatar });
        renderUser('me', myName, myAvatar, true);
        startTimer();
        voiceTracker();
    } catch (e) {
        alert("Microphone required for voice call!");
    }
};

socket.on('users', list => {
    list.forEach(u => {
        const p = createPeer(u.id, true);
        peers[u.id] = { p, name: u.name, avatar: u.avatar };
        renderUser(u.id, u.name, u.avatar);
    });
    updateOnlineCount();
});

socket.on('user-joined', u => {
    const p = createPeer(u.id, false);
    peers[u.id] = { p, name: u.name, avatar: u.avatar };
    renderUser(u.id, u.name, u.avatar);
    updateOnlineCount();
});

socket.on('signal', d => {
    if (peers[d.from]) peers[d.from].p.signal(d.sig);
});

socket.on('left', id => {
    if(peers[id]) { peers[id].p.destroy(); delete peers[id]; }
    document.getElementById(`card-${id}`)?.remove();
    updateOnlineCount();
});

function createPeer(id, init) {
    const p = new SimplePeer({ initiator: init, trickle: false, config: ice, stream: localStream });
    p.on('signal', s => socket.emit('signal', { to: id, sig: s }));
    p.on('stream', s => {
        let a = document.createElement('audio');
        a.srcObject = s; a.autoplay = true;
        a.setAttribute('playsinline', 'true');
        document.getElementById('audio-container').appendChild(a);
        // Force play for iPhone
        a.play().catch(() => console.log("Sound will play on next tap"));
    });
    return p;
}

// Chat Logic
const chatForm = document.getElementById('chat-form');
const chatInp = document.getElementById('chat-input');

chatForm.onsubmit = (e) => {
    e.preventDefault();
    if (chatInp.value.trim()) {
        socket.emit('msg', { t: chatInp.value, i: null, name: myName });
        chatInp.value = "";
    }
};

document.getElementById('chat-file').onchange = (e) => {
    const r = new FileReader();
    r.onload = () => socket.emit('msg', { t: "", i: r.result, name: myName });
    r.readAsDataURL(e.target.files[0]);
};

socket.on('msg', d => {
    const box = document.getElementById('chat-messages');
    const isMe = d.name === myName;
    const div = document.createElement('div');
    div.className = `msg ${isMe ? 'me' : 'other'}`;
    div.innerHTML = `<span class="msg-u">${d.name}</span>${d.t ? `<div>${d.t}</div>` : ''}${d.i ? `<img src="${d.i}">` : ''}`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
});

function renderUser(id, n, a, isMe = false) {
    if(document.getElementById(`card-${id}`)) return;
    const grid = document.getElementById('user-grid');
    const d = document.createElement('div');
    d.className = 'u-card'; d.id = `card-${id}`;
    d.innerHTML = `<img src="${a}"><span>${isMe ? 'You' : n}</span>`;
    grid.appendChild(d);
}

function switchTab(t) {
    document.querySelectorAll('.tab-view').forEach(v => v.classList.add('hidden'));
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.getElementById(`${t}-tab`).classList.remove('hidden');
    event.currentTarget.classList.add('active');
    if (aCtx) aCtx.resume();
}

function updateOnlineCount() { document.getElementById('count').innerText = Object.keys(peers).length + 1; }

function voiceTracker() {
    const ana = aCtx.createAnalyser();
    aCtx.createMediaStreamSource(localStream).connect(ana);
    const data = new Uint8Array(ana.frequencyBinCount);
    const check = () => {
        ana.getByteFrequencyData(data);
        const talk = (data.reduce((a,b)=>a+b)/data.length) > 15;
        socket.emit('talk', talk);
        const el = document.getElementById('card-me');
        if(el) talk ? el.classList.add('is-talking') : el.classList.remove('is-talking');
        requestAnimationFrame(check);
    };
    check();
}

socket.on('talk', d => {
    const el = document.getElementById(`card-${d.id}`);
    if(el) d.talk ? el.classList.add('is-talking') : el.classList.remove('is-talking');
});

document.getElementById('mute-toggle').onclick = function() {
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
document.getElementById('leave-call').onclick = () => location.reload();