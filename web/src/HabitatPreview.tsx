import type { SiteSummary } from "../../api/src/contracts/site";

export function HabitatPreview({ site }: { site: SiteSummary }) {
  return (
    <section className="habitat-preview">
      <div className="preview-heading">
        <div>
          <p className="eyebrow">05 / CONCEPTUAL OUTPOST</p>
          <h2>
            Room for research.
            <br />
            <span>Space to imagine.</span>
          </h2>
        </div>
        <div className="concept-badge">
          ILLUSTRATIVE ONLY
          <br />
          NOT ENGINEERING-VALIDATED
        </div>
      </div>
      <p className="section-copy">
        A visual concept for {site.name}, at{" "}
        {site.location.coordinates.map((v) => v.toFixed(5)).join("°, ")}° on
        Mars. This artwork is not a terrain reconstruction or a proposed
        construction plan.
      </p>
      <svg
        className="habitat-art"
        viewBox="0 0 1100 570"
        role="img"
        aria-label={`Illustrative habitat and greenhouse concept for ${site.name}, not an engineering-validated design`}
      >
        <defs>
          <linearGradient id="sky" x2="0" y2="1">
            <stop stopColor="#19272e" />
            <stop offset="1" stopColor="#5b403a" />
          </linearGradient>
          <linearGradient id="regolith" x2="0.8" y2="1">
            <stop stopColor="#b67251" />
            <stop offset="1" stopColor="#4c3731" />
          </linearGradient>
          <linearGradient id="shell" x2="0.4" y2="1">
            <stop stopColor="#e5dfc9" />
            <stop offset="1" stopColor="#82918c" />
          </linearGradient>
          <linearGradient id="glass" x2="1" y2="1">
            <stop stopColor="#a7ead4" stopOpacity=".7" />
            <stop offset="1" stopColor="#37685c" stopOpacity=".85" />
          </linearGradient>
          <radialGradient id="halo">
            <stop stopColor="#d9c5a0" stopOpacity=".2" />
            <stop offset="1" stopColor="#d9c5a0" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="1100" height="570" fill="url(#sky)" rx="12" />
        <ellipse cx="870" cy="70" rx="270" ry="160" fill="url(#halo)" />
        <path
          d="M0 245L75 207 171 240 301 184 427 245 544 219 678 246 801 208 949 222 1100 178V570H0Z"
          fill="#573d35"
        />
        <path
          d="M0 298L164 273 327 295 501 251 710 281 850 255 1100 289V570H0Z"
          fill="#76513e"
        />
        <path
          d="M0 339Q300 269 587 335T1100 310V570H0Z"
          fill="url(#regolith)"
        />
        <g opacity=".15" fill="none" stroke="#f0c8a2">
          <path d="M0 390Q300 340 620 399T1100 359" />
          <path d="M0 425Q300 375 620 434T1100 394" />
          <path d="M0 460Q300 410 620 469T1100 429" />
          <path d="M0 495Q300 445 620 504T1100 464" />
        </g>
        <ellipse
          cx="517"
          cy="435"
          rx="240"
          ry="40"
          fill="#2c2b28"
          opacity=".4"
        />
        <path d="M282 389L367 437 665 361 576 316Z" fill="#433b32" />
        <path d="M309 376L370 409 627 345 569 311Z" fill="#71837a" />
        <path d="M351 347L429 388 624 336 548 296Z" fill="#c8bda2" />
        <path d="M351 347V393L429 435V388Z" fill="#a3a38f" />
        <path d="M429 388L624 336V382L429 435Z" fill="#84938a" />
        <path
          d="M351 347Q385 268 429 308L624 256Q576 222 548 296Z"
          fill="url(#shell)"
        />
        <path
          d="M429 308Q469 310 463 379L624 336V256Q659 271 655 328Z"
          fill="#bbc6b5"
        />
        <path
          d="M430 308Q465 318 463 379L429 388V435L655 374V328L624 336V256"
          fill="url(#shell)"
        />
        <g stroke="#73857c" strokeWidth="2" fill="none">
          <path d="M471 297Q503 311 501 369" />
          <path d="M513 286Q545 300 543 358" />
          <path d="M555 275Q587 290 585 346" />
        </g>
        <path d="M479 391V369L503 362V385Z" fill="#28404a" />
        <path d="M529 378V355L553 348V372Z" fill="#28404a" />
        <path d="M580 365V342L604 336V359Z" fill="#28404a" />
        <path d="M355 386L428 423 428 449 346 409 311 401Z" fill="#947052" />
        <path d="M440 438L655 380 687 398 452 461 415 449Z" fill="#a97852" />
        <path d="M649 360L721 398 766 385 697 348Z" fill="#b8bba2" />
        <path d="M649 360V378L721 417V398Z" fill="#7b8d7e" />
        <path d="M705 363L776 400 938 357 866 320Z" fill="#63806b" />
        <path d="M705 363V388L776 426 938 382V357L776 400Z" fill="#39544b" />
        <path
          d="M705 363Q735 290 776 324L938 281Q905 247 866 320Z"
          fill="url(#glass)"
        />
        <path
          d="M776 324Q811 329 808 392L938 357V281Q973 289 970 348L938 357"
          fill="url(#glass)"
          stroke="#8fb8a2"
          strokeWidth="2"
        />
        <g fill="none" stroke="#bad9bf" strokeWidth="2">
          <path d="M776 324Q811 329 808 392" />
          <path d="M815 313Q851 318 848 381" />
          <path d="M856 302Q891 307 888 370" />
          <path d="M897 292Q932 296 929 359" />
        </g>
        <g fill="#82b76c">
          <ellipse
            cx="799"
            cy="378"
            rx="13"
            ry="5"
            transform="rotate(-13 799 378)"
          />
          <ellipse cx="833" cy="370" rx="13" ry="5" />
          <ellipse cx="866" cy="360" rx="13" ry="5" />
          <ellipse cx="901" cy="351" rx="13" ry="5" />
        </g>
        <g fill="#263f4d" stroke="#89a2a4">
          <path d="M210 388L274 420 317 390 250 360Z" />
          <path d="M185 419L249 451 291 421 226 390Z" />
          <path d="M160 450L225 482 267 452 201 421Z" />
        </g>
        <g stroke="#a8b9b3" strokeWidth="1.5">
          <path d="M243 368L284 405M221 378L264 415M218 401L259 437M193 412L235 447M191 433L233 469M167 445L210 478" />
        </g>
        <g fill="none" stroke="#e7d6b8" strokeWidth="1">
          <path d="M460 280L450 180H335" />
          <path d="M901 285L943 204H1028" />
          <path d="M216 406L133 363H63" />
        </g>
        <g
          fill="#f5e3c4"
          fontFamily="sans-serif"
          fontSize="14"
          letterSpacing="2"
        >
          <text x="335" y="165">
            RESEARCH HABITAT
          </text>
          <text x="856" y="190">
            GREENHOUSE
          </text>
          <text x="38" y="348">
            POWER CONCEPT
          </text>
        </g>
        <text
          x="35"
          y="535"
          fill="#f5debe"
          fontFamily="sans-serif"
          fontSize="11"
          letterSpacing="2"
        >
          CONCEPT ART / NO SCALE / NO PERFORMANCE OR SAFETY CLAIM
        </text>
      </svg>
      <div className="concept-notes">
        <article>
          <h3>Research habitat</h3>
          <p>
            An enclosed living and research space. The covering and modular form
            are illustrative; structural integrity, radiation shielding and life
            support are unresolved.
          </p>
        </article>
        <article>
          <h3>Greenhouse</h3>
          <p>
            A conceptual controlled growing space. Temperature, pressure,
            energy, water access and crop viability have not been validated for
            this site.
          </p>
        </article>
        <article>
          <h3>Before a real outpost</h3>
          <p>
            Scout local ground hazards, verify resource access, characterize
            radiation, and complete engineering and environmental review.
            Terrain evidence alone cannot establish habitability.
          </p>
        </article>
      </div>
    </section>
  );
}
