// src/planets/planet_crab.js
// 蟹状星云 Crab Nebula —— 超新星遗迹 + 脉冲星
// 适配自 124-main/蟹状星云.html，遵循 PlanetSpec 契约
import * as THREE from 'three';
import { particleTexture } from '../particleTexture.js?v=20260902v3';
import { PlanetType, assertValidSpec } from '../PlanetSpec.js?v=20260902v3';

const CONFIG = {
    pulsarRadius: 3,
    pulsarGlow1: 8,
    pulsarGlow2: 18,
    pulsarGlow3: 35,
    nebulaRadius: 90,
    nebulaElongation: 1.25,
    jetLength: 80,
    jetRadius: 6,
    synchrotronCount: 30000,
    filamentCount: 50,
    filamentParticles: 300,
    haloCount: 6000,
    tiltX: 0.2,
    tiltZ: 0.08,
};

function noise3D(x, y, z) {
    return Math.sin(x*0.03)*Math.cos(y*0.04)*Math.sin(z*0.035)
         + Math.sin(x*0.08+1)*Math.cos(y*0.07+2)*Math.sin(z*0.06+3)*0.5
         + Math.sin(x*0.15+4)*Math.cos(y*0.13+5)*Math.sin(z*0.11+6)*0.25;
}

function createSynchrotron() {
    const count = CONFIG.synchrotronCount;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count*3), colors = new Float32Array(count*3);
    const data = { basePos: new Float32Array(count*3), phases: new Float32Array(count), speeds: new Float32Array(count) };
    for (let i = 0; i < count; i++) {
        const r = CONFIG.nebulaRadius*Math.pow(Math.random(), 0.4);
        const theta = Math.random()*Math.PI*2, phi = Math.acos(2*Math.random()-1);
        const x = r*Math.sin(phi)*Math.cos(theta)*CONFIG.nebulaElongation;
        const y = r*Math.cos(phi);
        const z = r*Math.sin(phi)*Math.sin(theta);
        const n = noise3D(x, y, z)*12;
        const fx = x+n*0.3, fy = y+n*0.2, fz = z+n*0.3;
        positions[i*3]=fx; positions[i*3+1]=fy; positions[i*3+2]=fz;
        data.basePos[i*3]=fx; data.basePos[i*3+1]=fy; data.basePos[i*3+2]=fz;
        data.phases[i]=Math.random()*Math.PI*2;
        data.speeds[i]=0.08+Math.random()*0.25;
        const distFactor = r/CONFIG.nebulaRadius;
        let rc, gc, bc;
        if (distFactor<0.3){rc=0.7+Math.random()*0.3;gc=0.8+Math.random()*0.2;bc=0.9+Math.random()*0.1;}
        else if (distFactor<0.6){rc=0.3+Math.random()*0.2;gc=0.5+Math.random()*0.2;bc=0.8+Math.random()*0.2;}
        else {rc=0.15+Math.random()*0.1;gc=0.25+Math.random()*0.15;bc=0.5+Math.random()*0.2;}
        const brightness = (1.0-distFactor*0.5)*(0.4+Math.random()*0.6);
        colors[i*3]=rc*brightness; colors[i*3+1]=gc*brightness; colors[i*3+2]=bc*brightness;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return { points: new THREE.Points(geo, new THREE.PointsMaterial({
        size: 2.5, map: particleTexture, vertexColors: true, transparent: true,
        opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    })), data };
}

function createFilaments() {
    const total = CONFIG.filamentCount * CONFIG.filamentParticles;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(total*3), colors = new Float32Array(total*3);
    const data = { centers: [], dirs: [], bends: [], lens: [], phases: [], speeds: [] };
    let idx = 0;
    for (let f = 0; f < CONFIG.filamentCount; f++) {
        const startTheta = Math.random()*Math.PI*2, startPhi = Math.acos(2*Math.random()-1);
        const startR = CONFIG.nebulaRadius*(0.3+Math.random()*0.5);
        const cx = startR*Math.sin(startPhi)*Math.cos(startTheta)*CONFIG.nebulaElongation;
        const cy = startR*Math.cos(startPhi);
        const cz = startR*Math.sin(startPhi)*Math.sin(startTheta);
        const dirX = cx/(startR+0.001)+(Math.random()-0.5)*0.3;
        const dirY = cy/(startR+0.001)+(Math.random()-0.5)*0.3;
        const dirZ = cz/(startR+0.001)+(Math.random()-0.5)*0.3;
        const dl = Math.sqrt(dirX*dirX+dirY*dirY+dirZ*dirZ);
        const nx=dirX/dl, ny=dirY/dl, nz=dirZ/dl;
        const bendX=(Math.random()-0.5)*0.4, bendY=(Math.random()-0.5)*0.4, bendZ=(Math.random()-0.5)*0.4;
        const filLen = 20+Math.random()*40;
        const colorType = Math.random();
        let rc, gc, bc;
        if (colorType<0.5){rc=0.9;gc=0.2;bc=0.15;}
        else if (colorType<0.8){rc=0.85;gc=0.4;bc=0.15;}
        else {rc=0.2;gc=0.75;bc=0.4;}
        data.centers.push([cx,cy,cz]); data.dirs.push([nx,ny,nz]);
        data.bends.push([bendX,bendY,bendZ]); data.lens.push(filLen);
        data.phases.push(Math.random()*Math.PI*2); data.speeds.push(0.05+Math.random()*0.15);
        for (let p = 0; p < CONFIG.filamentParticles; p++) {
            const t = p/CONFIG.filamentParticles;
            const dist = t*filLen;
            const bend = Math.sin(t*2)*10;
            const spread = 2+t*3;
            positions[idx*3]=cx+nx*dist+bendX*bend+(Math.random()-0.5)*spread;
            positions[idx*3+1]=cy+ny*dist+bendY*bend+(Math.random()-0.5)*spread;
            positions[idx*3+2]=cz+nz*dist+bendZ*bend+(Math.random()-0.5)*spread;
            const intensity = Math.sin(t*Math.PI)*(0.5+Math.random()*0.5);
            colors[idx*3]=rc*intensity; colors[idx*3+1]=gc*intensity; colors[idx*3+2]=bc*intensity;
            idx++;
        }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return { points: new THREE.Points(geo, new THREE.PointsMaterial({
        size: 2.5, map: particleTexture, vertexColors: true, transparent: true,
        opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    })), data };
}

function createJets() {
    const count = 4000, per = count/2;
    const geo1 = new THREE.BufferGeometry(), geo2 = new THREE.BufferGeometry();
    const pos1 = new Float32Array(per*3), col1 = new Float32Array(per*3);
    const pos2 = new Float32Array(per*3), col2 = new Float32Array(per*3);
    const d1 = { basePos: new Float32Array(per*3), phases: new Float32Array(per) };
    const d2 = { basePos: new Float32Array(per*3), phases: new Float32Array(per) };
    for (let i = 0; i < per; i++) {
        for (let jet = 0; jet < 2; jet++) {
            const lobe = jet===0?1:-1;
            const t = Math.pow(Math.random(), 0.5);
            const dist = t*CONFIG.jetLength;
            const angle = Math.random()*Math.PI*2;
            const radius = CONFIG.jetRadius*(0.3+t*0.7);
            const x = Math.cos(angle)*radius, y = lobe*dist, z = Math.sin(angle)*radius;
            const intensity = (1-t*0.6)*(0.4+Math.random()*0.5);
            const rc=0.6*intensity, gc=0.75*intensity, bc=0.95*intensity;
            if (jet===0){pos1[i*3]=x;pos1[i*3+1]=y;pos1[i*3+2]=z;d1.basePos[i*3]=x;d1.basePos[i*3+1]=y;d1.basePos[i*3+2]=z;d1.phases[i]=Math.random()*Math.PI*2;col1[i*3]=rc;col1[i*3+1]=gc;col1[i*3+2]=bc;}
            else {pos2[i*3]=x;pos2[i*3+1]=y;pos2[i*3+2]=z;d2.basePos[i*3]=x;d2.basePos[i*3+1]=y;d2.basePos[i*3+2]=z;d2.phases[i]=Math.random()*Math.PI*2;col2[i*3]=rc;col2[i*3+1]=gc;col2[i*3+2]=bc;}
        }
    }
    geo1.setAttribute('position', new THREE.BufferAttribute(pos1, 3)); geo1.setAttribute('color', new THREE.BufferAttribute(col1, 3));
    geo2.setAttribute('position', new THREE.BufferAttribute(pos2, 3)); geo2.setAttribute('color', new THREE.BufferAttribute(col2, 3));
    const mat = new THREE.PointsMaterial({ size: 2.5, map: particleTexture, vertexColors: true, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
    return { jet1: new THREE.Points(geo1, mat), jet2: new THREE.Points(geo2, mat.clone()), data1: d1, data2: d2 };
}

function createHalo() {
    const count = CONFIG.haloCount;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count*3), colors = new Float32Array(count*3);
    const data = { basePos: new Float32Array(count*3), phases: new Float32Array(count) };
    for (let i = 0; i < count; i++) {
        const r = CONFIG.nebulaRadius+Math.random()*60;
        const theta = Math.random()*Math.PI*2, phi = Math.acos(2*Math.random()-1);
        const x = r*Math.sin(phi)*Math.cos(theta)*CONFIG.nebulaElongation;
        const y = r*Math.cos(phi);
        const z = r*Math.sin(phi)*Math.sin(theta);
        positions[i*3]=x; positions[i*3+1]=y; positions[i*3+2]=z;
        data.basePos[i*3]=x; data.basePos[i*3+1]=y; data.basePos[i*3+2]=z;
        data.phases[i]=Math.random()*Math.PI*2;
        const brightness = 0.08+Math.random()*0.12, t = Math.random();
        if (t<0.5){colors[i*3]=brightness*0.8;colors[i*3+1]=brightness*0.3;colors[i*3+2]=brightness*0.15;}
        else {colors[i*3]=brightness*0.3;colors[i*3+1]=brightness*0.4;colors[i*3+2]=brightness*0.7;}
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return { points: new THREE.Points(geo, new THREE.PointsMaterial({
        size: 2.0, map: particleTexture, vertexColors: true, transparent: true,
        opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    })), data };
}

export function createCrabNebula() {
    const group = new THREE.Group();
    group.name = 'crab';
    group.rotation.x = CONFIG.tiltX;
    group.rotation.z = CONFIG.tiltZ;

    const pulsar = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.pulsarRadius, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xddeeff })
    );
    group.add(pulsar);

    const glow1 = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.pulsarGlow1, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0x88bbff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, side: THREE.BackSide })
    );
    group.add(glow1);
    const glow2 = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.pulsarGlow2, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0x4488cc, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, side: THREE.BackSide })
    );
    group.add(glow2);
    const glow3 = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.pulsarGlow3, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0x336699, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, side: THREE.BackSide })
    );
    group.add(glow3);

    const synch = createSynchrotron();
    group.add(synch.points);
    const filaments = createFilaments();
    group.add(filaments.points);
    const jets = createJets();
    group.add(jets.jet1); group.add(jets.jet2);
    const halo = createHalo();
    group.add(halo.points);

    const clickTarget = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.nebulaRadius*1.3, 16, 16),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    clickTarget.name = 'crab-click';
    group.add(clickTarget);

    group.userData.tick = (time) => {
        const p1 = 1+Math.sin(time*8)*0.12;
        glow1.scale.set(p1,p1,p1); glow1.material.opacity = 0.4+Math.sin(time*8)*0.15;
        const p2 = 1+Math.sin(time*6+0.5)*0.08;
        glow2.scale.set(p2,p2,p2);
        const p3 = 1+Math.sin(time*4+1)*0.06;
        glow3.scale.set(p3,p3,p3);

        if (synch.data) {
            const arr = synch.points.geometry.attributes.position.array;
            const n = synch.data.basePos.length/3;
            for (let i = 0; i < n; i++) {
                const bx=synch.data.basePos[i*3], by=synch.data.basePos[i*3+1], bz=synch.data.basePos[i*3+2];
                const ph=synch.data.phases[i], sp=synch.data.speeds[i];
                arr[i*3]=bx+Math.sin(time*sp+ph)*3;
                arr[i*3+1]=by+Math.cos(time*sp*0.7+ph)*2;
                arr[i*3+2]=bz+Math.sin(time*sp*0.5+ph)*2.5;
            }
            synch.points.geometry.attributes.position.needsUpdate = true;
        }

        if (filaments.data) {
            const arr = filaments.points.geometry.attributes.position.array;
            const fCount = CONFIG.filamentCount, pPer = CONFIG.filamentParticles;
            for (let f = 0; f < fCount; f++) {
                const [cx,cy,cz] = filaments.data.centers[f];
                const [nx,ny,nz] = filaments.data.dirs[f];
                const [bx,by,bz] = filaments.data.bends[f];
                const fl = filaments.data.lens[f];
                const ph = filaments.data.phases[f], sp = filaments.data.speeds[f];
                const expand = 1+Math.sin(time*sp+ph)*0.02;
                for (let p = 0; p < pPer; p++) {
                    const t = p/pPer;
                    const dist = t*fl*expand;
                    const bend = Math.sin(t*2)*10*expand;
                    const spread = 2+t*3;
                    const idx = (f*pPer+p)*3;
                    arr[idx]=cx+nx*dist+bx*bend+(Math.random()-0.5)*spread;
                    arr[idx+1]=cy+ny*dist+by*bend+(Math.random()-0.5)*spread;
                    arr[idx+2]=cz+nz*dist+bz*bend+(Math.random()-0.5)*spread;
                }
            }
            filaments.points.geometry.attributes.position.needsUpdate = true;
        }

        if (jets.data1) {
            const arr = jets.jet1.geometry.attributes.position.array;
            const n = jets.data1.basePos.length/3;
            for (let i = 0; i < n; i++) {
                const bx=jets.data1.basePos[i*3], by=jets.data1.basePos[i*3+1], bz=jets.data1.basePos[i*3+2], ph=jets.data1.phases[i];
                arr[i*3]=bx+Math.sin(time*0.3+ph)*1;
                arr[i*3+1]=by+Math.sin(time*0.4+ph)*1.5;
                arr[i*3+2]=bz+Math.cos(time*0.3+ph)*1;
            }
            jets.jet1.geometry.attributes.position.needsUpdate = true;
        }
        if (jets.data2) {
            const arr = jets.jet2.geometry.attributes.position.array;
            const n = jets.data2.basePos.length/3;
            for (let i = 0; i < n; i++) {
                const bx=jets.data2.basePos[i*3], by=jets.data2.basePos[i*3+1], bz=jets.data2.basePos[i*3+2], ph=jets.data2.phases[i];
                arr[i*3]=bx+Math.sin(time*0.3+ph)*1;
                arr[i*3+1]=by+Math.sin(time*0.4+ph)*1.5;
                arr[i*3+2]=bz+Math.cos(time*0.3+ph)*1;
            }
            jets.jet2.geometry.attributes.position.needsUpdate = true;
        }

        if (halo.data) {
            const arr = halo.points.geometry.attributes.position.array;
            const n = halo.data.basePos.length/3;
            for (let i = 0; i < n; i++) {
                const bx=halo.data.basePos[i*3], by=halo.data.basePos[i*3+1], bz=halo.data.basePos[i*3+2], ph=halo.data.phases[i];
                arr[i*3]=bx+Math.sin(time*0.1+ph)*2;
                arr[i*3+1]=by+Math.cos(time*0.08+ph)*1.5;
                arr[i*3+2]=bz+Math.sin(time*0.12+ph)*2;
            }
            halo.points.geometry.attributes.position.needsUpdate = true;
        }

        group.rotation.y += 0.0004;
    };

    group.userData.clickTarget = clickTarget;
    return group;
}

export const crabSpec = {
    name: 'crab',
    type: PlanetType.PLANET,
    factory: createCrabNebula,
    orbit: { radius: 1000, speed: 0.0015, phase: Math.PI / 3 },  // 环2·60°
    appearance: { palette: [0x88bbff, 0xff4433, 0x44cc66], supportsColorCustomization: false },
    info: {
        title: '蟹状星云', subtitle: 'Crab Nebula (M1) · 超新星遗迹',
        rows: [
            { label: '类型', value: '超新星遗迹 (SNR)' },
            { label: '距离', value: '~6,500 光年（金牛座）' },
            { label: '爆发', value: '公元 1054 年 (SN 1054)' },
            { label: '直径', value: '~11 光年' },
            { label: '特征', value: '脉冲星 / 同步辐射 / 丝状抛射物 / 膨胀' }
        ],
        description: '蟹状星云是公元 1054 年一颗超新星爆发的遗迹，中国古代天文学家记载了这次"客星"。其中心有一颗每秒旋转 30 次的脉冲星，发出强烈的同步辐射。星云仍在以每秒约 1500 公里的速度膨胀，蓝白色的同步辐射与红绿色的丝状抛射物交织，是宇宙中最壮观的天体之一。'
    }
};

assertValidSpec(crabSpec);
