<!-- src/routes/BenderScene.svelte -->
<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import { OrbitControls, Grid, interactivity } from '@threlte/extras';
  import * as THREE from 'three';

  interface Props {
    bendAngle?: number;
    bendPosition?: number;
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
    bendPosition = $bindable(60),
    isOrthographic = false,
    outerDiameter = 0.706,
    stats = $bindable({ beforeBend: 0, inBend: 0, afterBend: 0, total: 0, width: 0, height: 0, depth: 0 }) 
  }: Props = $props();

  interactivity();

  let tubeGeom = $state<THREE.TubeGeometry | undefined>(undefined);

  let pipeRadius = $derived(outerDiameter / 2);
  
  // Scale the bend radius proportionately to the pipe's radius
  let bendRadius = $derived(pipeRadius * 10);
  let toolScaleFactor = $derived(bendRadius / 4);

  let angleRad = $derived(bendAngle * (Math.PI / 180));
  
  // Bender now translates along the pipe with bendPosition, and naturally subtracts
  // bendRadius * angleRad to roll back into the curve without overriding the physical mechanic
  let benderX = $derived(bendPosition - (bendRadius * angleRad));

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
    bendPos: number;
    totalLen: number;

    constructor(angleDeg: number, R: number, bendPos: number) {
      super();
      this.angleDeg = angleDeg;
      this.R = R;
      this.bendPos = bendPos;
      this.totalLen = 120; // Exact length 120", starts at 0, 0
    }

    getPoint(t: number, optionalTarget = new THREE.Vector3()) {
      const angleRad = this.angleDeg * (Math.PI / 180);
      const arcLen = this.R * angleRad;
      const L1 = this.bendPos - arcLen; 
      const d = t * this.totalLen;

      if (d <= L1) {
        // Straight portion before bend begins
        return optionalTarget.set(d, 0, 0);
      } else if (d <= L1 + arcLen) {
        // Bend curve
        const theta = (d - L1) / this.R;
        return optionalTarget.set(
          L1 + this.R * Math.cos(-Math.PI / 2 + theta),
          this.R + this.R * Math.sin(-Math.PI / 2 + theta),
          0
        );
      } else {
        // Straight continuation after the bend finishes
        const straightD = d - (L1 + arcLen);
        const endAngle = -Math.PI / 2 + angleRad;
        const px = L1 + this.R * Math.cos(endAngle);
        const py = this.R + this.R * Math.sin(endAngle);
        return optionalTarget.set(
          px + straightD * Math.cos(angleRad),
          py + straightD * Math.sin(angleRad),
          0
        );
      }
    }
  }

  let curve = $derived(new ConduitCurve(bendAngle, bendRadius, bendPosition));
</script>

<svelte:window onpointermove={onPointerMove} onpointerup={onPointerUp} />

<T.AmbientLight intensity={0.8} />
<T.DirectionalLight position={[80, 30, 20]} intensity={1.5} castShadow />

<!-- Cameras adjusted to center look-target on the middle of the 0-120 length pipe -->
{#if isOrthographic}
  <T.OrthographicCamera makeDefault position={[60, 10, 100]} zoom={10}>
    <OrbitControls enableDamping target={[60, 5, 0]} enabled={!isDragging} />
  </T.OrthographicCamera>
{:else}
  <T.PerspectiveCamera makeDefault position={[60, 10, 100]} fov={45}>
    <OrbitControls enableDamping target={[60, 5, 0]} enabled={!isDragging} />
  </T.PerspectiveCamera>
{/if}

<!-- 3D Coordinate Grids - Centered against the pipe length -->
<Grid sectionSize={20} cellSize={4} position={[60, 0, 0]} sectionColor="#888888" cellColor="#444444" fadeDistance={250} />
<Grid sectionSize={20} cellSize={4} position={[60, 0, 0]} rotation.x={Math.PI / 2} sectionColor="#888888" cellColor="#444444" fadeDistance={250} />
<Grid sectionSize={20} cellSize={4} position={[60, 0, 0]} rotation.z={Math.PI / 2} sectionColor="#888888" cellColor="#444444" fadeDistance={250} />

<T.Mesh castShadow receiveShadow>
  <T.TubeGeometry bind:ref={tubeGeom} args={[curve, 100, pipeRadius, 16, false]} />
  <T.MeshStandardMaterial color="#dddddd" metalness={0.9} roughness={0.3} />
</T.Mesh>

<!-- Bender Tool Pivot Group -->
<T.Group position={[benderX, bendRadius, 0]} rotation.z={-angleRad} rotation.y={Math.PI} scale={toolScaleFactor}>
  <T.Mesh rotation.z={-Math.PI / 2} castShadow>
    <T.TorusGeometry args={[4, 0.45, 16, 64, Math.PI / 2 + 0.1]} />
    <T.MeshStandardMaterial color="#1e90ff" metalness={0.3} roughness={0.6} />
  </T.Mesh>

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