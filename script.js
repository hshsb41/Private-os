const socket = io();
let localStream, myName = "", myAvatar = "https://i.ibb.co/Y4KjTgvP/Picsart-26-02-07-02-21-57-621.jpg";
let peers = {};
let audioCtx;

const ice = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };

document.getElementById('avatar-input').onchange = (e) => {
    const r = new FileReader();
    r.onload = () => { myAvatar = r.result; document.getElementById('preview').src = r.result; };
    r.readAsDataURL(e.target.files[0]);
};

// JOIN CALL CLICK
document.getElementById('join-btn').onclick = async () => {
    myName = document.getElementById('username').value.trim();
    if (!myName) return;
    try {
        // iPhone Audio Unlock: User interaction मा AudioContext सुरु गर्नैपर्छ
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();

        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        document.getElementById('join-screen').classList.add('hidden');
        document.getElementById('app-screen').classList.remove('hidden');
        
        socket.emit('join', { name: myName, avatar: myAvatar });
        addUI('me', myName, myAvatar, true);
        initTimer();
        micCheck();
    } catch (e) {
        alert("Microphone Required! Please allow mic access.");
    }
};

socket.on('users', list => {
    list.forEach(u => {
        const p = startPeer(u.id, true);
        peers[u.id] = { p, name: u.name, avatar: u.avatar };
        addUI(u.id, u.name, u.avatar);
    });
    countUpdate();
});

socket.on('user-connected', u => {
    const p = startPeer(u.id, false);
    peers[u.id] = { p, name: u.name, avatar: u.avatar };
    addUI(u.id, u.name, u.avatar);
    countUpdate();
});

socket.on('signal', data => {
    if (peers[data.from]) peers[data.from].p.signal(data.sig);
});

socket.on('left', id => {
    if(peers[id]) { peers[id].p.destroy(); delete peers[id]; }
    document.getElementById(`card-${id}`)?.remove();
    countUpdate();
});

function startPeer(id, init) {
    const p = new SimplePeer({ initiator: init, trickle: false, config: ice, stream: localStream });
    p.on('signal', s => socket.emit('signal', { to: id, sig: s }));
    p.on('stream', s => {
        let a = document.createElement('audio');
        a.srcObject = s; a.autoplay = true;
        a.playsInline = true; // iPhone sound fix
        document.getElementById('audio-dump').appendChild(a);
        
        // iPhone Force Play: User interaction पछि बज्न दिने
        a.play().catch(e => console.log("Audio play blocked by iOS, will play on next click"));
    });
    return p;
}

// CHAT FORM SUBMIT (iPhone Keyboard Fix)
const chatForm = document.getElementById('chat-form');
const inp = document.getElementById('c-input');

chatForm.onsubmit = (e) => {
    e.preventDefault();
    const t = inp.value.trim();
    if(t) {
        socket.emit('msg', { t, i: null, name: myName });
        inp.value = "";
        // Keep focus for next message on iPhone
        inp.focus();
    }
};

document.getElementById('send-btn').onclick = () => {
    chatForm.dispatchEvent(new Event('submit'));
};

document.getElementById('c-img').onchange = (e) => {
    const r = new FileReader();
    r.onload = () => socket.emit('msg', { t: "", i: r.result, name: myName });
    r.readAsDataURL(e.target.files[0]);
};

socket.on('msg', d => {
    const b = document.getElementById('chat-box');
    const isMe = d.name === myName;
    const div = document.createElement('div');
    div.className = `m-bubble ${isMe ? 'me' : 'other'}`;
    div.innerHTML = `<span class="m-name">${d.name}</span>${d.t ? `<div>${d.t}</div>` : ''}${d.i ? `<img src="${d.i}">` : ''}`;
    b.appendChild(div);
    b.scrollTop = b.scrollHeight;
});

function addUI(id, n, a, isMe = false) {
    if(document.getElementById(`card-${id}`)) return;
    const g = document.getElementById('user-grid');
    const d = document.createElement('div');
    d.className = 'u-card'; d.id = `card-${id}`;
    d.innerHTML = `<img src="${a}"><span>${isMe ? 'You' : n}</span>`;
    g.appendChild(d);
}

function tab(t) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.querySelectorAll('.nav-btn').forEach(i => i.classList.remove('active'));
    document.getElementById(`${t}-view`).classList.remove('hidden');
    event.currentTarget.classList.add('active');
    
    // Resume audio context if it was blocked
    if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

function countUpdate() { document.getElementById('count').innerText = Object.keys(peers).length + 1; }

function micCheck() {
    const ana = audioCtx.createAnalyser();
    audioCtx.createMediaStreamSource(localStream).connect(ana);
    const data = new Uint8Array(ana.frequencyBinCount);
    const check = () => {
        ana.getByteFrequencyData(data);
        const talk = (data.reduce((a,b)=>a+b)/data.length) > 15;
        socket.emit('talk', talk);
        const el = document.getElementById('card-me');
        if(el) talk ? el.classList.add('talk') : el.classList.remove('talk');
        requestAnimationFrame(check);
    };
    check();
}

socket.on('talk', d => {
    const el = document.getElementById(`card-${d.id}`);
    if(el) d.talk ? el.classList.add('talk') : el.classList.remove('talk');
});

document.getElementById('mute-btn').onclick = function() {
    const act = localStream.getAudioTracks()[0].enabled;
    localStream.getAudioTracks()[0].enabled = !act;
    this.classList.toggle('muted');
    this.innerHTML = act ? '<i class="fas fa-microphone-slash"></i>' : '<i class="fas fa-microphone"></i>';
};

function initTimer() {
    let s = 0; setInterval(() => {
        s++; let m = Math.floor(s/60).toString().padStart(2,'0'), sec = (s%60).toString().padStart(2,'0');
        document.getElementById('timer').innerText = `${m}:${sec}`;
    }, 1000);
}
document.getElementById('leave-btn').onclick = () => location.reload();