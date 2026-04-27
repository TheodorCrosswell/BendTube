<!-- src/routes/+page.svelte -->
<script lang="ts">
	import { Canvas } from '@threlte/core';
	import * as THREE from 'three';
	import BenderScene from './BenderScene.svelte';
	import { browser } from '$app/environment';
	import conduitData from '$lib/data/conduit-sizes.json';

	type Bend = { angle: number; rotation: number; position: number };
	let bends = $state<Bend[]>([{ angle: 0, rotation: 0, position: 60 }]);
	let activeBendIndex = $state(0);

	let isOrthographic = $state(false);

	let leftPanelOpen = $state(true);
	let rightPanelOpen = $state(true);

	const standards = conduitData.conduit_standards;
	const conduitTypes = ['EMT', 'IMC', 'Rigid'] as const;

	let selectedType = $state<(typeof conduitTypes)[number]>('EMT');
	let sizesForType = $derived(standards[selectedType]);
	let availableSizes = $derived(sizesForType.map((s) => s.trade_size));
	let selectedSize = $state('1/2');
	let bendMark = $state<'star' | 'arrow'>('star');

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
		depth: 0
	});

	const quickAngles = [10, 22.5, 30, 45, 60, 90];
	const quickRotations = [0, 90, 180, 270];
</script>

<div class="simulator-container">
	<button
		class="panel-toggle left"
		onclick={() => (leftPanelOpen = true)}
		class:hidden={leftPanelOpen}
	>
		⚙️ Controls
	</button>
	<button
		class="panel-toggle right"
		onclick={() => (rightPanelOpen = true)}
		class:hidden={rightPanelOpen}
	>
		📊 Stats
	</button>

	<div class="ui-panel left-panel" class:open={leftPanelOpen}>
		<div class="panel-header">
			<h1>Conduit Bender</h1>
			<button class="close-btn" onclick={() => (leftPanelOpen = false)} title="Close">✕</button>
		</div>
		<p>Click and drag the handle, or use the sliders.</p>

		<!-- Multi-bend Control Dashboard -->
		<div class="bend-navigation selector-group">
			<h4>Bend Sequence</h4>
			<div class="bend-controls-row">
				<button disabled={activeBendIndex === 0} onclick={() => activeBendIndex--}>
					&larr; Prev
				</button>
				<span class="bend-count">Bend {activeBendIndex + 1} of {bends.length}</span>
				<button disabled={activeBendIndex === bends.length - 1} onclick={() => activeBendIndex++}>
					Next &rarr;
				</button>
			</div>
			<div class="bend-actions-row">
				<button
					onclick={() => {
						bends.push({ angle: 0, rotation: 0, position: 60 });
						activeBendIndex = bends.length - 1;
					}}
				>
					+ New Bend
				</button>
				<button
					disabled={bends.length === 1}
					onclick={() => {
						bends.splice(activeBendIndex, 1);
						if (activeBendIndex >= bends.length) activeBendIndex = Math.max(0, bends.length - 1);
					}}
					class="delete-btn"
				>
					- Delete Bend
				</button>
			</div>
		</div>

		<!-- Conduit Type Selection -->
		<div class="selector-group">
			<h4>Conduit Type</h4>
			<div class="button-row">
				{#each conduitTypes as type (type)}
					<button class:active={selectedType === type} onclick={() => (selectedType = type)}>
						{type}
					</button>
				{/each}
			</div>
		</div>

		<!-- Trade Size Selection -->
		<div class="selector-group">
			<h4>Trade Size</h4>
			<div class="button-row flex-wrap">
				{#each availableSizes as size (size)}
					<button class:active={selectedSize === size} onclick={() => (selectedSize = size)}>
						{size}"
					</button>
				{/each}
			</div>
		</div>

		<!-- Bend Mark Selection -->
		<div class="selector-group">
			<h4>Bend Mark</h4>
			<div class="button-row">
				<button class:active={bendMark === 'star'} onclick={() => (bendMark = 'star')}>
					Star Mark
				</button>
				<button class:active={bendMark === 'arrow'} onclick={() => (bendMark = 'arrow')}>
					Arrow Mark
				</button>
			</div>
		</div>

		<!-- Position & Angle Controls Bound Seamlessly to Multi-bend Proxy -->
		<div class="controls-group">
			<div class="control-row">
				<label
					>Bend Start Position
					<div class="slider-container">
						<input
							type="range"
							min="0"
							max="120"
							step="0.1"
							bind:value={bends[activeBendIndex].position}
						/>
						<span class="val-display">{bends[activeBendIndex].position.toFixed(1)}"</span>
					</div>
				</label>
			</div>

			<div class="control-row">
				<label
					>Bend Angle
					<div class="slider-container">
						<input type="range" min="-110" max="110" bind:value={bends[activeBendIndex].angle} />
						<span class="val-display">{Math.round(bends[activeBendIndex].angle)}&deg;</span>
					</div>
				</label>

				<!-- Quick Select Buttons -->
				<div class="quick-angles button-row flex-wrap">
					{#each quickAngles as angle (angle)}
						<button
							class:active={bends[activeBendIndex].angle === angle}
							onclick={() => (bends[activeBendIndex].angle = angle)}
						>
							{angle}&deg;
						</button>
					{/each}
				</div>
			</div>

			<div class="control-row">
				<label
					>Bend Rotation (Roll)
					<div class="slider-container">
						<input type="range" min="0" max="360" bind:value={bends[activeBendIndex].rotation} />
						<span class="val-display">{Math.round(bends[activeBendIndex].rotation)}&deg;</span>
					</div>
				</label>

				<!-- Quick Select Buttons for Orientation -->
				<div class="quick-angles button-row flex-wrap">
					{#each quickRotations as rot (rot)}
						<button
							class:active={bends[activeBendIndex].rotation === rot}
							onclick={() => (bends[activeBendIndex].rotation = rot)}
						>
							{rot}&deg;
						</button>
					{/each}
				</div>
			</div>
		</div>

		<button class="view-toggle" onclick={() => (isOrthographic = !isOrthographic)}>
			Switch to {isOrthographic ? 'Perspective' : 'Orthographic'} View
		</button>
	</div>

	<div class="ui-panel right-panel" class:open={rightPanelOpen}>
		<div class="panel-header">
			<h3 class="stats-title">Live 3D Geometry Analysis</h3>
			<button class="close-btn" onclick={() => (rightPanelOpen = false)} title="Close">✕</button>
		</div>

		<div class="stat-section">
			<h4>Segment Lengths</h4>
			<div class="stat-row">
				<span>Before Bend:</span> <span>{stats.beforeBend.toFixed(2)}"</span>
			</div>
			<div class="stat-row">
				<span>Total Active Bend Length:</span> <span>{stats.inBend.toFixed(2)}"</span>
			</div>
			<div class="stat-row">
				<span>After Bends:</span> <span>{stats.afterBend.toFixed(2)}"</span>
			</div>
			<div class="stat-row total">
				<span>Total Length:</span> <span>{stats.total.toFixed(2)}"</span>
			</div>
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
				bind:bends
				bind:activeBendIndex
				{isOrthographic}
				{outerDiameter}
				conduitSize={selectedSize}
				conduitType={selectedType}
				{bendMark}
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
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
		transition: all 0.3s ease;
	}
	.panel-toggle:hover {
		background: #555;
	}
	.panel-toggle.left {
		top: 20px;
		left: 20px;
	}
	.panel-toggle.right {
		top: 20px;
		right: 20px;
	}
	.panel-toggle.hidden {
		opacity: 0;
		visibility: hidden;
		pointer-events: none;
	}

	.ui-panel {
		position: absolute;
		z-index: 10;
		color: white;
		padding: 1.5rem;
		border-radius: 12px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
		border: 1px solid #333;
		pointer-events: auto;
		width: 330px;
		box-sizing: border-box;
		max-height: calc(100vh - 40px);
		overflow-y: auto;
		transition:
			transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1),
			opacity 0.35s ease;
	}
	.ui-panel::-webkit-scrollbar {
		width: 6px;
	}
	.ui-panel::-webkit-scrollbar-thumb {
		background: #555;
		border-radius: 3px;
	}

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

	.ui-panel.right-panel {
		top: 20px;
		right: 20px;
		background: rgba(20, 20, 20, 0.6);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		transform: translateX(120%);
		opacity: 0;
	}
	.ui-panel.right-panel.open {
		transform: translateX(0);
		opacity: 1;
	}

	.panel-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 0.5rem;
	}
	.panel-header h1 {
		margin: 0;
		font-size: 1.25rem;
		color: #1e90ff;
	}
	.stats-title {
		margin: 0;
		font-size: 1rem;
		color: #4caf50;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

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
	.close-btn:hover {
		color: #fff;
		background: rgba(255, 255, 255, 0.1);
	}

	p {
		margin: 0 0 1rem 0;
		font-size: 0.85rem;
		color: #aaa;
	}

	/* --- Multi-Bend Controls --- */
	.bend-controls-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
		gap: 0.5rem;
	}
	.bend-controls-row button {
		background: #333;
		border: 1px solid #555;
		color: white;
		padding: 0.4rem 0.6rem;
		border-radius: 4px;
		cursor: pointer;
		flex: 1;
		transition: all 0.2s;
	}
	.bend-controls-row button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.bend-controls-row button:hover:not(:disabled) {
		background: #444;
	}
	.bend-count {
		font-size: 0.85rem;
		font-weight: bold;
		color: #1e90ff;
		text-align: center;
		white-space: nowrap;
		flex: 2;
	}

	.bend-actions-row {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}
	.bend-actions-row button {
		background: #222;
		border: 1px solid #444;
		color: #fff;
		padding: 0.4rem;
		border-radius: 4px;
		cursor: pointer;
		flex: 1;
		font-size: 0.8rem;
	}
	.bend-actions-row button:hover:not(:disabled) {
		background: #333;
	}
	.bend-actions-row button.delete-btn:hover:not(:disabled) {
		background: #aa0000;
		border-color: #ff0000;
	}
	.bend-actions-row button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.selector-group {
		margin-bottom: 1rem;
	}
	.selector-group h4 {
		margin: 0 0 0.5rem 0;
		font-size: 0.8rem;
		color: #aaa;
		text-transform: uppercase;
	}

	.button-row {
		display: flex;
		gap: 0.4rem;
	}
	.button-row.flex-wrap {
		flex-wrap: wrap;
	}

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
	.button-row.flex-wrap button {
		flex: unset;
		min-width: 45px;
	}
	.button-row button:hover {
		background: #444;
	}
	.button-row button.active {
		background: #1e90ff;
		border-color: #1e90ff;
		font-weight: bold;
	}

	.controls-group {
		margin-top: 1.5rem;
		padding-top: 1rem;
		border-top: 1px solid #444;
	}
	.control-row {
		margin-bottom: 1rem;
	}
	.control-row label {
		display: block;
		font-size: 0.8rem;
		color: #aaa;
		text-transform: uppercase;
		margin-bottom: 0.3rem;
	}
	.slider-container {
		display: flex;
		align-items: center;
		gap: 1rem;
	}
	input[type='range'] {
		flex-grow: 1;
		cursor: pointer;
	}
	.val-display {
		font-weight: bold;
		min-width: 45px;
		text-align: right;
		color: #fff;
	}
	.quick-angles {
		margin-top: 0.6rem;
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

	.stat-section {
		margin-top: 1rem;
		background: rgba(0, 0, 0, 0.2);
		padding: 0.75rem;
		border-radius: 6px;
	}
	.stat-section h4 {
		margin: 0 0 0.5rem 0;
		font-size: 0.8rem;
		color: #888;
		text-transform: uppercase;
	}

	.stat-row {
		display: flex;
		justify-content: space-between;
		font-size: 0.9rem;
		margin-bottom: 0.35rem;
		color: #ddd;
	}
	.stat-row:last-child {
		margin-bottom: 0;
	}
	.stat-row.total {
		margin-top: 0.5rem;
		padding-top: 0.5rem;
		border-top: 1px dashed #555;
		font-weight: bold;
		color: #fff;
	}

	@media (max-width: 768px) {
		.ui-panel {
			width: auto;
			left: 15px;
			right: 15px;
			max-height: 45vh;
			padding: 1.2rem;
		}
		.ui-panel.left-panel {
			top: 15px;
			transform: translateY(-120%);
		}
		.ui-panel.left-panel.open {
			transform: translateY(0);
		}
		.ui-panel.right-panel {
			top: auto;
			bottom: 15px;
			transform: translateY(120%);
		}
		.ui-panel.right-panel.open {
			transform: translateY(0);
		}
		.panel-toggle.left {
			top: 15px;
			left: 15px;
		}
		.panel-toggle.right {
			top: auto;
			bottom: 15px;
			right: 15px;
		}
	}
</style>
