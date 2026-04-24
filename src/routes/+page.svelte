<!-- src/routes/+page.svelte -->
<script lang="ts">
  import { Canvas } from '@threlte/core';
  import * as THREE from 'three';
  import BenderScene from './BenderScene.svelte';
  import { browser } from '$app/environment';
  import conduitData from '$lib/data/conduit-sizes.json';

  // --- 3D Scene Target State ---
  let bendAngle = $state(0);
  let bendRotation = $state(0); // Rotation passed to the 3D scene
  let bendPosition = $state(60); // Starts the bend at the halfway mark by default
  let isOrthographic = $state(false);

  // --- UI Slider State (Allows negative angles) ---
  let uiBendAngle = $state(0);
  let uiBendRotation = $state(0);

  // Helper functions for wrapping/comparing rotations
  function wrap360(val: number) {
    let v = val % 360;
    return v < 0 ? v + 360 : v;
  }

  function angleDiff(a: number, b: number) {
    let d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  }

  // Sync UI -> Scene Angle
  $effect(() => {
    let absUI = Math.abs(uiBendAngle);
    if (Math.abs(bendAngle - absUI) > 0.001) {
      bendAngle = absUI;
    }
  });

  // Sync Scene -> UI Angle (if updated by 3D drag handles)
  $effect(() => {
    let absUI = Math.abs(uiBendAngle);
    if (Math.abs(bendAngle - absUI) > 0.001) {
      uiBendAngle = uiBendAngle < 0 ? -bendAngle : bendAngle;
    }
  });

  // Sync UI -> Scene Rotation (Flips by 180deg when UI angle is negative)
  $effect(() => {
    let targetRot = wrap360(uiBendRotation + (uiBendAngle < 0 ? 180 : 0));
    if (angleDiff(bendRotation, targetRot) > 0.001) {
      bendRotation = targetRot;
    }
  });

  // Sync Scene -> UI Rotation (if updated by 3D drag handles)
  $effect(() => {
    let expectedSceneRot = wrap360(uiBendRotation + (uiBendAngle < 0 ? 180 : 0));
    if (angleDiff(bendRotation, expectedSceneRot) > 0.001) {
      uiBendRotation = wrap360(bendRotation + (uiBendAngle < 0 ? 180 : 0));
    }
  });

  // --- UI Layout State ---
  let leftPanelOpen = $state(true);
  let rightPanelOpen = $state(true);

  // --- Conduit Selection Logic ---
  const standards = conduitData.conduit_standards;
  const conduitTypes = ['EMT', 'IMC', 'Rigid'] as const;
  
  let selectedType = $state<typeof conduitTypes[number]>('EMT');
  let sizesForType = $derived(standards[selectedType]);
  let availableSizes = $derived(sizesForType.map(s => s.trade_size));
  let selectedSize = $state('1/2');

  // Reactively enforce valid size selections when switching types
  $effect(() => {
    if (!availableSizes.includes(selectedSize)) {
      selectedSize = availableSizes[0];
    }
  });

  // Lookup actual OD for the 3D Scene
  let currentConduit = $derived(sizesForType.find(s => s.trade_size === selectedSize) || sizesForType[0]);
  let outerDiameter = $derived(currentConduit.outer_diameter);

  let stats = $state({
    beforeBend: 0,
    inBend: 0,
    afterBend: 0,
    total: 0,
    width: 0,
    height: 0,
    depth: 0
  });

  const quickAngles = [10, 22.5, 30, 45, 60, 90];
  const quickRotations = [0, 90, 180, 270]; // Standard orientation clicks
</script>

<div class="simulator-container">
  <!-- Panel Toggles (visible when panels are hidden) -->
  <button class="panel-toggle left" onclick={() => leftPanelOpen = true} class:hidden={leftPanelOpen}>
    ⚙️ Controls
  </button>
  <button class="panel-toggle right" onclick={() => rightPanelOpen = true} class:hidden={rightPanelOpen}>
    📊 Stats
  </button>

  <!-- Left UI Overlay (Controls) -->
  <div class="ui-panel left-panel" class:open={leftPanelOpen}>
    <div class="panel-header">
      <h1>Conduit Bender</h1>
      <button class="close-btn" onclick={() => leftPanelOpen = false} title="Close">✕</button>
    </div>
    <p>Click and drag the handle, or use the sliders.</p>

    <!-- Conduit Type Selection -->
    <div class="selector-group">
      <h4>Conduit Type</h4>
      <div class="button-row">
        {#each conduitTypes as type}
          <button 
            class:active={selectedType === type}
            onclick={() => selectedType = type}
          >
            {type}
          </button>
        {/each}
      </div>
    </div>

    <!-- Trade Size Selection -->
    <div class="selector-group">
      <h4>Trade Size</h4>
      <div class="button-row flex-wrap">
        {#each availableSizes as size}
          <button 
            class:active={selectedSize === size}
            onclick={() => selectedSize = size}
          >
            {size}"
          </button>
        {/each}
      </div>
    </div>
    
    <!-- Position & Angle Controls -->
    <div class="controls-group">
      <div class="control-row">
        <label>Bend Start Position
        <div class="slider-container">
          <input type="range" min="0" max="120" step="0.1" bind:value={bendPosition} />
          <span class="val-display">{bendPosition.toFixed(1)}"</span>
        </div>
        </label>
      </div>

      <div class="control-row">
        <label>Bend Angle
        <div class="slider-container">
          <!-- Expanded range down to -110 bound to our UI State -->
          <input type="range" min="-110" max="110" bind:value={uiBendAngle} />
          <span class="val-display">{Math.round(uiBendAngle)}&deg;</span>
        </div>
        </label>
        
        <!-- Quick Select Buttons -->
        <div class="quick-angles button-row flex-wrap">
          {#each quickAngles as angle}
            <button 
              class:active={uiBendAngle === angle}
              onclick={() => uiBendAngle = angle}
            >
              {angle}&deg;
            </button>
          {/each}
        </div>
      </div>

      <div class="control-row">
        <label>Bend Rotation (Roll)
        <div class="slider-container">
          <input type="range" min="0" max="360" bind:value={uiBendRotation} />
          <span class="val-display">{Math.round(uiBendRotation)}&deg;</span>
        </div>
        </label>

        <!-- Quick Select Buttons for Orientation -->
        <div class="quick-angles button-row flex-wrap">
          {#each quickRotations as rot}
            <button 
              class:active={uiBendRotation === rot}
              onclick={() => uiBendRotation = rot}
            >
              {rot}&deg;
            </button>
          {/each}
        </div>
      </div>
    </div>

    <button 
      class="view-toggle" 
      onclick={() => isOrthographic = !isOrthographic}
    >
      Switch to {isOrthographic ? 'Perspective' : 'Orthographic'} View
    </button>
  </div>

  <!-- Right UI Overlay (Live Stats) -->
  <div class="ui-panel right-panel" class:open={rightPanelOpen}>
    <div class="panel-header">
      <h3 class="stats-title">Live 3D Geometry Analysis</h3>
      <button class="close-btn" onclick={() => rightPanelOpen = false} title="Close">✕</button>
    </div>
    
    <div class="stat-section">
      <h4>Segment Lengths</h4>
      <div class="stat-row"><span>Before Bend:</span> <span>{stats.beforeBend.toFixed(2)}"</span></div>
      <div class="stat-row"><span>In Bend:</span> <span>{stats.inBend.toFixed(2)}"</span></div>
      <div class="stat-row"><span>After Bend:</span> <span>{stats.afterBend.toFixed(2)}"</span></div>
      <div class="stat-row total"><span>Total Length:</span> <span>{stats.total.toFixed(2)}"</span></div>
    </div>

    <div class="stat-section">
      <h4>Physical 3D Dimensions</h4>
      <div class="stat-row"><span>Width (X):</span> <span>{stats.width.toFixed(2)}"</span></div>
      <div class="stat-row"><span>Height (Y):</span> <span>{stats.height.toFixed(2)}"</span></div>
      <div class="stat-row"><span>Depth (Z):</span> <span>{stats.depth.toFixed(2)}"</span></div>
    </div>
  </div>

  {#if browser}
    <Canvas shadows={THREE.PCFShadowMap}>
      <BenderScene 
        bind:bendAngle 
        bind:bendRotation
        bind:bendPosition
        {isOrthographic} 
        {outerDiameter}
        bind:stats 
      />
    </Canvas>
  {/if}
</div>

<style>
  :global(body) {
    margin: 0;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background-color: #1a1a1a;
  }
  
  .simulator-container {
    position: relative;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
  }

  /* --- Toggle Buttons --- */
  .panel-toggle {
    position: absolute;
    z-index: 5;
    background: rgba(40, 40, 40, 0.9);
    color: #fff;
    border: 1px solid #555;
    padding: 0.6rem 1rem;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 600;
    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    transition: all 0.3s ease;
  }
  .panel-toggle:hover { background: #555; }
  .panel-toggle.left { top: 20px; left: 20px; }
  .panel-toggle.right { top: 20px; right: 20px; }
  .panel-toggle.hidden {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
  }

  /* --- Base Panel Styles --- */
  .ui-panel {
    position: absolute;
    z-index: 10;
    color: white;
    padding: 1.5rem;
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    border: 1px solid #333;
    pointer-events: auto;
    width: 330px;
    box-sizing: border-box;
    max-height: calc(100vh - 40px);
    overflow-y: auto;
    transition: transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.35s ease;
  }
  .ui-panel::-webkit-scrollbar { width: 6px; }
  .ui-panel::-webkit-scrollbar-thumb { background: #555; border-radius: 3px; }

  /* --- Left Panel --- */
  .ui-panel.left-panel {
    top: 20px;
    left: 20px;
    background: rgba(20, 20, 20, 0.85);
    transform: translateX(-120%);
    opacity: 0;
  }
  .ui-panel.left-panel.open {
    transform: translateX(0);
    opacity: 1;
  }

  /* --- Right Panel --- */
  .ui-panel.right-panel {
    top: 20px;
    right: 20px;
    background: rgba(20, 20, 20, 0.6); /* More transparent */
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    transform: translateX(120%);
    opacity: 0;
  }
  .ui-panel.right-panel.open {
    transform: translateX(0);
    opacity: 1;
  }

  /* --- Panel Headers --- */
  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 0.5rem;
  }
  .panel-header h1 { margin: 0; font-size: 1.25rem; color: #1e90ff; }
  .stats-title { margin: 0; font-size: 1rem; color: #4caf50; text-transform: uppercase; letter-spacing: 0.5px; }
  
  .close-btn {
    background: transparent;
    border: none;
    color: #aaa;
    font-size: 1.25rem;
    cursor: pointer;
    line-height: 1;
    padding: 0.2rem;
    border-radius: 4px;
    transition: all 0.2s;
  }
  .close-btn:hover { color: #fff; background: rgba(255,255,255,0.1); }

  p { margin: 0 0 1rem 0; font-size: 0.85rem; color: #aaa; }

  /* --- Input & Control Layout --- */
  .selector-group { margin-bottom: 1rem; }
  .selector-group h4 { margin: 0 0 0.5rem 0; font-size: 0.8rem; color: #aaa; text-transform: uppercase; }
  
  .button-row { display: flex; gap: 0.4rem; }
  .button-row.flex-wrap { flex-wrap: wrap; }
  
  .button-row button {
    flex: 1;
    background: #333;
    border: 1px solid #555;
    color: white;
    padding: 0.4rem 0.6rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85rem;
    transition: all 0.2s;
  }
  .button-row.flex-wrap button { flex: unset; min-width: 45px; }
  .button-row button:hover { background: #444; }
  .button-row button.active {
    background: #1e90ff;
    border-color: #1e90ff;
    font-weight: bold;
  }

  .controls-group { margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #444; }
  .control-row { margin-bottom: 1rem; }
  .control-row label { display: block; font-size: 0.8rem; color: #aaa; text-transform: uppercase; margin-bottom: 0.3rem; }
  .slider-container { display: flex; align-items: center; gap: 1rem; }
  input[type="range"] { flex-grow: 1; cursor: pointer; }
  .val-display { font-weight: bold; min-width: 45px; text-align: right; color: #fff; }
  .quick-angles { margin-top: 0.6rem; }

  .view-toggle {
    margin-top: 1.25rem;
    padding: 0.6rem 1rem;
    width: 100%;
    background-color: #333;
    color: #fff;
    border: 1px solid #555;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 600;
    transition: background-color 0.2s ease;
  }
  .view-toggle:hover { background-color: #444; }

  /* --- Stats Styling --- */
  .stat-section { margin-top: 1rem; background: rgba(0, 0, 0, 0.2); padding: 0.75rem; border-radius: 6px; }
  .stat-section h4 { margin: 0 0 0.5rem 0; font-size: 0.8rem; color: #888; text-transform: uppercase; }

  .stat-row { display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 0.35rem; color: #ddd; }
  .stat-row:last-child { margin-bottom: 0; }
  .stat-row.total { margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px dashed #555; font-weight: bold; color: #fff; }

  /* --- Mobile Responsive Rules --- */
  @media (max-width: 768px) {
    .ui-panel {
      width: auto;
      left: 15px;
      right: 15px;
      max-height: 45vh;
      padding: 1.2rem;
    }
    
    /* Reposition so panels stack logically on tiny screens instead of overlapping heavily */
    .ui-panel.left-panel {
      top: 15px;
      transform: translateY(-120%); /* Slide in from top instead of left */
    }
    .ui-panel.left-panel.open { transform: translateY(0); }

    .ui-panel.right-panel {
      top: auto;
      bottom: 15px;
      transform: translateY(120%); /* Slide in from bottom */
    }
    .ui-panel.right-panel.open { transform: translateY(0); }

    /* Adjust Toggles */
    .panel-toggle.left { top: 15px; left: 15px; }
    .panel-toggle.right { top: auto; bottom: 15px; right: 15px; }
  }
</style>