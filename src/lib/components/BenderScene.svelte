<script lang="ts">
	import { T } from '@threlte/core';
	import { OrbitControls, Grid, interactivity } from '@threlte/extras';
	import * as THREE from 'three';

	import type { BenderSceneProps } from '$lib/types/bender';
	import { ConduitCurve } from '$lib/math/ConduitCurve';
	import { generateConduitTexture } from '$lib/utils/conduitTexture';
	import { getBenderDeduction } from '$lib/utils/benderDeduction';

	let {
		bends = $bindable([{ angle: 0, rotation: 0, position: 60, mark: 'star' }]),
		activeBendIndex = $bindable(0),
		isOrthographic = false,
		outerDiameter = 0.706,
		conduitSize = '1/2',
		conduitType = 'EMT',
		// eslint-disable-next-line no-useless-assignment
		stats = $bindable({
			beforeBend: 0,
			inBend: 0,
			afterBend: 0,
			total: 0,
			width: 0,
			height: 0,
			depth: 0,
			totalDegrees: 0
		})
	}: BenderSceneProps = $props();

	interactivity();

	let tubeGeom = $state<THREE.TubeGeometry | undefined>(undefined);

	let pipeRadius = $derived(outerDiameter / 2);
	let bendRadius = $derived(pipeRadius * 10);
	let toolScaleFactor = $derived(bendRadius / 4);

	// Calculate bender deduction accurately based on selected conduit size
	let deduction = $derived(getBenderDeduction(conduitSize));

	// --- Dynamic Canvas Texture for Conduit Text ---
	let textTexture = $derived(generateConduitTexture(conduitSize, conduitType));

	// --- Dragging Logic ---
	let isDragging = $state(false);
	let startX = $state(0);
	let startY = $state(0);
	let startAngle = $state(0);

	const onPointerDown = (e: PointerEvent) => {
		if (!bends[activeBendIndex]) return;
		isDragging = true;
		startX = e.clientX;
		startY = e.clientY;
		startAngle = bends[activeBendIndex].angle;
		document.body.style.cursor = 'grabbing';
		e.stopPropagation();
	};

	const onPointerMove = (e: PointerEvent) => {
		if (!isDragging || !bends[activeBendIndex]) return;
		const deltaX = e.clientX - startX;
		const deltaY = e.clientY - startY;

		// Adjust drag direction to feel intuitive depending on the bender alignment
		const movement = bends[activeBendIndex].mark === 'arrow' ? -deltaX + deltaY : deltaX + deltaY;

		let newAngle = startAngle + movement * 0.4;
		bends[activeBendIndex].angle = Math.max(-110, Math.min(newAngle, 110));
	};

	const onPointerUp = () => {
		if (isDragging) {
			isDragging = false;
			document.body.style.cursor = 'default';
		}
	};

	// --- Dynamic Math: Sequential Frenet Frame Conduit Path ---
	let curve = $derived(new ConduitCurve(bends, bendRadius, pipeRadius, deduction));

	// Calculate and align mathematical frame tracking properties to global geometry
	let activeBendFrame = $derived.by(() => {
		const activeUIBend = bends[activeBendIndex];
		if (!activeUIBend) return undefined;
		return curve.bendFrames.find((f) => f.bend.originalBend === activeUIBend);
	});

	let toolPos = $derived.by(() => {
		if (!activeBendFrame) return [0, 0, 0] as [number, number, number];
		return [activeBendFrame.center.x, activeBendFrame.center.y, activeBendFrame.center.z] as [
			number,
			number,
			number
		];
	});

	let toolQuat = $derived.by(() => {
		if (!activeBendFrame) return new THREE.Quaternion();
		// Compute absolute global transform orientations from tracking binormals
		const qBase = new THREE.Quaternion().setFromRotationMatrix(
			new THREE.Matrix4().makeBasis(
				activeBendFrame.dir,
				activeBendFrame.n,
				activeBendFrame.binormal
			)
		);

		let localEuler: THREE.Euler;
		if (activeBendFrame.bend.originalBend.mark === 'star') {
			// Star mark: tool faces backward, handle visually maps negative angle
			localEuler = new THREE.Euler(0, Math.PI, -activeBendFrame.bend.angleRad, 'XYZ');
		} else {
			// Arrow mark: tool aligns straight tracking forward, anchored entirely at the start of the curve
			localEuler = new THREE.Euler(0, 0, 0, 'XYZ');
		}

		const localQuat = new THREE.Quaternion().setFromEuler(localEuler);
		return qBase.multiply(localQuat);
	});

	// --- Exact Performance Calculation ---
	$effect(() => {
		if (!tubeGeom) return;

		tubeGeom.computeBoundingBox();
		const box = tubeGeom.boundingBox;
		const size = new THREE.Vector3();
		if (box) box.getSize(size);

		let lenBend = 0;
		let totalDeg = 0;
		for (const frame of curve.bendFrames) {
			lenBend += frame.bend.arcLen;
			totalDeg += frame.bend.angleDeg;
		}

		const sortedFrames = [...curve.bendFrames].sort((a, b) => a.L1 - b.L1);
		let beforeBend = 120;
		let afterBend = 0;

		if (sortedFrames.length > 0) {
			beforeBend = Math.max(0, sortedFrames[0].L1);
			const lastFrame = sortedFrames[sortedFrames.length - 1];
			afterBend = Math.max(0, 120 - (lastFrame.L1 + lastFrame.bend.arcLen));
		}

		stats = {
			beforeBend,
			inBend: lenBend,
			afterBend,
			total: beforeBend + lenBend + afterBend,
			width: size.x,
			height: size.y,
			depth: size.z,
			totalDegrees: totalDeg
		};
	});
</script>

<svelte:window onpointermove={onPointerMove} onpointerup={onPointerUp} />

{#if isOrthographic}
	<T.OrthographicCamera makeDefault position={[60, 10, 100]} zoom={10}>
		<OrbitControls target={[60, 5, 0]} enabled={!isDragging} />
	</T.OrthographicCamera>
{:else}
	<T.PerspectiveCamera makeDefault position={[60, 10, 100]} fov={45}>
		<OrbitControls target={[60, 5, 0]} enabled={!isDragging} />
	</T.PerspectiveCamera>
{/if}

<Grid
	gridSize={[120, 120]}
	sectionSize={12}
	cellSize={1}
	position={[60, 0, 0]}
	sectionColor="#888888"
	cellColor="#444444"
	fadeDistance={250}
/>
<Grid
	gridSize={[120, 120]}
	sectionSize={12}
	cellSize={1}
	position={[60, 60, 0]}
	rotation.x={Math.PI / 2}
	sectionColor="#888888"
	cellColor="#444444"
	fadeDistance={250}
/>
<Grid
	gridSize={[120, 120]}
	sectionSize={12}
	cellSize={1}
	position={[60, 60, 0]}
	rotation.z={Math.PI / 2}
	sectionColor="#888888"
	cellColor="#444444"
	fadeDistance={250}
/>

<T.Mesh>
	<T.TubeGeometry bind:ref={tubeGeom} args={[curve, 100, pipeRadius, 12, false]} />
	<T.MeshBasicMaterial color={textTexture ? '#ffffff' : '#999999'} map={textTexture || null} />
</T.Mesh>

<!-- Bender Tool Anchor mapped perfectly inside multiple sequential tracking coordinates -->
{#if activeBendFrame}
	<T.Group position={toolPos} quaternion={toolQuat.toArray()} scale={toolScaleFactor}>
		<T.Mesh rotation.z={-Math.PI / 2}>
			<T.TorusGeometry args={[4, 0.45, 16, 32, Math.PI / 2 + 0.1]} />
			<T.MeshBasicMaterial color="#1e90ff" />
		</T.Mesh>

		<T.Group
			rotation.z={Math.PI / 6}
			onpointerdown={onPointerDown}
			onpointerenter={() => (document.body.style.cursor = 'grab')}
			onpointerleave={() => {
				if (!isDragging) document.body.style.cursor = 'default';
			}}
		>
			<T.Mesh position={[0, 4, 0]}>
				<T.CylinderGeometry args={[0.15, 0.15, 16, 8]} />
				<T.MeshBasicMaterial color="#333333" />
			</T.Mesh>

			<T.Mesh position={[0, 11, 0]}>
				<T.CylinderGeometry args={[0.2, 0.2, 2, 8]} />
				<T.MeshBasicMaterial color="#cc0000" />
			</T.Mesh>
		</T.Group>
	</T.Group>
{/if}