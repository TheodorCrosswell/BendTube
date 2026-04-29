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
	let showGrid = $state(true);

	// Mobile-first layout state
	type MenuType = 'conduit' | 'bending' | 'stats' | 'transform' | 'modify' | null;
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

	// State additions for modify features (Cutting/Coupling)
	let totalLength = $state(120);
	type Coupling = { position: number };
	let couplings = $state<Coupling[]>([]);

	type ModifyMode = 'cut' | 'couple';
	let modifyMode = $state<ModifyMode>('cut');
	let cutPosition = $state(60);
	let coupleEnd = $state<1 | 2>(2);

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

	// Transform state for global positioning
	type TransformAxis = 'posX' | 'posY' | 'posZ' | 'rotX' | 'rotY' | 'rotZ';
	let pipeTransform = $state<Record<TransformAxis, number>>({
		posX: 0, posY: 0, posZ: 0,
		rotX: 0, rotY: 0, rotZ: 0
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
	let dragTarget = '';
	let dragAttr = '';

	function clampValue(target: string, attr: string, val: number) {
		if (target === 'bend') {
			if (attr === 'position') return Math.max(0, Math.min(totalLength, val));
			if (attr === 'angle') return Math.max(-110, Math.min(110, val));
			return Math.max(0, Math.min(360, val)); // rotation
		} else if (target === 'modify') {
			if (attr === 'cutPosition') return Math.max(0, Math.min(totalLength, val));
		}
		// General transforms have no hard clamping constraints
		return val;
	}

	function handlePointerDown(e: PointerEvent, target: string, attr: string) {
		isDragging = true;
		dragStartX = e.clientX;
		dragTarget = target;
		dragAttr = attr;
		
		if (target === 'bend') {
			dragStartValue = bends[activeBendIndex][attr as BendAttribute];
		} else if (target === 'modify') {
			dragStartValue = cutPosition;
		} else {
			dragStartValue = pipeTransform[attr as TransformAxis];
		}
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function handlePointerMove(e: PointerEvent) {
		if (!isDragging) return;
		
		const isPosType = (dragTarget === 'bend' && dragAttr === 'position') || (dragTarget === 'modify' && dragAttr === 'cutPosition') || (dragTarget === 'transform' && dragAttr.startsWith('pos'));
		const sensitivity = isPosType ? 0.1 : 0.5;
		const delta = (e.clientX - dragStartX) * sensitivity;
		
		let newValue = clampValue(dragTarget, dragAttr, dragStartValue + delta);
		
		if (dragTarget === 'bend') {
			bends[activeBendIndex][dragAttr as BendAttribute] = Number(newValue.toFixed(3));
		} else if (dragTarget === 'modify') {
			cutPosition = Number(newValue.toFixed(2));
		} else {
			pipeTransform[dragAttr as TransformAxis] = Number(newValue.toFixed(3));
		}
	}

	function handlePointerUp(e: PointerEvent) {
		isDragging = false;
		(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
	}

	function handleKeyDown(e: KeyboardEvent, target: string, attr: string) {
		const isPosType = attr === 'position' || attr === 'cutPosition' || attr.startsWith('pos');
		const step = isPosType ? 1 : 5;
		
		let current = target === 'bend' ? bends[activeBendIndex][attr as BendAttribute] : 
		              target === 'modify' ? cutPosition : 
					  pipeTransform[attr as TransformAxis];

		if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
			e.preventDefault();
			let val = clampValue(target, attr, current - step);
			if (target === 'bend') bends[activeBendIndex][attr as BendAttribute] = val;
			else if (target === 'modify') cutPosition = val;
			else pipeTransform[attr as TransformAxis] = val;
		} else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
			e.preventDefault();
			let val = clampValue(target, attr, current + step);
			if (target === 'bend') bends[activeBendIndex][attr as BendAttribute] = val;
			else if (target === 'modify') cutPosition = val;
			else pipeTransform[attr as TransformAxis] = val;
		}
	}

	// === Quick Select Handlers ===
	function addPosition(amount: number) {
		bends[activeBendIndex].position = clampValue('bend', 'position', bends[activeBendIndex].position + amount);
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

	function addCutPosition(amount: number) {
		cutPosition = clampValue('modify', 'cutPosition', cutPosition + amount);
	}

	function executeCut() {
		totalLength = cutPosition;
		let newBends = bends.filter(b => b.position <= totalLength);
		if (newBends.length === 0) newBends = [{ angle: 0, rotation: 0, position: totalLength / 2, mark: 'star' }];
		bends = newBends;
		
		if (activeBendIndex >= bends.length) activeBendIndex = Math.max(0, bends.length - 1);
		
		couplings = couplings.filter(c => c.position <= totalLength);
		cutPosition = Math.min(cutPosition, totalLength);
	}

	function executeCouple() {
		if (coupleEnd === 1) {
			bends = bends.map(b => ({ ...b, position: b.position + 120 }));
			couplings = [
				...couplings.map(c => ({ position: c.position + 120 })),
				{ position: 120 }
			];
			totalLength += 120;
			cutPosition += 120;
		} else {
			couplings = [...couplings, { position: totalLength }];
			totalLength += 120;
		}
	}
</script>

<div class="app-layout">
	<!-- Top: 3D Canvas Area (Flexes to fill remaining space dynamically) -->
	<div class="canvas-wrapper" style="bottom: {activeMenu ? menuHeight + 'px' : '0'}">
		<!-- Global View & Tool Toggles Floating Top Left -->
		<div class="top-left-controls">
			<button class="view-toggle" onclick={() => (isOrthographic = !isOrthographic)}>
				{isOrthographic ? 'Orthographic' : 'Perspective'}
			</button>
			<button class="view-toggle" onclick={() => (showGrid = !showGrid)}>
				{showGrid ? 'Hide Grid' : 'Show Grid'}
			</button>
		</div>

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
					bind:pipeTransform
					{totalLength}
					{couplings}
					cutMode={activeMenu === 'modify' && modifyMode === 'cut'}
					{cutPosition}
					coupleMode={activeMenu === 'modify' && modifyMode === 'couple'}
					{coupleEnd}
					{showGrid}
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
		<button class="fab" class:active={activeMenu === 'modify'} onclick={() => activeMenu = activeMenu === 'modify' ? null : 'modify'}>
			<span class="icon">✂️</span>
			<span class="label">Modify</span>
		</button>
		<button class="fab" class:active={activeMenu === 'transform'} onclick={() => activeMenu = activeMenu === 'transform' ? null : 'transform'}>
			<span class="icon">🕹️</span>
			<span class="label">Position</span>
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
						aria-valuemax={activeAttribute === 'position' ? totalLength : activeAttribute === 'angle' ? 110 : 360}
						onpointerdown={(e) => handlePointerDown(e, 'bend', activeAttribute)} 
						onpointermove={handlePointerMove} 
						onpointerup={handlePointerUp}
						onpointercancel={handlePointerUp}
						onpointerleave={handlePointerUp}
						onkeydown={(e) => handleKeyDown(e, 'bend', activeAttribute)}
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

		{:else if renderedMenu === 'modify'}
			<div class="menu-content">
				<h3>Modify Length</h3>

				<!-- Attribute Tabs -->
				<div class="attribute-tabs" style="margin-bottom: 12px;">
					<button class:active={modifyMode === 'cut'} onclick={() => modifyMode = 'cut'}>✂️ Cut</button>
					<button class:active={modifyMode === 'couple'} onclick={() => modifyMode = 'couple'}>🔗 Couple</button>
				</div>

				{#if modifyMode === 'cut'}
					<div class="custom-slider-container">
						<div 
							class="drag-pad" 
							role="slider"
							tabindex="0"
							aria-label="Cut Position"
							aria-valuenow={cutPosition}
							aria-valuemin={0}
							aria-valuemax={totalLength}
							onpointerdown={(e) => handlePointerDown(e, 'modify', 'cutPosition')} 
							onpointermove={handlePointerMove} 
							onpointerup={handlePointerUp}
							onpointercancel={handlePointerUp}
							onpointerleave={handlePointerUp}
							onkeydown={(e) => handleKeyDown(e, 'modify', 'cutPosition')}
						>
							<div class="drag-value">
								{cutPosition.toFixed(2)}"
							</div>
						</div>
					</div>

					<div class="quick-select-wrapper">
						<div class="quick-select">
							<button onclick={() => addCutPosition(12)}>+12"</button>
							<button onclick={() => addCutPosition(1)}>+1"</button>
							<button onclick={() => addCutPosition(-12)}>-12"</button>
							<button onclick={() => addCutPosition(-1)}>-1"</button>
							<button onclick={() => addCutPosition(0.125)}>+1/8"</button>
							<button onclick={() => addCutPosition(-0.125)}>-1/8"</button>
						</div>
					</div>

					<button class="action-btn" style="width: 100%; margin-top: 12px; background: #cc0000; color: white; padding: 12px; font-weight: bold; border-radius: 8px; border: none; font-size: 1.1rem; cursor: pointer;" onclick={executeCut}>
						CUT PIPE
					</button>

				{:else if modifyMode === 'couple'}
					<div class="selector-group" style="margin-top: 12px;">
						<div class="section-label">Select End to Couple</div>
						<div class="button-grid" style="grid-template-columns: 1fr 1fr;">
							<button class:active={coupleEnd === 1} onclick={() => coupleEnd = 1}>End 1 (Start)</button>
							<button class:active={coupleEnd === 2} onclick={() => coupleEnd = 2}>End 2 (End)</button>
						</div>
					</div>

					<button class="action-btn" style="width: 100%; margin-top: 12px; background: #1e90ff; color: white; padding: 12px; font-weight: bold; border-radius: 8px; border: none; font-size: 1.1rem; cursor: pointer;" onclick={executeCouple}>
						ADD 10FT SECTION
					</button>
				{/if}
			</div>

		{:else if renderedMenu === 'transform'}
			<div class="menu-content">
				<h3>Space Transform</h3>
				
				<div class="transform-grid">
					<!-- Position Drag Pads -->
					<div class="transform-column">
						<div class="section-label">Translation (Inches)</div>
						{#each ['X', 'Y', 'Z'] as axis}
							{@const posKey = `pos${axis}` as TransformAxis}
							<div class="custom-slider-container mini">
								<div class="drag-pad"
									role="slider" tabindex="0"
									onpointerdown={(e) => handlePointerDown(e, 'transform', posKey)}
									onpointermove={handlePointerMove}
									onpointerup={handlePointerUp}
									onpointercancel={handlePointerUp}
									onpointerleave={handlePointerUp}
									onkeydown={(e) => handleKeyDown(e, 'transform', posKey)}
								>
									<span class="drag-label">{axis}</span>
									<div class="drag-value mini-val">{pipeTransform[posKey].toFixed(1)}"</div>
								</div>
								<button class="reset-btn" onclick={() => pipeTransform[posKey] = 0} aria-label="Reset {axis} Position" title="Reset to 0">↺</button>
							</div>
						{/each}
					</div>

					<!-- Rotation Drag Pads -->
					<div class="transform-column">
						<div class="section-label">Rotation (Degrees)</div>
						{#each ['X', 'Y', 'Z'] as axis}
							{@const rotKey = `rot${axis}` as TransformAxis}
							<div class="custom-slider-container mini">
								<div class="drag-pad"
									role="slider" tabindex="0"
									onpointerdown={(e) => handlePointerDown(e, 'transform', rotKey)}
									onpointermove={handlePointerMove}
									onpointerup={handlePointerUp}
									onpointercancel={handlePointerUp}
									onpointerleave={handlePointerUp}
									onkeydown={(e) => handleKeyDown(e, 'transform', rotKey)}
								>
									<span class="drag-label">{axis}</span>
									<div class="drag-value mini-val">{Math.round(pipeTransform[rotKey])}&deg;</div>
								</div>
								<button class="reset-btn" onclick={() => pipeTransform[rotKey] = 0} aria-label="Reset {axis} Rotation" title="Reset to 0">↺</button>
							</div>
						{/each}
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

	.top-left-controls {
		position: absolute;
		top: 15px; left: 15px;
		z-index: 10;
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}

	.view-toggle {
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

	/* --- Mini Transform Drag Pads --- */
	.transform-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
	}
	.transform-column {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.custom-slider-container.mini {
		margin-bottom: 0;
		display: flex;
		gap: 8px;
	}
	.custom-slider-container.mini .drag-pad {
		flex: 1;
		height: 42px;
		flex-direction: row;
		justify-content: space-between;
		padding: 0 16px;
	}
	.custom-slider-container.mini .drag-value.mini-val {
		font-size: 1.15rem;
	}
	.drag-label {
		color: #1e90ff;
		font-weight: 800;
		font-size: 1rem;
	}
	
	/* Individual Reset Button for Transform */
	.reset-btn {
		width: 42px;
		height: 42px;
		flex-shrink: 0;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.4rem;
		border-radius: 12px;
		color: #888;
		transition: all 0.2s;
	}
	.reset-btn:hover, .reset-btn:active {
		color: #1e90ff;
		border-color: #1e90ff;
		background: rgba(30, 144, 255, 0.1);
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