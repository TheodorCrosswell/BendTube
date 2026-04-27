<!-- src/routes/BenderScene.svelte -->
<script lang="ts">
	import { T } from '@threlte/core';
	import { OrbitControls, Grid, interactivity } from '@threlte/extras';
	import * as THREE from 'three';

	interface BendState {
		angle: number;
		rotation: number;
		position: number;
		mark: 'star' | 'arrow';
	}

	interface MappedBend {
		angleDeg: number;
		rotDeg: number;
		angleRad: number;
		rotRad: number;
		arcLen: number;
		L1: number;
		R: number;
		position: number;
		originalBend: BendState;
	}

	interface BendFrame {
		bend: MappedBend;
		L1: number;
		pos: THREE.Vector3;
		dir: THREE.Vector3;
		n: THREE.Vector3;
		binormal: THREE.Vector3;
		center: THREE.Vector3;
		posPast: THREE.Vector3;
		dirPast: THREE.Vector3;
	}

	interface Props {
		bends?: BendState[];
		activeBendIndex?: number;
		isOrthographic?: boolean;
		outerDiameter?: number;
		conduitSize?: string;
		conduitType?: string;
		stats?: {
			beforeBend: number;
			inBend: number;
			afterBend: number;
			total: number;
			width: number;
			height: number;
			depth: number;
		};
	}

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
			depth: 0
		})
	}: Props = $props();

	interactivity();

	let tubeGeom = $state<THREE.TubeGeometry | undefined>(undefined);

	let pipeRadius = $derived(outerDiameter / 2);
	let bendRadius = $derived(pipeRadius * 10);
	let toolScaleFactor = $derived(bendRadius / 4);

	// Calculate bender deduction accurately based on selected conduit size
	let deduction = $derived.by(() => {
		switch (conduitSize) {
			case '1/2':
				return 5;
			case '3/4':
				return 6;
			case '1':
				return 8;
			case '1 1/4':
				return 11;
			case '1 1/2':
				return 14;
			default:
				return 5;
		}
	});

	// --- Dynamic Canvas Texture for Conduit Text ---
	let textTexture = $derived.by(() => {
		if (typeof document === 'undefined') return undefined;

		const canvas = document.createElement('canvas');
		const canvasCtx = canvas.getContext('2d');
		if (!canvasCtx) return undefined;

		const text = `${conduitSize}" ${conduitType} Conduit ----- `;
		const fontSize = 40;

		canvasCtx.font = `bold ${fontSize}px sans-serif`;
		const textWidth = Math.ceil(canvasCtx.measureText(text).width);

		canvas.width = textWidth;
		canvas.height = 256;

		const ctx2 = canvas.getContext('2d');
		if (!ctx2) return undefined;

		ctx2.fillStyle = '#999999';
		ctx2.fillRect(0, 0, canvas.width, canvas.height);

		ctx2.fillStyle = '#e0e0e0';
		ctx2.font = `bold ${fontSize}px sans-serif`;
		ctx2.textAlign = 'center';
		ctx2.textBaseline = 'middle';
		ctx2.fillText(text, canvas.width / 2, canvas.height / 2);

		const texture = new THREE.CanvasTexture(canvas);
		texture.wrapS = THREE.RepeatWrapping;
		texture.wrapT = THREE.RepeatWrapping;
		texture.repeat.set(15, 1);
		texture.offset.set(0, 0.25);
		texture.colorSpace = THREE.SRGBColorSpace;
		texture.needsUpdate = true;

		return texture;
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

	// --- Dynamic Math: Sequential Frenet Frame Conduit Path ---
	class ConduitCurve extends THREE.Curve<THREE.Vector3> {
		bendFrames: BendFrame[] = [];
		totalLen: number;

		constructor(
			bends: BendState[],
			R: number,
			pipeRadius: number,
			deduction: number = 5,
			totalLen: number = 120
		) {
			super();
			// Map physical constraints and sort multiple bends by distance sequentially
			const mappedBends = bends
				.map((b) => {
					const angleDeg = Math.abs(b.angle);
					// Removed the artificial 180 flip here to prevent rotating downstream bends
					const rotDeg = b.rotation % 360;
					const angleRad = angleDeg * (Math.PI / 180);
					const rotRad = rotDeg * (Math.PI / 180);
					const arcLen = R * angleRad;

					let L1: number;

					if (b.mark === 'star') {
						const starOffset = R * (Math.PI / 2) - R - pipeRadius;
						L1 = b.position - arcLen + starOffset;
					} else {
						L1 = b.position + deduction - R - pipeRadius;
					}

					return {
						angleDeg,
						rotDeg,
						angleRad,
						rotRad,
						arcLen,
						L1,
						R,
						position: b.position,
						originalBend: b
					};
				})
				.sort((a, b) => a.L1 - b.L1);

			this.totalLen = totalLen;

			let pos = new THREE.Vector3(0, 0, 0);
			let dir = new THREE.Vector3(1, 0, 0);
			let up = new THREE.Vector3(0, 1, 0);
			let right = new THREE.Vector3(0, 0, 1);
			let currentD = 0;

			// Construct 3D reference frames (positions & rotations) iteratively along the pipe trajectory
			for (const bend of mappedBends) {
				if (bend.L1 !== currentD) {
					pos.addScaledVector(dir, bend.L1 - currentD);
				}

				const n = new THREE.Vector3()
					.copy(up)
					.multiplyScalar(Math.cos(bend.rotRad))
					.addScaledVector(right, Math.sin(bend.rotRad));

				const binormal = new THREE.Vector3().crossVectors(dir, n).normalize();

				// Make the relative rotation permanent against the transported frame to treat consecutive bends independently
				up.copy(n);
				right.copy(binormal);

				// Compute geometric normal locally to correctly draw curves matching the negative drag direction
				const isNegative = bend.originalBend.angle < 0;
				const geoN = isNegative ? n.clone().multiplyScalar(-1) : n;
				const geoBinormal = isNegative ? binormal.clone().multiplyScalar(-1) : binormal;

				const center = new THREE.Vector3().copy(pos).addScaledVector(geoN, bend.R);

				const frame: BendFrame = {
					bend,
					L1: bend.L1,
					pos: pos.clone(),
					dir: dir.clone(),
					n: geoN.clone(),
					binormal: geoBinormal.clone(),
					center: center.clone(),
					posPast: new THREE.Vector3(),
					dirPast: new THREE.Vector3()
				};

				const theta = bend.angleRad;
				const v = new THREE.Vector3().copy(geoN).multiplyScalar(-1);

				pos
					.copy(center)
					.addScaledVector(v, bend.R * Math.cos(theta))
					.addScaledVector(dir, bend.R * Math.sin(theta));
				currentD = bend.L1 + bend.arcLen;

				const newDir = new THREE.Vector3()
					.copy(dir)
					.multiplyScalar(Math.cos(theta))
					.addScaledVector(geoN, Math.sin(theta));

				dir.copy(newDir).normalize();
				up.applyAxisAngle(geoBinormal, theta);
				right.applyAxisAngle(geoBinormal, theta);

				frame.posPast.copy(pos);
				frame.dirPast.copy(dir);

				this.bendFrames.push(frame);
			}
		}

		getPoint(t: number, optionalTarget = new THREE.Vector3()) {
			const d = t * this.totalLen;
			let currentD = 0;
			let pos = new THREE.Vector3(0, 0, 0);
			let dir = new THREE.Vector3(1, 0, 0);

			for (const frame of this.bendFrames) {
				const bend = frame.bend;

				// Straight path leading into the bend
				if (d <= frame.L1) {
					pos.copy(frame.pos).addScaledVector(frame.dir, d - frame.L1);
					return optionalTarget.copy(pos);
				}

				const bendEnd = frame.L1 + bend.arcLen;
				// Curving path mapped around the bend rotation center
				if (d <= bendEnd) {
					const theta = (d - frame.L1) / bend.R;
					const v = new THREE.Vector3().copy(frame.n).multiplyScalar(-1);
					pos
						.copy(frame.center)
						.addScaledVector(v, bend.R * Math.cos(theta))
						.addScaledVector(frame.dir, bend.R * Math.sin(theta));
					return optionalTarget.copy(pos);
				}

				// Override and leap out to continue processing successive bends accurately
				currentD = bendEnd;
				pos.copy(frame.posPast);
				dir.copy(frame.dirPast);
			}

			// Final run-off length
			pos.addScaledVector(dir, d - currentD);
			return optionalTarget.copy(pos);
		}
	}

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
		for (const frame of curve.bendFrames) {
			lenBend += frame.bend.arcLen;
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
			depth: size.z
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
