// src/particleTexture.js
// 共享粒子纹理 —— 与原始 index.html 的 createParticleTexture() 1:1 一致
// 注意:这是全局唯一的光点纹理,成员星球必须复用它,禁止自己 new THREE.CanvasTexture

import * as THREE from 'three';

function createParticleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.2, 'rgba(255,255,255,0.8)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.2)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(canvas);
}

// 模块级单例:ES module 首次被 import 时创建一次,之后所有星球共享
export const particleTexture = createParticleTexture();
