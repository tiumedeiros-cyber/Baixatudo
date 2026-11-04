import { JK_PIECES, JK_VIEWBOX, toPath } from "@/lib/jk-geometry";

type MarkProps = {
  className?: string;
  title?: string;
};

/** Monograma JK: três peças em tinta e o braço do K em lime. */
export function JKMark({ className, title }: MarkProps) {
  const { x, y, w, h } = JK_VIEWBOX;
  return (
    <svg
      viewBox={`${x} ${y} ${w} ${h}`}
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title>{title}</title> : null}
      {JK_PIECES.map((p) => (
        <path
          key={p.id}
          d={toPath(p.points)}
          fill={p.tone === "accent" ? "var(--accent)" : "var(--fg)"}
        />
      ))}
    </svg>
  );
}

/** Marca com colchetes lime nos cantos, usada na tela de login. */
export function JKFramed({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 280 224"
      className={className}
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g fill="none" stroke="var(--accent)" strokeWidth="5">
        <path d="M4 44V4H44" />
        <path d="M236 4H276V44" />
        <path d="M4 180V220H44" />
        <path d="M276 180V220H236" />
      </g>
      <g transform="translate(6 20)">
        {JK_PIECES.map((p) => (
          <path
            key={p.id}
            d={toPath(p.points)}
            transform={`translate(${-JK_VIEWBOX.x + 12} ${-JK_VIEWBOX.y})`}
            fill={p.tone === "accent" ? "var(--accent)" : "var(--fg)"}
          />
        ))}
      </g>
    </svg>
  );
}
