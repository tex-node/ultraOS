// Image -> Court Coordinates (G.21, Part XVII). A real homography-based transform, not a
// placeholder - direct linear transform (DLT) solved via least squares over whatever reference
// points a CourtCalibration provides (>= 4 required; more improves the least-squares fit).
//
// Coordinate system (documented per Part XVII's own instruction): court-space is in whatever
// `units` the CourtCalibration record declares (defaults to "meters" - see the Prisma model's
// comment on why real Ultra court dimensions aren't filled in for Season Zero), origin and axes
// are whatever the calibrating operator's reference points implicitly define (typically: origin
// at one baseline corner, x along the sideline, y along the baseline) - there is no fixed Ultra
// court coordinate standard yet, so this only guarantees internal consistency for one
// calibration, not comparability across videos with different reference-point choices. Made
// explicit rather than implied, since inventing a false sense of a shared coordinate standard
// would be exactly the "fabricated spatial accuracy" Part VIII of the safety rules forbids.
export type ReferencePoint = { imageX: number; imageY: number; courtX: number; courtY: number };

// 3x3 homography, row-major, h[2][2] normalized to 1.
export type Homography = number[][];

function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[pivotRow][col])) pivotRow = row;
    }
    if (Math.abs(M[pivotRow][col]) < 1e-10) return null; // singular - insufficient/degenerate points
    [M[col], M[pivotRow]] = [M[pivotRow], M[col]];
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = M[row][col] / M[col][col];
      for (let c = col; c <= n; c++) M[row][c] -= factor * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

// Least-squares DLT: for each correspondence, image (x,y) -> court (X,Y) contributes two rows to
// A*h = b, where h = [h11,h12,h13,h21,h22,h23,h31,h32] and h33 is fixed to 1.
export function computeHomography(points: ReferencePoint[]): Homography | null {
  if (points.length < 4) return null;

  const A: number[][] = [];
  const b: number[] = [];
  for (const p of points) {
    A.push([p.imageX, p.imageY, 1, 0, 0, 0, -p.imageX * p.courtX, -p.imageY * p.courtX]);
    b.push(p.courtX);
    A.push([0, 0, 0, p.imageX, p.imageY, 1, -p.imageX * p.courtY, -p.imageY * p.courtY]);
    b.push(p.courtY);
  }

  // Normal equations A^T A h = A^T b - turns an overdetermined (n > 4) system into a solvable
  // 8x8 one, which is exactly the least-squares fit for extra reference points.
  const AtA: number[][] = Array.from({ length: 8 }, () => Array(8).fill(0));
  const Atb: number[] = Array(8).fill(0);
  for (let row = 0; row < A.length; row++) {
    for (let i = 0; i < 8; i++) {
      Atb[i] += A[row][i] * b[row];
      for (let j = 0; j < 8; j++) AtA[i][j] += A[row][i] * A[row][j];
    }
  }

  const h = solveLinearSystem(AtA, Atb);
  if (!h) return null;
  return [
    [h[0], h[1], h[2]],
    [h[3], h[4], h[5]],
    [h[6], h[7], 1],
  ];
}

export function applyHomography(matrix: Homography, imageX: number, imageY: number): { courtX: number; courtY: number } {
  const w = matrix[2][0] * imageX + matrix[2][1] * imageY + matrix[2][2];
  const courtX = (matrix[0][0] * imageX + matrix[0][1] * imageY + matrix[0][2]) / w;
  const courtY = (matrix[1][0] * imageX + matrix[1][1] * imageY + matrix[1][2]) / w;
  return { courtX, courtY };
}

// Reprojection error - how well the fitted homography actually explains the reference points
// used to build it. High error means the calibration itself is unreliable (Part VIII: "if
// calibration/tracking confidence is weak, record uncertainty").
export function meanReprojectionError(matrix: Homography, points: ReferencePoint[]): number {
  if (points.length === 0) return 0;
  const errors = points.map((p) => {
    const projected = applyHomography(matrix, p.imageX, p.imageY);
    return Math.hypot(projected.courtX - p.courtX, projected.courtY - p.courtY);
  });
  return errors.reduce((sum, e) => sum + e, 0) / errors.length;
}
