// src/particleTexture.js
// 共享粒子纹理单例 —— 所有星球的 PointsMaterial.map 复用此纹理
// 维护者:架构协调者
// 设计目标:白色径向渐变中心 + 透明边缘,配合 AdditiveBlending
//           白色中心可被 PointsMaterial.color 着色为任意星球主色
// 冻结时间:Day 1 22:00(随接口一起冻结)

import * as THREE from 'three';

/**
 * 创建圆形径向渐变粒子纹理(32×32)
 * 与原 index.html createParticleTexture() 规格一致,保证视觉统一
 * @returns {THREE.CanvasTexture}
 */
function createParticleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext('2d');

    // 径向渐变:中心实心白 → 边缘完全透明
    // 关键:中心必须是纯白(255,255,255),才能被 PointsMaterial.color 正确着色
    const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.2, 'rgba(255,255,255,0.8)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.2)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');

    context.fillStyle = gradient;
    context.fillRect(0, 0, 32, 32);

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
}

// 单例:模块加载时创建一次,所有星球复用同一份 GPU 资源
// 成员用法:import { particleTexture } from '../particleTexture.js';
//           new THREE.PointsMaterial({ map: particleTexture, color: 0xff6600, ... })
export const particleTexture = createParticleTexture();
