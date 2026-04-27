import * as THREE from 'three';
import type { BendState, BendFrame } from '../types/bender';

export class ConduitCurve extends THREE.Curve<THREE.Vector3> {
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