// src/entryBackground.js
// 进入界面「银河系」背景 —— 由 React Bits 的 Galaxy.jsx 精确转换为原生 JS
// ====================================================================
// 【转换说明】
//   - React 组件壳(jsx / useRef / useEffect / props) → 原生 JS 启动/转场/销毁函数
//   - OGL 引擎核心(Renderer/Triangle/Program)与两段 shader → 逐字保留,视觉 100% 还原
//   - 图一「自定义」面板数值 → PARAMS 初始值
//   - 「中心排斥」从静态 prop 升级为可动画 uniform:点击进入后 0→5 三秒缓动炸开(转场)
// 【依赖】ogl(本地 node_modules,galaxy.html importmap 已映射,无 CDN 请求)
// ====================================================================

import { Renderer, Program, Mesh, Color, Triangle } from 'ogl';

// 图一「自定义」面板数值
const PARAMS = {
    focal: [0.5, 0.5],
    rotation: [1.0, 0.0],
    starSpeed: 0.4,          // 星速
    density: 1,              // 密度
    hueShift: 120,           // 色相移 120°
    speed: 1.0,              // 动画速度
    glowIntensity: 0.2,      // 发光强度
    saturation: 0,           // 饱和度
    twinkleIntensity: 0.4,   // 闪烁强度
    rotationSpeed: 0.05,     // 旋转速度
    autoCenterRepulsion: 0,  // 中心排斥(转场动画到 9 档,隧道穿梭)
    transparent: true,
    lightMode: false
};
const BURST_TARGET = 9;        // 转场目标档位(隧道穿梭:强度 5→9)
const BURST_RANGE = 0.02;      // 转场时中心排斥作用范围(0.1→0.02,全屏飞掠)

const vertexShader = `
attribute vec2 uv;
attribute vec2 position;

varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 0, 1);
}
`;

const fragmentShader = `
precision highp float;

uniform float uTime;
uniform vec3 uResolution;
uniform vec2 uFocal;
uniform vec2 uRotation;
uniform float uStarSpeed;
uniform float uDensity;
uniform float uHueShift;
uniform float uSpeed;
uniform float uGlowIntensity;
uniform float uSaturation;
uniform float uTwinkleIntensity;
uniform float uRotationSpeed;
uniform float uAutoCenterRepulsion;
uniform float uCenterRepulsionRange;
uniform bool uTransparent;
uniform float uLightMode;

varying vec2 vUv;

#define NUM_LAYER 4.0
#define STAR_COLOR_CUTOFF 0.2
#define MAT45 mat2(0.7071, -0.7071, 0.7071, 0.7071)
#define PERIOD 3.0

float Hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float tri(float x) {
  return abs(fract(x) * 2.0 - 1.0);
}

float tris(float x) {
  float t = fract(x);
  return 1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0));
}

float trisn(float x) {
  float t = fract(x);
  return 2.0 * (1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0))) - 1.0;
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float Star(vec2 uv, float flare) {
  float d = length(uv);
  float m = (0.05 * uGlowIntensity) / d;
  float rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
  m += rays * flare * uGlowIntensity;
  uv *= MAT45;
  rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
  m += rays * 0.3 * flare * uGlowIntensity;
  m *= smoothstep(1.0, 0.2, d);
  return m;
}

vec3 StarLayer(vec2 uv) {
  vec3 col = vec3(0.0);

  vec2 gv = fract(uv) - 0.5;
  vec2 id = floor(uv);

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y));
      vec2 si = id + vec2(float(x), float(y));
      float seed = Hash21(si);
      float size = fract(seed * 345.32);
      float glossLocal = tri(uStarSpeed / (PERIOD * seed + 1.0));
      float flareSize = smoothstep(0.9, 1.0, size) * glossLocal;

      float red = smoothstep(STAR_COLOR_CUTOFF, 1.0, Hash21(si + 1.0)) + STAR_COLOR_CUTOFF;
      float blu = smoothstep(STAR_COLOR_CUTOFF, 1.0, Hash21(si + 3.0)) + STAR_COLOR_CUTOFF;
      float grn = min(red, blu) * seed;
      vec3 base = vec3(red, grn, blu);

      float hue = atan(base.g - base.r, base.b - base.r) / (2.0 * 3.14159) + 0.5;
      hue = fract(hue + uHueShift / 360.0);
      float sat = length(base - vec3(dot(base, vec3(0.299, 0.587, 0.114)))) * uSaturation;
      float val = max(max(base.r, base.g), base.b);
      base = hsv2rgb(vec3(hue, sat, val));

      vec2 pad = vec2(tris(seed * 34.0 + uTime * uSpeed / 10.0), tris(seed * 38.0 + uTime * uSpeed / 30.0)) - 0.5;

      float star = Star(gv - offset - pad, flareSize);
      vec3 color = base;

      float twinkle = trisn(uTime * uSpeed + seed * 6.2831) * 0.5 + 1.0;
      twinkle = mix(1.0, twinkle, uTwinkleIntensity);
      star *= twinkle;

      col += star * size * color;
    }
  }

  return col;
}

void main() {
  vec2 focalPx = uFocal * uResolution.xy;
  vec2 uv = (vUv * uResolution.xy - focalPx) / uResolution.y;

  if (uAutoCenterRepulsion > 0.0) {
    vec2 centerUV = vec2(0.0, 0.0);
    float centerDist = length(uv - centerUV);
    vec2 repulsion = normalize(uv - centerUV) * (uAutoCenterRepulsion / (centerDist + uCenterRepulsionRange));
    uv += repulsion * 0.05;
  }

  float autoRotAngle = uTime * uRotationSpeed;
  mat2 autoRot = mat2(cos(autoRotAngle), -sin(autoRotAngle), sin(autoRotAngle), cos(autoRotAngle));
  uv = autoRot * uv;

  uv = mat2(uRotation.x, -uRotation.y, uRotation.y, uRotation.x) * uv;

  vec3 col = vec3(0.0);

  for (float i = 0.0; i < 1.0; i += 1.0 / NUM_LAYER) {
    float depth = fract(i + uStarSpeed * uSpeed);
    float scale = mix(20.0 * uDensity, 0.5 * uDensity, depth);
    float fade = depth * smoothstep(1.0, 0.9, depth);
    col += StarLayer(uv * scale + i * 453.32) * fade;
  }

  if (uLightMode > 0.5) {
    float energy = max(max(col.r, col.g), col.b);
    float coverage = clamp(smoothstep(0.0, 0.42, energy) * 0.92, 0.0, 0.92);
    vec3 ink = clamp(col * 0.48, 0.0, 0.82);
    gl_FragColor = vec4(mix(vec3(1.0), ink, coverage), 1.0);
  } else if (uTransparent) {
    float alpha = length(col);
    alpha = smoothstep(0.0, 0.3, alpha);
    alpha = min(alpha, 1.0);
    gl_FragColor = vec4(col, alpha);
  } else {
    gl_FragColor = vec4(col, 1.0);
  }
}
`;

let container = null;
let renderer = null;
let program = null;
let mesh = null;
let animateId = 0;
let running = false;
let burstState = null; // { start, duration, resolve }

function resize() {
    if (!renderer || !container) return;
    renderer.setSize(container.offsetWidth, container.offsetHeight);
    const gl = renderer.gl;
    if (program) {
        program.uniforms.uResolution.value = new Color(
            gl.canvas.width,
            gl.canvas.height,
            gl.canvas.width / gl.canvas.height
        );
    }
}

function update(t) {
    if (!running) return;
    animateId = requestAnimationFrame(update);

    program.uniforms.uTime.value = t * 0.001;
    program.uniforms.uStarSpeed.value = (t * 0.001 * PARAMS.starSpeed) / 10.0;

    // 转场:中心排斥 0→9 + 作用范围 0.1→0.02(easeInOutCubic),隧道穿梭感,完成后销毁
    if (burstState) {
        const k = Math.min(1, (performance.now() - burstState.start) / burstState.duration);
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        program.uniforms.uAutoCenterRepulsion.value = BURST_TARGET * e;
        program.uniforms.uCenterRepulsionRange.value = 0.1 + (BURST_RANGE - 0.1) * e;
        if (k >= 1) {
            const done = burstState.resolve;
            burstState = null;
            destroyEntryBackground();
            done();
            return; // 已销毁(renderer/program 已置 null),不再 render
        }
    }

    renderer.render({ scene: mesh });
}

/** 启动进入界面背景(页面打开即调) */
export function startEntryBackground(el) {
    if (running || !el) return;
    container = el;

    renderer = new Renderer({ alpha: PARAMS.transparent, premultipliedAlpha: false });
    const gl = renderer.gl;

    // 透明背景混合(原版 transparent 分支)
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    const geometry = new Triangle(gl);
    program = new Program(gl, {
        vertex: vertexShader,
        fragment: fragmentShader,
        uniforms: {
            uTime: { value: 0 },
            uResolution: { value: new Color(gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height) },
            uFocal: { value: new Float32Array(PARAMS.focal) },
            uRotation: { value: new Float32Array(PARAMS.rotation) },
            uStarSpeed: { value: PARAMS.starSpeed },
            uDensity: { value: PARAMS.density },
            uHueShift: { value: PARAMS.hueShift },
            uSpeed: { value: PARAMS.speed },
            uGlowIntensity: { value: PARAMS.glowIntensity },
            uSaturation: { value: PARAMS.saturation },
            uTwinkleIntensity: { value: PARAMS.twinkleIntensity },
            uRotationSpeed: { value: PARAMS.rotationSpeed },
            uAutoCenterRepulsion: { value: PARAMS.autoCenterRepulsion },
            uCenterRepulsionRange: { value: 0.1 },   // 原版分母 padding,转场时动画到 BURST_RANGE
            uTransparent: { value: PARAMS.transparent },
            uLightMode: { value: PARAMS.lightMode ? 1 : 0 }
        }
    });
    mesh = new Mesh(gl, { geometry, program });

    window.addEventListener('resize', resize, false);
    resize();

    running = true;
    animateId = requestAnimationFrame(update);
    container.appendChild(gl.canvas);
}

/** 转场:中心排斥 0→5 缓动炸开(easeInOutCubic),完成后自动销毁并 resolve */
export function burstAndDestroy(durationMs = 3000) {
    return new Promise((resolve) => {
        if (!running || !program) { resolve(); return; } // 背景未启动/已销毁(如重试二次进入)直接跳过
        burstState = { start: performance.now(), duration: durationMs, resolve };
    });
}

/** 销毁:停循环、解绑事件、移除 canvas、释放 WebGL 上下文 */
export function destroyEntryBackground() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(animateId);
    window.removeEventListener('resize', resize);
    const gl = renderer.gl;
    gl.canvas.remove();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    renderer = null; program = null; mesh = null; container = null; burstState = null;
}
