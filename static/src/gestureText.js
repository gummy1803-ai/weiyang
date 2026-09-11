// src/gestureText.js
// 手势-文本映射系统 v2:5种手势识别 + 三阶段粒子文字(飞入→保持→消散)
// 粒子由屏幕外螺旋汇聚成文字,无DOM文本框,纯Canvas发光粒子
// ====================================================================

const STORAGE_KEY = 'gestureTextSettings_v1';

// 5 种显著区分的手势定义
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

// 速度档:飞入秒数 / 保持秒数 / 消散秒数
const SPEED_LEVELS = {
    1: { fly: 2.2, hold: 3.2, out: 1.2, label: '慢' },
    2: { fly: 1.3, hold: 2.6, out: 0.9, label: '中' },
    3: { fly: 0.7, hold: 2.0, out: 0.6, label: '快' },
};

let settings = loadSettings();
let modeOn = false;

// 手势识别防抖
let lastRawGesture = null;
let stableFrames = 0;
const STABLE_NEED = 3;
let confirmedGesture = null;
let lastTriggerTime = 0;
const COOLDOWN_MS = 1800;

// ====== 粒子系统参数(集中配置,便于调优) ======
const PS = {
    budgetDesktop: 3600,   // 桌面端粒子预算(生成数量上限)
    budgetMobile:  1800,   // 移动端粒子预算
    alphaThreshold: 100,   // 文字像素采样阈值(0-255,越低粒子越密)
    flySize: 2.6,          // 飞行中粒子半径系数(相对baseSize)
    arriveSize: 1.0,       // 到位后粒子半径系数
    glowOuter: 3.2,        // 外光晕半径倍数
    flyHueStart: 35,       // 飞入起始色相(橙金)
    flyHueEnd: 280,        // 飞入结束色相(紫)
    holdHue: 275,          // 保持阶段色相
    holdLightness: 72,     // 保持阶段亮度
    outHue: 15,            // 消散阶段色相(红橙)
    spiral: 0.9,           // 切向速度系数(螺旋汇聚感,0=直线)
    friction: 0.94,        // 消散阶段空气阻力
    outSpeed: 260,         // 爆开初速度(px/s)
    maxDelay: 0.45,        // 入场错峰延迟上限(秒,瀑布感)
    twinkleAmp: 0.18,      // 保持阶段闪烁幅度
    twinkleFreq: 5,        // 闪烁频率
    jitter: 0.9,           // 成型后微抖动幅度(px)
};

// 粒子文字系统
let ptCanvas, ptCtx;
let particles = [];
let animStartTime = 0;
let lastFrameTime = 0;
let phase = 'idle'; // idle | in | hold | out
const dbg = { frames: 0, lastError: null, lastDrawn: 0, lastSample: 0 };

// Web Audio 反馈
let audioCtx = null;
function ensureAudio() {
    if (!audioCtx) {
        try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audioCtx = null; }
    }
}
function beep(freq, dur = 0.12, type = 'sine', gain = 0.12) {
    ensureAudio();
    if (!audioCtx) return;
    try {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = type; o.frequency.value = freq;
        g.gain.setValueAtTime(gain, audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(); o.stop(audioCtx.currentTime + dur);
    } catch (e) {}
}
function playSuccess() { beep(660, 0.08, 'sine', 0.1); setTimeout(() => beep(990, 0.12, 'sine', 0.1), 70); }
function playFail() { beep(180, 0.2, 'sawtooth', 0.08); }

// ---------- 设置持久化 ----------
function loadSettings() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const p = JSON.parse(raw);
            if (p && p.texts && p.speed) return p;
        }
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

// ---------- 手势分类 ----------
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
    const wrist = landmarks[0];
    const dTip4 = (landmarks[4].x - wrist.x) ** 2 + (landmarks[4].y - wrist.y) ** 2;
    const dMcp2 = (landmarks[2].x - wrist.x) ** 2 + (landmarks[2].y - wrist.y) ** 2;
    const thumbExt = dTip4 > dMcp2 * 1.15;

    // OK: 拇指尖与食指尖捏合 + 其余三指伸展
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
    return raw;
}

export function resetGestureState() {
    lastRawGesture = null; stableFrames = 0; confirmedGesture = null;
}

// ---------- 触发:粒子文字本身即反馈,不弹DOM文本框 ----------
function triggerGestureText(gesture) {
    const text = (settings.texts[gesture] || '').trim();
    if (!text) {
        playFail();
        miniToast(`该手势未绑定文本,请点「⚙️ 文本设置」`, false);
        return;
    }
    showParticleText(text);
    playSuccess();
}

// ---------- 极简角标提示(仅失败时使用,不遮挡中央) ----------
let toastTimer = null;
function miniToast(text, ok) {
    let el = document.getElementById('gesture-mini-toast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'gesture-mini-toast';
        el.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);padding:7px 18px;border-radius:16px;font-size:13px;font-weight:600;z-index:40;pointer-events:none;opacity:0;transition:opacity .25s;backdrop-filter:blur(6px);font-family:"Segoe UI",sans-serif;white-space:nowrap;';
        document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.background = ok ? 'rgba(20,80,40,0.8)' : 'rgba(100,30,20,0.82)';
    el.style.border = ok ? '1px solid #44ff88' : '1px solid #ff8855';
    el.style.color = ok ? '#bbffcc' : '#ffccaa';
    el.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.style.opacity = '0'; }, 1800);
}

// ============================================================
// 粒子文字系统 v2 —— 三阶段: 飞入(IN) → 保持(HOLD) → 消散(OUT)
// ============================================================
function initParticleCanvas() {
    ptCanvas = document.createElement('canvas');
    ptCanvas.id = 'particle-text-canvas';
    ptCanvas.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:14;';
    document.body.appendChild(ptCanvas);
    ptCtx = ptCanvas.getContext('2d');
    resizeParticleCanvas();
    window.addEventListener('resize', resizeParticleCanvas);
}
function resizeParticleCanvas() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    ptCanvas.width = Math.floor(window.innerWidth * dpr);
    ptCanvas.height = Math.floor(window.innerHeight * dpr);
    ptCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function showParticleText(text) {
    const pts = sampleTextPoints(text);
    if (pts.length === 0) { miniToast('文字渲染失败', false); return; }
    particles = buildParticles(pts);
    animStartTime = performance.now();
    lastFrameTime = animStartTime;
    phase = 'in';
}

// 离屏渲染文字 → 按粒子预算均匀采样像素坐标
function sampleTextPoints(text) {
    const W = window.innerWidth, H = window.innerHeight;
    const off = document.createElement('canvas');
    off.width = W; off.height = H;
    const octx = off.getContext('2d');
    // 字号:根据字数与屏宽自适应,保证长文本也能完整显示
    const fontSize = Math.max(42, Math.min(108, Math.floor(W / (text.length * 1.05))));
    octx.font = `bold ${fontSize}px "Microsoft YaHei","PingFang SC","Segoe UI",sans-serif`;
    octx.textAlign = 'center';
    octx.textBaseline = 'middle';
    octx.fillStyle = '#fff';
    octx.fillText(text, W / 2, H / 2);

    const img = octx.getImageData(0, 0, W, H).data;
    // 初筛:较稀疏步长收集候选像素
    const step = Math.max(2, Math.round(fontSize / 22));
    const candidates = [];
    for (let y = 0; y < H; y += step) {
        for (let x = 0; x < W; x += step) {
            if (img[(y * W + x) * 4 + 3] > PS.alphaThreshold) {
                candidates.push(x, y);
            }
        }
    }
    // 按预算等距抽样,保证密度均匀
    const isMobile = W < 768;
    const budget = isMobile ? PS.budgetMobile : PS.budgetDesktop;
    const pointCount = candidates.length / 2;
    const pts = [];
    if (pointCount <= budget) {
        for (let i = 0; i < candidates.length; i += 2) {
            pts.push({ tx: candidates[i], ty: candidates[i + 1] });
        }
    } else {
        const stride = pointCount / budget;
        for (let i = 0; i < budget; i++) {
            const ci = Math.floor(i * stride) * 2;
            pts.push({ tx: candidates[ci], ty: candidates[ci + 1] });
        }
    }
    return pts;
}

// 为每个目标像素生成一个带物理属性的粒子
function buildParticles(pts) {
    const W = window.innerWidth, H = window.innerHeight;
    const cx = W / 2, cy = H / 2;
    const spawnR = Math.hypot(W, H) * 0.62; // 起点:屏幕外圆环
    const tNow = performance.now() / 1000;

    return pts.map(p => {
        // 起点方向:目标相对中心的方向加随机偏转,粒子从屏幕外飞入
        const baseAng = Math.atan2(p.ty - cy, p.tx - cx);
        const ang = baseAng + (Math.random() - 0.5) * 1.6;
        const ox = cx + Math.cos(ang) * spawnR;
        const oy = cy + Math.sin(ang) * spawnR;

        // 切向分量形成螺旋汇聚
        const tan = ang + Math.PI / 2;
        const sp = PS.spiral * (0.6 + Math.random() * 0.8);

        return {
            ox, oy,
            tx: p.tx + (Math.random() - 0.5) * 1.5,
            ty: p.ty + (Math.random() - 0.5) * 1.5,
            x: ox, y: oy,
            vx: Math.cos(tan) * sp * 60,  // 飞入切向初速度(视觉扰动)
            vy: Math.sin(tan) * sp * 60,
            outVx: 0, outVy: 0,           // 消散阶段速度(触发时分配)
            outInit: false,               // 是否已初始化消散速度
            baseSize: 1.1 + Math.random() * 1.3,
            delay: Math.random() * PS.maxDelay,
            hue: PS.flyHueStart + Math.random() * 40,
            twinkle: Math.random() * Math.PI * 2,
            t0: tNow,
        };
    });
}

const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

function updateParticleText(now) {
    if (!ptCtx) return;
    const W = window.innerWidth, H = window.innerHeight;
    const dt = lastFrameTime ? Math.min(0.05, (now - lastFrameTime) / 1000) : 0.016;
    lastFrameTime = now;
    dbg.frames++;

    // 每帧清空重画(不使用拖尾擦除,避免粒子发灰)
    try {
    ptCtx.clearRect(0, 0, W, H);
    if (particles.length === 0) { phase = 'idle'; return; }

    const timing = SPEED_LEVELS[settings.speed] || SPEED_LEVELS[2];
    const elapsed = (now - animStartTime) / 1000;
    const tSec = now / 1000;

    ptCtx.globalCompositeOperation = 'lighter'; // 加色混合:重叠处更亮,发光质感

    let alive = 0;
    for (const p of particles) {
        const lt = elapsed - p.delay; // 粒子局部时间(扣除错峰延迟)
        let alpha = 0, size = p.baseSize, hue = p.hue, drawX, drawY;

        if (lt < 0) {
            continue; // 还未出发,不绘制
        } else if (lt < timing.fly) {
            // ===== 阶段 IN:螺旋汇聚飞入 =====
            const k = easeOutCubic(Math.min(1, lt / timing.fly));
            drawX = p.ox + (p.tx - p.ox) * k;
            drawY = p.oy + (p.ty - p.oy) * k;
            // 沿飞行方向的法线施加弧形偏移(中段最大),形成螺旋汇聚轨迹
            const fdx = p.tx - p.ox, fdy = p.ty - p.oy;
            const flen = Math.hypot(fdx, fdy) + 1e-6;
            const curveAmt = PS.spiral * 140 * Math.sin(k * Math.PI) * (0.5 + (p.twinkle % 1) * 0.5);
            drawX += (-fdy / flen) * curveAmt;
            drawY += (fdx / flen) * curveAmt;
            hue = PS.flyHueStart + (PS.flyHueEnd - PS.flyHueStart) * k;
            size = p.baseSize * (PS.flySize + (PS.arriveSize - PS.flySize) * k);
            alpha = Math.min(1, k * 2.2);
            phase = 'in';
        } else if (lt < timing.fly + timing.hold) {
            // ===== 阶段 HOLD:成型保持,微抖动+闪烁 =====
            const hk = (lt - timing.fly) / timing.hold;
            drawX = p.tx + Math.sin(tSec * 3 + p.twinkle) * PS.jitter;
            drawY = p.ty + Math.cos(tSec * 2.6 + p.twinkle) * PS.jitter;
            hue = PS.holdHue + Math.sin(p.twinkle) * 18;
            size = p.baseSize * PS.arriveSize;
            alpha = 1 - PS.twinkleAmp + Math.sin(tSec * PS.twinkleFreq + p.twinkle) * PS.twinkleAmp * 0.5 + 0.12;
            alpha = Math.max(0.55, Math.min(1, alpha));
            // 临近消散微微收暗
            if (hk > 0.8) alpha *= 1 - (hk - 0.8) * 1.5;
            phase = 'hold';
        } else {
            // ===== 阶段 OUT:爆开消散(首次进入时以当前成型位置为起点分配物理速度) =====
            if (!p.outInit) {
                p.outInit = true;
                p.x = p.tx; p.y = p.ty; // 以成型位置为爆开起点,避免闪回屏幕外
                const a = Math.random() * Math.PI * 2;
                const sp = PS.outSpeed * (0.4 + Math.random() * 0.9);
                p.outVx = Math.cos(a) * sp;
                p.outVy = Math.sin(a) * sp - 60; // 略微上飘
            }
            const ok = Math.min(1, (lt - timing.fly - timing.hold) / timing.out);
            p.outVx *= Math.pow(PS.friction, dt * 60);
            p.outVy *= Math.pow(PS.friction, dt * 60);
            p.x += p.outVx * dt;
            p.y += p.outVy * dt;
            drawX = p.x; drawY = p.y;
            hue = PS.holdHue + (PS.outHue - PS.holdHue) * ok;
            size = p.baseSize * (PS.arriveSize + ok * 1.4);
            alpha = (1 - ok) * (1 - ok);
            phase = 'out';
            if (ok >= 1) continue;
        }

        if (alpha <= 0.02) continue;
        alive++;

        // 双层发光:外圈大而暗(光晕) + 内圈小而亮(核心)
        const outerR = Math.max(0.6, size * PS.glowOuter);
        ptCtx.globalAlpha = alpha * 0.28;
        ptCtx.fillStyle = `hsl(${hue}, 95%, 60%)`;
        ptCtx.beginPath();
        ptCtx.arc(drawX, drawY, outerR, 0, Math.PI * 2);
        ptCtx.fill();

        ptCtx.globalAlpha = alpha;
        ptCtx.fillStyle = `hsl(${hue}, 100%, ${PS.holdLightness}%)`;
        ptCtx.beginPath();
        ptCtx.arc(drawX, drawY, Math.max(0.4, size), 0, Math.PI * 2);
        ptCtx.fill();

        // 白色高光核心(仅到位后),让文字边缘锐利清晰
        if (lt >= timing.fly && lt < timing.fly + timing.hold) {
            ptCtx.globalAlpha = alpha * 0.85;
            ptCtx.fillStyle = '#fff7ea';
            ptCtx.beginPath();
            ptCtx.arc(drawX, drawY, Math.max(0.3, size * 0.5), 0, Math.PI * 2);
            ptCtx.fill();
        }
    }

    ptCtx.globalAlpha = 1;
    ptCtx.globalCompositeOperation = 'source-over';
    dbg.lastDrawn = alive;

    // 全部消散 → 清理
    if (alive === 0 && phase === 'out') {
        particles = [];
        ptCtx.clearRect(0, 0, W, H);
        phase = 'idle';
    }
    } catch (e) {
        dbg.lastError = e.message;
        // 单帧异常不能打断 rAF 链,复位画布状态
        try { ptCtx.globalAlpha = 1; ptCtx.globalCompositeOperation = 'source-over'; } catch (_) {}
    }
}

// ---------- 模式开关 ----------
export function isGestureTextMode() { return modeOn; }
export function setGestureTextMode(on) {
    modeOn = on;
    if (on) {
        resetGestureState();
        ensureAudio();
    } else {
        particles = [];
        if (ptCtx) ptCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        phase = 'idle';
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
            <div class="gs-hint">5 种手势各绑定一条文本(10-30 字符),识别到手势时粒子将从屏幕外汇聚成文字</div>
            <div class="gs-list"></div>
            <div class="gs-speed">
                <span>文字显现速度:</span>
                <button data-speed="1">慢</button>
                <button data-speed="2" class="active">中</button>
                <button data-speed="3">快</button>
            </div>
            <div class="gs-tip">💡 操作:先点右上「🌀 手势文本」开启模式,再对摄像头做手势。握拳✊/张开✋不再控制镜头缩放,仅用于触发文字。</div>
            <div class="gs-actions">
                <button id="gs-test">▶ 预览效果</button>
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
                <span class="gs-gdesc">${def.desc}</span>
            </div>
            <input type="text" class="gs-input" maxlength="30" placeholder="输入 10-30 字符..." value="${settings.texts[k]}" data-gesture="${k}">
            <span class="gs-count">${(settings.texts[k] || '').length}/30</span>`;
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

    wrap.querySelector('#gs-test').addEventListener('click', () => {
        const first = wrap.querySelector('.gs-input').value || '粒子汇聚 星河成文';
        showParticleText(first.trim() || '粒子汇聚 星河成文');
    });
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
    if (!document.getElementById('gesture-text-style')) {
        const s = document.createElement('style');
        s.id = 'gesture-text-style';
        s.textContent = GS_STYLE;
        document.head.appendChild(s);
    }
    let toggle = document.getElementById('gesture-text-toggle');
    if (!toggle) {
        toggle = document.createElement('button');
        toggle.id = 'gesture-text-toggle';
        toggle.innerHTML = '🌀 手势文本';
        toggle.title = '开启后手势触发粒子文字(相机缩放暂停)';
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
    requestAnimationFrame(function loop(now) { updateParticleText(now); requestAnimationFrame(loop); });

    // 调试/测试钩子(验证粒子渲染与手势触发,不影响生产逻辑)
    window.__gestureText = {
        showText: (t) => showParticleText(t || '引力坍缩 一切归于奇点'),
        trigger: (g) => triggerGestureText(g || 'fist'),
        // 手动驱动N帧(测试用:绕过无头环境对rAF的节流)
        pump: (n) => { for (let i = 0; i < (n || 30); i++) updateParticleText(performance.now() + i * 16.7); },
        // 连续虚拟时钟模拟(测试用):从触发起连续推进ms毫秒,验证三阶段链路
        simulate: (text, ms) => {
            showParticleText(text);
            const t0 = animStartTime;
            for (let t = 16.7; t <= ms; t += 16.7) updateParticleText(t0 + t);
        },
        rafState: () => ({ frames: dbg.frames, hidden: document.hidden, visibility: document.visibilityState }),
        state: () => ({
            phase, count: particles.length, modeOn,
            speed: settings.speed,
            canvas: ptCanvas ? { w: ptCanvas.width, h: ptCanvas.height, cssW: window.innerWidth, cssH: window.innerHeight } : null,
            dbg,
        }),
        settings: () => settings,
    };
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
    position: relative; width: min(580px, 92vw); max-height: 88vh; overflow-y: auto;
    background: linear-gradient(160deg, rgba(20,10,45,0.97), rgba(10,5,30,0.97));
    border: 1px solid rgba(150,100,220,0.5); border-radius: 16px; padding: 24px;
    box-shadow: 0 0 50px rgba(120,70,220,0.4); color: #e0d4ff;
}
#gesture-settings-panel .gs-title { font-size: 20px; font-weight: 800; letter-spacing: 2px; color: #ffcc88; margin-bottom: 6px; }
#gesture-settings-panel .gs-hint { font-size: 12px; color: rgba(200,180,230,0.6); margin-bottom: 16px; line-height: 1.5; }
#gesture-settings-panel .gs-tip { font-size: 12px; color: rgba(255,200,140,0.75); background: rgba(255,150,0,0.08); border:1px solid rgba(255,150,0,0.25); border-radius:8px; padding:8px 12px; margin-bottom:14px; line-height:1.6; }
#gesture-settings-panel .gs-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
#gesture-settings-panel .gs-row { display: flex; align-items: center; gap: 10px; }
#gesture-settings-panel .gs-gesture { width: 120px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 1px; }
#gesture-settings-panel .gs-icon { font-size: 26px; }
#gesture-settings-panel .gs-name { font-size: 12px; color: #bbaaff; }
#gesture-settings-panel .gs-gdesc { font-size: 10px; color: rgba(180,160,210,0.5); }
#gesture-settings-panel .gs-input {
    flex: 1; padding: 9px 12px; border-radius: 8px; border: 1px solid rgba(130,80,220,0.4);
    background: rgba(10,5,25,0.8); color: #e8e0ff; font-family: inherit; font-size: 14px; outline: none;
}
#gesture-settings-panel .gs-input:focus { border-color: #9966ff; box-shadow: 0 0 10px rgba(130,80,255,0.4); }
#gesture-settings-panel .gs-count { font-size: 11px; color: rgba(180,160,210,0.5); width: 36px; text-align: right; }
#gesture-settings-panel .gs-speed { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; font-size: 13px; color: #bbaaff; }
#gesture-settings-panel .gs-speed button {
    padding: 6px 16px; border-radius: 16px; border: 1px solid rgba(130,80,220,0.4);
    background: rgba(10,5,25,0.7); color: #bbaaff; cursor: pointer; font-family: inherit;
}
#gesture-settings-panel .gs-speed button.active { background: rgba(130,80,255,0.35); border-color: #bbaaff; color: #fff; }
#gesture-settings-panel .gs-actions { display: flex; gap: 10px; justify-content: flex-end; }
#gesture-settings-panel .gs-actions button {
    padding: 9px 18px; border-radius: 10px; border: 1px solid rgba(130,80,220,0.4);
    background: rgba(10,5,25,0.7); color: #c7b8ff; cursor: pointer; font-family: inherit; font-size: 14px;
}
#gesture-settings-panel .gs-actions button.primary { background: linear-gradient(90deg, #7744ff, #aa66ff); border-color: #bbaaff; color: #fff; }
`;
