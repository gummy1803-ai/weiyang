// src/planets/planet_vela.js
// 船帆座星云 Vela Supernova Remnant —— 超新星遗迹 + 脉冲星 + 丝状网络
// 适配自 124-main/船帆座星云.html，遵循 PlanetSpec 契约
import * as THREE from 'three';
import { particleTexture } from '../particleTexture.js?v=20260902v3';
import { PlanetType, assertValidSpec } from '../PlanetSpec.js?v=20260902v3';

const CONFIG = {
    pulsarRadius: 3, pulsarGlow1: 7, pulsarGlow2: 16, pulsarGlow3: 30,
    jetLength: 80, jetRadius: 5,
    nebulaRadius: 160, plerionRadius: 40,
    filamentCount: 60, filamentParticles: 200,
    diffuseCount: 25000, haloCount: 4000,
    tiltX: 0.15, tiltZ: -0.08,
};

function noise3D(x, y, z) {
    return Math.sin(x*0.03)*Math.cos(y*0.04)*Math.sin(z*0.035)
         + Math.sin(x*0.08+1)*Math.cos(y*0.07+2)*Math.sin(z*0.06+3)*0.5
         + Math.sin(x*0.15+4)*Math.cos(y*0.13+5)*Math.sin(z*0.11+6)*0.25;
}

function createJets() {
    const count = 6000;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count*3), col = new Float32Array(count*3);
    const data = { basePos: new Float32Array(count*3), phases: new Float32Array(count) };
    for (let i = 0; i < count; i++) {
        const lobe = Math.random()<0.5?1:-1;
        const t = Math.pow(Math.random(), 0.5);
        const dist = t*CONFIG.jetLength;
        const angle = Math.random()*Math.PI*2;
        const radius = CONFIG.jetRadius*(0.3+t*0.7);
        const x = Math.cos(angle)*radius, y = lobe*dist, z = Math.sin(angle)*radius;
        pos[i*3]=x; pos[i*3+1]=y; pos[i*3+2]=z;
        data.basePos[i*3]=x; data.basePos[i*3+1]=y; data.basePos[i*3+2]=z;
        data.phases[i]=Math.random()*Math.PI*2;
        const intensity = (1-t*0.6)*(0.4+Math.random()*0.5);
        col[i*3]=0.55*intensity; col[i*3+1]=0.8*intensity; col[i*3+2]=0.95*intensity;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return { points: new THREE.Points(geo, new THREE.PointsMaterial({
        size: 2.5, map: particleTexture, vertexColors: true, transparent: true,
        opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    })), data };
}

function createFilaments() {
    const total = CONFIG.filamentCount*CONFIG.filamentParticles + 500;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(total*3), colors = new Float32Array(total*3);
    let idx = 0;
    for (let f = 0; f < CONFIG.filamentCount; f++) {
        const startTheta = Math.random()*Math.PI*2, startPhi = Math.acos(2*Math.random()-1);
        const startR = 20+Math.random()*CONFIG.nebulaRadius*0.8;
        const cx = startR*Math.sin(startPhi)*Math.cos(startTheta);
        const cy = startR*Math.cos(startPhi);
        const cz = startR*Math.sin(startPhi)*Math.sin(startTheta);
        const dirTheta = Math.random()*Math.PI*2, dirPhi = Math.acos(2*Math.random()-1);
        const nx = Math.sin(dirPhi)*Math.cos(dirTheta), ny = Math.cos(dirPhi), nz = Math.sin(dirPhi)*Math.sin(dirTheta);
        const bendX=(Math.random()-0.5)*0.5, bendY=(Math.random()-0.5)*0.5, bendZ=(Math.random()-0.5)*0.5;
        const filLen = 40+Math.random()*100;
        const colorType = Math.random();
        let rc, gc, bc;
        if (colorType<0.4){rc=0.9;gc=0.2;bc=0.15;}
        else if (colorType<0.65){rc=0.25;gc=0.7;bc=0.55;}
        else if (colorType<0.85){rc=0.2;gc=0.5;bc=0.8;}
        else {rc=0.8;gc=0.4;bc=0.15;}
        const filWidth = 2+Math.random()*4;
        for (let p = 0; p < CONFIG.filamentParticles; p++) {
            const t = p/CONFIG.filamentParticles;
            const dist = t*filLen;
            const bend = Math.sin(t*2.5)*20, bend2 = Math.cos(t*3)*15;
            const spread = filWidth+t*3;
            positions[idx*3]=cx+nx*dist+bendX*bend+(Math.random()-0.5)*spread;
            positions[idx*3+1]=cy+ny*dist+bendY*bend2+(Math.random()-0.5)*spread;
            positions[idx*3+2]=cz+nz*dist+bendZ*bend+(Math.random()-0.5)*spread;
            const intensity = Math.sin(t*Math.PI)*(0.4+Math.random()*0.5);
            colors[idx*3]=rc*intensity; colors[idx*3+1]=gc*intensity; colors[idx*3+2]=bc*intensity;
            idx++;
        }
    }
    // 铅笔星云 NGC 2736
    const pSX=-80, pSY=40, pSZ=-50, pDX=0.8, pDY=-0.3, pDZ=0.5, pLen=120;
    const pCount = total - CONFIG.filamentCount*CONFIG.filamentParticles;
    for (let p = 0; p < pCount; p++) {
        const t = p/pCount, dist = t*pLen;
        positions[idx*3]=pSX+pDX*dist+(Math.random()-0.5)*2;
        positions[idx*3+1]=pSY+pDY*dist+(Math.random()-0.5)*2;
        positions[idx*3+2]=pSZ+pDZ*dist+(Math.random()-0.5)*2;
        const intensity = Math.sin(t*Math.PI)*(0.5+Math.random()*0.4);
        colors[idx*3]=0.25*intensity; colors[idx*3+1]=0.7*intensity; colors[idx*3+2]=0.6*intensity;
        idx++;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({
        size: 2.5, map: particleTexture, vertexColors: true, transparent: true,
        opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    }));
}

function createDiffuse() {
    const count = CONFIG.diffuseCount;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count*3), colors = new Float32Array(count*3);
    const data = { basePos: new Float32Array(count*3), phases: new Float32Array(count), speeds: new Float32Array(count) };
    for (let i = 0; i < count; i++) {
        const r = CONFIG.plerionRadius+Math.random()*CONFIG.nebulaRadius;
        const theta = Math.random()*Math.PI*2, phi = Math.acos(2*Math.random()-1);
        const x = r*Math.sin(phi)*Math.cos(theta), y = r*Math.cos(phi), z = r*Math.sin(phi)*Math.sin(theta);
        const n = noise3D(x, y, z)*10;
        positions[i*3]=x+n*0.3; positions[i*3+1]=y+n*0.2; positions[i*3+2]=z+n*0.3;
        data.basePos[i*3]=positions[i*3]; data.basePos[i*3+1]=positions[i*3+1]; data.basePos[i*3+2]=positions[i*3+2];
        data.phases[i]=Math.random()*Math.PI*2; data.speeds[i]=0.06+Math.random()*0.2;
        const distFactor = r/CONFIG.nebulaRadius;
        const nv = noise3D(x*2, y*2, z*2);
        let rc, gc, bc;
        if (nv>0.2 && distFactor<0.5){rc=0.2+Math.random()*0.1;gc=0.5+Math.random()*0.15;bc=0.75+Math.random()*0.15;}
        else if (nv>-0.1){rc=0.25+Math.random()*0.1;gc=0.6+Math.random()*0.15;bc=0.5+Math.random()*0.1;}
        else {rc=0.7+Math.random()*0.15;gc=0.2+Math.random()*0.1;bc=0.15+Math.random()*0.08;}
        const brightness = (1.0-distFactor*0.4)*(0.3+Math.random()*0.5);
        colors[i*3]=rc*brightness; colors[i*3+1]=gc*brightness; colors[i*3+2]=bc*brightness;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return { points: new THREE.Points(geo, new THREE.PointsMaterial({
        size: 2.5, map: particleTexture, vertexColors: true, transparent: true,
        opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    })), data };
}

function createHalo() {
    const count = CONFIG.haloCount;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count*3), colors = new Float32Array(count*3);
    const data = { basePos: new Float32Array(count*3), phases: new Float32Array(count) };
    for (let i = 0; i < count; i++) {
        const r = CONFIG.nebulaRadius+Math.random()*80;
        const theta = Math.random()*Math.PI*2, phi = Math.acos(2*Math.random()-1);
        const x = r*Math.sin(phi)*Math.cos(theta), y = r*Math.cos(phi), z = r*Math.sin(phi)*Math.sin(theta);
        positions[i*3]=x; positions[i*3+1]=y; positions[i*3+2]=z;
        data.basePos[i*3]=x; data.basePos[i*3+1]=y; data.basePos[i*3+2]=z;
        data.phases[i]=Math.random()*Math.PI*2;
        const brightness = 0.06+Math.random()*0.1, t = Math.random();
        if (t<0.5){colors[i*3]=brightness*0.6;colors[i*3+1]=brightness*0.25;colors[i*3+2]=brightness*0.15;}
        else {colors[i*3]=brightness*0.25;colors[i*3+1]=brightness*0.5;colors[i*3+2]=brightness*0.6;}
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return { points: new THREE.Points(geo, new THREE.PointsMaterial({
        size: 2.0, map: particleTexture, vertexColors: true, transparent: true,
        opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    })), data };
}

export function createVelaNebula() {
    const group = new THREE.Group();
    group.name = 'vela';
    group.rotation.x = CONFIG.tiltX;
    group.rotation.z = CONFIG.tiltZ;

    const pulsar = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.pulsarRadius, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xddeeff })
    );
    group.add(pulsar);
    const glow1 = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.pulsarGlow1, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, side: THREE.BackSide })
    );
    group.add(glow1);
    const glow2 = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.pulsarGlow2, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0x4488aa, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, side: THREE.BackSide })
    );
    group.add(glow2);
    const glow3 = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.pulsarGlow3, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0x336677, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, side: THREE.BackSide })
    );
    group.add(glow3);

    const plerion1 = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.plerionRadius, 24, 24),
        new THREE.MeshBasicMaterial({ color: 0x44aacc, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, side: THREE.BackSide })
    );
    group.add(plerion1);
    const plerion2 = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.plerionRadius*0.6, 24, 24),
        new THREE.MeshBasicMaterial({ color: 0x66bbdd, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, side: THREE.BackSide })
    );
    group.add(plerion2);

    const jets = createJets(); group.add(jets.points);
    const filaments = createFilaments(); group.add(filaments);
    const diffuse = createDiffuse(); group.add(diffuse.points);
    const halo = createHalo(); group.add(halo.points);

    const clickTarget = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.nebulaRadius*1.2, 16, 16),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    clickTarget.name = 'vela-click';
    group.add(clickTarget);

    group.userData.tick = (time) => {
        const g1p = 1+Math.sin(time*7)*0.1; glow1.scale.set(g1p,g1p,g1p); glow1.material.opacity = 0.4+Math.sin(time*7)*0.12;
        const g2p = 1+Math.sin(time*5+0.5)*0.06; glow2.scale.set(g2p,g2p,g2p);
        const g3p = 1+Math.sin(time*3+1)*0.04; glow3.scale.set(g3p,g3p,g3p);
        const p1p = 1+Math.sin(time*1.5)*0.03; plerion1.scale.set(p1p,p1p,p1p); plerion1.material.opacity = 0.04+Math.sin(time*1.2)*0.015;
        const p2p = 1+Math.sin(time*2)*0.04; plerion2.scale.set(p2p,p2p,p2p);

        if (jets.data) {
            const arr = jets.points.geometry.attributes.position.array;
            const n = jets.data.basePos.length/3;
            for (let i = 0; i < n; i++) {
                const bx=jets.data.basePos[i*3], by=jets.data.basePos[i*3+1], bz=jets.data.basePos[i*3+2], ph=jets.data.phases[i];
                arr[i*3]=bx+Math.sin(time*0.3+ph)*1;
                arr[i*3+1]=by+Math.sin(time*0.4+ph)*1.5;
                arr[i*3+2]=bz+Math.cos(time*0.3+ph)*1;
            }
            jets.points.geometry.attributes.position.needsUpdate = true;
        }
        if (diffuse.data) {
            const arr = diffuse.points.geometry.attributes.position.array;
            const n = diffuse.data.basePos.length/3;
            for (let i = 0; i < n; i++) {
                const bx=diffuse.data.basePos[i*3], by=diffuse.data.basePos[i*3+1], bz=diffuse.data.basePos[i*3+2];
                const ph=diffuse.data.phases[i], sp=diffuse.data.speeds[i];
                arr[i*3]=bx+Math.sin(time*sp+ph)*2.5;
                arr[i*3+1]=by+Math.cos(time*sp*0.7+ph)*2;
                arr[i*3+2]=bz+Math.sin(time*sp*0.5+ph)*2;
            }
            diffuse.points.geometry.attributes.position.needsUpdate = true;
        }
        if (halo.data) {
            const arr = halo.points.geometry.attributes.position.array;
            const n = halo.data.basePos.length/3;
            for (let i = 0; i < n; i++) {
                const bx=halo.data.basePos[i*3], by=halo.data.basePos[i*3+1], bz=halo.data.basePos[i*3+2], ph=halo.data.phases[i];
                arr[i*3]=bx+Math.sin(time*0.08+ph)*2;
                arr[i*3+1]=by+Math.cos(time*0.07+ph)*1.5;
                arr[i*3+2]=bz+Math.sin(time*0.09+ph)*2;
            }
            halo.points.geometry.attributes.position.needsUpdate = true;
        }
        group.rotation.y += 0.0003;
    };

    group.userData.clickTarget = clickTarget;
    return group;
}

export const velaSpec = {
    name: 'vela',
    type: PlanetType.PLANET,
    factory: createVelaNebula,
    orbit: { radius: 2350, speed: 0.00025 },  // 环3·相位0°(与蜘蛛星云共享轨道,同速180°错相)
    appearance: { palette: [0x44aacc, 0xff4433, 0x44cc88], supportsColorCustomization: false },
    info: {
        title: '船帆座星云', subtitle: 'Vela Supernova Remnant · 超新星遗迹',
        rows: [
            { label: '类型', value: '超新星遗迹 (SNR)' },
            { label: '距离', value: '~800 光年（船帆座）' },
            { label: '直径', value: '~8° 天区' },
            { label: '中心', value: '船帆座脉冲星 (PSR J0835-4510)' },
            { label: '特征', value: '丝状网络 / 铅笔星云 / 脉冲风云尾' }
        ],
        description: '船帆座超新星遗迹是约 1.1 万年前一颗超新星爆发的产物，是距离地球最近的超新星遗迹之一。其中心的脉冲星每秒旋转约 11 次，周围有蓝青色的脉冲风云尾（Plerion）。遗迹中布满了壮观的发光丝状结构网络，以及著名的铅笔星云（NGC 2736）——一条细长的激波丝。'
    }
};

assertValidSpec(velaSpec);
