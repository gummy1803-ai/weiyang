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
    rotationSpeedMultiplier: 0.05
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

// GROUP 模式:相机围绕系统中心(原点)球坐标,手势驱动
function updateGroupCamera() {
    // 手掌旋转 → 水平角 phi
    if (Math.abs(cameraState.handRotation) > 0.1) {
        cameraState.phi += cameraState.handRotation * CONFIG.rotationSpeedMultiplier;
    }
    // 握拳 → 远离;张开 → 靠近
    if (cameraState.isFist) {
        cameraState.zoomVelocity += 0.5;
    } else if (cameraState.isOpen) {
        cameraState.targetRadius = CONFIG.minDistance;
        const diff = cameraState.radius - CONFIG.minDistance;
        cameraState.zoomVelocity = -diff * 0.05;
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
    // 空闲自转(无手势时系统缓慢旋转,保持动态感)
    if (!cameraState.isFist && !cameraState.isOpen && Math.abs(cameraState.handRotation) < 0.1) {
        cameraState.phi -= 0.001;
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

    // 公转:每个 orbit 按各自速度绕系统中心旋转
    planetInstances.forEach(({ spec, orbit }) => {
        orbit.rotation.y += spec.orbit.speed;
    });

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
    } else {
        cameraState.handRotation = 0;
        cameraState.isFist = false;
        cameraState.isOpen = false;
        statusEl.innerText = '未检测到手';
        statusEl.style.color = '#888';
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
