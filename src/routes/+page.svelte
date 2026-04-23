<!-- src/routes/+page.svelte -->
<script lang="ts">
  import { Canvas } from '@threlte/core';
  import * as THREE from 'three';
  import BenderScene from './BenderScene.svelte';
  import { browser } from '$app/environment';
  import conduitData from '$lib/data/conduit-sizes.json';

  let bendAngle = $state(0);
  let isOrthographic = $state(false);

  // --- Conduit Selection Logic ---
  const standards = conduitData.conduit_standards;
  const conduitTypes = ['EMT', 'IMC', 'Rigid'] as const;
  
  let selectedType = $state<typeof conduitTypes[number]>('EMT');
  let sizesForType = $derived(standards[selectedType]);
  let availableSizes = $derived(sizesForType.map(s => s.trade_size));
  let selectedSize = $state('1/2');

  // Reactively enforce valid size selections when switching types (e.g. EMT doesn't have 6")
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
</script>

<div class="simulator-container">
  <!-- 2D UI Overlay -->
  <div class="ui-panel">
    <h1>Conduit Bender</h1>
    <p>Click and drag the handle, or use the slider.</p>

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
    
    <div class="controls">
      <input type="range" min="0" max="110" bind:value={bendAngle} />
      <span class="angle-display">{Math.round(bendAngle)}&deg;</span>
    </div>

    <button 
      class="view-toggle" 
      onclick={() => isOrthographic = !isOrthographic}
    >
      Switch to {isOrthographic ? 'Perspective' : 'Orthographic'} View
    </button>

    <!-- Display the Live 3D Measurements -->
    <div class="measurements">
      <h3>Live 3D Geometry Analysis</h3>
      
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
  </div>

  {#if browser}
    <Canvas shadows={THREE.PCFShadowMap}>
      <BenderScene 
        bind:bendAngle 
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

  .ui-panel {
    position: absolute;
    top: 20px;
    left: 20px;
    z-index: 10;
    background: rgba(20, 20, 20, 0.85);
    color: white;
    padding: 1.5rem;
    border-radius: 12px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.3);
    border: 1px solid #333;
    pointer-events: auto;
    width: 330px;
    max-height: 90vh;
    overflow-y: auto;
  }

  /* Custom Scrollbar for UI panel */
  .ui-panel::-webkit-scrollbar { width: 6px; }
  .ui-panel::-webkit-scrollbar-thumb { background: #555; border-radius: 3px; }

  h1 { margin: 0 0 0.25rem 0; font-size: 1.25rem; color: #1e90ff; }
  p { margin: 0 0 1rem 0; font-size: 0.85rem; color: #aaa; }

  /* Conduit Selection UI */
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
  .button-row.flex-wrap button { flex: unset; min-width: 48px; }
  
  .button-row button:hover { background: #444; }
  .button-row button.active {
    background: #1e90ff;
    border-color: #1e90ff;
    font-weight: bold;
  }

  .controls { display: flex; align-items: center; gap: 1rem; margin-top: 1rem; }
  input[type="range"] { flex-grow: 1; cursor: pointer; }
  .angle-display { font-weight: bold; min-width: 40px; text-align: right; }

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

  .measurements {
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid #444;
  }

  .measurements h3 { margin: 0 0 1rem 0; font-size: 1rem; color: #4caf50; text-transform: uppercase; letter-spacing: 0.5px; }

  .stat-section { margin-bottom: 1rem; background: rgba(0, 0, 0, 0.2); padding: 0.75rem; border-radius: 6px; }
  .stat-section h4 { margin: 0 0 0.5rem 0; font-size: 0.8rem; color: #888; }

  .stat-row { display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 0.35rem; color: #ddd; }
  .stat-row:last-child { margin-bottom: 0; }
  .stat-row.total { margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px dashed #555; font-weight: bold; color: #fff; }
</style>