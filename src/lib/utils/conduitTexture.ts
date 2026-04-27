import * as THREE from 'three';

export function generateConduitTexture(conduitSize: string, conduitType: string): THREE.CanvasTexture | undefined {
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
}