<!-- src/lib/components/BenderScene.svelte -->
<script lang="ts">
	import { T } from '@threlte/core';
	import { OrbitControls, Grid, interactivity, HTML } from '@threlte/extras';
	import * as THREE from 'three';

	import type { BenderSceneProps } from '$lib/types/bender';
	import { ConduitCurve } from '$lib/math/ConduitCurve';
	import { generateConduitTexture } from '$lib/utils/conduitTexture';
	import { getBenderDeduction } from '$lib/utils/benderDeduction';
	import conduitSizes from '$lib/data/conduit-sizes.json';

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

	// Strictly typed camera references to fix assignment errors
	let orthoCameraRef = $state<THREE.OrthographicCamera | undefined>(undefined);
	let perspCameraRef = $state<THREE.PerspectiveCamera | undefined>(undefined);
	let cameraRef = $derived(isOrthographic ? orthoCameraRef : perspCameraRef);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let controlsRef = $state<any>(undefined);

	let pipeRadius = $derived(outerDiameter / 2);
	let bendRadius = $derived(pipeRadius * 10);
	let toolScaleFactor = $derived(bendRadius / 4);

	// Calculate bender deduction accurately based on selected conduit size
	let deduction = $derived(getBenderDeduction(conduitSize));

	// --- Dynamic Canvas Texture for Conduit Text ---
	let textTexture = $derived(generateConduitTexture(conduitSize, conduitType));

	// --- Dynamic Math: Sequential Frenet Frame Conduit Path ---
	let curve = $derived(new ConduitCurve(bends, bendRadius, pipeRadius, deduction));

	// --- Precise Visual Marks for Bends ---
	let marks = $derived.by(() => {
		return bends.map((bend, index) => {
			const t = bend.position / curve.totalLen;
			const pos = curve.getPoint(t);

			// Step slightly forward to get an accurate localized tangent for precise ring rotations
			const pos2 = curve.getPoint(t + 0.001);
			const tangent = new THREE.Vector3().subVectors(pos2, pos).normalize();

			if (tangent.lengthSq() === 0) {
				tangent.set(1, 0, 0);
			}

			// Cylinder geometry naturally aligns with the Y axis, so we project it alongside the tangent vector
			const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);

			return {
				index,
				pos: pos.toArray() as [number, number, number],
				quat: quat.toArray() as [number, number, number, number]
			};
		});
	});

	// --- Kick & Length Measurement Overlay Logic ---
	function createCylinderLine(p1: [number, number, number], p2: [number, number, number]) {
		const vA = new THREE.Vector3(...p1);
		const vB = new THREE.Vector3(...p2);
		const distance = vA.distanceTo(vB);
		const midPoint = vA.clone().lerp(vB, 0.5).toArray();
		const direction = vB.clone().sub(vA).normalize();
		
		// Fallback for zero distance
		if (distance < 0.001) direction.set(0, 1, 0);
		
		const quaternion = new THREE.Quaternion()
			.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction)
			.toArray();

		return { position: midPoint, quaternion, length: distance };
	}

	let kickMeasurements = $derived.by(() => {
		const measurements = [];
		// Sort frames to ensure chronological measurements from start to finish
		const sortedFrames = [...curve.bendFrames].sort((a, b) => a.L1 - b.L1);

		for (let i = 0; i < sortedFrames.length; i++) {
			const frame = sortedFrames[i];
			// Ignore completely straight segments
			if (Math.abs(frame.bend.angleRad) < 0.01) continue;

			const dir0 = frame.dir.clone().normalize();
			const n0 = frame.n.clone().normalize();
			const binormal = frame.binormal.clone().normalize();
			const angleRad = frame.bend.angleRad;
			
			// Compute normals and forward direction for the newly generated straight section
			const n1 = n0.clone().applyAxisAngle(binormal, angleRad).normalize();
			const dir1 = dir0.clone().applyAxisAngle(binormal, angleRad).normalize();

			// Anchor the beginning of the measurement frame to the exact start of the current bend
			const tStart = frame.L1 / curve.totalLen;
			const p0_center = curve.getPoint(tStart);

			// Find the end of the straight section following the bend (either the next *actual* bend or the tube end)
			let nextFrame = undefined;
			for (let j = i + 1; j < sortedFrames.length; j++) {
				if (Math.abs(sortedFrames[j].bend.angleRad) >= 0.01) {
					nextFrame = sortedFrames[j];
					break;
				}
			}
			
			let p1_center;
			if (nextFrame) {
				const tEndNext = nextFrame.L1 / curve.totalLen;
				const pStartNext = curve.getPoint(tEndNext);
				
				// Extend the measurement point forward to the centerline intersection vertex of the next bend
				// This ensures we measure to the physical outer edge ("back") of the next bend
				const distToVertex = bendRadius * Math.tan(Math.abs(nextFrame.bend.angleRad) / 2);
				p1_center = pStartNext.clone().add(dir1.clone().multiplyScalar(distToVertex));
			} else {
				p1_center = curve.getPoint(1);
			}

			// Compute the exact outer conduit edges for both segments (pushing outwards in reverse normal direction)
			const p0_outer = p0_center.clone().add(n0.clone().multiplyScalar(-pipeRadius));
			const p1_outer = p1_center.clone().add(n1.clone().multiplyScalar(-pipeRadius));

			// Find where the end point projects directly down onto the initial segment's extended baseline
			const diff = p1_outer.clone().sub(p0_outer);
			const projectionDistance = diff.dot(dir0);
			const pProj = p0_outer.clone().add(dir0.clone().multiplyScalar(projectionDistance));

			// Push the entire dimension line drawing outwards visually so it doesn't clip the 3D conduit
			const visualOffset = n0.clone().multiplyScalar(-4); // 4 inches away from outer edge

			const v_p0 = p0_outer.clone().add(visualOffset);
			const v_pProj = pProj.clone().add(visualOffset);
			const heightVec = p1_outer.clone().sub(pProj);
			const v_p1_shifted = v_pProj.clone().add(heightVec);

			const height = heightVec.length();

			if (height >= 0.1) {
				measurements.push({
					id: `bend-kick-${i}`,
					lines: [
						createCylinderLine(v_p0.toArray(), v_pProj.toArray()), // Baseline
						createCylinderLine(v_pProj.toArray(), v_p1_shifted.toArray()), // Height line
						createCylinderLine(p0_outer.toArray(), v_p0.toArray()), // Extension Line 1
						createCylinderLine(p1_outer.toArray(), v_p1_shifted.toArray()) // Extension Line 2
					],
					labelPos: v_pProj
						.clone()
						.add(heightVec.clone().multiplyScalar(0.5))
						.toArray() as [number, number, number],
					height: height
				});
			}
		}

		return measurements;
	});

	// --- Straight Section Measurements ---
	let straightMeasurements = $derived.by(() => {
		const measurements = [];
		const sortedFrames = [...curve.bendFrames].sort((a, b) => a.L1 - b.L1);
		const validFrames = sortedFrames.filter((f) => Math.abs(f.bend.angleRad) >= 0.01);
		
		const numSections = validFrames.length + 1;

		for (let i = 0; i < numSections; i++) {
			let pStart_center: THREE.Vector3;
			let pEnd_center: THREE.Vector3;
			let dir: THREE.Vector3;
			let binormal: THREE.Vector3;

			// Determine mathematical starting edge of this straight section
			if (i === 0) {
				pStart_center = curve.getPoint(0);
				if (validFrames.length > 0) {
					dir = validFrames[0].dir.clone().normalize();
					binormal = validFrames[0].binormal.clone().normalize();
				} else {
					dir = new THREE.Vector3(1, 0, 0);
					binormal = new THREE.Vector3(0, 0, 1);
				}
			} else {
				const prevFrame = validFrames[i - 1];
				const tPhysicalStart = (prevFrame.L1 + prevFrame.bend.arcLen) / curve.totalLen;
				const pPhysicalStart = curve.getPoint(tPhysicalStart);
				
				binormal = prevFrame.binormal.clone().normalize();
				dir = prevFrame.dir.clone().applyAxisAngle(binormal, prevFrame.bend.angleRad).normalize();
				
				// Extend the start line backwards to reach the "back of the bend" intersection point
				const distToPrevVertex = bendRadius * Math.tan(Math.abs(prevFrame.bend.angleRad) / 2);
				pStart_center = pPhysicalStart.clone().sub(dir.clone().multiplyScalar(distToPrevVertex));
			}

			// Determine mathematical ending edge of this straight section
			if (i === validFrames.length) {
				pEnd_center = curve.getPoint(1);
			} else {
				const nextFrame = validFrames[i];
				const tPhysicalEnd = nextFrame.L1 / curve.totalLen;
				const pPhysicalEnd = curve.getPoint(tPhysicalEnd);
				
				// Extend the end line forwards to reach the "back of the bend" intersection point
				const distToNextVertex = bendRadius * Math.tan(Math.abs(nextFrame.bend.angleRad) / 2);
				pEnd_center = pPhysicalEnd.clone().add(dir.clone().multiplyScalar(distToNextVertex));
			}

			// Calculate straight back-to-back length
			const segmentVector = pEnd_center.clone().sub(pStart_center);
			const length = segmentVector.dot(dir);

			if (length >= 0.1) {
				// Offset by 6 inches sideways along the binormal vector to avoid colliding with Kicks
				const visualOffset = binormal.clone().multiplyScalar(6); 
				
				const v_pStart = pStart_center.clone().add(visualOffset);
				const v_pEnd = pEnd_center.clone().add(visualOffset);

				measurements.push({
					id: `straight-len-${i}`,
					lines: [
						createCylinderLine(v_pStart.toArray() as [number, number, number], v_pEnd.toArray() as [number, number, number]),
						createCylinderLine(pStart_center.toArray() as [number, number, number], v_pStart.toArray() as [number, number, number]),
						createCylinderLine(pEnd_center.toArray() as [number, number, number], v_pEnd.toArray() as [number, number, number])
					],
					labelPos: v_pStart.clone().lerp(v_pEnd, 0.5).toArray() as [number, number, number],
					length: length
				});
			}
		}

		return measurements;
	});

	let conduitData = $derived(
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(conduitSizes.conduit_standards as any)[conduitType]?.find(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(c: any) => c.trade_size === conduitSize
		)
	);

	let innerRadius = $derived(
		conduitData
			? pipeRadius * (conduitData.inner_diameter / conduitData.outer_diameter)
			: pipeRadius * 0.8
	);

	let startPoint = $derived(curve.getPoint(0).toArray());
	let endPoint = $derived(curve.getPoint(1).toArray());

	let startQuaternion = $derived.by(() => {
		const tangent = curve.getTangent(0).normalize();
		const q = new THREE.Quaternion();
		// The start cap sits at t=0 facing backward
		q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent.clone().negate());
		return q.toArray();
	});

	let endQuaternion = $derived.by(() => {
		const tangent = curve.getTangent(1).normalize();
		const q = new THREE.Quaternion();
		// The end cap sits at t=1 facing forward
		q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);
		return q.toArray();
	});

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

	// --- Click to add a bend logic ---
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const onConduitClick = (e: any) => {
		e.stopPropagation();
		// Ensure we don't accidentally create a bend while ending a camera pan/drag
		if (e.uv && !isDragging) {
			const t = e.uv.x;
			// Convert fractional 0-1 mapped length representation to real inches
			const newPosition = Number((t * curve.totalLen).toFixed(2));
			
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const newBend: any = { angle: 0, rotation: 0, position: newPosition, mark: 'star' };
			
			// Append and sort to maintain chronological run order
			const newBends = [...bends, newBend].sort((a, b) => a.position - b.position);
			
			bends = newBends;
			// Automatically select the newly created bend
			activeBendIndex = newBends.indexOf(newBend);
		}
	};

	// --- Camera State Tracking ---
	// Encapsulated in a plain constant object to bypass Svelte 5 state reactivity.
	// This prevents jittering/feedback loops during orbit while properly
	// initializing values whenever the camera components are toggled/created.
	const cameraState = {
		pos: [60, 10, 100] as [number, number, number],
		target: [60, 5, 0] as [number, number, number],
		zoom: 10
	};

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const onCameraChange = (e: any) => {
		const controls = e.target;
		if (!controls) return;

		cameraState.pos = [
			controls.object.position.x,
			controls.object.position.y,
			controls.object.position.z
		];
		cameraState.target = [controls.target.x, controls.target.y, controls.target.z];

		// Map zoom properties so the visual scale carries over appropriately
		if (controls.object.isOrthographicCamera) {
			cameraState.zoom = controls.object.zoom;
		} else {
			// Approximate perspective visual distance size to an equivalent orthographic zoom
			const distance = Math.hypot(
				cameraState.pos[0] - cameraState.target[0],
				cameraState.pos[1] - cameraState.target[1],
				cameraState.pos[2] - cameraState.target[2]
			);
			cameraState.zoom = 1000 / (distance || 1);
		}
	};

	// Calculate and align mathematical frame tracking properties to global geometry
	let activeBendFrame = $derived.by(() => {
		const activeUIBend = bends[activeBendIndex];
		if (!activeUIBend) return undefined;
		return curve.bendFrames.find((f) => f.bend.originalBend === activeUIBend);
	});

	let toolPos = $derived.by(() => {
		if (!activeBendFrame) return [0, pipeRadius, pipeRadius] as [number, number, number];
		return [
			activeBendFrame.center.x,
			activeBendFrame.center.y + pipeRadius,
			activeBendFrame.center.z + pipeRadius
		] as [number, number, number];
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

	// --- Camera Tracking on Distance Change ---
	let lastPosition: number | undefined = undefined;
	let lastIndex: number | undefined = undefined;
	let lastToolPos: [number, number, number] | undefined = undefined;

	$effect(() => {
		const currentBend = bends[activeBendIndex];
		const currentPosition = currentBend?.position;
		const currentToolPos = toolPos;

		// Perform a smooth manual camera shift natively via Three.js matching any newly slid distances exactly
		if (
			lastIndex === activeBendIndex &&
			lastPosition !== undefined &&
			currentPosition !== undefined &&
			lastPosition !== currentPosition &&
			lastToolPos !== undefined
		) {
			if (cameraRef && controlsRef) {
				const dx = currentToolPos[0] - lastToolPos[0];
				const dy = currentToolPos[1] - lastToolPos[1];
				const dz = currentToolPos[2] - lastToolPos[2];

				cameraRef.position.x += dx;
				cameraRef.position.y += dy;
				cameraRef.position.z += dz;

				controlsRef.target.x += dx;
				controlsRef.target.y += dy;
				controlsRef.target.z += dz;

				controlsRef.update();

				cameraState.pos = [cameraRef.position.x, cameraRef.position.y, cameraRef.position.z];
				cameraState.target = [controlsRef.target.x, controlsRef.target.y, controlsRef.target.z];
			}
		}

		lastIndex = activeBendIndex;
		lastPosition = currentPosition;
		lastToolPos = currentToolPos;
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
	<T.OrthographicCamera
		makeDefault
		zoom={cameraState.zoom}
		oncreate={(ref) => {
			ref.position.set(...cameraState.pos);
			ref.lookAt(...cameraState.target);
		}}
		bind:ref={orthoCameraRef}
	>
		<OrbitControls
			target={cameraState.target}
			enabled={!isDragging}
			onchange={onCameraChange}
			bind:ref={controlsRef}
		/>
	</T.OrthographicCamera>
{:else}
	<T.PerspectiveCamera
		makeDefault
		fov={45}
		oncreate={(ref) => {
			ref.position.set(...cameraState.pos);
			ref.lookAt(...cameraState.target);
		}}
		bind:ref={perspCameraRef}
	>
		<OrbitControls
			target={cameraState.target}
			enabled={!isDragging}
			onchange={onCameraChange}
			bind:ref={controlsRef}
		/>
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

<T.Group position={[0, pipeRadius, pipeRadius]}>
	<T.Mesh onclick={onConduitClick}>
		<T.TubeGeometry bind:ref={tubeGeom} args={[curve, 100, pipeRadius, 12, false]} />
		<T.MeshBasicMaterial color={textTexture ? '#ffffff' : '#999999'} map={textTexture || null} />
	</T.Mesh>

	<!-- Bend Marks -->
	{#each marks as mark (mark.index)}
		<T.Group position={mark.pos} quaternion={mark.quat}>
			<!-- 1/8" thick physical Sharpie ring sliding slightly hovering the conduit to avoid z-fighting -->
			<T.Mesh>
				<T.CylinderGeometry args={[pipeRadius + 0.02, pipeRadius + 0.02, 0.125, 32]} />
				<T.MeshBasicMaterial color="#111111" />
			</T.Mesh>

			<!-- Floating Indicator Label -->
			<HTML center>
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					onclick={(e) => { e.stopPropagation(); activeBendIndex = mark.index; }}
					style="background: {activeBendIndex === mark.index ? '#1e90ff' : 'rgba(0,0,0,0.8)'}; color: white; padding: 4px 8px; border-radius: 4px; font-family: sans-serif; font-size: 12px; font-weight: bold; pointer-events: auto; cursor: pointer; margin-top: -40px; white-space: nowrap; user-select: none; transition: background 0.2s;"
				>
					Bend {mark.index + 1}
				</div>
			</HTML>
		</T.Group>
	{/each}

	<!-- Kick Measurement Overlays -->
	{#each kickMeasurements as measurement (measurement.id)}
		{#each measurement.lines as lineProps}
			<T.Mesh position={lineProps.position} quaternion={lineProps.quaternion}>
				<T.CylinderGeometry args={[0.04, 0.04, lineProps.length, 8]} />
				<T.MeshBasicMaterial color="#1e90ff" />
			</T.Mesh>
		{/each}

		<HTML position={measurement.labelPos} center>
			<div
				style="background: rgba(0, 0, 0, 0.8); color: #1e90ff; padding: 4px 8px; border-radius: 4px; font-family: monospace; font-size: 14px; font-weight: bold; pointer-events: none; border: 1px solid #1e90ff; white-space: nowrap; user-select: none; margin-left: 10px;"
			>
				Kick: {measurement.height.toFixed(2)}"
			</div>
		</HTML>
	{/each}

	<!-- Straight Section Back-to-Back Measurement Overlays -->
	{#each straightMeasurements as measurement (measurement.id)}
		{#each measurement.lines as lineProps}
			<T.Mesh position={lineProps.position} quaternion={lineProps.quaternion}>
				<T.CylinderGeometry args={[0.04, 0.04, lineProps.length, 8]} />
				<T.MeshBasicMaterial color="#32cd32" />
			</T.Mesh>
		{/each}

		<HTML position={measurement.labelPos} center>
			<div
				style="background: rgba(0, 0, 0, 0.8); color: #32cd32; padding: 4px 8px; border-radius: 4px; font-family: monospace; font-size: 14px; font-weight: bold; pointer-events: none; border: 1px solid #32cd32; white-space: nowrap; user-select: none; margin-bottom: 20px;"
			>
				Length: {measurement.length.toFixed(2)}"
			</div>
		</HTML>
	{/each}

	<!-- Start Cap -->
	<T.Group position={startPoint} quaternion={startQuaternion}>
		<!-- Outer Material Ring -->
		<T.Mesh>
			<T.RingGeometry args={[innerRadius, pipeRadius, 12]} />
			<T.MeshBasicMaterial color={textTexture ? '#ffffff' : '#999999'} map={textTexture || null} />
		</T.Mesh>
		<!-- Inner Black Hole -->
		<T.Mesh>
			<T.CircleGeometry args={[innerRadius, 12]} />
			<T.MeshBasicMaterial color="#000000" />
		</T.Mesh>
	</T.Group>

	<!-- End Cap -->
	<T.Group position={endPoint} quaternion={endQuaternion}>
		<!-- Outer Material Ring -->
		<T.Mesh>
			<T.RingGeometry args={[innerRadius, pipeRadius, 12]} />
			<T.MeshBasicMaterial color={textTexture ? '#ffffff' : '#999999'} map={textTexture || null} />
		</T.Mesh>
		<!-- Inner Black Hole -->
		<T.Mesh>
			<T.CircleGeometry args={[innerRadius, 12]} />
			<T.MeshBasicMaterial color="#000000" />
		</T.Mesh>
	</T.Group>
</T.Group>

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