// src/planets/planet_helix.js
// 螺旋星云 Helix Nebula (NGC 7293) —— 行星状星云 + 白矮星 + 彗状结
// 适配自 124-main/螺旋星云.html，遵循 PlanetSpec 契约
import * as THREE from 'three';
import { particleTexture } from '../particleTexture.js?v=20260902v3';
import { PlanetType, assertValidSpec } from '../PlanetSpec.js?v=20260902v3';

const CONFIG = {
    dwarfRadius: 5, dwarfGlow1: 12, dwarfGlow2: 25, dwarfGlow3: 45,
    shellInner: 60, shellOuter: 110, shellMain: 85, shellThickness: 30,
    haloInner: 120, haloOuter: 200,
    gasParticleCount: 28000, knotCount: 150, knotParticleCount: 60, haloParticleCount: 5000,
    tiltX: 0.25,
};

function createGas() {
    const count = CONFIG.gasParticleCount;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count*3), colors = new Float32Array(count*3);
    const data = { baseR: new Float32Array(count), baseTheta: new Float32Array(count),
        basePhi: new Float32Array(count), phases: new Float32Array(count), speeds: new Float32Array(count) };
    for (let i = 0; i < count; i++) {
        const r = CONFIG.shellMain+(Math.random()-0.5)*CONFIG.shellThickness*2+(Math.random()-0.5)*CONFIG.shellThickness;
        const theta = Math.random()*Math.PI*2;
        const phi = Math.PI/2+(Math.random()-0.5)*0.6*Math.PI;
        positions[i*3]=r*Math.sin(phi)*Math.cos(theta);
        positions[i*3+1]=r*Math.cos(phi)*0.6;
        positions[i*3+2]=r*Math.sin(phi)*Math.sin(theta);
        data.baseR[i]=r; data.baseTheta[i]=theta; data.basePhi[i]=phi;
        data.phases[i]=Math.random()*Math.PI*2; data.speeds[i]=0.1+Math.random()*0.3;
        const distFactor = (r-CONFIG.shellInner)/(CONFIG.shellOuter-CONFIG.shellInner);
        const t = Math.max(0, Math.min(1, distFactor));
        let rc, gc, bc;
        if (t<0.3){const t2=t/0.3;rc=0.3+t2*0.2;gc=0.8+t2*0.1;bc=0.9;}
        else if (t<0.6){const t2=(t-0.3)/0.3;rc=0.5+t2*0.3;gc=0.7-t2*0.2;bc=0.9-t2*0.2;}
        else {const t2=(t-0.6)/0.4;rc=0.8+t2*0.2;gc=0.3-t2*0.15;bc=0.2-t2*0.1;}
        const brightnessVar = 0.7+Math.random()*0.5;
        colors[i*3]=rc*brightnessVar; colors[i*3+1]=gc*brightnessVar; colors[i*3+2]=bc*brightnessVar;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return { points: new THREE.Points(geo, new THREE.PointsMaterial({
        size: 2.5, map: particleTexture, vertexColors: true, transparent: true,
        opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    })), data };
}

function createKnots() {
    const total = CONFIG.knotCount * CONFIG.knotParticleCount;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(total*3), colors = new Float32Array(total*3);
    for (let k = 0; k < CONFIG.knotCount; k++) {
        const r = CONFIG.shellMain+(Math.random()-0.5)*CONFIG.shellThickness;
        const theta = Math.random()*Math.PI*2;
        const phi = Math.PI/2+(Math.random()-0.5)*0.5*Math.PI;
        const kx = r*Math.sin(phi)*Math.cos(theta), ky = r*Math.cos(phi)*0.6, kz = r*Math.sin(phi)*Math.sin(theta);
        const dirX = kx/r, dirY = ky/r, dirZ = kz/r;
        for (let p = 0; p < CONFIG.knotParticleCount; p++) {
            const idx = k*CONFIG.knotParticleCount+p;
            const tailFactor = Math.random();
            const tailLen = tailFactor*15;
            const spread = 2+tailFactor*3;
            positions[idx*3]=kx+dirX*tailLen+(Math.random()-0.5)*spread;
            positions[idx*3+1]=ky+dirY*tailLen+(Math.random()-0.5)*spread;
            positions[idx*3+2]=kz+dirZ*tailLen+(Math.random()-0.5)*spread;
            const headBright = 1-tailFactor;
            if (headBright>0.6){colors[idx*3]=0.6+Math.random()*0.3;colors[idx*3+1]=0.7+Math.random()*0.3;colors[idx*3+2]=0.9+Math.random()*0.1;}
            else if (headBright>0.3){colors[idx*3]=0.4+Math.random()*0.2;colors[idx*3+1]=0.6+Math.random()*0.2;colors[idx*3+2]=0.5+Math.random()*0.2;}
            else {colors[idx*3]=0.7+Math.random()*0.2;colors[idx*3+1]=0.2+Math.random()*0.15;colors[idx*3+2]=0.1+Math.random()*0.1;}
        }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({
        size: 2.0, map: particleTexture, vertexColors: true, transparent: true,
        opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    }));
}

function createHalo() {
    const count = CONFIG.haloParticleCount;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count*3), colors = new Float32Array(count*3);
    const data = { baseR: new Float32Array(count), baseTheta: new Float32Array(count),
        basePhi: new Float32Array(count), phases: new Float32Array(count) };
    for (let i = 0; i < count; i++) {
        const r = CONFIG.haloInner+Math.random()*(CONFIG.haloOuter-CONFIG.haloInner);
        const theta = Math.random()*Math.PI*2, phi = Math.acos(2*Math.random()-1);
        positions[i*3]=r*Math.sin(phi)*Math.cos(theta);
        positions[i*3+1]=r*Math.cos(phi)*0.8;
        positions[i*3+2]=r*Math.sin(phi)*Math.sin(theta);
        data.baseR[i]=r; data.baseTheta[i]=theta; data.basePhi[i]=phi; data.phases[i]=Math.random()*Math.PI*2;
        const brightness = 0.15+Math.random()*0.25;
        const distFactor = (r-CONFIG.haloInner)/(CONFIG.haloOuter-CONFIG.haloInner);
        colors[i*3]=brightness*(0.8+distFactor*0.2); colors[i*3+1]=brightness*(0.2+distFactor*0.15); colors[i*3+2]=brightness*(0.3+distFactor*0.2);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return { points: new THREE.Points(geo, new THREE.PointsMaterial({
        size: 2.0, map: particleTexture, vertexColors: true, transparent: true,
        opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    })), data };
}

export function createHelixNebula() {
    const group = new THREE.Group();
    group.name = 'helix';
    group.rotation.x = CONFIG.tiltX;

    const dwarf = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.dwarfRadius, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xddeeff })
    );
    group.add(dwarf);
    const glow1 = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.dwarfGlow1, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xaaccff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, side: THREE.BackSide })
    );
    group.add(glow1);
    const glow2 = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.dwarfGlow2, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0x88aaff, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, side: THREE.BackSide })
    );
    group.add(glow2);
    const glow3 = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.dwarfGlow3, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0x6688dd, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, side: THREE.BackSide })
    );
    group.add(glow3);

    const innerBubble = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.shellInner, 32, 32),
        new THREE.MeshBasicMaterial({ color: 0x44aacc, transparent: true, opacity: 0.04, blending: THREE.AdditiveBlending, side: THREE.BackSide })
    );
    group.add(innerBubble);
    const outerShell = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.shellOuter, 32, 32),
        new THREE.MeshBasicMaterial({ color: 0xff5533, transparent: true, opacity: 0.03, blending: THREE.AdditiveBlending, side: THREE.BackSide })
    );
    group.add(outerShell);
    const haloSphere = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.haloOuter, 32, 32),
        new THREE.MeshBasicMaterial({ color: 0xaa3366, transparent: true, opacity: 0.015, blending: THREE.AdditiveBlending, side: THREE.BackSide })
    );
    group.add(haloSphere);

    const gas = createGas(); group.add(gas.points);
    const knots = createKnots(); group.add(knots);
    const halo = createHalo(); group.add(halo.points);

    const clickTarget = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.haloOuter*0.9, 16, 16),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    clickTarget.name = 'helix-click';
    group.add(clickTarget);

    group.userData.tick = (time) => {
        const g1 = 1+Math.sin(time*3)*0.08; glow1.scale.set(g1,g1,g1); glow1.material.opacity = 0.35+Math.sin(time*2.5)*0.08;
        const g2 = 1+Math.sin(time*2+0.5)*0.06; glow2.scale.set(g2,g2,g2);
        const g3 = 1+Math.sin(time*1.5+1)*0.05; glow3.scale.set(g3,g3,g3);
        const ib = 1+Math.sin(time*0.8)*0.02; innerBubble.scale.set(ib,ib,ib); innerBubble.material.opacity = 0.035+Math.sin(time*1.0)*0.01;

        if (gas.data) {
            const arr = gas.points.geometry.attributes.position.array;
            const n = gas.data.baseR.length;
            for (let i = 0; i < n; i++) {
                const r = gas.data.baseR[i]+Math.sin(time*gas.data.speeds[i]+gas.data.phases[i])*1.5;
                const theta = gas.data.baseTheta[i]+time*0.002;
                const phi = gas.data.basePhi[i];
                arr[i*3]=r*Math.sin(phi)*Math.cos(theta);
                arr[i*3+1]=r*Math.cos(phi)*0.6;
                arr[i*3+2]=r*Math.sin(phi)*Math.sin(theta);
            }
            gas.points.geometry.attributes.position.needsUpdate = true;
        }
        if (halo.data) {
            const arr = halo.points.geometry.attributes.position.array;
            const n = halo.data.baseR.length;
            for (let i = 0; i < n; i++) {
                const r = halo.data.baseR[i]+Math.sin(time*0.1+halo.data.phases[i])*2;
                const theta = halo.data.baseTheta[i]+time*0.001;
                const phi = halo.data.basePhi[i];
                arr[i*3]=r*Math.sin(phi)*Math.cos(theta);
                arr[i*3+1]=r*Math.cos(phi)*0.8;
                arr[i*3+2]=r*Math.sin(phi)*Math.sin(theta);
            }
            halo.points.geometry.attributes.position.needsUpdate = true;
        }
        group.rotation.y += 0.0002;
    };

    group.userData.clickTarget = clickTarget;
    return group;
}

export const helixSpec = {
    name: 'helix',
    type: PlanetType.PLANET,
    factory: createHelixNebula,
    orbit: { radius: 2800, speed: 0.0006, phase: Math.PI + Math.PI / 6 },  // 环4·210°(与猎户星云同环,同速180°错相)
    appearance: { palette: [0x44aacc, 0xff5533, 0xaa3366], supportsColorCustomization: false },
    info: {
        title: '螺旋星云', subtitle: 'Helix Nebula (NGC 7293) · 行星状星云',
        rows: [
            { label: '类型', value: '行星状星云' },
            { label: '距离', value: '~655 光年（宝瓶座）' },
            { label: '直径', value: '~5.7 光年' },
            { label: '中心', value: '白矮星' },
            { label: '特征', value: '彗状结 (Cometary Knots) / 壳层结构' }
        ],
        description: '螺旋星云是离地球最近的行星状星云之一，是类太阳恒星死亡时抛出的外壳。其中心的白矮星辐射出强烈的紫外光，电离周围气体。星云最显著的特征是数千个"彗状结"——朝向中心的头部呈蓝色，背向的尾巴呈红色，宛如宇宙中的向日葵。内壳层呈蓝绿色（OIII），外壳层呈红橙色（Hα）。'
    }
};

assertValidSpec(helixSpec);
