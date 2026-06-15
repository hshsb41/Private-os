const socket = io();
let localStream, myName = "", myAvatar = "https://i.ibb.co/Y4KjTgvP/Picsart-26-02-07-02-21-57-621.jpg";
let peers = {};

const ice = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// Preview Image
document.getElementById('avatar-input').onchange = (e) => {
    const r = new FileReader();
    r.onload = () => { myAvatar = r.result; document.getElementById('preview').src = r.result; };
    r.readAsDataURL(e.target.files[0]);
};

// Join
document.getElementById('join-btn').onclick = async () => {
    myName = document.getElementById('username').value.trim();
    if (!myName) return;
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        document.getElementById('join-page').classList.add('hidden');
        document.getElementById('app-page').classList.remove('hidden');
        socket.emit('join', { name: myName, avatar: myAvatar });
        addCard('me', myName, myAvatar, true);
        startTimer();
        voiceCheck();
    } catch (e) { alert("Mic required"); }
};

socket.on('users', list => {
    list.forEach(u => {
        const p = createPeer(u.id, true);
        peers[u.id] = { p, name: u.name, avatar: u.avatar };
        addCard(u.id, u.name, u.avatar);
    });
    updateCount();
});

socket.on('signal', d => {
    if (d.sig && peers[d.from]) peers[d.from].p.signal(d.sig);
    else if (d.sig && !peers[d.from]) {
        const p = createPeer(d.from, false, d.sig);
        peers[d.from] = { p, name: d.name, avatar: d.avatar };
        addCard(d.from, d.name, d.avatar);
        updateCount();
    }
});

socket.on('left', id => {
    if(peers[id]) { peers[id].p.destroy(); delete peers[id]; }
    document.getElementById(`card-${id}`)?.remove();
    updateCount();
});

function createPeer(id, init, sig = null) {
    const p = new SimplePeer({ initiator: init, trickle: false, config: ice, stream: localStream });
    p.on('signal', s => socket.emit('signal', { to: id, sig: s, name: myName, avatar: myAvatar }));
    p.on('stream', s => {
        let a = document.createElement('audio'); a.srcObject = s; a.autoplay = true;
        document.getElementById('audio-dump').appendChild(a);
    });
    if(sig) p.signal(sig);
    return p;
}

// Messaging (Fixed Typing)
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('c-input');

chatForm.onsubmit = (e) => {
    e.preventDefault();
    const txt = chatInput.value.trim();
    if (txt) {
        socket.emit('msg', { t: txt, i: null, name: myName });
        chatInput.value = "";
    }
};

document.getElementById('c-img').onchange = (e) => {
    const r = new FileReader();
    r.onload = () => socket.emit('msg', { t: "", i: r.result, name: myName });
    r.readAsDataURL(e.target.files[0]);
};

socket.on('msg', d => {
    const box = document.getElementById('chat-messages');
    const isMe = d.name === myName;
    const div = document.createElement('div');
    div.className = `m-bubble ${isMe ? 'me' : 'other'}`;
    div.innerHTML = `<span class="m-name">${d.name}</span>${d.t ? `<div>${d.t}</div>` : ''}${d.i ? `<img src="${d.i}">` : ''}`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
});

function switchTab(t) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`${t}-view`).classList.remove('hidden');
    document.getElementById(`tab-${t}`).classList.add('active');
}

function addCard(id, n, a, isMe = false) {
    if(document.getElementById(`card-${id}`)) return;
    const grid = document.getElementById('user-grid');
    const d = document.createElement('div');
    d.className = 'u-card'; d.id = `card-${id}`;
    d.innerHTML = `<img src="${a}"><span>${isMe ? 'YOU' : n}</span>`;
    grid.appendChild(d);
}

function updateCount() { document.getElementById('count').innerText = Object.keys(peers).length + 1; }

function voiceCheck() {
    const ctx = new AudioContext(), ana = ctx.createAnalyser();
    ctx.createMediaStreamSource(localStream).connect(ana);
    const data = new Uint8Array(ana.frequencyBinCount);
    const run = () => {
        ana.getByteFrequencyData(data);
        const talk = (data.reduce((a,b)=>a+b)/data.length) > 15;
        socket.emit('talk', talk);
        const el = document.getElementById('card-me');
        if(el) talk ? el.classList.add('active-talk') : el.classList.remove('active-talk');
        requestAnimationFrame(run);
    };
    run();
}

socket.on('talk', d => {
    const el = document.getElementById(`card-${d.id}`);
    if(el) d.talk ? el.classList.add('active-talk') : el.classList.remove('active-talk');
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
        document.getElementById('timer').innerText = `${m}:${sec}`;
    }, 1000);
}
document.getElementById('leave-btn').onclick = () => location.reload();