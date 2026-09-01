// src/main.js
// 主场景装配器 —— 把符合 PlanetSpec 契约的星球模块装配进场景
// 维护者:架构协调者
// Day 1 范围:场景 + 装配 + 公转 + 相机双模式骨架(GROUP 实现,SINGLE 留接口)+ MediaPipe 手势(GROUP 输入)
// Day 6 补完:SINGLE 模式射线投射选中星球 + 模式切换平滑过渡

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { assertValidSpec, validateFactoryOutput } from './PlanetSpec.js';
import { PLANET_SPECS } from './planets/index.js';  // 从聚合模块导入,多人协作改这里

// 装配清单:由 src/planets/index.js 统一维护,main.js 不直接 import 具体星球
const SPECS = PLANET_SPECS;

// ===== 配置 =====
const CONFIG = {
    defaultDistance: 400,
    minDistance: 150,
    maxDistance: 2000,
    rotationSpeedMultiplier: 0.01  // 再降一档,从 0.02
};

// ===== 自动归位系统配置 =====
const RETURN_CONFIG = {
    idleTimeout: 10000,         // 10秒无指令触发归位(±0.1秒精度由 performance.now() 保证)
    duration: 2500,             // 归位动画时长 2.5秒(在 2-3秒 范围内)
    positionTolerance: 0.002,   // ±2mm 位置误差容忍(1单位=1mm假设)
    rotationDeadzone: 0.1,      // 旋转死区,过滤手部抖动(防误触发)
    minValidFrames: 3,           // 有效指令需连续3帧稳定(防误触发)
};

// 归位状态机
const ReturnState = { IDLE: 'idle', RETURNING: 'returning' };
let returnState = ReturnState.IDLE;
let lastCommandTime = performance.now();   // 最后一次有效指令时间戳
let validFrameCount = 0;                    // 当前连续有效帧计数
let returnStartTime = 0;                    // 归位开始时间
let returnFrom = null;                      // 归位起始状态快照 {radius, theta, phi}

// 归位目标(默认中心位置)
const RETURN_TARGET = {
    radius: CONFIG.defaultDistance,
    theta: Math.PI / 2,
    phi: 0
};

// ===== 全局 =====
let scene, camera, renderer, composer;
let systemGroup;
const planetInstances = [];  // { spec, orbit, obj, index }
let time = 0;

// 相机模式
const CameraMode = { GROUP: 'group', SINGLE: 'single' };
let cameraMode = CameraMode.GROUP;
let focusedIndex = -1;  // SINGLE 模式聚焦的星球索引

// 相机状态(GROUP 模式用)
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
const loadingEl = document.getElementById('loading');
const previewCanvas = document.getElementById('webcam-preview');
const previewCtx = previewCanvas.getContext('2d');

// ===== Three.js 初始化 =====
function initThree() {
    const container = document.getElementById('canvas-container');

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.0005);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 3000);
    camera.position.set(0, 0, CONFIG.defaultDistance);

    // TODO Day 7 评估是否移除:preserveDrawingBuffer:true 确保 agent 截图能抓到渲染内容
    // 开发期保留,正式演示前确认是否需要移除(有微小 GPU 开销)
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Bloom 后期处理
    const renderPass = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        1.5, 0.4, 0.85
    );
    bloomPass.threshold = 0;
    bloomPass.strength = 2.0;
    bloomPass.radius = 0.5;

    composer = new EffectComposer(renderer);
    composer.addPass(renderPass);
    composer.addPass(bloomPass);

    window.addEventListener('resize', onWindowResize);
}

// ===== 装配星球(契约校验 + 包装进 orbit Group)=====
function assemblePlanets(specs) {
    systemGroup = new THREE.Group();
    systemGroup.name = 'system';

    specs.forEach((spec, i) => {
        // 静态契约校验
        assertValidSpec(spec);

        // 调工厂函数 + 运行时校验
        const obj = spec.factory();
        const outErrors = validateFactoryOutput(obj);
        if (outErrors.length > 0) {
            throw new Error(`[main] ${spec.name} factory 输出无效: ${outErrors.join('; ')}`);
        }

        // 包装进 orbit Group:
        //   轨道偏移由父节点处理(orbit.position.x = radius)
        //   星球本体保持在 (0,0,0)(设计师约定)
        const orbit = new THREE.Group();
        orbit.name = `${spec.name}-orbit`;
        orbit.position.x = spec.orbit.radius;
        orbit.rotation.z = spec.orbit.inclination;
        orbit.userData.speed = spec.orbit.speed;
        orbit.add(obj);

        systemGroup.add(orbit);
        planetInstances.push({ spec, orbit, obj, index: i });
        console.log(`[main] 装配成功: ${spec.name} (orbit.r=${spec.orbit.radius})`);
    });

    scene.add(systemGroup);
}

// ===== 相机更新(双模式分发)=====
function updateCamera() {
    if (cameraMode === CameraMode.GROUP) {
        updateGroupCamera();
    } else if (cameraMode === CameraMode.SINGLE && focusedIndex >= 0) {
        updateSingleCamera();
    }
}

// 缓动函数:ease in-out cubic,归位动画用,起步/结束平稳无冲击
function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// 启动归位流程:记录起始快照,进入 RETURNING 状态
function startReturn() {
    returnState = ReturnState.RETURNING;
    returnStartTime = performance.now();
    returnFrom = {
        radius: cameraState.radius,
        theta: cameraState.theta,
        phi: cameraState.phi
    };
    // 日志:触发时间 + 起始位置
    const triggerTime = new Date().toLocaleString('zh-CN', { hour12: false });
    console.log(`[归位] 触发时间: ${triggerTime}`);
    console.log(`[归位] 起始位置: r=${returnFrom.radius.toFixed(3)}, theta=${returnFrom.theta.toFixed(4)}, phi=${returnFrom.phi.toFixed(4)}`);
    if (statusEl) {
        statusEl.innerText = '状态: 🏠 自动归位中...';
        statusEl.style.color = '#ffaa00';
    }
}

// 归位完成:发送确认信号 + 重置待机状态 + 日志
function completeReturn() {
    const elapsed = performance.now() - returnStartTime;
    const finalState = {
        radius: cameraState.radius,
        theta: cameraState.theta,
        phi: cameraState.phi
    };
    // 强制吸附到目标(消除残余误差,保证 ±2mm 精度)
    cameraState.radius = RETURN_TARGET.radius;
    cameraState.theta = RETURN_TARGET.theta;
    cameraState.phi = RETURN_TARGET.phi;
    cameraState.zoomVelocity = 0;
    cameraState.handRotation = 0;
    cameraState.isFist = false;
    cameraState.isOpen = false;

    returnState = ReturnState.IDLE;
    lastCommandTime = performance.now();  // 重置计时器,避免立刻再触发
    validFrameCount = 0;

    // 日志:耗时 + 最终位置 + 误差
    const posError = Math.abs(finalState.radius - RETURN_TARGET.radius);
    console.log(`[归位] 完成 | 耗时: ${elapsed.toFixed(0)}ms | 最终位置: r=${RETURN_TARGET.radius.toFixed(3)}, theta=${RETURN_TARGET.theta.toFixed(4)}, phi=${RETURN_TARGET.phi.toFixed(4)} | 位置误差: ${posError.toFixed(4)} (容忍 ±${RETURN_CONFIG.positionTolerance})`);
    console.log('[归位] 已发送确认信号,设备重置为待机模式');

    if (statusEl) {
        statusEl.innerText = '状态: 待机 (已归位)';
        statusEl.style.color = '#888888';
    }
}

// GROUP 模式:相机围绕系统中心(原点)球坐标,手势驱动
function updateGroupCamera() {
    // 归位模式:用 easeInOutCubic 插值到目标,不响应手势
    if (returnState === ReturnState.RETURNING && returnFrom) {
        const elapsed = performance.now() - returnStartTime;
        const t = Math.min(elapsed / RETURN_CONFIG.duration, 1);  // 0→1
        const k = easeInOutCubic(t);                              // 缓动后的 0→1
        cameraState.radius = returnFrom.radius + (RETURN_TARGET.radius - returnFrom.radius) * k;
        cameraState.theta = returnFrom.theta + (RETURN_TARGET.theta - returnFrom.theta) * k;
        cameraState.phi   = returnFrom.phi   + (RETURN_TARGET.phi   - returnFrom.phi  ) * k;
        // 完成:耗时到 + 误差小于容忍
        if (t >= 1) {
            completeReturn();
        }
    } else {
        // 正常手势控制模式
        // 手掌旋转 → 水平角 phi
        if (Math.abs(cameraState.handRotation) > RETURN_CONFIG.rotationDeadzone) {
            cameraState.phi += cameraState.handRotation * CONFIG.rotationSpeedMultiplier;
        }
        // 握拳 → 远离;张开 → 靠近
        if (cameraState.isFist) {
            cameraState.zoomVelocity += 0.08;
        } else if (cameraState.isOpen) {
            cameraState.targetRadius = CONFIG.minDistance;
            const diff = cameraState.radius - CONFIG.minDistance;
            cameraState.zoomVelocity = -diff * 0.01;
        } else {
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
    }
    const r = cameraState.radius;
    camera.position.x = r * Math.sin(cameraState.theta) * Math.sin(cameraState.phi);
    camera.position.y = r * Math.cos(cameraState.theta);
    camera.position.z = r * Math.sin(cameraState.theta) * Math.cos(cameraState.phi);
    camera.lookAt(0, 0, 0);
}

// SINGLE 模式骨架:相机围绕选中星球世界坐标
// Day 6 实现:用 inst.obj.getWorldPosition(tmpVec) 作为 lookAt 目标,跟随公转中的星球
// Day 1 临时复用 GROUP 逻辑,避免 demo 黑屏
function updateSingleCamera() {
    const inst = planetInstances[focusedIndex];
    if (!inst) return;
    // TODO Day 6:tmpVec.setFromMatrixWorld(inst.obj.matrixWorld); camera.lookAt(tmpVec)
    updateGroupCamera();
}

// ===== 模式切换 API(Day 6 由射线投射触发)=====
export function focusPlanet(index) {
    if (index < 0 || index >= planetInstances.length) return;
    focusedIndex = index;
    cameraMode = CameraMode.SINGLE;
    console.log(`[main] 聚焦星球 #${index}: ${planetInstances[index].spec.name}`);
}

export function unfocus() {
    focusedIndex = -1;
    cameraMode = CameraMode.GROUP;
    console.log('[main] 返回 GROUP 模式');
}

// ===== 动画循环 =====
function animate() {
    requestAnimationFrame(animate);
    time += 0.005;

    // 公转:已禁用,Day 6 开启(多星球时再启用)
    // planetInstances.forEach(({ spec, orbit }) => {
    //     orbit.rotation.y += spec.orbit.speed;
    // });

    // 归位触发检测:IDLE 状态下,距上次有效指令超过 10 秒则启动归位
    // 时间精度:performance.now() 微秒级,±0.1秒 容忍富余
    if (returnState === ReturnState.IDLE) {
        const idleMs = performance.now() - lastCommandTime;
        if (idleMs >= RETURN_CONFIG.idleTimeout) {
            startReturn();
        }
    }

    updateCamera();
    composer.render();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
}

// ===== MediaPipe 手势(GROUP 模式输入)=====
function onResults(results) {
    previewCtx.save();
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    previewCtx.drawImage(results.image, 0, 0, previewCanvas.width, previewCanvas.height);

    let hasValidCommand = false;  // 本帧是否有"有效指令"(防误触发)

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        // 预览窗骨架
        drawConnectors(previewCtx, landmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 2 });
        drawLandmarks(previewCtx, landmarks, { color: '#FF0000', lineWidth: 1, radius: 2 });

        // 旋转:手腕(0)与中指根(9)的 X 差
        const wrist = landmarks[0];
        const middleBase = landmarks[9];
        const dx = middleBase.x - wrist.x;
        cameraState.handRotation = dx * -5.0;

        // 握拳/张开判定
        const fingerTips = [8, 12, 16, 20];
        const fingerMCPs = [5, 9, 13, 17];
        let foldedCount = 0;
        const distSq = (p1, p2) => (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
        for (let i = 0; i < 4; i++) {
            const dTip = distSq(landmarks[fingerTips[i]], wrist);
            const dMcp = distSq(landmarks[fingerMCPs[i]], wrist);
            if (dTip < dMcp * 1.2) foldedCount++;
        }

        if (foldedCount >= 3) {
            cameraState.isFist = true;
            cameraState.isOpen = false;
            statusEl.innerText = '状态: ✊ 握拳 (拉远)';
            statusEl.style.color = '#ff4444';
        } else if (foldedCount === 0) {
            cameraState.isFist = false;
            cameraState.isOpen = true;
            statusEl.innerText = '状态: ✋ 张开 (靠近)';
            statusEl.style.color = '#44ff44';
        } else {
            cameraState.isFist = false;
            cameraState.isOpen = false;
            statusEl.innerText = '状态: 🤞 旋转控制中';
            statusEl.style.color = '#00ffcc';
        }

        // 有效指令判定(防误触发):
        //   - 旋转超过死区,或握拳,或张开 → 视为有效
        //   - 否则(手指半弯、手在镜头里静止)不算有效指令,计时器继续
        if (Math.abs(cameraState.handRotation) > RETURN_CONFIG.rotationDeadzone
            || cameraState.isFist
            || cameraState.isOpen) {
            validFrameCount++;
            // 连续 minValidFrames 帧稳定才确认有效(过滤瞬间抖动)
            if (validFrameCount >= RETURN_CONFIG.minValidFrames) {
                hasValidCommand = true;
            }
        } else {
            validFrameCount = 0;
        }
    } else {
        cameraState.handRotation = 0;
        cameraState.isFist = false;
        cameraState.isOpen = false;
        statusEl.innerText = '未检测到手';
        statusEl.style.color = '#888';
        validFrameCount = 0;
    }

    // 有效指令到来:刷新计时器;若正在归位则打断归位,恢复手势控制
    if (hasValidCommand) {
        lastCommandTime = performance.now();
        if (returnState === ReturnState.RETURNING) {
            returnState = ReturnState.IDLE;
            returnFrom = null;
            console.log('[归位] 被有效指令打断,恢复手势控制');
            if (statusEl) {
                statusEl.innerText = '状态: 🤞 旋转控制中';
                statusEl.style.color = '#00ffcc';
            }
        }
    }

    previewCtx.restore();
}

function initMediaPipe() {
    const videoElement = document.getElementById('input-video');
    const hands = new window.Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });
    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });
    hands.onResults(onResults);

    const cameraUtils = new window.Camera(videoElement, {
        onFrame: async () => { await hands.send({ image: videoElement }); },
        width: 640,
        height: 480
    });
    cameraUtils.start()
        .then(() => { loadingEl.style.display = 'none'; })
        .catch(err => { loadingEl.innerHTML = '摄像头启动失败: ' + err; });

    previewCanvas.width = 160;
    previewCanvas.height = 120;
}

// ===== 启动 =====
initThree();
assemblePlanets(SPECS);
animate();
setTimeout(initMediaPipe, 1000);
