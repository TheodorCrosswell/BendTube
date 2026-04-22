<!-- src/routes/+page.svelte -->
<script lang="ts">
  import { Canvas } from '@threlte/core';
  import * as THREE from 'three';
  import BenderScene from './BenderScene.svelte';
  import { browser } from '$app/environment'; // <-- Import browser check

  let bendAngle = $state(0); // State in degrees
  let isOrthographic = $state(false); // State for camera view
</script>

<div class="simulator-container">
  <!-- 2D UI Overlay (This will still SSR instantly) -->
  <div class="ui-panel">
    <h1>EMT Conduit Bender</h1>
    <p>Click and drag the handle, or use the slider to bend.</p>
    
    <div class="controls">
      <!-- Bind range slider natively as a number -->
      <input type="range" min="0" max="110" bind:value={bendAngle} />
      <span class="angle-display">{Math.round(bendAngle)}&deg;</span>
    </div>

    <!-- Camera Toggle Button -->
    <button 
      class="view-toggle" 
      onclick={() => isOrthographic = !isOrthographic}
    >
      Switch to {isOrthographic ? 'Perspective' : 'Orthographic'} View
    </button>
  </div>

  <!-- 3D Canvas (Only load on the Client to prevent SSR errors with useDOM) -->
  {#if browser}
    <Canvas shadows={THREE.PCFShadowMap}>
      <BenderScene bind:bendAngle {isOrthographic} />
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
  }

  h1 {
    margin: 0 0 0.5rem 0;
    font-size: 1.25rem;
    color: #1e90ff;
  }

  p {
    margin: 0 0 1rem 0;
    font-size: 0.9rem;
    color: #aaa;
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  input[type="range"] {
    flex-grow: 1;
    cursor: pointer;
  }

  .angle-display {
    font-weight: bold;
    min-width: 40px;
    text-align: right;
  }

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

  .view-toggle:hover {
    background-color: #444;
  }
</style>