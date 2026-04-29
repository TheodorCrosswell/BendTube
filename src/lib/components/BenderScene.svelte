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

	// Import the new abstracted component
	import MeasurementOverlays from './MeasurementOverlays.svelte';

	type ExtendedProps = BenderSceneProps & {
		pipeTransform?: { posX: number; posY: number; posZ: number; rotX: number; rotY: number; rotZ: number };
		totalLength?: number;
		couplings?: { position: number }[];
		cutMode?: boolean;
		cutPosition?: number;
		coupleMode?: boolean;
		coupleEnd?: 1 | 2;
		showGrid?: boolean;
	};

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
		}),
		pipeTransform = $bindable({ posX: 0, posY: 0, posZ: 0, rotX: 0, rotY: 0, rotZ: 0 }),
		totalLength = 120,
		couplings = [],
		cutMode = false,
		cutPosition = 60,
		coupleMode = false,
		coupleEnd = 2,
		showGrid = true
	}: ExtendedProps = $props();

	interactivity();

	let tubeGeom = $state<THREE.TubeGeometry | undefined>(undefined);

	let orthoCameraRef = $state<THREE.OrthographicCamera | undefined>(undefined);
	let perspCameraRef = $state<THREE.PerspectiveCamera | undefined>(undefined);
	let cameraRef = $derived(isOrthographic ? orthoCameraRef : perspCameraRef);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let controlsRef = $state<any>(undefined);

	let pipeRadius = $derived(outerDiameter / 2);
	let bendRadius = $derived(pipeRadius * 10);
	let toolScaleFactor = $derived(bendRadius / 4);

	let deduction = $derived(getBenderDeduction(conduitSize));

	let textTexture = $derived(generateConduitTexture(conduitSize, conduitType));
	let curve = $derived(new ConduitCurve(bends, bendRadius, pipeRadius, deduction, totalLength));

	// Derived logic for Cut Mode visuals
	let cutT = $derived(totalLength > 0 ? cutPosition / totalLength : 0);
	let cutPos = $derived(curve.getPoint(cutT));
	let cutTangent = $derived.by(() => {
		const delta = 0.001;
		const t1 = Math.max(0, cutT - delta);
		const t2 = Math.min(1, cutT + delta);
		const p1 = curve.getPoint(t1);
		const p2 = curve.getPoint(t2);
		let t = new THREE.Vector3().subVectors(p2, p1).normalize();
		if (t.lengthSq() === 0) t.set(1, 0, 0);
		return t;
	});
	let cutQuat = $derived.by(() => {
		return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), cutTangent);
	});

	// Derived logic for Couple Mode visuals
	let couplePos = $derived(curve.getPoint(coupleEnd === 1 ? 0 : 1));
	let coupleTangent = $derived.by(() => {
		const delta = 0.001;
		const p1 = curve.getPoint(coupleEnd === 1 ? delta : 1 - delta);
		const p2 = curve.getPoint(coupleEnd === 1 ? 0 : 1);
		let t = new THREE.Vector3().subVectors(p2, p1).normalize();
		if (t.lengthSq() === 0) t.set(1, 0, 0);
		return t;
	});
	let coupleQuat = $derived.by(() => {
		return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), coupleTangent);
	});

	let marks = $derived.by(() => {
		return bends.map((bend, index) => {
			const t = bend.position / curve.totalLen;
			const pos = curve.getPoint(t);

			const pos2 = curve.getPoint(Math.min(t + 0.001, 1));
			const tangent = new THREE.Vector3().subVectors(pos2, pos).normalize();

			if (tangent.lengthSq() === 0) {
				tangent.set(1, 0, 0);
			}

			const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);

			return {
				index,
				pos: pos.toArray() as [number, number, number],
				quat: quat.toArray() as [number, number, number, number]
			};
		});
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
		q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent.clone().negate());
		return q.toArray();
	});

	let endQuaternion = $derived.by(() => {
		const tangent = curve.getTangent(1).normalize();
		const q = new THREE.Quaternion();
		q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);
		return q.toArray();
	});

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const onConduitClick = (e: any) => {
		e.stopPropagation();
		if (e.uv) {
			const t = e.uv.x;
			const newPosition = Number((t * curve.totalLen).toFixed(2));

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const newBend: any = { angle: 0, rotation: 0, position: newPosition, mark: 'star' };

			const newBends = [...bends, newBend].sort((a, b) => a.position - b.position);

			bends = newBends;
			activeBendIndex = newBends.indexOf(newBend);
		}
	};

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

		if (controls.object.isOrthographicCamera) {
			cameraState.zoom = controls.object.zoom;
		} else {
			const distance = Math.hypot(
				cameraState.pos[0] - cameraState.target[0],
				cameraState.pos[1] - cameraState.target[1],
				cameraState.pos[2] - cameraState.target[2]
			);
			cameraState.zoom = 1000 / (distance || 1);
		}
	};

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

	let worldToolPos = $derived.by(() => {
		const localVec = new THREE.Vector3(toolPos[0], toolPos[1], toolPos[2]);
		const euler = new THREE.Euler(
			pipeTransform.rotX * (Math.PI / 180),
			pipeTransform.rotY * (Math.PI / 180),
			pipeTransform.rotZ * (Math.PI / 180),
			'XYZ'
		);
		localVec.applyEuler(euler);
		localVec.add(new THREE.Vector3(pipeTransform.posX, pipeTransform.posY, pipeTransform.posZ));
		return [localVec.x, localVec.y, localVec.z] as [number, number, number];
	});

	let toolQuat = $derived.by(() => {
		if (!activeBendFrame) return new THREE.Quaternion();
		const qBase = new THREE.Quaternion().setFromRotationMatrix(
			new THREE.Matrix4().makeBasis(
				activeBendFrame.dir,
				activeBendFrame.n,
				activeBendFrame.binormal
			)
		);

		let localEuler: THREE.Euler;
		if (activeBendFrame.bend.originalBend.mark === 'star') {
			localEuler = new THREE.Euler(0, Math.PI, -activeBendFrame.bend.angleRad, 'XYZ');
		} else {
			localEuler = new THREE.Euler(0, 0, 0, 'XYZ');
		}

		const localQuat = new THREE.Quaternion().setFromEuler(localEuler);
		return qBase.multiply(localQuat);
	});

	let lastPosition: number | undefined = undefined;
	let lastIndex: number | undefined = undefined;
	let lastToolPos: [number, number, number] | undefined = undefined;

	$effect(() => {
		const currentBend = bends[activeBendIndex];
		const currentPosition = currentBend?.position;
		const currentWorldToolPos = worldToolPos;

		if (
			lastIndex === activeBendIndex &&
			lastPosition !== undefined &&
			currentPosition !== undefined &&
			lastPosition !== currentPosition &&
			lastToolPos !== undefined
		) {
			if (cameraRef && controlsRef) {
				const dx = currentWorldToolPos[0] - lastToolPos[0];
				const dy = currentWorldToolPos[1] - lastToolPos[1];
				const dz = currentWorldToolPos[2] - lastToolPos[2];

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
		lastToolPos = currentWorldToolPos;
	});

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
		let beforeBend = totalLength;
		let afterBend = 0;

		if (sortedFrames.length > 0) {
			beforeBend = Math.max(0, sortedFrames[0].L1);
			const lastFrame = sortedFrames[sortedFrames.length - 1];
			afterBend = Math.max(0, totalLength - (lastFrame.L1 + lastFrame.bend.arcLen));
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
		<OrbitControls target={cameraState.target} onchange={onCameraChange} bind:ref={controlsRef} />
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
		<OrbitControls target={cameraState.target} onchange={onCameraChange} bind:ref={controlsRef} />
	</T.PerspectiveCamera>
{/if}

{#if showGrid}
	<Grid
		gridSize={[2400, 2400]}
		sectionSize={12}
		cellSize={1}
		position={[60, 0, 0]}
		sectionColor="#888888"
		cellColor="#444444"
		fadeDistance={1000}
	/>
	<Grid
		gridSize={[2400, 2400]}
		sectionSize={12}
		cellSize={1}
		position={[60, 60, 0]}
		rotation.x={Math.PI / 2}
		sectionColor="#888888"
		cellColor="#444444"
		fadeDistance={1000}
	/>
	<Grid
		gridSize={[2400, 2400]}
		sectionSize={12}
		cellSize={1}
		position={[60, 60, 0]}
		rotation.z={Math.PI / 2}
		sectionColor="#888888"
		cellColor="#444444"
		fadeDistance={1000}
	/>
{/if}

<!-- Master Transformation Group -->
<T.Group
	position={[pipeTransform.posX, pipeTransform.posY, pipeTransform.posZ]}
	rotation={[
		pipeTransform.rotX * (Math.PI / 180),
		pipeTransform.rotY * (Math.PI / 180),
		pipeTransform.rotZ * (Math.PI / 180)
	]}
>
	<T.Group position={[0, pipeRadius, pipeRadius]}>
		<T.Mesh onclick={onConduitClick}>
			<!-- Adjusted resolution for heavily coupled geometries -->
			<T.TubeGeometry bind:ref={tubeGeom} args={[curve, Math.floor(totalLength), pipeRadius, 12, false]} />
			<T.MeshBasicMaterial color={textTexture ? '#ffffff' : '#999999'} map={textTexture || null} />
		</T.Mesh>

		<!-- Couplings -->
		{#each couplings as coupling (coupling.position)}
			{@const cT = totalLength > 0 ? coupling.position / totalLength : 0}
			{@const cPos = curve.getPoint(cT)}
			{@const t1 = Math.max(0, cT - 0.001)}
			{@const t2 = Math.min(1, cT + 0.001)}
			{@const p1 = curve.getPoint(t1)}
			{@const p2 = curve.getPoint(t2)}
			{@const cTangent = new THREE.Vector3().subVectors(p2, p1).normalize()}
			{@const cQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), cTangent.lengthSq() > 0 ? cTangent : new THREE.Vector3(1,0,0))}
			
			<T.Group position={cPos.toArray()} quaternion={cQuat.toArray()}>
				<T.Mesh>
					<T.CylinderGeometry args={[pipeRadius + 0.08, pipeRadius + 0.08, 2.5, 32]} />
					<T.MeshStandardMaterial color="#cccccc" metalness={0.6} roughness={0.4} />
				</T.Mesh>
			</T.Group>
		{/each}

		{#if cutMode}
			<!-- Red Ring aligned with the pipe cut -->
			<T.Group position={cutPos.toArray()} quaternion={cutQuat.toArray()}>
				<T.Mesh>
					<T.CylinderGeometry args={[pipeRadius + 0.05, pipeRadius + 0.05, 0.5, 32]} />
					<T.MeshBasicMaterial color="#ff0000" />
				</T.Mesh>
			</T.Group>
			<!-- Red Arrow pointing straight down from above -->
			<T.Group position={cutPos.toArray()}>
				<T.Mesh position={[0, pipeRadius + 2.5, 0]} rotation={[Math.PI, 0, 0]}>
					<T.ConeGeometry args={[0.8, 3, 16]} />
					<T.MeshBasicMaterial color="#ff0000" />
				</T.Mesh>
			</T.Group>
		{/if}

		{#if coupleMode}
			<!-- Red Arrow pointing squarely at the open face of the pipe end -->
			<T.Group position={couplePos.toArray()} quaternion={coupleQuat.toArray()}>
				<T.Mesh position={[0, 2.0, 0]} rotation={[Math.PI, 0, 0]}>
					<T.ConeGeometry args={[0.8, 3, 16]} />
					<T.MeshBasicMaterial color="#ff0000" />
				</T.Mesh>
			</T.Group>
		{/if}

		<!-- Bend Marks -->
		{#each marks as mark (mark.index)}
			<T.Group position={mark.pos} quaternion={mark.quat}>
				<T.Mesh
					onclick={(e) => {
						e.stopPropagation();
						activeBendIndex = mark.index;
					}}
				>
					<T.CylinderGeometry args={[pipeRadius + 0.02, pipeRadius + 0.02, 0.125, 32]} />
					<T.MeshBasicMaterial color={activeBendIndex === mark.index ? '#1e90ff' : '#111111'} />
				</T.Mesh>

				<HTML center>
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<div
						onpointerdown={(e) => {
							e.stopPropagation();
							activeBendIndex = mark.index;
						}}
						onclick={(e) => {
							e.stopPropagation();
							activeBendIndex = mark.index;
						}}
						style="background: {activeBendIndex === mark.index
							? '#1e90ff'
							: 'transparent'}; color: {activeBendIndex === mark.index
							? 'white'
							: '#cccccc'}; padding: 4px 8px; border-radius: 4px; font-family: sans-serif; font-size: 12px; font-weight: bold; pointer-events: auto; cursor: pointer; margin-top: -40px; white-space: nowrap; user-select: none; transition: background 0.2s; text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;"
					>
						Bend {mark.index + 1}
					</div>
				</HTML>
			</T.Group>
		{/each}

		<!-- Isolated Measurement Overlays -->
		<MeasurementOverlays {curve} {pipeRadius} {bendRadius} />

		<!-- Start Cap -->
		<T.Group position={startPoint} quaternion={startQuaternion}>
			<T.Mesh>
				<T.RingGeometry args={[innerRadius, pipeRadius, 12]} />
				<T.MeshBasicMaterial color={textTexture ? '#ffffff' : '#999999'} map={textTexture || null} />
			</T.Mesh>
			<T.Mesh>
				<T.CircleGeometry args={[innerRadius, 12]} />
				<T.MeshBasicMaterial color="#000000" />
			</T.Mesh>
		</T.Group>

		<!-- End Cap -->
		<T.Group position={endPoint} quaternion={endQuaternion}>
			<T.Mesh>
				<T.RingGeometry args={[innerRadius, pipeRadius, 12]} />
				<T.MeshBasicMaterial color={textTexture ? '#ffffff' : '#999999'} map={textTexture || null} />
			</T.Mesh>
			<T.Mesh>
				<T.CircleGeometry args={[innerRadius, 12]} />
				<T.MeshBasicMaterial color="#000000" />
			</T.Mesh>
		</T.Group>
	</T.Group>

	<!-- Bender Tool -->
	{#if activeBendFrame}
		<T.Group position={toolPos} quaternion={toolQuat.toArray()} scale={toolScaleFactor}>
			<T.Mesh rotation.z={-Math.PI / 2}>
				<T.TorusGeometry args={[4, 0.45, 16, 32, Math.PI / 2 + 0.1]} />
				<T.MeshBasicMaterial color="#1e90ff" />
			</T.Mesh>

			<T.Group rotation.z={Math.PI / 6}>
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
</T.Group>