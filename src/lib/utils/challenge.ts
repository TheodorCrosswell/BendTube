// src/lib/utils/challenge.ts
import * as THREE from 'three';
import { ConduitCurve } from '$lib/math/ConduitCurve';

export type ChallengeData = {
	boxA: { pos: number[]; quat: number[]; size: number[]; holePos: number[]; holeNorm: number[] };
	boxB: { pos: number[]; quat: number[]; size: number[]; holePos: number[]; holeNorm: number[] };
	obstacles: { pos: number[]; size: number[] }[];
};

function getRandomConstrainedAngle() {
	const base = [0, 90, 180, 270][Math.floor(Math.random() * 4)];
	const offset = [0, 10, 22.5, 30, 45, 60, -10, -22.5, -30, -45, -60][Math.floor(Math.random() * 11)];
	return (base + offset) * (Math.PI / 180);
}

function getRandomBendAngle() {
	const angles = [10, 22.5, 30, 45, 60, 90];
	return angles[Math.floor(Math.random() * angles.length)];
}

export function generateChallenge(
	difficulty: number,
	selectedSize: string,
	outerDiameter: number,
	standardRadius: number
): ChallengeData {
	const isSmallPipe = ['1/2', '3/4', '1'].includes(selectedSize);
	// Note: hole gets placed on the +/- Z faces correctly for both sizes via 4x4x2.625 or 10x10x20
	const boxDim = isSmallPipe ? [4, 2.625, 4] : [10, 10, 20];

	// Random Box A Coordinates and Rotation Constraints
	const eulerA = new THREE.Euler(
		getRandomConstrainedAngle(),
		getRandomConstrainedAngle(),
		getRandomConstrainedAngle(),
		'XYZ'
	);
	const quatA = new THREE.Quaternion().setFromEuler(eulerA);
	const posA = new THREE.Vector3(Math.random() * 60, Math.random() * 20 + 10, Math.random() * 60);

	const holeLocalPos = new THREE.Vector3(0, 0, boxDim[2] / 2);
	const holeWorldPos = holeLocalPos.clone().applyQuaternion(quatA).add(posA);
	const holeWorldNorm = new THREE.Vector3(0, 0, 1).applyQuaternion(quatA);

	// Generating Phantom Pipe Constraints
	const pLen = difficulty * 60 + 60;
	const numBends = difficulty + Math.floor(Math.random() * 2);
	const segmentLen = pLen / (numBends + 2);

	const pBends = [];
	let currentPos = segmentLen;
	for (let i = 0; i < numBends; i++) {
		pBends.push({
			angle: getRandomBendAngle(),
			rotation: getRandomConstrainedAngle() * (180 / Math.PI),
			position: currentPos,
			mark: 'star' as const
		});
		currentPos += segmentLen;
	}

	const phantomCurve = new ConduitCurve(pBends, standardRadius, outerDiameter / 2, 5, pLen);
	const pipeStartQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), holeWorldNorm);

	const localEndPt = phantomCurve.getPoint(1);
	const localEndTan = phantomCurve.getTangent(1).normalize();

	const worldEndPt = localEndPt.clone().applyQuaternion(pipeStartQuat).add(holeWorldPos);
	const worldEndTan = localEndTan.clone().applyQuaternion(pipeStartQuat);

	// Map Box B
	const quatB = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), worldEndTan.clone().negate());
	const posB = worldEndPt.clone().sub(new THREE.Vector3(0, 0, boxDim[2] / 2).applyQuaternion(quatB));

	// Generate Non-Intersecting Obstacles
	const obs: { pos: number[]; size: number[] }[] = [];
	let attempts = 0;
	while (obs.length < difficulty * 3 && attempts < 200) {
		attempts++;
		const t = Math.random();
		const ptLocal = phantomCurve.getPoint(t);
		const ptWorld = ptLocal.clone().applyQuaternion(pipeStartQuat).add(holeWorldPos);

		const offset = new THREE.Vector3(
			(Math.random() - 0.5) * 40,
			(Math.random() - 0.5) * 40,
			(Math.random() - 0.5) * 40
		);

		const testPos = ptWorld.clone().add(offset);
		let tooClose = false;

		if (testPos.distanceTo(posA) < 15 || testPos.distanceTo(posB) < 15) tooClose = true;
		if (!tooClose) {
			for (let step = 0; step <= 1; step += 0.05) {
				const cPtLocal = phantomCurve.getPoint(step);
				const cPt = cPtLocal.clone().applyQuaternion(pipeStartQuat).add(holeWorldPos);
				if (testPos.distanceTo(cPt) < 10) {
					tooClose = true;
					break;
				}
			}
		}
		if (tooClose) continue;

		obs.push({
			pos: testPos.toArray(),
			size: [Math.random() * 8 + 4, Math.random() * 8 + 4, Math.random() * 8 + 4]
		});
	}

	return {
		boxA: { pos: posA.toArray(), quat: quatA.toArray(), size: boxDim, holePos: holeWorldPos.toArray(), holeNorm: holeWorldNorm.toArray() },
		boxB: { pos: posB.toArray(), quat: quatB.toArray(), size: boxDim, holePos: worldEndPt.toArray(), holeNorm: worldEndTan.clone().negate().toArray() },
		obstacles: obs
	};
}

export function checkVictoryCondition(
	challengeData: ChallengeData,
	pipeTransform: { posX: number; posY: number; posZ: number; rotX: number; rotY: number; rotZ: number },
	pipeRadius: number,
	startPoint: number[],
	startTangent: THREE.Vector3,
	endPoint: number[],
	endTangent: THREE.Vector3
): boolean {
	const euler = new THREE.Euler(
		pipeTransform.rotX * (Math.PI / 180),
		pipeTransform.rotY * (Math.PI / 180),
		pipeTransform.rotZ * (Math.PI / 180),
		'XYZ'
	);
	const masterPos = new THREE.Vector3(pipeTransform.posX, pipeTransform.posY, pipeTransform.posZ);
	const baseOffset = new THREE.Vector3(0, pipeRadius, pipeRadius);

	const localToWorld = (ptArray: number[], localTan: THREE.Vector3) => {
		const worldPt = new THREE.Vector3(ptArray[0], ptArray[1], ptArray[2])
			.add(baseOffset)
			.applyEuler(euler)
			.add(masterPos);

		const worldTan = localTan.clone().applyEuler(euler);
		return { worldPt, worldTan };
	};

	const start = localToWorld(startPoint, startTangent);
	const end = localToWorld(endPoint, endTangent);

	const holeAPos = new THREE.Vector3().fromArray(challengeData.boxA.holePos);
	const holeANorm = new THREE.Vector3().fromArray(challengeData.boxA.holeNorm);
	const holeBPos = new THREE.Vector3().fromArray(challengeData.boxB.holePos);
	const holeBNorm = new THREE.Vector3().fromArray(challengeData.boxB.holeNorm);

	const checkMatch = (pPt: THREE.Vector3, pTan: THREE.Vector3, hPos: THREE.Vector3, hNorm: THREE.Vector3, isEnd: boolean) => {
		const dist = pPt.distanceTo(hPos);
		// For Start end, pipe goes out so tangent matches hole direction. 
		// For Back end, pipe comes in, so its tangent is opposite the hole's normal face out.
		const targetNorm = isEnd ? hNorm.clone().negate() : hNorm;
		const angle = pTan.angleTo(targetNorm) * (180 / Math.PI);

		return dist <= 0.25 && angle <= 5;
	};

	// Option 1: Standard alignment
	const matchAStart = checkMatch(start.worldPt, start.worldTan, holeAPos, holeANorm, false);
	const matchBEnd = checkMatch(end.worldPt, end.worldTan, holeBPos, holeBNorm, true);

	// Option 2: The player flipped the physical pipe orientation end over end
	const matchBStart = checkMatch(start.worldPt, start.worldTan, holeBPos, holeBNorm, false);
	const matchAEnd = checkMatch(end.worldPt, end.worldTan, holeAPos, holeANorm, true);

	return (matchAStart && matchBEnd) || (matchBStart && matchAEnd);
}