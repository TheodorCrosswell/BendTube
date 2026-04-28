<!-- src/routes/+page.svelte -->
<script lang="ts">
	import { Canvas } from '@threlte/core';
	import * as THREE from 'three';
	import BenderScene from '../lib/components/BenderScene.svelte';
	import { browser } from '$app/environment';
	import conduitData from '$lib/data/conduit-sizes.json';

	type Bend = { angle: number; rotation: number; position: number; mark: 'star' | 'arrow' };
	let bends = $state<Bend[]>([{ angle: 0, rotation: 0, position: 60, mark: 'star' }]);
	let activeBendIndex = $state(0);

	let isOrthographic = $state(false);

	// Mobile-first layout state
	type MenuType = 'conduit' | 'bending' | 'stats' | null;
	let activeMenu = $state<MenuType>(null);
	
	// Track rendered menu to keep content alive during the close animation
	let renderedMenu = $state<MenuType>(null);
	let menuHeight = $state(0);

	$effect(() => {
		if (activeMenu !== null) {
			renderedMenu = activeMenu;
		}
	});
	
	// Active attribute for the single slider 
	type BendAttribute = 'position' | 'angle' | 'rotation';
	let activeAttribute = $state<BendAttribute>('position');

	const standards = conduitData.conduit_standards;
	const conduitTypes = ['EMT', 'IMC', 'Rigid'] as const;

	let selectedType = $state<(typeof conduitTypes)[number]>('EMT');
	let sizesForType = $derived(standards[selectedType]);
	let availableSizes = $derived(sizesForType.map((s) => s.trade_size));
	let selectedSize = $state('1/2');

	$effect(() => {
		if (!availableSizes.includes(selectedSize)) {
			selectedSize = availableSizes[0];
		}
	});

	let currentConduit = $derived(
		sizesForType.find((s) => s.trade_size === selectedSize) || sizesForType[0]
	);
	let outerDiameter = $derived(currentConduit.outer_diameter);

	let stats = $state({
		beforeBend: 0,
		inBend: 0,
		afterBend: 0,
		total: 0,
		width: 0,
		height: 0,
		depth: 0,
		totalDegrees: 0
	});

	// Standard typical bender shoe Centerline Radii (CLR)
	const standardRadii: Record<string, number> = {
		'1/2': 4, '3/4': 4.5, '1': 5.75, '1 1/4': 7.25, '1 1/2': 8.25,
		'2': 9.5, '2 1/2': 10.5, '3': 13, '3 1/2': 15, '4': 16, '5': 24, '6': 30
	};

	function getDegreeColor(deg: number) {
		if (deg > 360) return '#ff4d4d'; // Red
		if (deg > 270) return '#ffa500'; // Orange
		if (deg > 180) return '#ffd700'; // Yellow
		return '#4caf50'; // Green
	}

	// === Custom Drag Slider Logic ===
	let isDragging = false;
	let dragStartX = 0;
	let dragStartValue = 0;

	function clampValue(val: number) {
		if (activeAttribute === 'position') return Math.max(0, Math.min(120, val));
		if (activeAttribute === 'angle') return Math.max(-110, Math.min(110, val));
		return Math.max(0, Math.min(360, val)); // rotation
	}

	function handlePointerDown(e: PointerEvent) {
		isDragging = true;
		dragStartX = e.clientX;
		dragStartValue = bends[activeBendIndex][activeAttribute];
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function handlePointerMove(e: PointerEvent) {
		if (!isDragging) return;
		
		const sensitivity = activeAttribute === 'position' ? 0.1 : 0.5;
		const delta = (e.clientX - dragStartX) * sensitivity;
		
		let newValue = clampValue(dragStartValue + delta);
		bends[activeBendIndex][activeAttribute] = Number(newValue.toFixed(3));
	}

	function handlePointerUp(e: PointerEvent) {
		isDragging = false;
		(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
	}

	function handleKeyDown(e: KeyboardEvent) {
		const step = activeAttribute === 'position' ? 1 : 5;
		let current = bends[activeBendIndex][activeAttribute];

		if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
			e.preventDefault();
			bends[activeBendIndex][activeAttribute] = clampValue(current - step);
		} else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
			e.preventDefault();
			bends[activeBendIndex][activeAttribute] = clampValue(current + step);
		}
	}

	// === Quick Select Handlers ===
	function addPosition(amount: number) {
		bends[activeBendIndex].position = clampValue(bends[activeBendIndex].position + amount);
	}
	
	function setAngle(angle: number) {
		bends[activeBendIndex].angle = angle;
	}
	
	function invertAngle() {
		bends[activeBendIndex].angle = bends[activeBendIndex].angle * -1;
	}

	function addRotation(amount: number) {
		if (amount === 0) {
			bends[activeBendIndex].rotation = 0;
		} else {
			let newRot = bends[activeBendIndex].rotation + amount;
			bends[activeBendIndex].rotation = newRot > 360 ? newRot - 360 : newRot;
		}
	}
</script>

<div class="app-layout">
	<!-- Top: 3D Canvas Area (Flexes to fill remaining space dynamically) -->
	<div class="canvas-wrapper" style="bottom: {activeMenu ? menuHeight + 'px' : '0'}">
		<!-- Global View Toggle Floating Top Left -->
		<button class="view-toggle" onclick={() => (isOrthographic = !isOrthographic)}>
			{isOrthographic ? 'Orthographic' : 'Perspective'}
		</button>

		{#if browser}
			<Canvas shadows={THREE.PCFShadowMap}>
				<BenderScene
					bind:bends
					bind:activeBendIndex
					{isOrthographic}
					{outerDiameter}
					conduitSize={selectedSize}
					conduitType={selectedType}
					bind:stats
				/>
			</Canvas>
		{/if}
	</div>

	<!-- Floating Navigation Buttons (Bottom Right) -->
	<div class="floating-nav" style="bottom: {activeMenu ? `${menuHeight + 15}px` : '25px'}">
		<button class="fab" class:active={activeMenu === 'conduit'} onclick={() => activeMenu = activeMenu === 'conduit' ? null : 'conduit'}>
			<span class="icon">🏗️</span>
			<span class="label">Conduit</span>
		</button>
		<button class="fab" class:active={activeMenu === 'bending'} onclick={() => activeMenu = activeMenu === 'bending' ? null : 'bending'}>
			<span class="icon">🔄</span>
			<span class="label">Bending</span>
		</button>
		<button class="fab" class:active={activeMenu === 'stats'} onclick={() => activeMenu = activeMenu === 'stats' ? null : 'stats'}>
			<span class="icon">📊</span>
			<span class="label">Stats</span>
		</button>
	</div>

	<!-- Bottom Menu Sheet -->
	<div class="bottom-sheet" class:open={activeMenu !== null} bind:clientHeight={menuHeight}>
		{#if renderedMenu === 'conduit'}
			<div class="menu-content">
				<h3>Conduit Setup</h3>
				<div class="selector-group">
					<div class="section-label">Type</div>
					<div class="button-grid">
						{#each conduitTypes as type}
							<button class:active={selectedType === type} onclick={() => selectedType = type}>{type}</button>
						{/each}
					</div>
				</div>
				<div class="selector-group">
					<div class="section-label">Trade Size (Inches)</div>
					<div class="button-grid sizes">
						{#each availableSizes as size}
							<button class:active={selectedSize === size} onclick={() => selectedSize = size}>{size}"</button>
						{/each}
					</div>
				</div>
			</div>
		
		{:else if renderedMenu === 'bending'}
			<div class="menu-content">
				<!-- Sequence & Mark Row -->
				<div class="bend-header-row">
					<div class="sequence-nav">
						<button disabled={activeBendIndex === 0} onclick={() => activeBendIndex--}>&larr;</button>
						<span>Bend {activeBendIndex + 1}/{bends.length}</span>
						<button disabled={activeBendIndex === bends.length - 1} onclick={() => activeBendIndex++}>&rarr;</button>
						
						<button class="action-btn add" onclick={() => {
							const prevBend = bends[bends.length - 1];
							const conduit = currentConduit as any;
							const clr = conduit.radius ?? standardRadii[selectedSize] ?? 4;
							const arcLength = clr * Math.abs(prevBend.angle) * (Math.PI / 180);
							bends.push({ angle: 0, rotation: 0, position: Number((prevBend.position + arcLength).toFixed(2)), mark: prevBend.mark });
							activeBendIndex = bends.length - 1;
						}}>+</button>
						
						<button class="action-btn del" disabled={bends.length === 1} onclick={() => {
							bends.splice(activeBendIndex, 1);
							if (activeBendIndex >= bends.length) activeBendIndex = Math.max(0, bends.length - 1);
						}}>-</button>
					</div>

					<div class="mark-toggle">
						<button class:active={bends[activeBendIndex].mark === 'star'} onclick={() => bends[activeBendIndex].mark = 'star'}>⭐</button>
						<button class:active={bends[activeBendIndex].mark === 'arrow'} onclick={() => bends[activeBendIndex].mark = 'arrow'}>➔</button>
					</div>
				</div>

				<!-- Attribute Tabs -->
				<div class="attribute-tabs">
					<button class:active={activeAttribute === 'position'} onclick={() => activeAttribute = 'position'}>Distance</button>
					<button class:active={activeAttribute === 'angle'} onclick={() => activeAttribute = 'angle'}>Angle</button>
					<button class:active={activeAttribute === 'rotation'} onclick={() => activeAttribute = 'rotation'}>Roll</button>
				</div>

				<!-- The Custom Side-to-Side Drag Slider -->
				<div class="custom-slider-container">
					<div 
						class="drag-pad" 
						role="slider"
						tabindex="0"
						aria-label={activeAttribute}
						aria-valuenow={bends[activeBendIndex][activeAttribute]}
						aria-valuemin={activeAttribute === 'position' ? 0 : activeAttribute === 'angle' ? -110 : 0}
						aria-valuemax={activeAttribute === 'position' ? 120 : activeAttribute === 'angle' ? 110 : 360}
						onpointerdown={handlePointerDown} 
						onpointermove={handlePointerMove} 
						onpointerup={handlePointerUp}
						onpointercancel={handlePointerUp}
						onpointerleave={handlePointerUp}
						onkeydown={handleKeyDown}
					>
						<div class="drag-value">
							{#if activeAttribute === 'position'}
								{bends[activeBendIndex].position.toFixed(2)}"
							{:else if activeAttribute === 'angle'}
								{Math.round(bends[activeBendIndex].angle)}&deg;
							{:else}
								{Math.round(bends[activeBendIndex].rotation)}&deg;
							{/if}
						</div>
					</div>
				</div>

				<!-- Dynamic Quick Select Options -->
				<div class="quick-select-wrapper">
					<div class="quick-select">
						{#if activeAttribute === 'position'}
							<button onclick={() => addPosition(12)}>+12"</button>
							<button onclick={() => addPosition(1)}>+1"</button>
							<button onclick={() => addPosition(-12)}>-12"</button>
							<button onclick={() => addPosition(-1)}>-1"</button>
							<button onclick={() => addPosition(0.125)}>+1/8"</button>
							<button onclick={() => addPosition(-0.125)}>-1/8"</button>
						{:else if activeAttribute === 'angle'}
							{#each [0, 10, 22.5, 30, 45, 60, 90] as ang}
								<button class:active={bends[activeBendIndex].angle === ang} onclick={() => setAngle(ang)}>{ang}&deg;</button>
							{/each}
							<button class="invert-btn" onclick={invertAngle}>Invert ±</button>
						{:else if activeAttribute === 'rotation'}
							<button class:active={bends[activeBendIndex].rotation === 0} onclick={() => addRotation(0)}>0&deg;</button>
							{#each [10, 30, 45, 60, 90] as rot}
								<button onclick={() => addRotation(rot)}>+{rot}&deg;</button>
							{/each}
						{/if}
					</div>
				</div>
			</div>

		{:else if renderedMenu === 'stats'}
			<div class="menu-content stats-content">
				<h3>3D Geometry Analysis</h3>

				<div class="stat-card run-constraints">
					<h4>Run Constraints</h4>
					<div class="stat-row" style="color: {getDegreeColor(stats.totalDegrees)}; font-size: 1.1rem; font-weight: 700;">
						<span>Total Degrees:</span> 
						<span>
							{Math.round(stats.totalDegrees)}&deg;
							{#if stats.totalDegrees > 360}⚠️{/if}
						</span>
					</div>
				</div>
				
				<div class="stat-card">
					<h4>Dimensions</h4>
					<div class="stat-row"><span>Width (X):</span> <strong>{stats.width.toFixed(2)}"</strong></div>
					<div class="stat-row"><span>Height (Y):</span> <strong>{stats.height.toFixed(2)}"</strong></div>
					<div class="stat-row"><span>Depth (Z):</span> <strong>{stats.depth.toFixed(2)}"</strong></div>
				</div>

				<div class="stat-card">
					<h4>Segment Lengths</h4>
					<div class="stat-row"><span>Before Bend:</span> <strong>{stats.beforeBend.toFixed(2)}"</strong></div>
					<div class="stat-row"><span>Active Bends:</span> <strong>{stats.inBend.toFixed(2)}"</strong></div>
					<div class="stat-row"><span>After Bends:</span> <strong>{stats.afterBend.toFixed(2)}"</strong></div>
					<div class="stat-row total"><span>Total Length:</span> <strong>{stats.total.toFixed(2)}"</strong></div>
				</div>

			</div>
		{/if}
	</div>
</div>

<style>
	:global(body) {
		margin: 0;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
		background-color: #121212;
		color: #e0e0e0;
		overflow: hidden;
		touch-action: none;
	}

	.app-layout {
		position: relative;
		width: 100vw;
		height: 100vh;
		display: flex;
		flex-direction: column;
	}

	/* --- Canvas Area --- */
	.canvas-wrapper {
		position: absolute;
		top: 0; left: 0; right: 0;
		transition: bottom 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
		background-color: #1a1a1a;
	}

	.view-toggle {
		position: absolute;
		top: 15px; left: 15px;
		z-index: 10;
		background: rgba(30, 30, 30, 0.85);
		color: #fff;
		border: 1px solid #444;
		padding: 8px 16px;
		border-radius: 20px;
		font-weight: bold;
		backdrop-filter: blur(4px);
		cursor: pointer;
	}

	/* --- Floating Navigation --- */
	.floating-nav {
		position: fixed;
		right: 15px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		z-index: 50;
		transition: bottom 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	.fab {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 10px;
		background: #2a2a2a;
		border: 1px solid #444;
		border-radius: 30px;
		padding: 12px;
		color: white;
		cursor: pointer;
		box-shadow: 0 4px 12px rgba(0,0,0,0.4);
		transition: all 0.2s;
	}

	.fab .label {
		display: none;
		font-weight: 600;
		font-size: 0.9rem;
	}

	.fab.active {
		background: #1e90ff;
		border-color: #1e90ff;
	}

	.fab.active .label {
		display: block;
	}

	.fab .icon {
		font-size: 1.2rem;
		line-height: 1;
	}

	/* --- Bottom Menu Sheet --- */
	.bottom-sheet {
		position: absolute;
		bottom: 0; left: 0; right: 0;
		height: auto;
		max-height: 85vh; /* Failsafe scroll if screen is extremely small */
		background: #1e1e1e;
		border-top-left-radius: 24px;
		border-top-right-radius: 24px;
		box-shadow: 0 -4px 20px rgba(0,0,0,0.5);
		transform: translateY(100%);
		transition: transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
		z-index: 40;
		display: flex;
		flex-direction: column;
		border-top: 1px solid #333;
	}

	.bottom-sheet.open {
		transform: translateY(0);
	}

	.menu-content {
		padding: 16px 20px;
		overflow-y: auto;
		flex: 1;
	}

	.menu-content::-webkit-scrollbar { width: 6px; }
	.menu-content::-webkit-scrollbar-track { background: transparent; }
	.menu-content::-webkit-scrollbar-thumb { background: #444; border-radius: 4px; }

	h3 {
		margin: 0 0 16px 0;
		font-size: 1.2rem;
		color: #1e90ff;
	}

	/* --- Generic Buttons / Selectors --- */
	.section-label {
		display: block;
		font-size: 0.75rem;
		color: #888;
		text-transform: uppercase;
		margin-bottom: 8px;
		letter-spacing: 0.5px;
	}

	.selector-group {
		margin-bottom: 16px;
	}

	.button-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
	}
	.button-grid.sizes {
		grid-template-columns: repeat(auto-fill, minmax(70px, 1fr));
	}

	button {
		background: #2a2a2a;
		color: #e0e0e0;
		border: 1px solid #444;
		border-radius: 8px;
		padding: 10px 8px;
		font-size: 0.95rem;
		cursor: pointer;
		transition: background 0.15s, border-color 0.15s;
		user-select: none;
		-webkit-tap-highlight-color: transparent;
	}
	button:active { background: #333; }
	button.active {
		background: #1e90ff;
		color: white;
		border-color: #1e90ff;
		font-weight: bold;
	}

	/* --- Bending Specific UI --- */
	.bend-header-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 8px;
		gap: 10px;
	}

	.sequence-nav {
		display: flex;
		align-items: center;
		gap: 4px;
		background: #222;
		padding: 2px;
		border-radius: 8px;
		border: 1px solid #333;
	}
	.sequence-nav span {
		font-weight: bold;
		font-size: 0.85rem;
		padding: 0 4px;
		color: #1e90ff;
		white-space: nowrap;
	}
	.sequence-nav button {
		padding: 4px 8px;
		background: #333;
		border: none;
		border-radius: 6px;
	}
	.sequence-nav button:disabled { opacity: 0.3; }
	.sequence-nav .action-btn { font-weight: bold; font-size: 1.1rem; padding: 4px 10px; }
	.sequence-nav .action-btn.del { background: #4a1c1c; color: #ff6b6b; }

	.mark-toggle {
		display: flex;
		gap: 4px;
	}
	.mark-toggle button { padding: 4px 10px; }

	.attribute-tabs {
		display: flex;
		gap: 8px;
		margin-bottom: 8px;
	}
	.attribute-tabs button {
		flex: 1;
		padding: 6px;
		border-radius: 20px;
		font-size: 0.9rem;
	}

	/* --- Custom Drag Pad Slider --- */
	.custom-slider-container {
		margin-bottom: 8px;
	}
	.drag-pad {
		background: #252525;
		border: 2px solid #444;
		border-radius: 12px;
		height: 50px;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		cursor: ew-resize;
		touch-action: none;
		user-select: none;
		transition: border-color 0.2s, background-color 0.2s;
	}
	.drag-pad:focus {
		outline: none;
		border-color: #1e90ff;
		box-shadow: 0 0 0 3px rgba(30, 144, 255, 0.3);
	}
	.drag-pad:active {
		border-color: #1e90ff;
		background: #2a2a2a;
	}
	.drag-value {
		font-size: 1.75rem;
		font-weight: 800;
		color: #fff;
		font-variant-numeric: tabular-nums;
	}

	/* --- Quick Select Grid --- */
	.quick-select-wrapper {
		background: #1a1a1a;
		padding: 8px;
		border-radius: 12px;
		border: 1px solid #333;
	}

	.quick-select {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.quick-select button {
		flex: 1 1 calc(25% - 6px);
		min-width: 50px;
		padding: 8px 4px;
		background: #2c2c2c;
		font-weight: 600;
		font-size: 0.85rem;
	}
	.quick-select .invert-btn {
		background: #4a3f1c;
		color: #ffd700;
		border-color: #ffd700;
		flex-basis: 100%;
	}

	/* --- Stats Styling --- */
	.stats-content {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.stat-card {
		background: #252525;
		padding: 12px 16px;
		border-radius: 12px;
		border: 1px solid #333;
	}
	.stat-card h4 {
		margin: 0 0 10px 0;
		font-size: 0.8rem;
		color: #888;
		text-transform: uppercase;
	}
	.stat-row {
		display: flex;
		justify-content: space-between;
		font-size: 0.95rem;
		margin-bottom: 6px;
	}
	.stat-row:last-child { margin-bottom: 0; }
	.stat-row strong { color: #fff; }
	.stat-row.total {
		margin-top: 8px;
		padding-top: 8px;
		border-top: 1px dashed #555;
		color: #1e90ff;
	}

	@media (min-width: 768px) {
		.quick-select button { flex-basis: calc(12.5% - 6px); }
		.menu-content { padding: 20px 40px; }
	}
</style>