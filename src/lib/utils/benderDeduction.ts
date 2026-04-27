export function getBenderDeduction(conduitSize: string): number {
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
}