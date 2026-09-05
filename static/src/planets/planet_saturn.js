// src/planets/planet_saturn.js
// 土星 Saturn —— 气态巨行星 + 环系
// 适配自 124-main/土星.html，遵循 PlanetSpec 契约
import * as THREE from 'three';
import { particleTexture } from '../particleTexture.js?v=20260902v3';
import { PlanetType, assertValidSpec } from '../PlanetSpec.js?v=20260902v3';

const CONFIG = {
    planetRadius: 50,
    atmosphereInner: 54,
    atmosphereOuter: 59,
    rings: [
        { innerR: 62,  outerR: 74,  opacity: 0.15, color: 0x887755, label: 'D' },
        { innerR: 75,  outerR: 92,  opacity: 0.3,  color: 0xaa9966, label: 'C' },
        { innerR: 93,  outerR: 120, opacity: 0.85, color: 0xddcc88, label: 'B' },
        { innerR: 121, outerR: 127, opacity: 0.05, color: 0x554433, label: 'Cassini' },
        { innerR: 128, outerR: 157, opacity: 0.6,  color: 0xccbb77, label: 'A' },
        { innerR: 160, outerR: 165, opacity: 0.35, color: 0xbbaa66, label: 'F' },
    ],
    ringParticleCount: 22000,
    orbitParticleCount: 8000,
};

const AXIAL_TILT = 0.466;

function createPlanetTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const bands = [
        { y: 0, h: 40, color: '#665544' }, { y: 40, h: 35, color: '#887755' },
        { y: 75, h: 30, color: '#bbaa77' }, { y: 105, h: 35, color: '#998866' },
        { y: 140, h: 30, color: '#d4c490' }, { y: 170, h: 45, color: '#b0a070' },
        { y: 215, h: 55, color: '#e8d8a8' }, { y: 270, h: 45, color: '#b0a070' },
        { y: 315, h: 30, color: '#d4c490' }, { y: 345, h: 35, color: '#998866' },
        { y: 380, h: 30, color: '#bbaa77' }, { y: 410, h: 35, color: '#887755' },
        { y: 445, h: 40, color: '#665544' }, { y: 485, h: 27, color: '#554433' },
    ];
    bands.forEach((band, idx) => {
        ctx.beginPath(); ctx.moveTo(0, band.y);
        for (let x = 0; x <= 1024; x += 6) {
            const wobble = Math.sin(x*0.02+idx*1.5)*4 + Math.sin(x*0.05+idx*0.6)*2;
            ctx.lineTo(x, band.y+wobble);
        }
        ctx.lineTo(1024, band.y+band.h);
        for (let x = 1024; x >= 0; x -= 6) {
            const wobble = Math.sin(x*0.02+idx*1.5+0.7)*4 + Math.sin(x*0.05+idx*0.6+0.4)*2;
            ctx.lineTo(x, band.y+band.h+wobble);
        }
        ctx.closePath(); ctx.fillStyle = band.color; ctx.fill();
    });
    for (let i = 0; i < 120; i++) {
        const x = Math.random()*1024, y = Math.random()*512;
        const rx = Math.random()*25+8, ry = Math.random()*6+3;
        const alpha = Math.random()*0.2+0.04, bright = Math.random()>0.5;
        const v = ctx.createRadialGradient(x, y, 0, x, y, rx);
        if (bright) { v.addColorStop(0, `rgba(235,220,180,${alpha})`); v.addColorStop(1, 'rgba(200,185,150,0)'); }
        else { v.addColorStop(0, `rgba(90,75,50,${alpha})`); v.addColorStop(1, 'rgba(110,95,60,0)'); }
        ctx.fillStyle = v;
        ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI*2); ctx.fill();
    }
    const hexX = 512, hexY = 30;
    ctx.strokeStyle = 'rgba(120,100,60,0.3)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
        const angle = (i/6)*Math.PI*2;
        const hx = hexX+Math.cos(angle)*40, hy = hexY+Math.sin(angle)*15;
        if (i===0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
    }
    ctx.stroke();
    for (let i = 0; i < 10000; i++) {
        const x = Math.random()*1024, y = Math.random()*512, size = Math.random()*1.3+0.3;
        const brightness = Math.random()*0.14+0.03, hue = 35+Math.random()*15;
        const sat = 15+Math.random()*25, light = 45+Math.random()*35;
        ctx.fillStyle = `hsla(${hue},${sat}%,${light}%,${brightness})`;
        ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI*2); ctx.fill();
    }
    return new THREE.CanvasTexture(canvas);
}

function createRingTexture(color, opacity) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 4;
    const ctx = canvas.getContext('2d');
    const baseColor = new THREE.Color(color);
    const grad = ctx.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0, `rgba(${baseColor.r*255*0.2},${baseColor.g*255*0.15},${baseColor.b*255*0.1},0)`);
    grad.addColorStop(0.05, `rgba(${baseColor.r*255},${baseColor.g*255*0.9},${baseColor.b*255*0.7},${opacity})`);
    for (let s = 0; s < 25; s++) {
        const p = 0.08+(s/25)*0.84;
        const alpha = opacity*(0.35+Math.random()*0.65);
        const w = 0.005+Math.random()*0.018, b = 0.5+Math.random()*0.7;
        grad.addColorStop(Math.max(0,p-w/2), `rgba(${baseColor.r*255*b},${baseColor.g*255*b*0.9},${baseColor.b*255*b*0.7},${alpha})`);
        grad.addColorStop(p, `rgba(${baseColor.r*255*b*0.6},${baseColor.g*255*b*0.5},${baseColor.b*255*b*0.4},${alpha*0.5})`);
        grad.addColorStop(Math.min(1,p+w/2), `rgba(${baseColor.r*255*b},${baseColor.g*255*b*0.9},${baseColor.b*255*b*0.7},${alpha})`);
    }
    grad.addColorStop(0.95, `rgba(${baseColor.r*255*0.6},${baseColor.g*255*0.5},${baseColor.b*255*0.35},${opacity*0.3})`);
    grad.addColorStop(1, `rgba(${baseColor.r*255*0.1},${baseColor.g*255*0.08},${baseColor.b*255*0.05},0)`);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 256, 4);
    return new THREE.CanvasTexture(canvas);
}

function createRingSystem() {
    const disks = [];
    CONFIG.rings.forEach((ring) => {
        const ringGeo = new THREE.RingGeometry(ring.innerR, ring.outerR, 128, 8);
        const pos = ringGeo.attributes.position, uvs = ringGeo.attributes.uv;
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i), y = pos.getY(i);
            const r = Math.sqrt(x*x+y*y);
            const normR = (r-ring.innerR)/(ring.outerR-ring.innerR);
            uvs.setXY(i, normR, 0.5);
        }
        const ringMat = new THREE.MeshBasicMaterial({
            map: createRingTexture(ring.color, ring.opacity), transparent: true,
            opacity: ring.opacity*0.6, side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending, depthWrite: false
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.rotation.x = -Math.PI/2;
        ringMesh.rotation.z = AXIAL_TILT;
        disks.push({ mesh: ringMesh, speed: 0.0002*(CONFIG.rings[0].innerR/ring.innerR) });
    });
    return disks;
}

function createRingParticles() {
    const count = CONFIG.ringParticleCount;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count*3), colors = new Float32Array(count*3);
    const ringData = { baseAngles: new Float32Array(count), radii: new Float32Array(count),
        baseYs: new Float32Array(count), orbitSpeeds: new Float32Array(count) };
    const totalSpan = CONFIG.rings.reduce((s, r) => s+(r.outerR-r.innerR), 0);
    let pi = 0;
    CONFIG.rings.forEach((ring, ringIdx) => {
        const ringCount = Math.floor(count*(ring.outerR-ring.innerR)/totalSpan);
        const ringColor = new THREE.Color(ring.color);
        for (let i = 0; i < ringCount && pi < count; i++) {
            const t = Math.random();
            const r = ring.innerR+(ring.outerR-ring.innerR)*t;
            const angle = Math.random()*Math.PI*2;
            const thickness = 0.3+(ringIdx/CONFIG.rings.length)*3;
            const baseY = (Math.random()-0.5)*thickness;
            positions[pi*3] = r*Math.cos(angle);
            positions[pi*3+1] = baseY;
            positions[pi*3+2] = r*Math.sin(angle);
            const normR = (r-ring.innerR)/(ring.outerR-ring.innerR);
            const brightness = ring.opacity*(0.6+0.5*(1-normR));
            const doppler = 1.0+0.3*Math.cos(angle);
            colors[pi*3] = Math.min(1, ringColor.r*brightness*doppler);
            colors[pi*3+1] = Math.min(1, ringColor.g*brightness*doppler);
            colors[pi*3+2] = Math.min(1, ringColor.b*brightness*doppler);
            ringData.baseAngles[pi] = angle;
            ringData.radii[pi] = r;
            ringData.baseYs[pi] = baseY;
            ringData.orbitSpeeds[pi] = 0.04*Math.sqrt(ring.innerR/r)*0.5;
            pi++;
        }
    });
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return { points: new THREE.Points(geo, new THREE.PointsMaterial({
        size: 1.5, map: particleTexture, vertexColors: true, transparent: true,
        opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    })), data: ringData };
}

function createOrbitParticles() {
    const count = CONFIG.orbitParticleCount;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count*3), colors = new Float32Array(count*3);
    const orbitData = { semiMajors: new Float32Array(count), semiMinors: new Float32Array(count),
        inclinations: new Float32Array(count), longitudes: new Float32Array(count),
        baseAngles: new Float32Array(count), speeds: new Float32Array(count) };
    for (let i = 0; i < count; i++) {
        const a = 100+Math.random()*100, ecc = 0.05+Math.random()*0.25, b = a*(1-ecc);
        const inc = (Math.random()-0.5)*0.4, lon = Math.random()*Math.PI*2, angle = Math.random()*Math.PI*2;
        orbitData.semiMajors[i]=a; orbitData.semiMinors[i]=b; orbitData.inclinations[i]=inc;
        orbitData.longitudes[i]=lon; orbitData.baseAngles[i]=angle;
        orbitData.speeds[i]=0.08*Math.sqrt(100/a)*0.3;
        const cosA=Math.cos(angle), sinA=Math.sin(angle);
        let x=a*cosA, z=b*sinA, y=0;
        const cosI=Math.cos(inc), sinI=Math.sin(inc);
        const ny=y*cosI-z*sinI, nz=y*sinI+z*cosI; y=ny; z=nz;
        const cosL=Math.cos(lon), sinL=Math.sin(lon);
        const nx=x*cosL-z*sinL, nz2=x*sinL+z*cosL; x=nx; z=nz2;
        positions[i*3]=x; positions[i*3+1]=y; positions[i*3+2]=z;
        const t=Math.random();
        colors[i*3]=0.6+t*0.25; colors[i*3+1]=0.52+t*0.22; colors[i*3+2]=0.32+t*0.15;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return { points: new THREE.Points(geo, new THREE.PointsMaterial({
        size: 1.8, map: particleTexture, vertexColors: true, transparent: true,
        opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    })), data: orbitData };
}

export function createSaturn() {
    const group = new THREE.Group();
    group.name = 'saturn';

    const planet = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.planetRadius, 64, 64),
        new THREE.MeshBasicMaterial({ map: createPlanetTexture(), color: 0xffffff })
    );
    planet.rotation.z = AXIAL_TILT;
    group.add(planet);

    const atmosphereInner = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.atmosphereInner, 48, 48),
        new THREE.MeshBasicMaterial({ color: 0xddccaa, transparent: true, opacity: 0.12,
            side: THREE.BackSide, blending: THREE.AdditiveBlending })
    );
    atmosphereInner.rotation.z = AXIAL_TILT;
    group.add(atmosphereInner);

    const atmosphereOuter = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.atmosphereOuter, 48, 48),
        new THREE.MeshBasicMaterial({ color: 0xccbb99, transparent: true, opacity: 0.07,
            side: THREE.BackSide, blending: THREE.AdditiveBlending })
    );
    atmosphereOuter.rotation.z = AXIAL_TILT;
    group.add(atmosphereOuter);

    const ringDisks = createRingSystem();
    ringDisks.forEach(r => group.add(r.mesh));

    const ringParticles = createRingParticles();
    ringParticles.points.rotation.x = -Math.PI/2;
    ringParticles.points.rotation.z = AXIAL_TILT;
    group.add(ringParticles.points);

    const orbit = createOrbitParticles();
    group.add(orbit.points);

    const clickTarget = new THREE.Mesh(
        new THREE.SphereGeometry(170, 16, 16),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    clickTarget.name = 'saturn-click';
    group.add(clickTarget);

    group.userData.tick = (time) => {
        planet.rotation.y += 0.005;
        const pulse = 1 + Math.sin(time*1.5)*0.008;
        atmosphereInner.scale.set(pulse, pulse, pulse);

        ringDisks.forEach(ring => { ring.mesh.rotation.z += ring.speed; });

        if (ringParticles.data) {
            const arr = ringParticles.points.geometry.attributes.position.array;
            const n = ringParticles.data.baseAngles.length;
            for (let i = 0; i < n; i++) {
                const idx = i*3;
                const ang = ringParticles.data.baseAngles[i] + time*ringParticles.data.orbitSpeeds[i];
                const r = ringParticles.data.radii[i];
                const y = ringParticles.data.baseYs[i];
                arr[idx] = Math.cos(ang)*r;
                arr[idx+1] = y;
                arr[idx+2] = Math.sin(ang)*r;
            }
            ringParticles.points.geometry.attributes.position.needsUpdate = true;
        }

        if (orbit.data) {
            const arr = orbit.points.geometry.attributes.position.array;
            const n = orbit.data.semiMajors.length;
            for (let i = 0; i < n; i++) {
                const ang = orbit.data.baseAngles[i]+time*orbit.data.speeds[i];
                const a = orbit.data.semiMajors[i], b = orbit.data.semiMinors[i];
                const inc = orbit.data.inclinations[i], lon = orbit.data.longitudes[i];
                const cosA=Math.cos(ang), sinA=Math.sin(ang);
                let x=a*cosA, z=b*sinA, y=0;
                const cosI=Math.cos(inc), sinI=Math.sin(inc);
                const ny=y*cosI-z*sinI, nz=y*sinI+z*cosI; y=ny; z=nz;
                const cosL=Math.cos(lon), sinL=Math.sin(lon);
                const nx=x*cosL-z*sinL, nz2=x*sinL+z*cosL; x=nx; z=nz2;
                arr[i*3]=x; arr[i*3+1]=y; arr[i*3+2]=z;
            }
            orbit.points.geometry.attributes.position.needsUpdate = true;
        }
    };

    group.userData.clickTarget = clickTarget;
    return group;
}

export const saturnSpec = {
    name: 'saturn',
    type: PlanetType.PLANET,
    factory: createSaturn,
    orbit: { radius: 1650, speed: 0.0004 },
    appearance: { palette: [0xddcc88, 0xccbb77, 0xaa9966], supportsColorCustomization: false },
    info: {
        title: '土星', subtitle: 'SATURN · 环系气态巨行星',
        rows: [
            { label: '类型', value: '气态巨行星' },
            { label: '半径', value: '约 58,232 km（9.4倍地球）' },
            { label: '自转周期', value: '约 10.7 小时' },
            { label: '环系', value: 'A/B/C/D/F 环' },
            { label: '卫星', value: '146 颗已知卫星' }
        ],
        description: '土星是太阳系第二大行星，以其壮观的环系闻名。环主要由冰粒和岩石碎片组成，从 D 环到 F 环跨越数十万公里。土星的密度极低，如果有足够大的海洋，它甚至能浮在水面上。其北极的六边形风暴是太阳系中最奇特的大气现象之一。'
    }
};

assertValidSpec(saturnSpec);
