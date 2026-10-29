/** Orthogonaler Leitungszug als SVG-Pfad mit gerundeten Ecken (Biegeradius r, in mm). */
export function roundedPath(points: { x: number; y: number }[], r = 2.4): string {
  const p = points.filter(
    (q, i) => i === 0 || q.x !== points[i - 1]!.x || q.y !== points[i - 1]!.y,
  );
  if (p.length < 2) return '';
  let d = `M${p[0]!.x},${p[0]!.y}`;
  for (let i = 1; i < p.length - 1; i++) {
    const a = p[i - 1]!;
    const b = p[i]!;
    const c = p[i + 1]!;
    const lin = Math.hypot(b.x - a.x, b.y - a.y);
    const lout = Math.hypot(c.x - b.x, c.y - b.y);
    const rr = Math.min(r, lin / 2, lout / 2);
    const ux = (b.x - a.x) / lin;
    const uy = (b.y - a.y) / lin;
    const vx = (c.x - b.x) / lout;
    const vy = (c.y - b.y) / lout;
    d += ` L${b.x - ux * rr},${b.y - uy * rr} Q${b.x},${b.y} ${b.x + vx * rr},${b.y + vy * rr}`;
  }
  const last = p[p.length - 1]!;
  return `${d} L${last.x},${last.y}`;
}
