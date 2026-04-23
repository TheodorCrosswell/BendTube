<!-- src/routes/BenderScene.svelte -->
<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import { OrbitControls, Grid, interactivity } from '@threlte/extras';
  import * as THREE from 'three';

  // 1. Define strict types for the component props so parent components can bind to them
  interface Props {
    bendAngle?: number;
    isOrthographic?: boolean;
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
    stats = $bindable({ beforeBend: 0, inBend: 0, afterBend: 0, total: 0, width: 0, height: 0, depth: 0 }) 
  }: Props = $props();

  interactivity();

  // 2. Initialize with undefined instead of null to satisfy Threlte's expected type
  let tubeGeom = $state<THREE.TubeGeometry | undefined>(undefined);

  // --- Derived Tool Position ---
  // The bender must roll backward along the stationary pipe.
  // The distance it rolls equals the arc length of the bend: arcLen = radius * angleInRadians.
  let angleRad = $derived(bendAngle * (Math.PI / 180));
  let benderX = $derived(-4 * angleRad);

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
  
  // useTask fires on the render loop. We limit calculations to 5 times per second (0.2s intervals)
  useTask((delta) => {
    timeElapsed += delta;
    if (timeElapsed >= 0.2) {
      timeElapsed %= 0.2;
      calculateStatsFromScene();
    }
  });

  function calculateStatsFromScene() {
    if (!tubeGeom) return;

    // 1. EXTRACT 3D SPATIAL DIMENSIONS (Bounding Box)
    // Computes the actual box encapsulating the generated geometry (includes conduit thickness)
    tubeGeom.computeBoundingBox();
    const box = tubeGeom.boundingBox;
    const size = new THREE.Vector3();
    if (box) box.getSize(size);

    // 2. EXTRACT SEGMENT LENGTHS FROM GEOMETRY PATH
    const path = tubeGeom.parameters.path;
    // Extract 1000 points strictly from the 3D object's path to measure vectors
    const points = path.getPoints(1000); 

    let lenBefore = 0;
    let lenBend = 0;
    let lenAfter = 0;
    let state = 'BEFORE'; // FSM: 'BEFORE' -> 'BEND' -> 'AFTER'

    for (let i = 0; i < points.length - 1; i++) {
      const pA = points[i];
      const pB = points[i + 1];
      const dist = pA.distanceTo(pB);

      if (i > 0 && i < points.length - 1) {
        const pPrev = points[i - 1];
        const vPrev = new THREE.Vector3().subVectors(pA, pPrev).normalize();
        const vNext = new THREE.Vector3().subVectors(pB, pA).normalize();
        
        // Measure the angle between adjacent segment vectors to detect the bend in 3D space
        const angle = vPrev.angleTo(vNext);
        const isStraight = angle < 0.002; // Small tolerance for floating point variations

        // State Machine to segment the pipe
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

    // Push the results back to the two-way bound prop
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

    constructor(angleDeg: number) {
      super();
      this.angleDeg = angleDeg;
    }

    getPoint(t: number, optionalTarget = new THREE.Vector3()) {
      const angleRad = this.angleDeg * (Math.PI / 180);
      const R = 4;
      const L1_initial = 15;
      const L2 = 15;
      
      const arcLen = R * angleRad;
      const L1 = L1_initial - arcLen; 
      const totalLen = L1_initial + L2; 
      const d = t * totalLen;

      if (d <= L1) {
        // Keep the left straight part locked stationary on the floor.
        // It starts exactly at -L1_initial and gets effectively shorter as it gets consumed by the bend.
        return optionalTarget.set(-L1_initial + d, 0, 0);
      } else if (d <= L1 + arcLen) {
        // The arc's center physically rolls backward along the X-axis by `-arcLen`
        const theta = (d - L1) / R;
        return optionalTarget.set(
          -arcLen + R * Math.cos(-Math.PI / 2 + theta),
          R + R * Math.sin(-Math.PI / 2 + theta),
          0
        );
      } else {
        // The bent continuation is translated backward as well to stay connected continuously 
        const straightD = d - (L1 + arcLen);
        const endAngle = -Math.PI / 2 + angleRad;
        const px = -arcLen + R * Math.cos(endAngle);
        const py = R + R * Math.sin(endAngle);
        return optionalTarget.set(
          px + straightD * Math.cos(angleRad),
          py + straightD * Math.sin(angleRad),
          0
        );
      }
    }
  }

  let curve = $derived(new ConduitCurve(bendAngle));
</script>

<svelte:window onpointermove={onPointerMove} onpointerup={onPointerUp} />

<!-- Lighting -->
<T.AmbientLight intensity={0.8} />
<T.DirectionalLight position={[10, 15, 10]} intensity={1.5} castShadow />

<!-- Camera & Navigation Toggle -->
{#if isOrthographic}
  <T.OrthographicCamera makeDefault position={[0, 5, 25]} zoom={40}>
    <OrbitControls enableDamping target={[0, 2, 0]} enabled={!isDragging} />
  </T.OrthographicCamera>
{:else}
  <T.PerspectiveCamera makeDefault position={[0, 5, 25]} fov={45}>
    <OrbitControls enableDamping target={[0, 2, 0]} enabled={!isDragging} />
  </T.PerspectiveCamera>
{/if}

<!-- 3D Coordinate Grids -->
<Grid position={[0, 0, 0]} sectionColor="#888888" cellColor="#444444" fadeDistance={50} />
<Grid position={[0, 0, 0]} rotation.x={Math.PI / 2} sectionColor="#888888" cellColor="#444444" fadeDistance={50} />
<Grid position={[0, 0, 0]} rotation.z={Math.PI / 2} sectionColor="#888888" cellColor="#444444" fadeDistance={50} />

<!-- EMT Conduit Model -->
<T.Mesh castShadow receiveShadow>
  <!-- Using bind:ref with undefined initial state -->
  <T.TubeGeometry bind:ref={tubeGeom} args={[curve, 100, 0.4, 16, false]} />
  <T.MeshStandardMaterial color="#dddddd" metalness={0.9} roughness={0.3} />
</T.Mesh>

<!-- Bender Tool Pivot Group -->
<!-- Position shifted by `benderX` backwards so it properly rolls rather than sliding -->
<T.Group position={[benderX, 4, 0]} rotation.z={-angleRad} rotation.y={Math.PI}>
  <T.Mesh rotation.z={-Math.PI / 2} castShadow>
    <T.TorusGeometry args={[4, 0.45, 16, 64, Math.PI / 2 + 0.1]} />
    <T.MeshStandardMaterial color="#1e90ff" metalness={0.3} roughness={0.6} />
  </T.Mesh>

  <T.Group 
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