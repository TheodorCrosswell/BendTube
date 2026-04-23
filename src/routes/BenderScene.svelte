<!-- src/routes/BenderScene.svelte -->
<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import { OrbitControls, Grid, interactivity } from '@threlte/extras';
  import * as THREE from 'three';

  interface Props {
    bendAngle?: number;
    isOrthographic?: boolean;
    outerDiameter?: number;
    stats?: {
      beforeBend: number;
      inBend: number;
      afterBend: number;
      total: number;
      width: number;
      height: number;
      depth: number;
    };
  }

  let { 
    bendAngle = $bindable(0), 
    isOrthographic = false,
    outerDiameter = 0.706,
    stats = $bindable({ beforeBend: 0, inBend: 0, afterBend: 0, total: 0, width: 0, height: 0, depth: 0 }) 
  }: Props = $props();

  interactivity();

  let tubeGeom = $state<THREE.TubeGeometry | undefined>(undefined);

  // --- Dynamic Parametric Scale calculations ---
  // A standard 120" stick of conduit broken out roughly in front/behind the bend 
  // ensuring the segment consumed by the curve never pulls the left tail past x=0.
  const L1_initial = 75; 
  const L2 = 45; 

  let pipeRadius = $derived(outerDiameter / 2);
  
  // Scale the bend radius proportionately to the pipe's radius
  let bendRadius = $derived(pipeRadius * 10);
  let toolScaleFactor = $derived(bendRadius / 4); // Based on original geometry scaled for r=0.4

  let angleRad = $derived(bendAngle * (Math.PI / 180));
  let benderX = $derived(-bendRadius * angleRad);

  // --- Dragging Logic ---
  let isDragging = $state(false);
  let startX = $state(0);
  let startY = $state(0);
  let startAngle = $state(0);

  const onPointerDown = (e: any) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startAngle = bendAngle;
    document.body.style.cursor = 'grabbing';
    e.stopPropagation();
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!isDragging) return;
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    const movement = deltaX + deltaY; 
    let newAngle = startAngle + movement * 0.4;
    bendAngle = Math.max(0, Math.min(newAngle, 110)); 
  };

  const onPointerUp = () => {
    if (isDragging) {
      isDragging = false;
      document.body.style.cursor = 'default';
    }
  };

  // --- Performance Calculation Polling ---
  let timeElapsed = 0;
  
  useTask((delta) => {
    timeElapsed += delta;
    if (timeElapsed >= 0.2) {
      timeElapsed %= 0.2;
      calculateStatsFromScene();
    }
  });

  function calculateStatsFromScene() {
    if (!tubeGeom) return;

    tubeGeom.computeBoundingBox();
    const box = tubeGeom.boundingBox;
    const size = new THREE.Vector3();
    if (box) box.getSize(size);

    const path = tubeGeom.parameters.path;
    const points = path.getPoints(1000); 

    let lenBefore = 0;
    let lenBend = 0;
    let lenAfter = 0;
    let state = 'BEFORE'; 

    for (let i = 0; i < points.length - 1; i++) {
      const pA = points[i];
      const pB = points[i + 1];
      const dist = pA.distanceTo(pB);

      if (i > 0 && i < points.length - 1) {
        const pPrev = points[i - 1];
        const vPrev = new THREE.Vector3().subVectors(pA, pPrev).normalize();
        const vNext = new THREE.Vector3().subVectors(pB, pA).normalize();
        
        const angle = vPrev.angleTo(vNext);
        const isStraight = angle < 0.001; 

        if (state === 'BEFORE' && !isStraight) {
          state = 'BEND';
        } else if (state === 'BEND' && isStraight) {
          state = 'AFTER';
        }
      }

      if (state === 'BEFORE') lenBefore += dist;
      else if (state === 'BEND') lenBend += dist;
      else if (state === 'AFTER') lenAfter += dist;
    }

    stats = {
      beforeBend: lenBefore,
      inBend: lenBend,
      afterBend: lenAfter,
      total: lenBefore + lenBend + lenAfter,
      width: size.x,
      height: size.y,
      depth: size.z
    };
  }

  // --- Dynamic Math: Conduit Path Curve ---
  class ConduitCurve extends THREE.Curve<THREE.Vector3> {
    angleDeg: number;
    R: number;
    L1_initial: number;
    L2: number;

    constructor(angleDeg: number, R: number, L1: number, L2: number) {
      super();
      this.angleDeg = angleDeg;
      this.R = R;
      this.L1_initial = L1;
      this.L2 = L2;
    }

    getPoint(t: number, optionalTarget = new THREE.Vector3()) {
      const angleRad = this.angleDeg * (Math.PI / 180);
      
      const arcLen = this.R * angleRad;
      const L1 = this.L1_initial - arcLen; 
      const totalLen = this.L1_initial + this.L2; 
      const d = t * totalLen;

      if (d <= L1) {
        return optionalTarget.set(-this.L1_initial + d, 0, 0);
      } else if (d <= L1 + arcLen) {
        const theta = (d - L1) / this.R;
        return optionalTarget.set(
          -arcLen + this.R * Math.cos(-Math.PI / 2 + theta),
          this.R + this.R * Math.sin(-Math.PI / 2 + theta),
          0
        );
      } else {
        const straightD = d - (L1 + arcLen);
        const endAngle = -Math.PI / 2 + angleRad;
        const px = -arcLen + this.R * Math.cos(endAngle);
        const py = this.R + this.R * Math.sin(endAngle);
        return optionalTarget.set(
          px + straightD * Math.cos(angleRad),
          py + straightD * Math.sin(angleRad),
          0
        );
      }
    }
  }

  let curve = $derived(new ConduitCurve(bendAngle, bendRadius, L1_initial, L2));
</script>

<svelte:window onpointermove={onPointerMove} onpointerup={onPointerUp} />

<!-- Lighting -->
<T.AmbientLight intensity={0.8} />
<T.DirectionalLight position={[20, 30, 20]} intensity={1.5} castShadow />

<!-- Camera & Navigation Toggle, pulled back to accommodate the 120" pipe scale -->
{#if isOrthographic}
  <T.OrthographicCamera makeDefault position={[0, 10, 100]} zoom={10}>
    <OrbitControls enableDamping target={[0, 5, 0]} enabled={!isDragging} />
  </T.OrthographicCamera>
{:else}
  <T.PerspectiveCamera makeDefault position={[0, 10, 100]} fov={45}>
    <OrbitControls enableDamping target={[0, 5, 0]} enabled={!isDragging} />
  </T.PerspectiveCamera>
{/if}

<!-- 3D Coordinate Grids - Expanded bounds for longer pipe -->
<Grid sectionSize={20} cellSize={4} position={[0, 0, 0]} sectionColor="#888888" cellColor="#444444" fadeDistance={250} />
<Grid sectionSize={20} cellSize={4} position={[0, 0, 0]} rotation.x={Math.PI / 2} sectionColor="#888888" cellColor="#444444" fadeDistance={250} />
<Grid sectionSize={20} cellSize={4} position={[0, 0, 0]} rotation.z={Math.PI / 2} sectionColor="#888888" cellColor="#444444" fadeDistance={250} />

<!-- Real-time parameter driven Conduit Model -->
<T.Mesh castShadow receiveShadow>
  <T.TubeGeometry bind:ref={tubeGeom} args={[curve, 100, pipeRadius, 16, false]} />
  <T.MeshStandardMaterial color="#dddddd" metalness={0.9} roughness={0.3} />
</T.Mesh>

<!-- Bender Tool Pivot Group - Proportioned relative to the selected outer diameter -->
<T.Group position={[benderX, bendRadius, 0]} rotation.z={-angleRad} rotation.y={Math.PI} scale={toolScaleFactor}>
  <!-- Bender Shoe -->
  <T.Mesh rotation.z={-Math.PI / 2} castShadow>
    <T.TorusGeometry args={[4, 0.45, 16, 64, Math.PI / 2 + 0.1]} />
    <T.MeshStandardMaterial color="#1e90ff" metalness={0.3} roughness={0.6} />
  </T.Mesh>

  <!-- Handle / Pivot Interaction area -->
  <T.Group 
    rotation.z={Math.PI / 6}
    onpointerdown={onPointerDown} 
    onpointerenter={() => document.body.style.cursor = 'grab'} 
    onpointerleave={() => { if (!isDragging) document.body.style.cursor = 'default'; }}
  >
    <T.Mesh position={[0, 4, 0]} castShadow>
      <T.CylinderGeometry args={[0.15, 0.15, 16, 16]} />
      <T.MeshStandardMaterial color="#333333" metalness={0.7} roughness={0.2} />
    </T.Mesh>

    <T.Mesh position={[0, 11, 0]}>
      <T.CylinderGeometry args={[0.20, 0.20, 2, 16]} />
      <T.MeshStandardMaterial color="#cc0000" />
    </T.Mesh>
  </T.Group>
</T.Group>