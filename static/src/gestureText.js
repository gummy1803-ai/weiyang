// src/gestureText.js
// 手势-文本映射系统:5种手势识别 + 粒子文字动画 + 设置绑定 + 反馈
// 复用 MediaPipe Hands landmark,不干扰主星相机控制(由调用方决定是否接管)
// ====================================================================

const STORAGE_KEY = 'gestureTextSettings_v1';

// 5 种显著区分的手势定义(基于指尖/指根到手腕距离)
const GESTURE_DEFS = {
    fist:     { label: '✊ 握拳',   icon: '✊', desc: '所有手指握紧' },
    open:     { label: '✋ 张开',   icon: '✋', desc: '五指完全张开' },
    scissors: { label: '✌️ 剪刀手', icon: '✌️', desc: '食指+中指伸出' },
    call:     { label: '🤙 电话',   icon: '🤙', desc: '拇指+小指伸出' },
    ok:       { label: '👌 OK',    icon: '👌', desc: '拇指尖碰食指尖' },
};
const GESTURE_KEYS = Object.keys(GESTURE_DEFS);

const DEFAULT_TEXTS = {
    fist:     '引力坍缩 一切归于奇点',
    open:     '星云绽放 万象更新',
    scissors: '剪刀手 划破虚空',
    call:     '电话接通 星际连线',
    ok:       '一切就绪 任务确认',
};

// 速度档(粒子飞行秒数)
const SPEED_LEVELS = { 1: 2.5, 2: 1.5, 3: 0.8 };

let settings = loadSettings();
let modeOn = false;

// 手势识别防抖
let lastRawGesture = null;
let stableFrames = 0;
const STABLE_NEED = 3;          // 连续 N 帧同一手势才确认
let confirmedGesture = null;
let lastTriggerTime = 0;
const COOLDOWN_MS = 1800;       // 同一手势触发冷却

// 粒子文字系统
let ptCanvas, ptCtx;
let particles = [];
let activeText = '';
let animStartTime = 0;
let lastFrameTime = 0;

// Web Audio 反馈
let audioCtx = null;
function ensureAudio() {
    if (!audioCtx) {
        try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audioCtx = null; }
    }
}
function beep(freq, dur = 0.12, type = 'sine', gain = 0.15) {
    ensureAudio();
    if (!audioCtx) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(gain, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + dur);
}
function playSuccess() { beep(660, 0.08, 'sine', 0.12); setTimeout(() => beep(990, 0.12, 'sine', 0.12), 70); }
function playFail() { beep(180, 0.2, 'sawtooth', 0.1); }

// ---------- 设置持久化 ----------
function loadSettings() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { texts: { ...DEFAULT_TEXTS }, speed: 2 };
}
function saveSettings() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (e) {}
}
export function getSettings() { return settings; }
export function updateSetting(key, value) {
    if (key === 'speed') { settings.speed = value; }
    else if (key in DEFAULT_TEXTS) { settings.texts[key] = value; }
    saveSettings();
}

// ---------- 手势分类(landmarks 是 21 个点) ----------
function fingerExtended(landmarks, tipIdx, mcpIdx) {
    const wrist = landmarks[0];
    const tip = landmarks[tipIdx], mcp = landmarks[mcpIdx];
    const dTip = (tip.x - wrist.x) ** 2 + (tip.y - wrist.y) ** 2;
    const dMcp = (mcp.x - wrist.x) ** 2 + (mcp.y - wrist.y) ** 2;
    return dTip > dMcp * 1.25;
}

function classifyGesture(landmarks) {
    const indexExt = fingerExtended(landmarks, 8, 5);
    const middleExt = fingerExtended(landmarks, 12, 9);
    const ringExt = fingerExtended(landmarks, 16, 13);
    const pinkyExt = fingerExtended(landmarks, 20, 17);
    // 拇指: tip4 到 wrist 距离 vs thumbMCP(2) 到 wrist
    const wrist = landmarks[0];
    const dTip4 = (landmarks[4].x - wrist.x) ** 2 + (landmarks[4].y - wrist.y) ** 2;
    const dMcp2 = (landmarks[2].x - wrist.x) ** 2 + (landmarks[2].y - wrist.y) ** 2;
    const thumbExt = dTip4 > dMcp2 * 1.15;

    // OK: 拇指尖与食指尖捏合 + 其余伸展
    const pinchD = Math.hypot(landmarks[4].x - landmarks[8].x, landmarks[4].y - landmarks[8].y);
    const handScale = Math.hypot(landmarks[0].x - landmarks[9].x, landmarks[0].y - landmarks[9].y) + 1e-6;
    if (pinchD / handScale < 0.35 && middleExt && ringExt && pinkyExt) return 'ok';

    if (indexExt && middleExt && ringExt && pinkyExt) return 'open';
    if (!indexExt && !middleExt && !ringExt && !pinkyExt) return 'fist';
    if (indexExt && middleExt && !ringExt && !pinkyExt) return 'scissors';
    if (thumbExt && pinkyExt && !indexExt && !middleExt && !ringExt) return 'call';
    return null;
}

// ---------- 供 main.js 调用:处理一帧 landmark ----------
export function handleGestureFrame(landmarks) {
    if (!modeOn) return null;
    const raw = classifyGesture(landmarks);
    if (raw === lastRawGesture) stableFrames++;
    else { lastRawGesture = raw; stableFrames = 1; }

    if (stableFrames >= STABLE_NEED && raw) {
        const now = performance.now();
        if (raw !== confirmedGesture || now - lastTriggerTime > COOLDOWN_MS) {
            confirmedGesture = raw;
            lastTriggerTime = now;
            triggerGestureText(raw);
            return raw;
        }
    }
    return raw; // 仍返回原始识别结果供 UI 显示
}

export function resetGestureState() {
    lastRawGesture = null; stableFrames = 0; confirmedGesture = null;
}

// ---------- 触发粒子文字 ----------
function triggerGestureText(gesture) {
    const text = (settings.texts[gesture] || '').trim();
    if (!text) { playFail(); flashFeedback('请先绑定文本', false); return; }
    showParticleText(text);
    playSuccess();
    flashFeedback(`${GESTURE_DEFS[gesture].label}  →  ${text}`, true);
}

// ---------- 粒子文字系统 ----------
function initParticleCanvas() {
    ptCanvas = document.createElement('canvas');
    ptCanvas.id = 'particle-text-canvas';
    ptCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:12;';
    document.body.appendChild(ptCanvas);
    ptCtx = ptCanvas.getContext('2d');
    resizeParticleCanvas();
    window.addEventListener('resize', resizeParticleCanvas);
}
function resizeParticleCanvas() {
    const dpr = window.devicePixelRatio || 1;
    ptCanvas.width = window.innerWidth * dpr;
    ptCanvas.height = window.innerHeight * dpr;
    ptCanvas.style.width = window.innerWidth + 'px';
    ptCanvas.style.height = window.innerHeight + 'px';
    ptCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function showParticleText(text) {
    activeText = text;
    animStartTime = performance.now();
    particles = buildTextParticles(text);
}

function buildTextParticles(text) {
    const W = window.innerWidth, H = window.innerHeight;
    const off = document.createElement('canvas');
    const octx = off.getContext('2d');
    const fontSize = Math.min(90, Math.max(40, Math.floor(W / (text.length + 2))));
    off.width = W; off.height = H;
    octx.fillStyle = '#fff';
    octx.font = `bold ${fontSize}px 'Segoe UI', sans-serif`;
    octx.textAlign = 'center';
    octx.textBaseline = 'middle';
    octx.fillText(text, W / 2, H / 2);

    const img = octx.getImageData(0, 0, W, H).data;
    const step = Math.max(3, Math.floor(fontSize / 14));
    const pts = [];
    for (let y = 0; y < H; y += step) {
        for (let x = 0; x < W; x += step) {
            const idx = (y * W + x) * 4 + 3;
            if (img[idx] > 128) {
                pts.push({ tx: x, ty: y });
            }
        }
    }
    // 限制总粒子数,过多性能差
    const MAX = 3500;
    if (pts.length > MAX) {
        const stride = pts.length / MAX;
        const sampled = [];
        for (let i = 0; i < MAX; i++) sampled.push(pts[Math.floor(i * stride)]);
        pts.length = 0; pts.push(...sampled);
    }

    const cx = W / 2, cy = H / 2;
    const hueBase = 280; // 紫金色调
    return pts.map(p => {
        const a = Math.random() * Math.PI * 2;
        const r = 80 + Math.random() * 200;
        return {
            x: cx + Math.cos(a) * r,
            y: cy + Math.sin(a) * r,
            tx: p.tx, ty: p.ty,
            vx: 0, vy: 0,
            life: 1.0,
            hue: hueBase + (Math.random() - 0.5) * 40,
            size: 1.5 + Math.random() * 1.5,
        };
    });
}

function updateParticleText(now) {
    if (!ptCtx) return;
    const dt = lastFrameTime ? Math.min(0.05, (now - lastFrameTime) / 1000) : 0.016;
    lastFrameTime = now;
    const elapsed = (now - animStartTime) / 1000;
    const flyDur = SPEED_LEVELS[settings.speed] || 1.5;
    const t = Math.min(1, elapsed / flyDur);

    ptCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    // 拖尾淡化
    ptCtx.globalCompositeOperation = 'destination-out';
    ptCtx.fillStyle = 'rgba(0,0,0,0.18)';
    ptCtx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    ptCtx.globalCompositeOperation = 'lighter';

    for (const p of particles) {
        // 飞向目标
        p.x += (p.tx - p.x) * 0.06;
        p.y += (p.ty - p.y) * 0.06;
        // 到达后逐渐消散
        const reached = Math.hypot(p.tx - p.x, p.ty - p.y) < 2;
        if (reached && t > 0.85) p.life = Math.max(0, p.life - dt * 0.6);
        if (p.life <= 0) continue;
        ptCtx.globalAlpha = p.life;
        ptCtx.fillStyle = `hsl(${p.hue}, 90%, 70%)`;
        ptCtx.beginPath();
        ptCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ptCtx.fill();
    }
    ptCtx.globalAlpha = 1;
    ptCtx.globalCompositeOperation = 'source-over';

    // 动画结束清理
    if (t >= 1 && elapsed > flyDur + 1.2) {
        particles = [];
        activeText = '';
    }
}

// ---------- 反馈提示 ----------
let feedbackTimer = null;
function flashFeedback(text, ok) {
    let el = document.getElementById('gesture-feedback');
    if (!el) {
        el = document.createElement('div');
        el.id = 'gesture-feedback';
        el.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);padding:16px 28px;border-radius:14px;font-size:18px;font-weight:700;letter-spacing:1px;z-index:50;pointer-events:none;opacity:0;transition:opacity .25s;backdrop-filter:blur(8px);font-family:"Segoe UI",sans-serif;';
        document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.background = ok ? 'rgba(20,80,40,0.85)' : 'rgba(100,20,20,0.85)';
    el.style.border = ok ? '1px solid #44ff88' : '1px solid #ff5555';
    el.style.color = ok ? '#bbffcc' : '#ffbbbb';
    el.style.boxShadow = ok ? '0 0 30px rgba(68,255,136,0.5)' : '0 0 20px rgba(255,85,85,0.4)';
    el.style.opacity = '1';
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => { el.style.opacity = '0'; }, 1600);
}

// ---------- 模式开关 ----------
export function isGestureTextMode() { return modeOn; }
export function setGestureTextMode(on) {
    modeOn = on;
    if (on) {
        resetGestureState();
        flashFeedback('手势文本模式已开启', true);
    } else {
        particles = []; activeText = '';
        if (ptCtx) ptCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
    const btn = document.getElementById('gesture-text-toggle');
    if (btn) btn.classList.toggle('active', on);
}

// ---------- 设置面板 ----------
function buildSettingsPanel() {
    const wrap = document.createElement('div');
    wrap.id = 'gesture-settings-panel';
    wrap.className = 'hidden';
    wrap.innerHTML = `
        <div class="gs-mask"></div>
        <div class="gs-box">
            <div class="gs-title">🌀 手势-文本绑定设置</div>
            <div class="gs-hint">5 种手势各绑定一条文本(10-30 字符),识别到手势时粒子文字自动浮现</div>
            <div class="gs-list"></div>
            <div class="gs-speed">
                <span>文字显现速度:</span>
                <button data-speed="1">慢</button>
                <button data-speed="2" class="active">中</button>
                <button data-speed="3">快</button>
            </div>
            <div class="gs-actions">
                <button id="gs-reset">恢复默认</button>
                <button id="gs-close" class="primary">完成</button>
            </div>
        </div>`;
    document.body.appendChild(wrap);

    const list = wrap.querySelector('.gs-list');
    GESTURE_KEYS.forEach(k => {
        const def = GESTURE_DEFS[k];
        const row = document.createElement('div');
        row.className = 'gs-row';
        row.innerHTML = `
            <div class="gs-gesture" title="${def.desc}">
                <span class="gs-icon">${def.icon}</span>
                <span class="gs-name">${def.label}</span>
            </div>
            <input type="text" class="gs-input" maxlength="30" placeholder="输入 10-30 字符..." value="${settings.texts[k]}" data-gesture="${k}">
            <span class="gs-count">${(settings.texts[k]||'').length}/30</span>`;
        list.appendChild(row);
    });

    wrap.querySelector('.gs-list').addEventListener('input', (e) => {
        const inp = e.target.closest('.gs-input');
        if (!inp) return;
        const g = inp.dataset.gesture;
        let v = inp.value;
        if (v.length > 30) v = v.slice(0, 30);
        updateSetting(g, v);
        inp.parentElement.querySelector('.gs-count').textContent = v.length + '/30';
    });

    wrap.querySelectorAll('.gs-speed button').forEach(b => {
        b.addEventListener('click', () => {
            const s = parseInt(b.dataset.speed);
            settings.speed = s; saveSettings();
            wrap.querySelectorAll('.gs-speed button').forEach(x => x.classList.toggle('active', x === b));
        });
    });
    const curSpeed = wrap.querySelector(`.gs-speed button[data-speed="${settings.speed}"]`);
    if (curSpeed) { wrap.querySelectorAll('.gs-speed button').forEach(x => x.classList.remove('active')); curSpeed.classList.add('active'); }

    wrap.querySelector('#gs-reset').addEventListener('click', () => {
        settings = { texts: { ...DEFAULT_TEXTS }, speed: 2 }; saveSettings();
        wrap.querySelectorAll('.gs-input').forEach(inp => inp.value = settings.texts[inp.dataset.gesture]);
        wrap.querySelectorAll('.gs-count').forEach((c, i) => c.textContent = (settings.texts[GESTURE_KEYS[i]] || '').length + '/30');
        wrap.querySelectorAll('.gs-speed button').forEach(x => x.classList.toggle('active', parseInt(x.dataset.speed) === 2));
    });
    wrap.querySelector('#gs-close').addEventListener('click', () => wrap.classList.add('hidden'));
    wrap.querySelector('.gs-mask').addEventListener('click', () => wrap.classList.add('hidden'));
}

export function openSettingsPanel() {
    document.getElementById('gesture-settings-panel')?.classList.remove('hidden');
}
export function closeSettingsPanel() {
    document.getElementById('gesture-settings-panel')?.classList.add('hidden');
}

// ---------- 初始化 ----------
export function initGestureText() {
    initParticleCanvas();
    buildSettingsPanel();
    // 注入样式
    if (!document.getElementById('gesture-text-style')) {
        const s = document.createElement('style');
        s.id = 'gesture-text-style';
        s.textContent = GS_STYLE;
        document.head.appendChild(s);
    }
    // 模式按钮
    let toggle = document.getElementById('gesture-text-toggle');
    if (!toggle) {
        toggle = document.createElement('button');
        toggle.id = 'gesture-text-toggle';
        toggle.innerHTML = '🌀 手势文本';
        toggle.title = '开启后手势将触发绑定文本的粒子显示(相机控制暂停)';
        toggle.addEventListener('click', () => setGestureTextMode(!modeOn));
        const ff = document.getElementById('fastforward-btn');
        if (ff && ff.parentNode) ff.parentNode.insertBefore(toggle, ff);
        else document.body.appendChild(toggle);
    }
    let setBtn = document.getElementById('gesture-settings-btn');
    if (!setBtn) {
        setBtn = document.createElement('button');
        setBtn.id = 'gesture-settings-btn';
        setBtn.innerHTML = '⚙️ 文本设置';
        setBtn.title = '自定义 5 种手势绑定的文本与显示速度';
        setBtn.addEventListener('click', openSettingsPanel);
        const ff = document.getElementById('fastforward-btn');
        if (ff && ff.parentNode) ff.parentNode.insertBefore(setBtn, ff);
        else document.body.appendChild(setBtn);
    }
    // 粒子动画主循环
    requestAnimationFrame(function loop(now) { updateParticleText(now); requestAnimationFrame(loop); });
}

const GS_STYLE = `
#gesture-text-toggle, #gesture-settings-btn {
    position: absolute; top: 24px; z-index: 17;
    background: rgba(10,5,25,0.75); border: 1px solid rgba(150,100,220,0.6);
    border-radius: 20px; padding: 8px 16px; color: #c7b8ff; font-size: 13px;
    cursor: pointer; font-family: inherit; letter-spacing: 1px;
    transition: all .25s; backdrop-filter: blur(6px);
}
#gesture-text-toggle { right: 30px; }
#gesture-settings-btn { right: 150px; }
#gesture-text-toggle:hover, #gesture-settings-btn:hover {
    background: rgba(130,80,255,0.25); border-color: #9966ff; color: #e0d4ff;
    box-shadow: 0 0 15px rgba(130,80,255,0.5);
}
#gesture-text-toggle.active {
    background: linear-gradient(90deg, rgba(255,150,0,0.3), rgba(255,70,90,0.3));
    border-color: #ffaa44; color: #ffd9a8;
    box-shadow: 0 0 18px rgba(255,150,0,0.6);
    animation: gtPulse 1.8s ease-in-out infinite;
}
@keyframes gtPulse { 0%,100%{box-shadow:0 0 12px rgba(255,150,0,.4);} 50%{box-shadow:0 0 24px rgba(255,150,0,.85);} }
#gesture-settings-panel { position: fixed; inset: 0; z-index: 80; display: flex; align-items: center; justify-content: center; }
#gesture-settings-panel.hidden { display: none; }
#gesture-settings-panel .gs-mask { position: absolute; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); }
#gesture-settings-panel .gs-box {
    position: relative; width: min(560px, 92vw); max-height: 88vh; overflow-y: auto;
    background: linear-gradient(160deg, rgba(20,10,45,0.97), rgba(10,5,30,0.97));
    border: 1px solid rgba(150,100,220,0.5); border-radius: 16px; padding: 24px;
    box-shadow: 0 0 50px rgba(120,70,220,0.4); color: #e0d4ff;
}
#gesture-settings-panel .gs-title { font-size: 20px; font-weight: 800; letter-spacing: 2px; color: #ffcc88; margin-bottom: 6px; }
#gesture-settings-panel .gs-hint { font-size: 12px; color: rgba(200,180,230,0.6); margin-bottom: 16px; line-height: 1.5; }
#gesture-settings-panel .gs-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
#gesture-settings-panel .gs-row { display: flex; align-items: center; gap: 10px; }
#gesture-settings-panel .gs-gesture { width: 110px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 2px; }
#gesture-settings-panel .gs-icon { font-size: 26px; }
#gesture-settings-panel .gs-name { font-size: 11px; color: #bbaaff; }
#gesture-settings-panel .gs-input {
    flex: 1; padding: 9px 12px; border-radius: 8px; border: 1px solid rgba(130,80,220,0.4);
    background: rgba(10,5,25,0.8); color: #e8e0ff; font-family: inherit; font-size: 14px; outline: none;
}
#gesture-settings-panel .gs-input:focus { border-color: #9966ff; box-shadow: 0 0 10px rgba(130,80,255,0.4); }
#gesture-settings-panel .gs-count { font-size: 11px; color: rgba(180,160,210,0.5); width: 36px; text-align: right; }
#gesture-settings-panel .gs-speed { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; font-size: 13px; color: #bbaaff; }
#gesture-settings-panel .gs-speed button {
    padding: 6px 16px; border-radius: 16px; border: 1px solid rgba(130,80,220,0.4);
    background: rgba(10,5,25,0.7); color: #bbaaff; cursor: pointer; font-family: inherit;
}
#gesture-settings-panel .gs-speed button.active { background: rgba(130,80,255,0.35); border-color: #bbaaff; color: #fff; }
#gesture-settings-panel .gs-actions { display: flex; gap: 12px; justify-content: flex-end; }
#gesture-settings-panel .gs-actions button {
    padding: 9px 20px; border-radius: 10px; border: 1px solid rgba(130,80,220,0.4);
    background: rgba(10,5,25,0.7); color: #c7b8ff; cursor: pointer; font-family: inherit; font-size: 14px;
}
#gesture-settings-panel .gs-actions button.primary { background: linear-gradient(90deg, #7744ff, #aa66ff); border-color: #bbaaff; color: #fff; }
`;
