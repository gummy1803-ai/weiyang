// src/main.js
// 星系装配器(galaxy.html 的入口逻辑) —— 把符合 PlanetSpec 契约的星球装进同一场景
// 维护者:架构协调者
// ====================================================================
// 【与原始 index.html 的关系】
//   - 场景/Bloom/相机/手势控制 = 原版代码逐行对应复刻,仅改两处:
//     1) 灵敏度用你最终调定的值(rotation 0.01 / fist 0.08 / open 0.01)
//     2) 禁用空闲相机自转(phi -= 0.001 已删除,星球静止不漂移)
//   - 星球本体全部来自 src/planets/ 模块,原始星球在 core.js 1:1 复刻
//   - 原始 index.html 保持零改动,可随时打开对比美感基准
// ====================================================================

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { assertValidSpec, validateFactoryOutput } from './PlanetSpec.js';
import { PLANET_SPECS } from './planets/index.js?v=20260906v5';
import { api } from './api.js';
import { startEntryBackground, burstAndDestroy } from './entryBackground.js';

// ===== 配置(与原始 index.html 一致,除标注外) =====
const CONFIG = {
    minDistance: 120,
    defaultDistance: 600, // 启动视角在主星(恒星放大2.2倍后,双环半径308需在此距离外才不被裁)
    maxDistance: 6500,   // 紧凑轨道布局(最外环3200)下,拉满即可一眼看全所有行星+星云
    rotationSpeedMultiplier: 0.08,  // 灵敏度提升(原版 0.05)
    fistAcceleration: 0.25,        // 握拳加速(原版 0.5)
    openLerpFactor: 0.04            // 张开靠近(原版 0.05)
};

let scene, camera, renderer, composer;
let systemGroup;
const planetInstances = [];  // { spec, orbitGroup, obj }
let time = 0;

// 相机控制状态(与原始 index.html 一致)
const cameraState = {
    radius: CONFIG.defaultDistance,
    theta: Math.PI / 2,
    phi: 0,
    zoomVelocity: 0,
    targetRadius: CONFIG.defaultDistance,
    isFist: false,
    isOpen: false,
    handRotation: 0
};

const statusEl = document.getElementById('gesture-status');
const entryOverlay = document.getElementById('entry-overlay');
const entryBtn = document.getElementById('entry-btn');
const entryStatus = document.getElementById('entry-status');
const entryStats = document.getElementById('entry-stats');
const nicknameInput = document.getElementById('nickname-input');
const captchaImg = document.getElementById('captcha-img');
const captchaInput = document.getElementById('captcha-input');
const previewCanvas = document.getElementById('webcam-preview');
const previewCtx = previewCanvas.getContext('2d');

// 摄像头预热状态(登录页即请求权限,进入时复用)
let camState = 'loading';   // 'loading' | 'ready' | 'error'
let camReadyPromise = null;
let assetState = 'loading'; // 'loading' | 'ready' | 'failed'
const progressFill = document.getElementById('entry-progress-fill');

// ==========================================
// 1. Three.js 初始化(原版逐行对应)
// ==========================================
function initThree() {
    const container = document.getElementById('canvas-container');

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.00008);  // 稀雾:压轨道后远处星球不再被雾吞掉(原0.0005在3000+距离雾化89%)
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 15000);
    camera.position.set(0, 0, CONFIG.defaultDistance);

    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // 后期处理 (Bloom 发光) —— 数值与原版一致
    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    bloomPass.threshold = 0;
    bloomPass.strength = 2.0;
    bloomPass.radius = 0.5;

    composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);
    bloomPassRef = bloomPass;

    // 装配全部星球
    console.log('[main] PLANET_SPECS.length =', PLANET_SPECS.length);
    console.log('[main] PLANET_SPECS names =', PLANET_SPECS.map(s => s.name).join(', '));
    window.__PLANET_SPECS__ = PLANET_SPECS; // 调试用:暴露到全局
    window.__planetInstances__ = planetInstances; // 调试用:渲染测试可读取实时世界坐标
    window.__orbitalTrails__ = orbitalTrails;     // 调试用:渲染测试可校验轨道带围绕恒星
    window.__focusOnPlanet__ = focusOnPlanet; // 调试用:渲染测试可模拟聚焦
    window.__cameraDebug__ = () => ({ // 调试用:相机轴心/位置实时状态
        centerIndex: cameraCenterIndex,
        focusAnimating: !!focusTarget,
        radius: +cameraState.radius.toFixed(1),
        pos: camera.position.toArray().map(v => +v.toFixed(1)),
        center: getCameraCenter(_cameraCenter).toArray().map(v => +v.toFixed(1))
    });
    assemblePlanets(PLANET_SPECS);

    window.addEventListener('resize', onWindowResize);

    // raycaster + 点击/拖拽/滚轮
    initRaycaster();
}

// ==========================================
// 2. 星球装配(契约校验 + 轨道挂载)
// ==========================================
function assemblePlanets(specs) {
    systemGroup = new THREE.Group();
    systemGroup.name = 'system';
    scene.add(systemGroup);

    specs.forEach((spec) => {
        assertValidSpec(spec);                      // 静态契约校验,不合格直接抛错
        const obj = spec.factory();                 // 调工厂生成星球
        validateFactoryOutput(obj, spec);           // 运行时校验

        // 轨道挂载:orbitGroup 固定在星系中心,星球本体偏移 orbit.radius
        // → animate 中 orbitGroup.rotation.y += speed 即绕恒星公转
        // (旧实现 orbitGroup.position.x=radius + 自转 → 星球只原地自旋,从不绕恒星公转)
        const orbitGroup = new THREE.Group();
        orbitGroup.name = `orbit-${spec.name}`;
        obj.position.x = spec.orbit.radius;         // STAR 的 radius=0 → 居中
        orbitGroup.rotation.y = spec.orbit.phase || 0; // 共享轨道初相位(星云与行星同环时错开,默认0)
        orbitGroup.add(obj);
        systemGroup.add(orbitGroup);

        planetInstances.push({ spec, orbitGroup, obj });
        console.log(`[装配] ${spec.name}(${spec.type}) → 轨道半径 ${spec.orbit.radius}`);
    });

    // 队友 Downloads/index.html 第 932-1053 行的轨道带 + 星空背景
    createOrbitalTrails();
    createStarfield();

    // 行星导航按钮栏(数据驱动,从 PLANET_SPECS 生成)
    buildPlanetNav(specs);
}

// ==========================================
// 场景辅助元素:轨道带 + 星空背景(队友原版)
// ==========================================
let orbitalTrails = [];
let starfield;
const _bhWorldPos = new THREE.Vector3(); // GARGANTUA 实时世界坐标(轨道带跟随用)

function createOrbitalTrails() {
    const tex = createParticleTexture();
    const trailConfigs = [
        // 与队友原版 Downloads/index.html 932-1053 行逐字节一致(勿改动美术参数):
        // 原版场景原点即黑洞,轨道带围绕黑洞 —— 椭圆焦点在黑洞上,大离心率是原版设计
        { count: 4000, baseR: 125, spread: 18, speed: 1.2,  inclination: 0.08,  eccentricity: 0.35, argPeri: 0.0,  color: 0xddccaa, size: 2.0, opacity: 0.7 },
        { count: 5500, baseR: 250, spread: 25, speed: 0.6,  inclination: -0.15, eccentricity: 0.50, argPeri: 0.9,  color: 0xccbbaa, size: 2.0, opacity: 0.7 },
        { count: 4500, baseR: 300, spread: 20, speed: 0.45, inclination: 0.06,  eccentricity: 0.28, argPeri: 1.8,  color: 0xbbaa99, size: 2.0, opacity: 0.65 },
        { count: 6500, baseR: 415, spread: 30, speed: 0.22, inclination: -0.25, eccentricity: 0.55, argPeri: 2.6,  color: 0xaa9988, size: 2.5, opacity: 0.7 },
        { count: 5000, baseR: 620, spread: 38, speed: 0.11, inclination: 0.45,  eccentricity: 0.60, argPeri: 3.4,  color: 0x998877, size: 3.0, opacity: 0.6 },
        { count: 3500, baseR: 820, spread: 60, speed: 0.05, inclination: -0.55, eccentricity: 0.65, argPeri: 4.5,  color: 0x887766, size: 3.0, opacity: 0.5 },
    ];

    trailConfigs.forEach(config => {
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(config.count * 3);
        const colors = new Float32Array(config.count * 3);
        const params = [];
        const baseColor = new THREE.Color(config.color);

        for (let i = 0; i < config.count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = config.baseR + (Math.random() - 0.5) * config.spread * 2;
            const inc = config.inclination + (Math.random() - 0.5) * 0.06;
            const e = Math.max(0.05, Math.min(0.85, config.eccentricity + (Math.random() - 0.5) * 0.06));
            const argPeri = config.argPeri + (Math.random() - 0.5) * 0.15;
            const yOff = (Math.random() - 0.5) * 4;
            const spd = config.speed * (0.85 + Math.random() * 0.3);

            const a = r, b = r * Math.sqrt(1 - e * e), cOff = r * e;
            const cosArg = Math.cos(argPeri), sinArg = Math.sin(argPeri);
            params.push({ angle, a, b, cOff, cosArg, sinArg, inc, yOff, speed: spd });

            const u = a * Math.cos(angle) - cOff;
            const v = b * Math.sin(angle);
            const uR = u * cosArg - v * sinArg;
            const vR = u * sinArg + v * cosArg;
            positions[i * 3]     = uR;
            positions[i * 3 + 1] = vR * Math.sin(inc) + yOff;
            positions[i * 3 + 2] = vR * Math.cos(inc);

            const c = baseColor.clone();
            c.multiplyScalar(0.6 + Math.random() * 0.4);
            colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const mat = new THREE.PointsMaterial({
            size: config.size, map: tex, vertexColors: true, transparent: true,
            opacity: config.opacity, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
        });
        const points = new THREE.Points(geo, mat);
        scene.add(points);

        // 椭圆轨道引导线
        const orbitPts = [];
        const segs = 300;
        for (let i = 0; i <= segs; i++) {
            const a = (i / segs) * Math.PI * 2;
            const aCfg = config.baseR;
            const bCfg = aCfg * Math.sqrt(1 - config.eccentricity * config.eccentricity);
            const cCfg = aCfg * config.eccentricity;
            const u = aCfg * Math.cos(a) - cCfg;
            const v = bCfg * Math.sin(a);
            const uR = u * Math.cos(config.argPeri) - v * Math.sin(config.argPeri);
            const vR = u * Math.sin(config.argPeri) + v * Math.cos(config.argPeri);
            orbitPts.push(uR, vR * Math.sin(config.inclination), vR * Math.cos(config.inclination));
        }
        const orbitGeo = new THREE.BufferGeometry();
        orbitGeo.setAttribute('position', new THREE.Float32BufferAttribute(orbitPts, 3));
        const orbitLine = new THREE.Line(orbitGeo, new THREE.LineBasicMaterial({
            color: config.color, transparent: true, opacity: 0.12
        }));
        scene.add(orbitLine);
        orbitalTrails.push({ mesh: points, params, positions, orbitLine });
    });
}

function updateOrbitalTrails() {
    // 轨道带围绕 GARGANTUA(黑洞行星):队友原版中场景原点即黑洞,轨道带挂在原点;
    // 模块化架构里黑洞绕恒星公转,因此轨道带整体实时跟随黑洞的世界位置
    const bhInst = planetInstances.find(({ spec }) => spec.name === 'planet1');
    if (bhInst) {
        bhInst.obj.getWorldPosition(_bhWorldPos);
        orbitalTrails.forEach(trail => {
            trail.mesh.position.copy(_bhWorldPos);
            trail.orbitLine.position.copy(_bhWorldPos);
        });
    }

    orbitalTrails.forEach(trail => {
        const pos = trail.positions;
        const params = trail.params;
        for (let i = 0; i < params.length; i++) {
            const p = params[i];
            p.angle += p.speed * 0.002;
            const u = p.a * Math.cos(p.angle) - p.cOff;
            const v = p.b * Math.sin(p.angle);
            const uR = u * p.cosArg - v * p.sinArg;
            const vR = u * p.sinArg + v * p.cosArg;
            pos[i * 3] = uR;
            pos[i * 3 + 1] = vR * Math.sin(p.inc) + p.yOff;
            pos[i * 3 + 2] = vR * Math.cos(p.inc);
        }
        trail.mesh.geometry.attributes.position.needsUpdate = true;
    });
}

function createStarfield() {
    const geo = new THREE.BufferGeometry();
    const positions = [];
    for (let i = 0; i < 3000; i++) {
        const r = 3500 + Math.random() * 3500;  // 星空壳在系统外围(最外轨道3200之外),包住整个行星系统
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        positions.push(
            r * Math.sin(phi) * Math.cos(theta),
            r * Math.sin(phi) * Math.sin(theta),
            r * Math.cos(phi)
        );
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    starfield = new THREE.Points(geo, new THREE.PointsMaterial({
        color: 0xffffff, size: 1.5, transparent: true,
        opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    scene.add(starfield);
}

/** 共享粒子纹理(队友原版 Canvas 圆渐变) */
function createParticleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32; canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.2, 'rgba(255,255,255,0.8)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.2)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(canvas);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
}

// ==========================================
// raycaster + 点击聚焦 + 信息面板 + 导航按钮
// ==========================================
let raycaster, pointer;
let focusTarget = null;       // { planet, duration, elapsed, startRadius, startTheta, startPhi, targetRadius }
let infoPanelShowing = false;
let currentFocusedIndex = -1; // 当前聚焦的行星索引(-1 = 无)
// 相机旋转轴心:-1 = 星系原点(核心星);>=0 = 以该行星为中心
// (聚焦行星后,拖拽/滚轮/手势的旋转与缩放都绕行星本身,且轴心实时跟随其公转)
let cameraCenterIndex = -1;
const _cameraCenter = new THREE.Vector3(); // 每帧复用的轴心临时向量,避免分配

// ==========================================
// 星系形成系统 + 黑洞内部模式(队友 Downloads/index.html 原版移植)
// ==========================================
let formationActive = false;
let formationStartTime = 0;
let formationElapsed = 0;
let formationSpeed = 1.0;
let formationCloud = null;
let formationCloudData = null;
let flashSphere = null;
let bloomStrengthBoost = 0;
let clickCount = 0;
let lastClickTime = 0;
let formationOrigOpacities = {};
const _formationBHPos = new THREE.Vector3(); // 形成期间卡冈图雅实时世界坐标(星云/闪光跟随用)
let lastFrameTime = 0;

let interiorActive = false;
let interiorTransition = 0;
let interiorExiting = false;
let interiorParticles = null;
let interiorRings = [];
let interiorSingularity = null;
let interiorGroup = null; // 内部场景容器(红雾/光环/奇点),实时跟随黑洞世界坐标
let savedCameraRadius = 0;
let savedBloomStrength = 0;
let interiorInfoPanelShowing = false;

// 亮度调节(11 档,队友原版)
let brightnessLevel = 0; // -3 到 7
const brightnessSteps = [
    { bloom: 0.8, label: '很暗' },
    { bloom: 1.4, label: '较暗' },
    { bloom: 2.0, label: '略暗' },
    { bloom: 2.5, label: '正常' },
    { bloom: 3.2, label: '略亮' },
    { bloom: 4.0, label: '较亮' },
    { bloom: 5.5, label: '很亮' },
    { bloom: 7.5, label: '极亮' },
    { bloom: 10, label: '耀斑' },
    { bloom: 14, label: '爆闪' },
    { bloom: 20, label: '失明' }
];
let bloomPassRef = null; // initThree 时赋值

/** 动态生成底部导航按钮栏(数据驱动) */
function buildPlanetNav(specs) {
    const nav = document.getElementById('planet-nav');
    nav.innerHTML = '';
    specs.forEach((spec, idx) => {
        if (!spec.info) return; // 没有 info 就不生成导航按钮
        const btn = document.createElement('button');
        btn.className = 'nav-btn';
        btn.textContent = spec.info.title || spec.name;
        btn.dataset.index = idx;
        btn.addEventListener('click', () => {
            if (interiorActive || formationActive) return; // 黑洞内部/星系形成模式中禁止跳转,防止状态错乱
            focusOnPlanet(idx);
            showInfoPanel(idx);
            updateNavActive(idx);
        });
        nav.appendChild(btn);
    });
}

function updateNavActive(idx) {
    document.querySelectorAll('#planet-nav .nav-btn').forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.index) === idx);
    });
}

/** 卡冈图雅专属操作提示:仅在与黑洞交互时显示,不常驻操作框 */
function setGargantuaHints(on) {
    document.getElementById('gargantua-hints')?.classList.toggle('show', on);
}

/** 获取相机旋转轴心(世界坐标):聚焦行星/黑洞内部/星系形成均以卡冈图雅为轴心并实时跟随公转 */
function getCameraCenter(out) {
    if (cameraCenterIndex >= 0) {
        const inst = planetInstances[cameraCenterIndex];
        if (inst && inst.spec.orbit.radius > 0) {
            return inst.obj.getWorldPosition(out);
        }
        cameraCenterIndex = -1;
    }
    return out.set(0, 0, 0);
}

/** 聚焦动画结束:轴心切到被选行星。相机世界位置不动,仅重算"行星基准"的球坐标 */
function anchorCameraToPlanet(idx) {
    const inst = planetInstances[idx];
    if (!inst || inst.spec.orbit.radius <= 0) { cameraCenterIndex = -1; return; }
    const center = inst.obj.getWorldPosition(new THREE.Vector3());
    const offset = camera.position.clone().sub(center);
    const len = offset.length();
    if (len < 1) { cameraCenterIndex = -1; return; }
    cameraCenterIndex = idx;
    cameraState.radius = len;
    cameraState.theta = Math.acos(Math.max(-1, Math.min(1, offset.y / len)));
    cameraState.phi = Math.atan2(offset.x, offset.z);
}

/** 解除行星聚焦:轴心切回星系原点。相机世界位置不动,仅重算"原点基准"的球坐标 */
function reanchorCameraToOrigin() {
    focusTarget = null;
    setGargantuaHints(false); // 回到星系视角,收起卡冈图雅专属提示
    if (cameraCenterIndex < 0) {
        currentFocusedIndex = -1;
        updateNavActive(-1);
        return;
    }
    const offset = camera.position.clone();
    const len = offset.length();
    cameraCenterIndex = -1;
    currentFocusedIndex = -1;
    if (len > 1) {
        cameraState.radius = Math.max(CONFIG.minDistance, Math.min(CONFIG.maxDistance, len));
        cameraState.theta = Math.acos(Math.max(-1, Math.min(1, offset.y / len)));
        cameraState.phi = Math.atan2(offset.x, offset.z);
    }
    updateNavActive(-1);
}

/** 平滑聚焦相机到指定行星 */
function focusOnPlanet(planetIndex) {
    const inst = planetInstances[planetIndex];
    if (!inst) return;

    // 已锚定在某行星上时:先把轴心切回原点基准(相机位置不动)再开始新动画,避免两套球坐标基准混算
    if (cameraCenterIndex >= 0) reanchorCameraToOrigin();

    // 计算行星当前世界位置(考虑轨道公转)
    const worldPos = new THREE.Vector3();
    inst.obj.getWorldPosition(worldPos);

    // 目标相机位置:停在行星外侧的安全观察距离,禁止怼进行星中心区域
    // (黑洞 R=30、吸积盘外缘~100:相机距行星 300 → 外部特征/吸积盘完整可见;
    //  旧公式 max(orbit.radius,180) 会让相机正好落在行星位置上,穿进吸积盘内部)
    const orbitR = inst.spec.orbit.radius;
    const targetRadius = orbitR > 0
        ? Math.min(orbitR + 300, CONFIG.maxDistance)
        : CONFIG.defaultDistance;

    // 球坐标转换:根据行星世界位置推导期望的 theta/phi
    const x = worldPos.x, y = worldPos.y, z = worldPos.z;
    const targetPhi = Math.atan2(x, z);
    const targetTheta = Math.acos(Math.max(-1, Math.min(1, y / Math.max(targetRadius, 0.001))));

    focusTarget = {
        planetIndex: planetIndex,
        duration: 1.2,
        elapsed: 0,
        startRadius: cameraState.radius,
        startTheta: cameraState.theta,
        startPhi: cameraState.phi,
        targetRadius: targetRadius,
        targetTheta: targetTheta,
        targetPhi: targetPhi
    };
    currentFocusedIndex = planetIndex;
}

/** 显示/隐藏信息面板(数据驱动) */
function showInfoPanel(planetIndex) {
    const spec = planetInstances[planetIndex]?.spec;
    setGargantuaHints(spec?.name === 'planet1'); // 聚焦黑洞时展示其专属操作,聚焦其他天体时收起
    if (!spec?.info) return;
    const info = spec.info;

    const panel = document.getElementById('info-panel');
    panel.querySelector('.info-title').textContent = info.title || '';
    panel.querySelector('.info-subtitle').textContent = info.subtitle || '';
    panel.querySelector('.info-desc').textContent = info.description || '';

    const rowsDiv = document.getElementById('info-rows');
    rowsDiv.innerHTML = '';
    (info.rows || []).forEach(r => {
        const row = document.createElement('div');
        row.className = 'info-row';
        row.innerHTML = `<span class="info-label">${r.label}</span><span class="info-value">${r.value}</span>`;
        rowsDiv.appendChild(row);
    });

    panel.classList.add('show');
    infoPanelShowing = true;
}

function hideInfoPanel() {
    const panel = document.getElementById('info-panel');
    panel.classList.remove('show');
    infoPanelShowing = false;
}

/** 点击面板外关闭 */
document.addEventListener('click', (e) => {
    if (infoPanelShowing) {
        const panel = document.getElementById('info-panel');
        if (!panel.contains(e.target)) {
            hideInfoPanel();
        }
    }
});

/** 初始化 raycaster + 绑定点击/拖拽事件 */
function initRaycaster() {
    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();

    renderer.domElement.addEventListener('click', (e) => {
        if (infoPanelShowing) return;
        if (focusTarget) return; // 聚焦动画中不响应点击
        if (interiorActive || formationActive) return; // 内部/形成模式不响应点击

        pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
        pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);

        // 收集所有行星的 clickTarget
        const clickTargets = planetInstances
            .map(({ obj }) => obj.userData.clickTarget)
            .filter(Boolean);

        if (clickTargets.length === 0) return;
        const intersects = raycaster.intersectObjects(clickTargets, false);
        if (intersects.length > 0) {
            const hitObj = intersects[0].object;
            // 找到属于哪个行星实例
            const idx = planetInstances.findIndex(({ obj }) =>
                obj.userData.clickTarget === hitObj
            );
            if (idx >= 0) {
                const spec = planetInstances[idx].spec;
                // 黑洞行星:点 3 次触发星系形成(队友原版逻辑)
                if (spec.name === 'planet1' && !formationActive) {
                    setGargantuaHints(true); // 首次触碰黑洞即展示其专属操作
                    const now = Date.now();
                    if (now - lastClickTime > 2500) clickCount = 0;
                    clickCount++;
                    lastClickTime = now;
                    if (clickCount === 1) {
                        statusEl.innerText = "黑洞点击 1/3";
                        statusEl.style.color = "#aa77dd";
                    } else if (clickCount === 2) {
                        statusEl.innerText = "黑洞点击 2/3";
                        statusEl.style.color = "#aa77dd";
                    } else if (clickCount >= 3) {
                        clickCount = 0;
                        startFormation();
                    }
                    return;
                }
                // 其他行星:聚焦 + 信息面板
                focusOnPlanet(idx);
                showInfoPanel(idx);
                updateNavActive(idx);
                statusEl.innerText = `已聚焦: ${spec.info?.title || spec.name}`;
                statusEl.style.color = '#bbaaff';
            }
        } else if (cameraCenterIndex >= 0) {
            // 点击空白处:解除行星聚焦,旋转轴心回到星系中心
            reanchorCameraToOrigin();
            statusEl.innerText = "已返回星系视角";
            statusEl.style.color = "#88aacc";
        }
    });

    // 鼠标拖拽旋转 + 滚轮缩放(队友原版)
    let isDragging = false, prevX = 0, prevY = 0;
    renderer.domElement.addEventListener('mousedown', (e) => {
        isDragging = true;
        prevX = e.clientX; prevY = e.clientY;
    });
    window.addEventListener('mousemove', (e) => {
        if (!isDragging || interiorActive) return;
        const dx = e.clientX - prevX;
        const dy = e.clientY - prevY;
        cameraState.phi += dx * 0.006;
        cameraState.theta -= dy * 0.006;
        cameraState.theta = Math.max(0.15, Math.min(Math.PI - 0.15, cameraState.theta));
        prevX = e.clientX; prevY = e.clientY;
    });
    window.addEventListener('mouseup', () => { isDragging = false; });
    renderer.domElement.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (interiorActive) return; // 内部模式半径由 updateInterior 控制
        cameraState.radius += e.deltaY * 0.6;
        cameraState.radius = Math.max(CONFIG.minDistance, Math.min(CONFIG.maxDistance, cameraState.radius));
    }, { passive: false });

    // 黑洞内部:长按 600ms 查看简介(队友原版交互)
    let longPressTimer = null;
    renderer.domElement.addEventListener('mousedown', () => {
        if (!interiorActive) return;
        longPressTimer = setTimeout(showInteriorInfoPanel, 600);
    });
    ['mouseup', 'mouseleave'].forEach(ev =>
        renderer.domElement.addEventListener(ev, () => clearTimeout(longPressTimer))
    );

    // 内部简介面板:点击任意处关闭
    document.addEventListener('click', () => {
        if (interiorInfoPanelShowing) hideInteriorInfoPanel();
    });
}

// ==========================================
// 星系形成系统(队友 Downloads/index.html 1411-1813 行原版移植)
// ==========================================
function showFormationText(title, sub, stage) {
    const overlay = document.getElementById('formation-overlay');
    overlay.querySelector('.formation-title').textContent = title;
    overlay.querySelector('.formation-sub').textContent = sub || '';
    overlay.querySelector('.formation-stage').textContent = stage || '';
    overlay.classList.add('show');
}

function hideFormationText() {
    document.getElementById('formation-overlay').classList.remove('show');
}

function showFastForwardBtn() {
    const btn = document.getElementById('fastforward-btn');
    btn.classList.add('show');
    btn.onclick = toggleFastForward;
}

function hideFastForwardBtn() {
    const btn = document.getElementById('fastforward-btn');
    btn.classList.remove('show');
    btn.classList.remove('active');
    formationSpeed = 1.0;
    btn.innerHTML = "⏩ 快进 2x";
}

function toggleFastForward() {
    const btn = document.getElementById('fastforward-btn');
    if (formationSpeed === 1.0) {
        formationSpeed = 2.0;
        btn.classList.add('active');
        btn.innerHTML = "⏩ 快进 4x";
    } else if (formationSpeed === 2.0) {
        formationSpeed = 4.0;
        btn.classList.add('active');
        btn.innerHTML = "⏩ 快进 1x";
    } else {
        formationSpeed = 1.0;
        btn.classList.remove('active');
        btn.innerHTML = "⏩ 快进 2x";
    }
}

function createFormationCloud(texture) {
    const count = 8000;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const params = [];

    for (let i = 0; i < count; i++) {
        const startR = 300 + Math.random() * 500;
        const startAngle = Math.random() * Math.PI * 2;
        const startY = (Math.random() - 0.5) * 400;
        const targetR = 35 + Math.random() * 50;
        const swirlSpeed = 0.005 + Math.random() * 0.012;
        const delay = Math.random() * 0.25;

        params.push({ startR, startAngle, startY, targetR, currentAngle: startAngle, swirlSpeed, delay });

        positions[i * 3] = startR * Math.cos(startAngle);
        positions[i * 3 + 1] = startY;
        positions[i * 3 + 2] = startR * Math.sin(startAngle);

        const b = 0.7 + Math.random() * 0.3;
        colors[i * 3] = 1.0 * b;
        colors[i * 3 + 1] = (0.6 + Math.random() * 0.3) * b;
        colors[i * 3 + 2] = (0.2 + Math.random() * 0.2) * b;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
        size: 4, map: texture, vertexColors: true,
        transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    });

    const mesh = new THREE.Points(geo, mat);
    return { mesh, params, positions };
}

function startFormation() {
    // 星系形成以卡冈图雅(黑洞)为中心:轴心切到黑洞本体,星云坍缩/闪光/黑洞诞生均以其为原点
    focusTarget = null; // 在途聚焦飞行会与形成期相机抢控制权,先取消
    const bhIdx = planetInstances.findIndex(({ spec }) => spec.name === 'planet1');
    if (bhIdx >= 0) {
        anchorCameraToPlanet(bhIdx);
        updateNavActive(bhIdx);
    }
    setGargantuaHints(true); // 形成过程是卡冈图雅的专属演出
    formationActive = true;
    formationElapsed = 0;
    formationSpeed = 1.0;
    bloomStrengthBoost = 0;

    // 形成期观看距离:坍缩星云半径可达 ~800,自动拉到能看全全程的观察距离
    cameraState.radius = Math.min(Math.max(cameraState.radius, 1100), CONFIG.maxDistance);

    // 存储原始透明度
    formationOrigOpacities = {
        disk: getPlanetObj('planet1', 'accretionDisk')?.material.opacity ?? 0.9,
        lens: getPlanetObj('planet1', 'lensingRing')?.material.opacity ?? 0.7,
        star: starfield ? starfield.material.opacity : 0.6,
        photon: getPlanetObj('planet1', 'photonRing')?.material.opacity ?? 0.2,
        edge: getPlanetObj('planet1', 'edgeRing')?.material.opacity ?? 0.35,
        trails: orbitalTrails.map(t => t.mesh.material.opacity),
        orbitLines: orbitalTrails.map(t => t.orbitLine.material.opacity)
    };

    // 创建坍缩粒子云(局部坐标以黑洞为中心)
    const tex = createParticleTexture();
    const cloud = createFormationCloud(tex);
    formationCloud = cloud.mesh;
    formationCloudData = cloud;
    const bhObj = planetInstances.find(({ spec }) => spec.name === 'planet1')?.obj;
    if (bhObj) bhObj.getWorldPosition(formationCloud.position);
    scene.add(formationCloud);

    showFastForwardBtn();
    showFormationText("星系重置", "原有结构逐渐消散...", "阶段 1/9");
}

/** 获取行星 userData 里的子对象引用 */
function getPlanetObj(planetName, key) {
    const inst = planetInstances.find(({ spec }) => spec.name === planetName);
    return inst ? inst.obj.userData[key] : null;
}

/** 星系形成期间隐藏星球本体(黑洞组/轨道带透明度由 updateFormation 控制) */
function updateFormation(dt) {
    formationElapsed += dt * formationSpeed;
    const elapsed = formationElapsed;
    const FO = formationOrigOpacities;

    const blackHole = getPlanetObj('planet1', 'blackHole');
    const photonRing = getPlanetObj('planet1', 'photonRing');
    const accretionDisk = getPlanetObj('planet1', 'accretionDisk');
    const lensingRing = getPlanetObj('planet1', 'lensingRing');
    const edgeRing = getPlanetObj('planet1', 'edgeRing');

    // 星云/闪光实时跟随黑洞世界位置(形成期间黑洞持续公转,一切以卡冈图雅为中心)
    const bhObj = planetInstances.find(({ spec }) => spec.name === 'planet1')?.obj;
    if (bhObj) {
        bhObj.getWorldPosition(_formationBHPos);
        if (formationCloud) formationCloud.position.copy(_formationBHPos);
        if (flashSphere) flashSphere.position.copy(_formationBHPos);
    }

    // --- 阶段1: 星系消散 (0-6s) ---
    if (elapsed < 6) {
        const t = elapsed / 6;
        orbitalTrails.forEach((trail, i) => {
            trail.mesh.material.opacity = FO.trails[i] * (1 - t);
            trail.orbitLine.material.opacity = FO.orbitLines[i] * (1 - t);
        });
        if (accretionDisk) accretionDisk.material.opacity = FO.disk * (1 - t);
        if (lensingRing) lensingRing.material.opacity = FO.lens * (1 - t);
        if (edgeRing) edgeRing.material.opacity = FO.edge * (1 - t);
        if (starfield) starfield.material.opacity = FO.star * (1 - t);
        if (photonRing) photonRing.material.opacity = FO.photon * (1 - t);
        if (blackHole) blackHole.scale.setScalar(1);

        if (t < 0.02) showFormationText("星系消散", "轨道带逐渐瓦解...", "阶段 1/9");
        if (t > 0.35 && t < 0.38) showFormationText("星系消散", "吸积盘光芒褪去...", "阶段 1/9");
        if (t > 0.7 && t < 0.73) showFormationText("星系消散", "星空背景逐渐暗淡...", "阶段 1/9");
    }
    // --- 阶段2: 原始星云 (6-11s) ---
    else if (elapsed < 11) {
        const t = (elapsed - 6) / 5;
        orbitalTrails.forEach((trail) => {
            trail.mesh.material.opacity = 0;
            trail.orbitLine.material.opacity = 0;
        });
        if (accretionDisk) accretionDisk.material.opacity = 0;
        if (lensingRing) lensingRing.material.opacity = 0;
        if (starfield) starfield.material.opacity = 0;
        if (photonRing) photonRing.material.opacity = 0;
        if (edgeRing) edgeRing.material.opacity = 0;
        if (blackHole) blackHole.scale.setScalar(Math.max(0, 1 - t * 0.8));
        if (formationCloud) formationCloud.material.opacity = t;

        updateCloudSwirl(0.2);
        if (t < 0.02) showFormationText("原始星云", "物质从虚空中缓缓凝聚...", "阶段 2/9");
        if (t > 0.45 && t < 0.48) showFormationText("原始星云", "氢氦尘埃弥漫整个空间...", "阶段 2/9");
        if (t > 0.8 && t < 0.83) showFormationText("原始星云", "微小的密度涨落正在孕育...", "阶段 2/9");
    }
    // --- 阶段3: 引力坍缩 (11-21s) ---
    else if (elapsed < 21) {
        const t = (elapsed - 11) / 10;
        if (blackHole) blackHole.scale.setScalar(0);
        if (formationCloud) formationCloud.material.opacity = 1;

        if (formationCloudData) {
            const cloudPos = formationCloudData.positions;
            const cloudParams = formationCloudData.params;
            for (let i = 0; i < cloudParams.length; i++) {
                const p = cloudParams[i];
                const localT = Math.max(0, Math.min(1, (t - p.delay) / (1 - p.delay)));
                const easedT = localT * localT * (3 - 2 * localT);
                const r = p.startR * (1 - easedT) + p.targetR * easedT;
                p.currentAngle += p.swirlSpeed * (1 + easedT * 3);
                const yFlat = p.startY * (1 - easedT) * (1 - easedT * 0.5);
                cloudPos[i * 3] = r * Math.cos(p.currentAngle);
                cloudPos[i * 3 + 1] = yFlat;
                cloudPos[i * 3 + 2] = r * Math.sin(p.currentAngle);
            }
            formationCloud.geometry.attributes.position.needsUpdate = true;
        }

        if (t < 0.02) showFormationText("引力坍缩", "密度峰开始吸引周围物质...", "阶段 3/9");
        if (t > 0.2 && t < 0.23) showFormationText("引力坍缩", "引力势阱逐渐加深...", "阶段 3/9");
        if (t > 0.4 && t < 0.43) showFormationText("坍缩加速", "自由下落阶段开始...", "阶段 3/9");
        if (t > 0.6 && t < 0.63) showFormationText("坍缩加速", "角动量使物质旋转加快...", "阶段 3/9");
        if (t > 0.8 && t < 0.83) showFormationText("接近临界", "核心密度急剧攀升...", "阶段 3/9");
    }
    // --- 阶段4: 盘面形成 (21-26s) ---
    else if (elapsed < 26) {
        const t = (elapsed - 21) / 5;
        if (blackHole) blackHole.scale.setScalar(0);
        if (formationCloud) formationCloud.material.opacity = 1;

        if (formationCloudData) {
            const cloudPos = formationCloudData.positions;
            const cloudParams = formationCloudData.params;
            for (let i = 0; i < cloudParams.length; i++) {
                const p = cloudParams[i];
                p.currentAngle += p.swirlSpeed * 4;
                const yDamp = p.startY * 0.1 * (1 - t) * (1 - t);
                cloudPos[i * 3] = p.targetR * Math.cos(p.currentAngle);
                cloudPos[i * 3 + 1] = yDamp;
                cloudPos[i * 3 + 2] = p.targetR * Math.sin(p.currentAngle);
            }
            formationCloud.geometry.attributes.position.needsUpdate = true;
        }

        if (t < 0.02) showFormationText("盘面形成", "垂直方向物质向中面坠落...", "阶段 4/9");
        if (t > 0.35 && t < 0.38) showFormationText("盘面形成", "旋转盘逐渐扁平化...", "阶段 4/9");
        if (t > 0.7 && t < 0.73) showFormationText("盘面形成", "开普勒旋转建立...", "阶段 4/9");
    }
    // --- 阶段5: 核心点燃 (26-31s) ---
    else if (elapsed < 31) {
        const t = (elapsed - 26) / 5;
        if (!flashSphere) {
            flashSphere = new THREE.Mesh(
                new THREE.SphereGeometry(30 * 0.2, 32, 32),
                new THREE.MeshBasicMaterial({
                    color: 0xffffee, transparent: true, opacity: 0.2,
                    blending: THREE.AdditiveBlending
                })
            );
            scene.add(flashSphere);
        }
        flashSphere.scale.setScalar(0.2 + t * 1.5);
        flashSphere.material.opacity = 0.2 + t * 0.4;
        bloomStrengthBoost = t * 0.4;

        if (formationCloudData) {
            const cloudPos = formationCloudData.positions;
            const cloudParams = formationCloudData.params;
            for (let i = 0; i < cloudParams.length; i++) {
                const p = cloudParams[i];
                const r = p.targetR * (1 - t * 0.2);
                p.currentAngle += p.swirlSpeed * 5;
                cloudPos[i * 3] = r * Math.cos(p.currentAngle);
                cloudPos[i * 3 + 1] = 0;
                cloudPos[i * 3 + 2] = r * Math.sin(p.currentAngle);
            }
            formationCloud.geometry.attributes.position.needsUpdate = true;
            formationCloud.material.opacity = 1 - t * 0.15;
        }
        if (blackHole) blackHole.scale.setScalar(0);

        if (t < 0.02) showFormationText("奇点凝聚", "中心密度突破临界点...", "阶段 5/9");
        if (t > 0.35 && t < 0.38) showFormationText("奇点凝聚", "引力压垮一切抵抗...", "阶段 5/9");
        if (t > 0.7 && t < 0.73) showFormationText("奇点凝聚", "核心区域越来越亮...", "阶段 5/9");
    }
    // --- 阶段6: 黑洞诞生 (31-37s) ---
    else if (elapsed < 37) {
        const t = (elapsed - 31) / 6;
        if (flashSphere) {
            const flashScale = 0.5 + t * 28;
            flashSphere.scale.set(flashScale, flashScale, flashScale);
            flashSphere.material.opacity = Math.max(0, (1 - t * 0.9) * 1.0);
        }
        bloomStrengthBoost = Math.max(0, 1 - t * 1.1);
        if (blackHole) blackHole.scale.setScalar(Math.min(1, t * 1.2));
        if (photonRing) photonRing.material.opacity = FO.photon * Math.min(1, t * 1.8);
        if (edgeRing) edgeRing.material.opacity = FO.edge * Math.min(1, t * 1.8);

        if (formationCloudData) {
            const cloudPos = formationCloudData.positions;
            const cloudParams = formationCloudData.params;
            for (let i = 0; i < cloudParams.length; i++) {
                const p = cloudParams[i];
                const r = p.targetR * Math.max(0, 1 - t * 1.3);
                p.currentAngle += p.swirlSpeed * 7;
                cloudPos[i * 3] = r * Math.cos(p.currentAngle);
                cloudPos[i * 3 + 1] = 0;
                cloudPos[i * 3 + 2] = r * Math.sin(p.currentAngle);
            }
            formationCloud.geometry.attributes.position.needsUpdate = true;
            formationCloud.material.opacity = Math.max(0, 1 - t * 1.5);
        }

        if (t < 0.02) showFormationText("黑洞诞生", "事件视界正在形成...", "阶段 6/9");
        if (t > 0.25 && t < 0.28) showFormationText("黑洞诞生", "时空剧烈扭曲...", "阶段 6/9");
        if (t > 0.5 && t < 0.53) showFormationText("黑洞诞生", "大闪光爆发...", "阶段 6/9");
        if (t > 0.75 && t < 0.78) showFormationText("黑洞诞生", "残余物质被吞噬...", "阶段 6/9");
    }
    // --- 阶段7: 吸积盘形成 (37-47s) ---
    else if (elapsed < 47) {
        const t = (elapsed - 37) / 10;
        const easedT = t * t * (3 - 2 * t);
        if (flashSphere) {
            flashSphere.material.opacity = Math.max(0, (1 - t * 0.5) * 0.3);
            flashSphere.scale.setScalar(0.5 + (1 - t * 0.5) * 28);
        }
        if (t > 0.3 && formationCloud) {
            scene.remove(formationCloud);
            formationCloud = null;
        }
        bloomStrengthBoost = Math.max(0, (1 - t * 1.2) * 0.4);
        if (blackHole) blackHole.scale.setScalar(1);
        if (photonRing) photonRing.material.opacity = FO.photon;
        if (edgeRing) edgeRing.material.opacity = FO.edge;
        if (accretionDisk) {
            accretionDisk.material.opacity = FO.disk * easedT;
            accretionDisk.rotation.y += 0.004;
        }
        if (lensingRing) {
            lensingRing.material.opacity = FO.lens * easedT * 0.4;
            lensingRing.rotation.z += 0.002;
        }
        if (photonRing) {
            const pulse = 1 + Math.sin(time * 2) * 0.02;
            photonRing.scale.set(pulse, pulse, pulse);
        }

        if (t < 0.02) showFormationText("吸积盘形成", "外围气体开始落入...", "阶段 7/9");
        if (t > 0.2 && t < 0.23) showFormationText("吸积盘形成", "摩擦加热盘体...", "阶段 7/9");
        if (t > 0.4 && t < 0.43) showFormationText("吸积盘形成", "温度升至数千度...", "阶段 7/9");
        if (t > 0.6 && t < 0.63) showFormationText("吸积盘形成", "内缘发出炽热光芒...", "阶段 7/9");
        if (t > 0.8 && t < 0.83) showFormationText("引力透镜", "光线开始沿弯曲路径传播...", "阶段 7/9");
    }
    // --- 阶段8: 轨道带演化 (47-62s) ---
    else if (elapsed < 62) {
        const t = (elapsed - 47) / 15;
        if (flashSphere) { scene.remove(flashSphere); flashSphere = null; }
        if (formationCloud) { scene.remove(formationCloud); formationCloud = null; }
        bloomStrengthBoost = 0;
        if (accretionDisk) {
            accretionDisk.material.opacity = FO.disk;
            accretionDisk.rotation.y += 0.0015;
        }
        if (lensingRing) {
            lensingRing.material.opacity = FO.lens;
            lensingRing.rotation.z += 0.0008;
        }
        if (photonRing) {
            photonRing.material.opacity = FO.photon;
            const pulse = 1 + Math.sin(time * 2) * 0.02;
            photonRing.scale.set(pulse, pulse, pulse);
        }
        if (blackHole) blackHole.scale.setScalar(1);

        const beltStagger = [0, 0.1, 0.22, 0.36, 0.52, 0.7];
        const beltDur = 0.26;
        orbitalTrails.forEach((trail, i) => {
            const bt = Math.max(0, Math.min(1, (t - beltStagger[i]) / beltDur));
            const eb = bt * bt * (3 - 2 * bt);
            trail.mesh.material.opacity = FO.trails[i] * eb;
            trail.orbitLine.material.opacity = FO.orbitLines[i] * eb;
        });

        if (t < 0.02) showFormationText("轨道带演化", "第一条轨道带开始凝聚...", "阶段 8/9");
        if (t > 0.18 && t < 0.21) showFormationText("轨道带演化", "第二条轨道带形成...", "阶段 8/9");
        if (t > 0.38 && t < 0.41) showFormationText("轨道带演化", "内层轨道逐渐稳定...", "阶段 8/9");
        if (t > 0.58 && t < 0.61) showFormationText("轨道带演化", "外层轨道带显现...", "阶段 8/9");
        if (t > 0.78 && t < 0.81) showFormationText("轨道带演化", "六条轨道带全部就位...", "阶段 8/9");
    }
    // --- 阶段9: 星系成型 (62-70s) ---
    else if (elapsed < 70) {
        const t = (elapsed - 62) / 8;
        orbitalTrails.forEach((trail, i) => {
            trail.mesh.material.opacity = FO.trails[i];
            trail.orbitLine.material.opacity = FO.orbitLines[i];
        });
        if (accretionDisk) {
            accretionDisk.material.opacity = FO.disk;
            accretionDisk.rotation.y += 0.001;
        }
        if (lensingRing) {
            lensingRing.material.opacity = FO.lens;
            lensingRing.rotation.z += 0.0005;
        }
        if (photonRing) {
            photonRing.material.opacity = FO.photon;
            const pulse = 1 + Math.sin(time * 2) * 0.02;
            photonRing.scale.set(pulse, pulse, pulse);
        }
        if (blackHole) blackHole.scale.setScalar(1);
        if (starfield) {
            starfield.material.opacity = FO.star * Math.min(1, t * 1.5);
            starfield.rotation.y += 0.0002;
        }

        if (t < 0.02) showFormationText("星系成型", "遥远恒星逐渐显现...", "阶段 9/9");
        if (t > 0.4 && t < 0.43) showFormationText("星系成型", "整个星系趋于稳定...", "阶段 9/9");
        if (t > 0.8 && t < 0.83) showFormationText("星系形成完成", "卡冈图雅苏醒", "阶段 9/9");
    }
    // --- 完成 ---
    else {
        orbitalTrails.forEach((trail, i) => {
            trail.mesh.material.opacity = FO.trails[i];
            trail.orbitLine.material.opacity = FO.orbitLines[i];
        });
        if (accretionDisk) accretionDisk.material.opacity = FO.disk;
        if (lensingRing) lensingRing.material.opacity = FO.lens;
        if (starfield) starfield.material.opacity = FO.star;
        if (photonRing) photonRing.material.opacity = FO.photon;
        if (edgeRing) edgeRing.material.opacity = FO.edge;
        if (blackHole) blackHole.scale.setScalar(1);
        bloomStrengthBoost = 0;
        formationActive = false;
        hideFormationText();
        hideFastForwardBtn();
        statusEl.innerText = "星系形成完成";
        statusEl.style.color = "#cc88ff";
    }
}

/** 阶段2 星云缓旋辅助 */
function updateCloudSwirl(speedFactor) {
    if (!formationCloudData) return;
    const cloudPos = formationCloudData.positions;
    const cloudParams = formationCloudData.params;
    for (let i = 0; i < cloudParams.length; i++) {
        const p = cloudParams[i];
        p.currentAngle += p.swirlSpeed * speedFactor;
        cloudPos[i * 3] = p.startR * Math.cos(p.currentAngle);
        cloudPos[i * 3 + 1] = p.startY;
        cloudPos[i * 3 + 2] = p.startR * Math.sin(p.currentAngle);
    }
    if (formationCloud) formationCloud.geometry.attributes.position.needsUpdate = true;
}

// ==========================================
// 黑洞内部系统(队友 Downloads/index.html 1819-2095 行原版移植)
// ==========================================
function createInteriorScene() {
    const tex = createParticleTexture();
    // 统一挂在 interiorGroup 下,整体跟随黑洞世界坐标(内部模式锚定到卡冈图雅本体)
    interiorGroup = new THREE.Group();
    scene.add(interiorGroup);

    const interiorCount = 12000;
    const interiorGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(interiorCount * 3);
    const colors = new Float32Array(interiorCount * 3);
    const interiorParams = [];

    for (let i = 0; i < interiorCount; i++) {
        const r = 30 + Math.random() * 400;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const speed = 0.3 + Math.random() * 2;

        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = r * Math.cos(phi);

        const colorMix = Math.random();
        if (colorMix < 0.5) {
            colors[i * 3] = 1.0;
            colors[i * 3 + 1] = 0.15 + Math.random() * 0.2;
            colors[i * 3 + 2] = 0.2 + Math.random() * 0.2;
        } else if (colorMix < 0.8) {
            colors[i * 3] = 0.8 + Math.random() * 0.2;
            colors[i * 3 + 1] = 0.2 + Math.random() * 0.3;
            colors[i * 3 + 2] = 0.8 + Math.random() * 0.2;
        } else {
            colors[i * 3] = 0.3 + Math.random() * 0.3;
            colors[i * 3 + 1] = 0.1 + Math.random() * 0.2;
            colors[i * 3 + 2] = 1.0;
        }

        interiorParams.push({ r, theta, phi, speed, wobble: Math.random() * Math.PI * 2, wobbleSpeed: 0.5 + Math.random() * 1.5 });
    }

    interiorGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    interiorGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const interiorMat = new THREE.PointsMaterial({
        size: 2, vertexColors: true, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, map: tex, depthWrite: false, sizeAttenuation: true
    });

    interiorParticles = { mesh: new THREE.Points(interiorGeo, interiorMat), params: interiorParams, positions, geo: interiorGeo };
    interiorGroup.add(interiorParticles.mesh);

    // 多层发光环
    const ringColors = [0xff2244, 0xcc33aa, 0x8844ff, 0xff4488, 0x6633ff];
    for (let i = 0; i < 5; i++) {
        const ringGeo = new THREE.TorusGeometry(60 + i * 35, 1.5 + i * 0.3, 16, 150);
        const ringMat = new THREE.MeshBasicMaterial({
            color: ringColors[i], transparent: true, opacity: 0,
            blending: THREE.AdditiveBlending, side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2 + (i % 2 === 0 ? 0.2 : -0.2);
        ring.rotation.z = i * 0.4;
        interiorGroup.add(ring);
        interiorRings.push({ mesh: ring, speed: 0.001 + i * 0.0008, tiltSpeed: 0.0003 + i * 0.0002 });
    }

    // 奇点
    interiorSingularity = new THREE.Mesh(
        new THREE.SphereGeometry(3, 32, 32),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending })
    );
    interiorGroup.add(interiorSingularity);
}

function enterInterior() {
    if (interiorActive || formationActive) return;
    // 内部模式锚定到卡冈图雅本体:轴心切到黑洞(相机位置不动,仅重算"黑洞基准"球坐标)
    // 不再隐藏行星/星空/轨道带 —— 主星与卡冈图雅保持可见,红雾从黑洞位置展开
    const bhIdx = planetInstances.findIndex(({ spec }) => spec.name === 'planet1');
    if (bhIdx >= 0) {
        anchorCameraToPlanet(bhIdx);
        updateNavActive(bhIdx);
    }
    setGargantuaHints(true); // 内部模式同样是卡冈图雅专属场景
    const blackHole = getPlanetObj('planet1', 'blackHole');
    interiorActive = true;
    interiorTransition = 0;
    interiorExiting = false;

    savedCameraRadius = cameraState.radius;
    savedBloomStrength = bloomStrengthBoost;

    if (!interiorParticles) createInteriorScene();

    // 内部场景(红雾/光环/奇点)立即对齐黑洞世界坐标
    if (interiorGroup) {
        blackHole.getWorldPosition(interiorGroup.position);
    }

    setTimeout(() => {
        document.getElementById('interior-overlay').classList.add('show');
    }, 2000);

    statusEl.innerText = "进入事件视界...";
    statusEl.style.color = "#ff3366";
}

function exitInterior() {
    if (!interiorActive || interiorExiting) return;
    interiorExiting = true;
    document.getElementById('interior-overlay').classList.remove('show');
    hideInteriorInfoPanel();
    statusEl.innerText = "返回正常空间...";
    statusEl.style.color = "#cc88ff";
}

function updateInterior(dt) {
    const enterDuration = 2.5;
    const exitDuration = 2;

    // 内部场景每帧跟随黑洞世界坐标(黑洞公转时红雾随之移动)
    const bhInst = planetInstances.find(({ spec }) => spec.name === 'planet1');
    if (bhInst && interiorGroup) {
        bhInst.obj.getWorldPosition(interiorGroup.position);
    }

    if (!interiorExiting && interiorTransition < 1) {
        interiorTransition = Math.min(1, interiorTransition + dt / enterDuration);
        const t = interiorTransition;
        const eased = t * t * (3 - 2 * t);

        cameraState.radius = savedCameraRadius * (1 - eased) + 8 * eased;
        if (interiorParticles) interiorParticles.mesh.material.opacity = eased * 0.9;
        interiorRings.forEach((ring, i) => {
            ring.mesh.material.opacity = eased * (0.4 + i * 0.1);
        });
        if (interiorSingularity) interiorSingularity.material.opacity = eased * 1.0;
        bloomStrengthBoost = eased * 3;

        if (interiorTransition >= 1) {
            statusEl.innerText = "奇点核心";
            statusEl.style.color = "#ff3366";
        }
    } else if (interiorExiting && interiorTransition > 0) {
        interiorTransition = Math.max(0, interiorTransition - dt / exitDuration);
        const t = interiorTransition;
        const eased = t * t * (3 - 2 * t);

        cameraState.radius = savedCameraRadius * (1 - eased) + 8 * eased;
        if (interiorParticles) interiorParticles.mesh.material.opacity = eased * 0.9;
        interiorRings.forEach((ring, i) => {
            ring.mesh.material.opacity = eased * (0.4 + i * 0.1);
        });
        if (interiorSingularity) interiorSingularity.material.opacity = eased * 1.0;
        bloomStrengthBoost = eased * 3;

        if (interiorTransition <= 0) {
            interiorActive = false;
            interiorExiting = false;
            // 天体全程未隐藏,无需恢复可见性
            bloomStrengthBoost = savedBloomStrength;
            statusEl.innerText = "等待手势...";
            statusEl.style.color = "#cc6688";
        }
    }

    // 内部粒子螺旋坠入奇点
    if (interiorParticles && interiorTransition > 0.3) {
        const positions = interiorParticles.positions;
        const params = interiorParticles.params;
        const activeFactor = Math.min(1, (interiorTransition - 0.3) / 0.7);
        const time2 = time * 2;

        for (let i = 0; i < params.length; i++) {
            const p = params[i];
            p.theta += p.speed * dt * (0.8 + activeFactor * 1.5);
            p.phi += Math.sin(time2 * p.wobbleSpeed + p.wobble) * 0.02 * activeFactor;
            p.r -= p.speed * dt * (10 + activeFactor * 20);

            const gravityFactor = 1 + (1 - p.r / 450) * 2 * activeFactor;
            p.theta += p.speed * dt * gravityFactor * 0.5;

            if (p.r < 4) {
                p.r = 380 + Math.random() * 180;
                p.theta = Math.random() * Math.PI * 2;
                p.phi = Math.acos(2 * Math.random() - 1);
                p.speed = 0.5 + Math.random() * 2.5;
            }

            const turbulence = Math.sin(time2 * 3 + p.wobble * 2) * 0.02 * activeFactor;
            positions[i * 3] = p.r * Math.sin(p.phi + turbulence) * Math.cos(p.theta);
            positions[i * 3 + 1] = p.r * Math.sin(p.phi) * Math.sin(p.theta + turbulence * 0.5);
            positions[i * 3 + 2] = p.r * Math.cos(p.phi + turbulence * 0.7);
        }
        interiorParticles.geo.attributes.position.needsUpdate = true;

        const sizePulse = 1 + Math.sin(time2) * 0.3;
        interiorParticles.mesh.material.size = 2 * sizePulse;
    }

    // 环旋转和波动
    interiorRings.forEach((ring, i) => {
        const direction = i % 2 === 0 ? 1 : -1;
        ring.mesh.rotation.z += ring.speed * direction * (1.5 + Math.sin(time + i) * 0.5);
        ring.mesh.rotation.x = Math.PI / 2 + Math.sin(time * ring.tiltSpeed * 2 + i * 1.3) * 0.6;
        ring.mesh.rotation.y = Math.sin(time * ring.tiltSpeed * 1.5 + i) * 0.4;
        const pulse = 1 + Math.sin(time * 2 + i * 0.8) * 0.15 + Math.sin(time * 3.7 + i) * 0.08;
        ring.mesh.scale.set(pulse, pulse, pulse);
    });

    // 奇点脉动
    if (interiorSingularity) {
        const singPulse = 1 + Math.sin(time * 5) * 0.4 + Math.sin(time * 2.7) * 0.3 + Math.sin(time * 8.3) * 0.15;
        interiorSingularity.scale.set(singPulse, singPulse, singPulse);
        const colorShift = Math.sin(time * 3) * 0.5 + 0.5;
        interiorSingularity.material.color.setRGB(1, 0.7 + colorShift * 0.3, 0.5 + (1 - colorShift) * 0.5);
    }

    // 相机轻微晃动
    if (interiorTransition >= 1 && !interiorExiting) {
        cameraState.theta += Math.sin(time * 1.5) * 0.002;
        cameraState.phi += Math.sin(time * 2.1) * 0.0015;
    }

    // Bloom 动态脉动
    if (interiorTransition >= 0.5) {
        const bloomPulse = Math.sin(time * 2) * 0.5 + Math.sin(time * 4.3) * 0.3;
        bloomStrengthBoost = Math.max(2, 3 + bloomPulse * (interiorTransition >= 1 ? 1.5 : 0.5));
    }
}

// ==========================================
// 内部简介面板 + 键盘监听
// ==========================================
function showInteriorInfoPanel() {
    interiorInfoPanelShowing = true;
    document.getElementById('interior-info-panel').classList.add('show');
}

function hideInteriorInfoPanel() {
    interiorInfoPanelShowing = false;
    document.getElementById('interior-info-panel').classList.remove('show');
}

document.addEventListener('keydown', (e) => {
    // 按 3 退出黑洞内部
    if (e.key === '3' && interiorActive) {
        exitInterior();
        return;
    }
    // 按 4 进入黑洞内部
    if (e.key === '4' && !interiorActive && !formationActive) {
        enterInterior();
        return;
    }
    // 亮度调节 1/2
    if (e.key === '1' || e.key === '2') {
        if (e.key === '1') {
            brightnessLevel = Math.max(-3, brightnessLevel - 1);
        } else {
            brightnessLevel = Math.min(7, brightnessLevel + 1);
        }
        const step = brightnessSteps[brightnessLevel + 3];
        statusEl.innerText = `亮度: ${step.label} (${brightnessLevel >= 0 ? '+' : ''}${brightnessLevel})`;
        statusEl.style.color = "#cc88ff";
        setTimeout(() => {
            if (!interiorActive && !formationActive) {
                statusEl.innerText = "等待手势...";
                statusEl.style.color = "#cc6688";
            }
        }, 1500);
    }
});

// 功能介绍展开/收起
document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('instructions-toggle');
    if (toggle) {
        toggle.addEventListener('click', () => {
            document.getElementById('instructions-panel').classList.toggle('open');
        });
    }
    const interiorClose = document.getElementById('interior-info-close');
    if (interiorClose) {
        interiorClose.addEventListener('click', hideInteriorInfoPanel);
    }
    // 内部长按显示简介(简化:点击奇点区域即可)
    const overlay = document.getElementById('interior-overlay');
    if (overlay) {
        overlay.style.pointerEvents = 'none';
    }
});

// ==========================================
// 3. 动画与逻辑更新(原版结构 + 多星球遍历)
// ==========================================
function updateCamera() {
    // 黑洞内部模式:半径由 updateInterior 控制(→8 坠向奇点),
    // 必须跳过手势缩放和 minDistance=120 钳制,否则相机被强制拉回;
    // 轴心为黑洞世界坐标(getCameraCenter),红雾/奇点/坠入均以卡冈图雅本体为基准
    if (interiorActive) {
        const center = getCameraCenter(_cameraCenter);
        camera.position.x = center.x + cameraState.radius * Math.sin(cameraState.theta) * Math.sin(cameraState.phi);
        camera.position.y = center.y + cameraState.radius * Math.cos(cameraState.theta);
        camera.position.z = center.z + cameraState.radius * Math.sin(cameraState.theta) * Math.cos(cameraState.phi);
        camera.lookAt(center);
        return;
    }

    // 1. 处理旋转(死区 0.1 防抖 + 非线性曲线:小动作精细、大动作加速)
    if (Math.abs(cameraState.handRotation) > 0.1) {
        const raw = cameraState.handRotation;
        const adjusted = Math.sign(raw) * Math.pow(Math.abs(raw), 1.15);
        cameraState.phi += adjusted * CONFIG.rotationSpeedMultiplier;
    }

    // 2. 处理缩放(握拳 vs 张开)
    if (cameraState.isFist) {
        // 握拳: 远离,加速运动
        cameraState.zoomVelocity += CONFIG.fistAcceleration;
    } else if (cameraState.isOpen) {
        // 张开: 靠近,lerp 先快后慢
        cameraState.targetRadius = CONFIG.minDistance;
        const diff = cameraState.radius - CONFIG.minDistance;
        cameraState.zoomVelocity = -diff * CONFIG.openLerpFactor;
    } else {
        // 无手势,阻尼停止
        cameraState.zoomVelocity *= 0.9;
    }

    cameraState.radius += cameraState.zoomVelocity;

    if (cameraState.radius < CONFIG.minDistance) {
        cameraState.radius = CONFIG.minDistance;
        cameraState.zoomVelocity = 0;
    }
    if (cameraState.radius > CONFIG.maxDistance) {
        cameraState.radius = CONFIG.maxDistance;
    }

    // 注意:原版的空闲自转(phi -= 0.001)已按需求移除 —— 无指令时星球固定不动

    // 旋转轴心:聚焦行星时绕行星(实时跟随其公转),否则绕星系原点
    const center = getCameraCenter(_cameraCenter);

    // 球坐标 → 笛卡尔坐标(相对轴心;偏移方式与原版一致)
    camera.position.x = center.x + cameraState.radius * Math.sin(cameraState.theta) * Math.sin(cameraState.phi);
    camera.position.y = center.y + cameraState.radius * Math.cos(cameraState.theta);
    camera.position.z = center.z + cameraState.radius * Math.sin(cameraState.theta) * Math.cos(cameraState.phi);

    camera.lookAt(center);
}

function animate() {
    requestAnimationFrame(animate);

    // dt(秒,限幅防切页后跳变)—— 星系形成/黑洞内部动画的时间基准
    const now = performance.now();
    const dt = lastFrameTime ? Math.min((now - lastFrameTime) / 1000, 0.05) : 0.016;
    lastFrameTime = now;

    time += 0.005;

    // 轨道带运动(队友原版)
    updateOrbitalTrails();

    // 星空缓慢旋转
    if (starfield) starfield.rotation.y += 0.0002;

    // 星球自转/星环差速:由各星球模块自带的 tick 钩子驱动
    // 公转:orbitGroup 旋转,STAR 的 speed=0 自动静止
    planetInstances.forEach(({ spec, orbitGroup, obj }) => {
        if (spec.orbit.speed !== 0) {
            orbitGroup.rotation.y += spec.orbit.speed;
        }
        if (obj.userData.tick) {
            obj.userData.tick(time);
        }
    });

    // 相机聚焦动画(从当前球坐标平滑 lerp 到目标;黑洞内部模式中暂停,避免与坠入动画互抢半径)
    if (focusTarget && !interiorActive) {
        focusTarget.elapsed += 0.016; // 假设 60fps,后续可加 dt
        const t = Math.min(1, focusTarget.elapsed / focusTarget.duration);
        const eased = t * t * (3 - 2 * t); // easeInOut

        cameraState.radius = THREE.MathUtils.lerp(focusTarget.startRadius, focusTarget.targetRadius, eased);
        cameraState.theta = THREE.MathUtils.lerp(focusTarget.startTheta, focusTarget.targetTheta, eased);
        // phi 要取最短方向(避免绕远路)
        let phiDiff = focusTarget.targetPhi - focusTarget.startPhi;
        while (phiDiff > Math.PI) phiDiff -= Math.PI * 2;
        while (phiDiff < -Math.PI) phiDiff += Math.PI * 2;
        cameraState.phi = focusTarget.startPhi + phiDiff * eased;

        if (t >= 1) {
            const idx = focusTarget.planetIndex;
            focusTarget = null;
            // 聚焦完成:旋转轴心切换到被选行星(此后拖拽/缩放/手势均绕行星本身)
            anchorCameraToPlanet(idx);
        }
    }

    // 星系形成 9 阶段 / 黑洞内部模式(队友原版)
    if (formationActive) updateFormation(dt);
    if (interiorActive) updateInterior(dt);

    // Bloom 强度 = 亮度档位基准(1/2键调节) + 阶段动态加成
    if (bloomPassRef) {
        bloomPassRef.strength = brightnessSteps[brightnessLevel + 3].bloom + bloomStrengthBoost;
    }

    updateCamera();
    composer.render();
}

// ==========================================
// 4. MediaPipe Hands 集成(原版逐行对应)
// ==========================================
function onResults(results) {
    // 绘制预览图(方便用户调试位置)
    previewCtx.save();
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    previewCtx.drawImage(results.image, 0, 0, previewCanvas.width, previewCanvas.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];

        // 绘制骨架到小窗
        drawConnectors(previewCtx, landmarks, HAND_CONNECTIONS, {color: '#00FF00', lineWidth: 2});
        drawLandmarks(previewCtx, landmarks, {color: '#FF0000', lineWidth: 1, radius: 2});

        // 1. 判断旋转(手腕(0)与中指指根(9)的 X 坐标差值)
        const wrist = landmarks[0];
        const middleBase = landmarks[9];

        const dx = middleBase.x - wrist.x;
        cameraState.handRotation = dx * -5.0; // 反向使得符合直觉

        // 2. 判断 握拳 vs 张开(指尖到手腕距离 vs 指根到手腕距离)
        const fingerTips = [8, 12, 16, 20];
        const fingerMCPs = [5, 9, 13, 17];

        let foldedCount = 0;
        const distSq = (p1, p2) => (p1.x - p2.x)**2 + (p1.y - p2.y)**2;

        for (let i = 0; i < 4; i++) {
            const dTip = distSq(landmarks[fingerTips[i]], wrist);
            const dMcp = distSq(landmarks[fingerMCPs[i]], wrist);
            if (dTip < dMcp * 1.2) {
                foldedCount++;
            }
        }

        // 状态机
        if (foldedCount >= 3) {
            cameraState.isFist = true;
            cameraState.isOpen = false;
            statusEl.innerText = "状态: ✊ 握拳 (拉远)";
            statusEl.style.color = "#ff4444";
        } else if (foldedCount === 0) {
            cameraState.isFist = false;
            cameraState.isOpen = true;
            statusEl.innerText = "状态: ✋ 张开 (靠近)";
            statusEl.style.color = "#44ff44";
        } else {
            cameraState.isFist = false;
            cameraState.isOpen = false;
            statusEl.innerText = "状态: 🤞 旋转控制中";
            statusEl.style.color = "#00ffcc";
        }

    } else {
        cameraState.handRotation = 0;
        cameraState.isFist = false;
        cameraState.isOpen = false;
        statusEl.innerText = "未检测到手";
        statusEl.style.color = "#888";
    }
    previewCtx.restore();
}

function initMediaPipe() {
    const videoElement = document.getElementById('input-video');

    previewCanvas.width = 160;
    previewCanvas.height = 120;

    const hands = new window.Hands({locateFile: (file) => {
        return `./libs/mediapipe/${file}`;
    }});

    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    hands.onResults(onResults);

    // 自主管理摄像头流(替代 camera_utils:该库失败时会 alert 弹窗,体验差且无法自定义提示)
    // 返回 Promise:登录页即请求权限,enterGalaxy 等它完成后再淡出进入界面
    entryStatus.innerText = '正在请求摄像头权限,请允许...';
    entryStatus.style.color = '#00ffcc';
    camState = 'loading';
    return navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false
    }).then(stream => {
        videoElement.srcObject = stream;
        return videoElement.play();
    }).then(() => {
        // 送帧循环:等上一帧识别完再送下一帧,避免识别任务堆积
        const detectLoop = async () => {
            if (videoElement.readyState >= 2) {
                try { await hands.send({ image: videoElement }); } catch (e) { /* 单帧失败忽略 */ }
            }
            requestAnimationFrame(detectLoop);
        };
        requestAnimationFrame(detectLoop);

        // 摄像头就绪(淡出由 enterGalaxy 统一处理)
        camState = 'ready';
        // 若资源已就绪,点亮进入按钮;否则提示等待资源
        if (assetState === 'ready' || assetState === 'failed') {
            entryBtn.disabled = false;
            entryBtn.innerText = '进入星系';
            entryStatus.innerText = assetState === 'failed' ? '网络不佳,进入后加载可能稍慢' : '就绪';
            entryStatus.style.color = assetState === 'failed' ? '#ffaa00' : '#00ffcc';
        } else {
            entryStatus.innerText = '摄像头就绪,资源加载中...';
        }
    }).catch(err => {
        camState = 'error';
        entryStatus.innerText = friendlyCameraError(err);
        entryStatus.style.color = '#ff5555';
        entryBtn.disabled = false;
        entryBtn.innerText = '重试';
        throw err; // 上抛给 ensureCamera,用于判断"摄像头失败时不淡出"
    });
}

/** 摄像头错误 → 用户能看懂的中文提示 */
function friendlyCameraError(err) {
    const name = (err && err.name) || '';
    if (name === 'NotReadableError') return '摄像头被其他页面或程序占用,请关闭后点击重试';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return '摄像头权限被拒绝,请在浏览器地址栏允许摄像头后重试';
    if (name === 'NotFoundError' || name === 'OverconstrainedError') return '未检测到可用摄像头设备,请检查连接后重试';
    return '摄像头启动失败: ' + ((err && err.message) || err);
}

/** 摄像头预热:登录页即请求权限,返回 always-resolving promise('ready'/'error') */
function ensureCamera() {
    camReadyPromise = initMediaPipe()
        .then(() => 'ready')
        .catch(() => 'error'); // initMediaPipe 内部已设置错误文案与重试按钮
    return camReadyPromise;
}

// ==========================================
// 启动流程:页面打开即请求摄像头权限 → 预热模型 → 点击进入
// ==========================================

// 预热 MediaPipe 手势引擎资源(写进浏览器 HTTP 缓存,点击进入后秒开)
// 文件名与 @mediapipe/hands npm 包实际文件名一致(已本地化到 libs/mediapipe)
const MEDIAPIPE_BASE = './libs/mediapipe/';
const PRELOAD_FILES = [
    'hands_solution_packed_assets_loader.js',
    'hands_solution_simd_wasm_bin.js',
    'hands_solution_simd_wasm_bin.wasm',
    'hands.binarypb',
    'hand_landmark_full.tflite'   // modelComplexity:1 对应的模型(npm 包名,非 CDN 名)
];

function preloadAssets() {
    let done = 0;
    let failed = 0;
    PRELOAD_FILES.forEach((file) => {
        fetch(MEDIAPIPE_BASE + file, { mode: 'cors' })
            .catch(() => { failed++; })
            .finally(() => {
                done++;
                // 更新进度条
                if (progressFill) {
                    progressFill.style.width = Math.round((done / PRELOAD_FILES.length) * 100) + '%';
                }
                if (done === PRELOAD_FILES.length) {
                    assetState = failed > 0 ? 'failed' : 'ready';
                    // 进度条满:仅在摄像头也就绪时点亮按钮
                    if (camState === 'ready') {
                        entryBtn.disabled = false;
                        entryBtn.innerText = '进入星系';
                        entryStatus.innerText = assetState === 'failed' ? '网络不佳,进入后加载可能稍慢' : '就绪';
                        entryStatus.style.color = assetState === 'failed' ? '#ffaa00' : '#00ffcc';
                    } else if (camState === 'error') {
                        entryBtn.disabled = false;
                        entryBtn.innerText = '重试';
                    }
                    // camState === 'loading':按钮保持 disabled,等摄像头授权
                }
            });
    });
}

// ==========================================
// 用户统计 + 进入流程(昵称 + 验证码 + 幂等上报 + 离线补报)
// ==========================================

// ---------- 验证码 ----------
let currentCaptchaId = '';

// 本地降级验证码:静态托管(GitHub Pages)/后端未启动时前端自发自验,保证进入流程不被阻塞
let localCaptchaAnswer = '';

function generateLocalCaptcha() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    localCaptchaAnswer = code;
    currentCaptchaId = 'local-' + Math.random().toString(36).slice(2);
    captchaImg.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40" viewBox="0 0 120 40">' +
        '<rect width="120" height="40" fill="#0d0d0d"/>' +
        code.split('').map((c, i) =>
            '<text x="' + (18 + i * 26) + '" y="28" fill="#ffaa00" font-size="22" font-family="monospace" text-anchor="middle"' +
            ' transform="rotate(' + Math.floor(Math.random() * 24 - 12) + ' ' + (18 + i * 26) + ' 22)">' + c + '</text>'
        ).join('') +
        '</svg>';
}

async function refreshCaptcha() {
    captchaImg.innerHTML = '加载中';
    try {
        const d = await api.getCaptcha();
        currentCaptchaId = d.captchaId;
        captchaImg.innerHTML = d.svg;
    } catch (err) {
        generateLocalCaptcha(); // 无后端环境:前端自发自验,不阻塞进入
    }
}
captchaImg.addEventListener('click', refreshCaptcha);

// ---------- 统计概览 ----------
function loadVisitStats() {
    api.getStats()
        .then(d => {
            entryStats.innerText = d.uniqueVisitors > 0
                ? `已有 ${d.uniqueVisitors} 人进入过星系 · 累计 ${d.totalVisits} 次`
                : '你将是第一位访客';
            entryStats.style.color = '#ffaa00';
        })
        .catch(() => {
            // 静态托管(Pages)与本地后端未启动,分别给出准确提示
            entryStats.innerText = location.hostname.endsWith('github.io')
                ? '离线模式:统计服务不可用,仍可正常进入体验'
                : '统计服务未连接,请从 http://localhost:8080/galaxy.html 访问';
            entryStats.style.color = '#ff5555';
        });
}

// ---------- 离线补报(数据同步策略:失败暂存 localStorage,下次打开补报;uuid 幂等保证不虚增) ----------
const PENDING_KEY = 'pending-visit';

function savePendingVisit(payload) {
    try { localStorage.setItem(PENDING_KEY, JSON.stringify(payload)); } catch (e) { /* 隐私模式等场景静默 */ }
}

function flushPendingVisit() {
    let pending = null;
    try { pending = localStorage.getItem(PENDING_KEY); } catch (e) { return; }
    if (!pending) return;
    api.submitVisit(JSON.parse(pending))
        .then(() => { localStorage.removeItem(PENDING_KEY); console.log('[统计] 离线期间的进入记录已补报'); })
        .catch(() => { /* 下次再试 */ });
}

// ---------- 进入流程 ----------
async function handleEnter() {
    const answer = captchaInput.value.trim().toUpperCase();
    if (!currentCaptchaId) {
        entryStatus.innerText = '验证码未加载,请点击验证码区域刷新';
        entryStatus.style.color = '#ff5555';
        return;
    }
    if (!answer) {
        entryStatus.innerText = '请输入验证码';
        entryStatus.style.color = '#ff5555';
        return;
    }

    // 本地降级验证码:前端自验后直接进入(静态托管/后端未启动环境)
    if (currentCaptchaId.startsWith('local-')) {
        if (answer !== localCaptchaAnswer) {
            entryStatus.innerText = '验证码错误';
            entryStatus.style.color = '#ff5555';
            captchaInput.value = '';
            generateLocalCaptcha();
            return;
        }
        entryBtn.disabled = true;
        entryStatus.innerText = '离线模式,进入星系...';
        entryStatus.style.color = '#00ffcc';
        enterGalaxy();
        return;
    }

    entryBtn.disabled = true;
    entryStatus.innerText = '正在校验...';
    entryStatus.style.color = '#00ffcc';

    const payload = {
        nickname: nicknameInput.value.trim(),
        captchaId: currentCaptchaId,
        captchaAnswer: answer,
        visitUuid: crypto.randomUUID()
    };

    try {
        await api.submitVisit(payload);      // 幂等:重试不会虚增计数
        try { localStorage.removeItem(PENDING_KEY); } catch (e) { /* 静默 */ }
        enterGalaxy();
    } catch (err) {
        if (err.status === 400 || err.status === 429) {
            // 业务错误:验证码错误/过期/被锁,提示并换新码
            entryStatus.innerText = err.message;
            entryStatus.style.color = '#ff5555';
            captchaInput.value = '';
            refreshCaptcha();
            entryBtn.disabled = false;
        } else {
            // 网络/服务器故障:不阻塞进入(演示优先),暂存后下次补报
            savePendingVisit(payload);
            entryStatus.innerText = '统计服务暂不可达,进入记录将在下次打开时自动补报';
            entryStatus.style.color = '#ffaa00';
            enterGalaxy();
        }
    }
}

function enterGalaxy() {
    // 星尘背景转场:中心排斥 0→5 三秒炸开后销毁(与摄像头就绪并行)
    const burstDone = burstAndDestroy(3000);

    // 摄像头已在登录页请求;若失败则在此重试
    const camReady = (camReadyPromise || Promise.resolve('error')).then(state => {
        if (state === 'ready') return 'ready';
        return ensureCamera(); // 失败:重新请求
    });

    Promise.all([burstDone, camReady]).then(([, state]) => {
        if (state === 'ready') {
            // 转场完成 + 摄像头就绪 → 淡出进入界面,星系接管
            entryOverlay.classList.add('hidden');
            setTimeout(() => { entryOverlay.style.display = 'none'; }, 700);

            // 功能介绍启动即自动展示,无需任何点击(1s 后弹出,等转场尘埃落定)
            // 卡冈图雅介绍面板不在此预展示:启动视角在主星,应在用户点击/跳转到黑洞时才出现
            setTimeout(() => {
                document.getElementById('instructions-panel').classList.add('open');
            }, 1000);
        }
        // 摄像头失败:initMediaPipe 已设置错误文案与"重试"按钮,用户可再次点击重试
    });
}

entryBtn.addEventListener('click', handleEnter);
captchaInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !entryBtn.disabled) handleEnter();
});

// ---------- 断网监听(连接状态管理) ----------
window.addEventListener('offline', () => {
    entryStats.innerText = '网络已断开';
    entryStats.style.color = '#ff5555';
});
window.addEventListener('online', () => {
    loadVisitStats();
    flushPendingVisit();
});

initThree();
animate();
startEntryBackground(document.getElementById('bg-galaxy'));
preloadAssets();
ensureCamera(); // 登录页即请求摄像头权限,无需等到点击进入
loadVisitStats();
refreshCaptcha();
flushPendingVisit();
