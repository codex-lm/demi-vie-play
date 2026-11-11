// Abramowitz and Stegun 7.1.26, evaluated as erfc directly so the small tail
// is not lost by subtracting erf from 1. Maximum absolute error: 1.5e-7.
export function erfc(value) {
  if (Number.isNaN(value)) return NaN;
  if (value === 0) return 1;
  if (value === Infinity) return 0;
  if (value === -Infinity) return 2;
  const x = Math.abs(value);
  const t = 1 / (1 + 0.3275911 * x);
  const tail = t * (0.254829592 + t * (-0.284496736
    + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-x * x);
  return value < 0 ? 2 - tail : tail;
}

// R(x) = 4 i^2 erfc(x), for x >= 0. In the remote tail the two terms of the
// closed form nearly cancel. Its asymptotic expansion avoids that cancellation
// and avoids Infinity * 0 when the thermal front is still far from the room.
export function integratedErfc2(x) {
  if (Number.isNaN(x) || x < 0) return NaN;
  if (x === Infinity) return 0;
  if (x < 6) {
    return Math.max(0, (1 + 2 * x * x) * erfc(x)
      - 2 * x / Math.sqrt(Math.PI) * Math.exp(-x * x));
  }
  const inverseSquare = 1 / (x * x);
  let term = 1;
  let sum = term;
  for (let n = 1; n <= 20; n += 1) {
    term *= -(2 * n + 1) * (n + 1) / (2 * n) * inverseSquare;
    sum += term;
  }
  return Math.exp(-x * x) / Math.sqrt(Math.PI) * inverseSquare / x * sum;
}
