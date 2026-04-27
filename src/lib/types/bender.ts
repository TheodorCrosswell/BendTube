import type * as THREE from 'three';

export interface BendState {
	angle: number;
	rotation: number;
	position: number;
	mark: 'star' | 'arrow';
}

export interface MappedBend {
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

export interface BendFrame {
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

export interface BenderStats {
	beforeBend: number;
	inBend: number;
	afterBend: number;
	total: number;
	width: number;
	height: number;
	depth: number;
	totalDegrees: number;
}

export interface BenderSceneProps {
	bends?: BendState[];
	activeBendIndex?: number;
	isOrthographic?: boolean;
	outerDiameter?: number;
	conduitSize?: string;
	conduitType?: string;
	stats?: BenderStats;
}