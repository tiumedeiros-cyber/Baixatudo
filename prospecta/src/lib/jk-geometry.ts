/**
 * Geometria do monograma JK (mesma do portfólio da Kelvin Studio).
 * Coordenadas num espaço de 256x200; a marca visível ocupa JK_VIEWBOX.
 */
export type Pt = readonly [number, number];

export const JK_VIEWBOX = { x: 14, y: 4, w: 240, h: 168 } as const;

export type JKPiece = {
  id: "j" | "k-stem" | "k-leg" | "k-arm";
  tone: "ink" | "accent";
  points: readonly Pt[];
};

export const JK_PIECES: readonly JKPiece[] = [
  {
    id: "j",
    tone: "ink",
    points: [
      [70, 28],
      [106, 28],
      [106, 138],
      [84, 168],
      [20, 168],
      [20, 138],
      [70, 138],
    ],
  },
  {
    id: "k-stem",
    tone: "ink",
    points: [
      [126, 28],
      [162, 28],
      [162, 168],
      [126, 168],
    ],
  },
  {
    id: "k-leg",
    tone: "ink",
    points: [
      [170, 108],
      [206, 108],
      [248, 168],
      [206, 168],
    ],
  },
  {
    id: "k-arm",
    tone: "accent",
    points: [
      [170, 92],
      [206, 92],
      [248, 10],
      [212, 10],
    ],
  },
] as const;

export const toPath = (points: readonly Pt[]) =>
  "M" + points.map(([x, y]) => `${x} ${y}`).join("L") + "Z";
