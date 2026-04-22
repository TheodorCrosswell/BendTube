<!-- src/routes/BenderScene.svelte -->
<script lang="ts">
  import { T } from '@threlte/core';
  import { OrbitControls, Grid, interactivity } from '@threlte/extras';
  import * as THREE from 'three';

  let { bendAngle = $bindable(0) } = $props();

  // Enable Threlte's raycasting interactivity for pointer events (v8/v9 syntax)
  interactivity();

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
    e.stopPropagation(); // Prevent orbit controls from stealing focus
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!isDragging) return;
    // Calculate mouse movement (pulling down and right bends the conduit)
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    
    // Sensitivity factor
    const movement = deltaX + deltaY; 
    let newAngle = startAngle + movement * 0.4;
    
    // Clamp between 0 and 110 degrees
    bendAngle = Math.max(0, Math.min(newAngle, 110)); 
  };

  const onPointerUp = () => {
    if (isDragging) {
      isDragging = false;
      document.body.style.cursor = 'default';
    }
  };

  // --- Dynamic Math: Conduit Path Curve ---
  class ConduitCurve extends THREE.Curve<THREE.Vector3> {
    angleDeg: number;

    constructor(angleDeg: number) {
      super();
      this.angleDeg = angleDeg;
    }

    getPoint(t: number, optionalTarget = new THREE.Vector3()) {
      const angleRad = this.angleDeg * (Math.PI / 180);
      const R = 4; // Bending radius
      const L1 = 15; // Straight back section length (anchored at shoe)
      const L2_initial = 15; // Initial straight forward section length
      
      // REAL-WORLD EMT MATH:
      // The pipe doesn't stretch. The arc consumes straight pipe (Developed Length = R * theta).
      // We shrink the forward straight section by the exact length of the arc.
      const arcLen = R * angleRad;
      const L2 = L2_initial - arcLen; 
      
      // The physical total length remains perfectly constant at all times (15 + 15 = 30)
      const totalLen = L1 + L2_initial; 
      const d = t * totalLen;

      if (d <= L1) {
        // Back straight (Remains flat and stationary relative to the floor)
        return optionalTarget.set(-L1 + d, 0, 0);
      } else if (d <= L1 + arcLen) {
        // Arc (Bend)
        // Distance along the arc is (d - L1). Angle theta = arcDistance / Radius
        const theta = (d - L1) / R;
        return optionalTarget.set(
          R * Math.cos(-Math.PI / 2 + theta),
          R + R * Math.sin(-Math.PI / 2 + theta),
          0
        );
      } else {
        // Forward straight (Pulls back/shortens visually as pipe wraps into the bend)
        const straightD = d - (L1 + arcLen);
        const endAngle = -Math.PI / 2 + angleRad;
        const px = R * Math.cos(endAngle);
        const py = R + R * Math.sin(endAngle);
        return optionalTarget.set(
          px + straightD * Math.cos(angleRad),
          py + straightD * Math.sin(angleRad),
          0
        );
      }
    }
  }

  // Reactively rebuild the curve instance when the angle changes using Svelte 5
  // Note: We leave the instantiation of TubeGeometry to Threlte below!
  let curve = $derived(new ConduitCurve(bendAngle));
</script>

<svelte:window onpointermove={onPointerMove} onpointerup={onPointerUp} />

<!-- Lighting -->
<T.AmbientLight intensity={0.8} />
<T.DirectionalLight position={[10, 15, 10]} intensity={1.5} castShadow />

<!-- Camera & Navigation -->
<T.PerspectiveCamera makeDefault position={[0, 5, 25]} fov={45}>
  <!-- Disable OrbitControls while dragging the handle -->
  <OrbitControls enableDamping target={[0, 2, 0]} enabled={!isDragging} />
</T.PerspectiveCamera>

<!-- 3D Coordinate Grids -->
<!-- XZ Plane (Horizontal floor, y=0) -->
<Grid 
  position={[0, 0, 0]} 
  sectionColor="#888888" 
  cellColor="#444444" 
  fadeDistance={50} 
/>
<!-- XY Plane (Vertical facing Z, rotated 90deg on X axis) -->
<Grid 
  position={[0, 0, 0]} 
  rotation.x={Math.PI / 2}
  sectionColor="#888888" 
  cellColor="#444444" 
  fadeDistance={50} 
/>
<!-- YZ Plane (Vertical facing X, rotated 90deg on Z axis) -->
<Grid 
  position={[0, 0, 0]} 
  rotation.z={Math.PI / 2}
  sectionColor="#888888" 
  cellColor="#444444" 
  fadeDistance={50} 
/>

<!-- EMT Conduit Model -->
<T.Mesh castShadow receiveShadow>
  <!-- 
    Using `args` enables Threlte to monitor changes. When `$derived` curve changes, 
    Threlte will automatically clear the old geometry from GPU memory and build a new one. 
  -->
  <T.TubeGeometry args={[curve, 100, 0.4, 16, false]} />
  <T.MeshStandardMaterial color="#dddddd" metalness={0.9} roughness={0.3} />
</T.Mesh>

<!-- Bender Tool Pivot Group -->
<!-- Rotates clockwise (-Z) around the center of the bend radius (0, 4, 0), and rotated 180 degrees on Y axis -->
<T.Group position={[0, 4, 0]} rotation.z={-bendAngle * (Math.PI / 180)} rotation.y={Math.PI}>
  
  <!-- Bender Shoe (The curved blue part) -->
  <T.Mesh rotation.z={-Math.PI / 2} castShadow>
    <T.TorusGeometry args={[4, 0.45, 16, 64, Math.PI / 2 + 0.1]} />
    <T.MeshStandardMaterial color="#1e90ff" metalness={0.3} roughness={0.6} />
  </T.Mesh>

  <!-- Interactive Handle Group -->
  <!-- Threlte v8 events use standard lowercase Svelte 5 syntax: onpointerdown -->
  <T.Group 
    onpointerdown={onPointerDown} 
    onpointerenter={() => document.body.style.cursor = 'grab'} 
    onpointerleave={() => { if (!isDragging) document.body.style.cursor = 'default'; }}
  >
    <!-- Handle Pole -->
    <T.Mesh position={[0, 4, 0]} castShadow>
      <T.CylinderGeometry args={[0.15, 0.15, 16, 16]} />
      <T.MeshStandardMaterial color="#333333" metalness={0.7} roughness={0.2} />
    </T.Mesh>

    <!-- Handle Grip (Red) -->
    <T.Mesh position={[0, 11, 0]}>
      <T.CylinderGeometry args={[0.20, 0.20, 2, 16]} />
      <T.MeshStandardMaterial color="#cc0000" />
    </T.Mesh>
    
  </T.Group>
</T.Group>