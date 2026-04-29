<!-- src/lib/components/MeasurementOverlays.svelte -->
<script lang="ts">
	import { T } from '@threlte/core';
	import { HTML } from '@threlte/extras';
	import * as THREE from 'three';
	import type { ConduitCurve } from '$lib/math/ConduitCurve';

	let {
		curve,
		pipeRadius,
		bendRadius
	}: {
		curve: ConduitCurve;
		pipeRadius: number;
		bendRadius: number;
	} = $props();

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

			// Find the end of the straight section following the bend
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

				// Extend the measurement point forward to the centerline intersection vertex
				const distToVertex = bendRadius * Math.tan(Math.abs(nextFrame.bend.angleRad) / 2);
				p1_center = pStartNext.clone().add(dir1.clone().multiplyScalar(distToVertex));
			} else {
				p1_center = curve.getPoint(1);
			}

			// Compute the exact outer conduit edges for both segments
			const p0_outer = p0_center.clone().add(n0.clone().multiplyScalar(-pipeRadius));
			const p1_outer = p1_center.clone().add(n1.clone().multiplyScalar(-pipeRadius));

			// Find where the end point projects directly down onto the initial segment's extended baseline
			const diff = p1_outer.clone().sub(p0_outer);
			const projectionDistance = diff.dot(dir0);
			const pProj = p0_outer.clone().add(dir0.clone().multiplyScalar(projectionDistance));

			// Push the entire dimension line drawing outwards visually
			const visualOffset = n0.clone().multiplyScalar(-8); // 8 inches away from outer edge

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
					labelPos: v_pProj.clone().add(heightVec.clone().multiplyScalar(0.5)).toArray() as [
						number,
						number,
						number
					],
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

			// Determine mathematical starting edge
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

				// Extend backward
				const distToPrevVertex = bendRadius * Math.tan(Math.abs(prevFrame.bend.angleRad) / 2);
				pStart_center = pPhysicalStart.clone().sub(dir.clone().multiplyScalar(distToPrevVertex));
			}

			// Determine mathematical ending edge
			if (i === validFrames.length) {
				pEnd_center = curve.getPoint(1);
			} else {
				const nextFrame = validFrames[i];
				const tPhysicalEnd = nextFrame.L1 / curve.totalLen;
				const pPhysicalEnd = curve.getPoint(tPhysicalEnd);

				// Extend forwards
				const distToNextVertex = bendRadius * Math.tan(Math.abs(nextFrame.bend.angleRad) / 2);
				pEnd_center = pPhysicalEnd.clone().add(dir.clone().multiplyScalar(distToNextVertex));
			}

			const segmentVector = pEnd_center.clone().sub(pStart_center);
			const length = segmentVector.dot(dir);

			if (length >= 0.1) {
				const visualOffset = binormal.clone().multiplyScalar(10);

				const v_pStart = pStart_center.clone().add(visualOffset);
				const v_pEnd = pEnd_center.clone().add(visualOffset);

				measurements.push({
					id: `straight-len-${i}`,
					lines: [
						createCylinderLine(
							v_pStart.toArray() as [number, number, number],
							v_pEnd.toArray() as [number, number, number]
						),
						createCylinderLine(
							pStart_center.toArray() as [number, number, number],
							v_pStart.toArray() as [number, number, number]
						),
						createCylinderLine(
							pEnd_center.toArray() as [number, number, number],
							v_pEnd.toArray() as [number, number, number]
						)
					],
					labelPos: v_pStart.clone().lerp(v_pEnd, 0.5).toArray() as [number, number, number],
					length: length
				});
			}
		}

		return measurements;
	});

	// --- Offset Measurements ---
	let offsetMeasurements = $derived.by(() => {
		const measurements = [];
		const sortedFrames = [...curve.bendFrames].sort((a, b) => a.L1 - b.L1);
		const validFrames = sortedFrames.filter((f) => Math.abs(f.bend.angleRad) >= 0.01);

		for (let i = 0; i < validFrames.length - 1; i++) {
			const frame0 = validFrames[i];
			const frame1 = validFrames[i + 1];

			const dir0 = frame0.dir.clone().normalize();
			const n0 = frame0.n.clone().normalize();
			const binormal0 = frame0.binormal.clone().normalize();

			const tStart0 = frame0.L1 / curve.totalLen;
			const p0_center = curve.getPoint(tStart0);
			const p0_outer = p0_center.clone().add(n0.clone().multiplyScalar(-pipeRadius));

			const tA = (frame1.L1 + frame1.bend.arcLen) / curve.totalLen;
			const pA_center = curve.getPoint(tA);

			const nextFrame = validFrames[i + 2];
			let pB_center;

			const dir1 = frame1.dir
				.clone()
				.applyAxisAngle(frame1.binormal.clone().normalize(), frame1.bend.angleRad)
				.normalize();

			if (nextFrame) {
				const tB = nextFrame.L1 / curve.totalLen;
				const pB_physical = curve.getPoint(tB);
				const distToVertex = bendRadius * Math.tan(Math.abs(nextFrame.bend.angleRad) / 2);
				pB_center = pB_physical.clone().add(dir1.clone().multiplyScalar(distToVertex));
			} else {
				pB_center = curve.getPoint(1);
			}

			const createMeasurement = (
				p_center: THREE.Vector3,
				labelPrefix: string,
				isPointA: boolean
			) => {
				const p_outer = p_center.clone().add(n0.clone().multiplyScalar(-pipeRadius));

				const diff = p_outer.clone().sub(p0_outer);
				const distDir0 = diff.dot(dir0);
				const heightSigned = diff.dot(n0);
				const height = Math.abs(heightSigned);
				const distBinormal = diff.dot(binormal0);

				if (height < 0.1) return null;

				const baseVisualOffset = isPointA ? 16 : 24;
				const visualOffsetDist = Math.max(baseVisualOffset, distBinormal + (isPointA ? 8 : 16));
				const v_offset = binormal0.clone().multiplyScalar(visualOffsetDist);

				const v_p0_outer = p0_outer.clone().add(v_offset);
				const v_pProjLine = p0_outer
					.clone()
					.add(dir0.clone().multiplyScalar(distDir0))
					.add(v_offset);
				const v_pHeight = v_pProjLine.clone().add(n0.clone().multiplyScalar(heightSigned));

				return {
					id: `offset-${i}-${isPointA ? 'A' : 'B'}`,
					lines: [
						createCylinderLine(
							v_p0_outer.toArray() as [number, number, number],
							v_pProjLine.toArray() as [number, number, number]
						), // Baseline
						createCylinderLine(
							v_pProjLine.toArray() as [number, number, number],
							v_pHeight.toArray() as [number, number, number]
						), // Height line
						createCylinderLine(
							p0_outer.toArray() as [number, number, number],
							v_p0_outer.toArray() as [number, number, number]
						), // Extension Line 1
						createCylinderLine(
							p_outer.toArray() as [number, number, number],
							v_pHeight.toArray() as [number, number, number]
						) // Extension Line 2
					],
					labelPos: v_pProjLine
						.clone()
						.add(n0.clone().multiplyScalar(heightSigned * 0.5))
						.toArray() as [number, number, number],
					height: heightSigned,
					labelPrefix
				};
			};

			const measA = createMeasurement(pA_center, 'Offset (Bend 2)', true);
			if (measA) measurements.push(measA);

			const measB = createMeasurement(pB_center, 'Offset (End)', false);
			if (measB && pB_center.distanceTo(pA_center) > 0.1) measurements.push(measB);
		}

		return measurements;
	});
</script>

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
			style="color: #1e90ff; font-family: monospace; font-size: 14px; font-weight: bold; pointer-events: none; white-space: nowrap; user-select: none; margin-left: 10px; text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;"
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
			style="color: #32cd32; font-family: monospace; font-size: 14px; font-weight: bold; pointer-events: none; white-space: nowrap; user-select: none; margin-bottom: 10px; text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;"
		>
			Length: {measurement.length.toFixed(2)}"
		</div>
	</HTML>
{/each}

<!-- Offset Measurement Overlays -->
{#each offsetMeasurements as measurement (measurement.id)}
	{#each measurement.lines as lineProps}
		<T.Mesh position={lineProps.position} quaternion={lineProps.quaternion}>
			<T.CylinderGeometry args={[0.04, 0.04, lineProps.length, 8]} />
			<T.MeshBasicMaterial color="#ff8c00" />
		</T.Mesh>
	{/each}

	<HTML position={measurement.labelPos} center>
		<div
			style="color: #ff8c00; font-family: monospace; font-size: 14px; font-weight: bold; pointer-events: none; white-space: nowrap; user-select: none; margin-left: 10px; text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;"
		>
			{measurement.labelPrefix}: {Math.abs(measurement.height).toFixed(2)}"
		</div>
	</HTML>
{/each}
