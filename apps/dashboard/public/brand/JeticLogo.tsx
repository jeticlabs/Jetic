import { useId, type CSSProperties } from "react";

type JeticIconProps = {
  /** Width in px. Height follows the 2:3 aspect ratio. */
  size?: number;
  /** true = loops forever (loaders). false = plays the intro once and holds. */
  loop?: boolean;
  /** Colour of the light sweep. Use "#000" on a white logo, "#fff" on a dark one. */
  sheen?: string;
  className?: string;
};

const css = `.jl-p{fill:currentColor}
.jl-g{transform-origin:7px 10.5px}
.jl-sg stop{stop-color:var(--j-hi)}
.jl-sg .jl-mid{stop-opacity:var(--j-hia)}
@media(prefers-reduced-motion:reduce){.jl *{animation:none!important}.jl-s{display:none}}
.jl[data-loop="true"] .jl-g{animation:jl-g 4.8s infinite}.jl[data-loop="true"] .jl-a{animation:jl-a 4.8s infinite}.jl[data-loop="true"] .jl-b{animation:jl-b 4.8s infinite}.jl[data-loop="true"] .jl-c{animation:jl-c 4.8s infinite}.jl[data-loop="true"] .jl-s{animation:jl-s 4.8s infinite}
@keyframes jl-g{0%{transform:scale(.94);animation-timing-function:cubic-bezier(.22,1,.36,1)}25%,100%{transform:scale(1)}}
@keyframes jl-a{0%{transform:translateX(-14px);animation-timing-function:cubic-bezier(.22,1,.36,1)}15.625%{transform:translateX(0)}62.5%{transform:translateX(0);animation-timing-function:cubic-bezier(.65,0,.35,1)}76.042%,100%{transform:translateX(14px)}}
@keyframes jl-b{0%,6.25%{transform:translateY(-7.2px);animation-timing-function:cubic-bezier(.22,1,.36,1)}20.833%{transform:translateY(0)}67.708%{transform:translateY(0);animation-timing-function:cubic-bezier(.65,0,.35,1)}81.25%,100%{transform:translateY(7.2px)}}
@keyframes jl-c{0%,12.5%{transform:translateX(14px);animation-timing-function:cubic-bezier(.22,1,.36,1)}28.125%{transform:translateX(0)}72.917%{transform:translateX(0);animation-timing-function:cubic-bezier(.65,0,.35,1)}86.458%,100%{transform:translateX(-14px)}}
@keyframes jl-s{0%,31.25%{transform:translateX(-9px);animation-timing-function:cubic-bezier(.45,0,.25,1)}47.917%,100%{transform:translateX(27px)}}

.jl[data-loop="false"] .jl-g{animation:jl-g-in 1.2s cubic-bezier(.22,1,.36,1) both}
.jl[data-loop="false"] .jl-a{animation:jl-a-in .75s cubic-bezier(.22,1,.36,1) both}
.jl[data-loop="false"] .jl-b{animation:jl-b-in .7s cubic-bezier(.22,1,.36,1) .3s both}
.jl[data-loop="false"] .jl-c{animation:jl-c-in .75s cubic-bezier(.22,1,.36,1) .6s both}
.jl[data-loop="false"] .jl-s{animation:jl-s-in .8s cubic-bezier(.45,0,.25,1) 1.5s both}
@keyframes jl-g-in{from{transform:scale(.94)}}
@keyframes jl-a-in{from{transform:translateX(-14px)}}
@keyframes jl-b-in{from{transform:translateY(-7.2px)}}
@keyframes jl-c-in{from{transform:translateX(14px)}}
@keyframes jl-s-in{from{transform:translateX(-9px)}to{transform:translateX(27px)}}`;

/** The logo takes its colour from `currentColor`, e.g. className="text-white". */
export function JeticIcon({ size = 20, loop = true, sheen = "#000", className }: JeticIconProps) {
  const id = useId().replace(/:/g, "");
  const style = { "--j-hi": sheen, "--j-hia": 0.22 } as CSSProperties;

  return (
    <svg
      className={`jl ${className ?? ""}`}
      data-loop={loop}
      style={style}
      width={size}
      height={size * 1.5}
      viewBox="0 0 14 21"
      role="img"
      aria-label="Jetic"
    >
      <style>{css}</style>
      <defs>
        <clipPath id={`${id}-shape`}>
          <path d="M0 0h14v14l-7 7H0v-7h7V7H0V0Z" />
        </clipPath>
        <clipPath id={`${id}-a`}><rect x="0" y="-1" width="14" height="9" /></clipPath>
        <clipPath id={`${id}-b`}><rect x="6" y="6.96" width="9" height="7.08" /></clipPath>
        <clipPath id={`${id}-c`}><rect x="0" y="13" width="14" height="9" /></clipPath>
        <linearGradient id={`${id}-sg`} className="jl-sg">
          <stop offset="0" stopOpacity="0" />
          <stop offset=".5" className="jl-mid" />
          <stop offset="1" stopOpacity="0" />
        </linearGradient>
      </defs>

      <g className="jl-g">
        <g clipPath={`url(#${id}-a)`}><path className="jl-p jl-a" d="M0 0H14V7.04H7V7H0Z" /></g>
        <g clipPath={`url(#${id}-b)`}><path className="jl-p jl-b" d="M7 6.96H14V14.04H7Z" /></g>
        <g clipPath={`url(#${id}-c)`}><path className="jl-p jl-c" d="M0 14H7V13.96H14V14L7 21H0Z" /></g>
        <g clipPath={`url(#${id}-shape)`}>
          <g className="jl-s">
            <rect transform="skewX(-20)" x="0" y="-2" width="5" height="25" fill={`url(#${id}-sg)`} />
          </g>
        </g>
      </g>
    </svg>
  );
}
