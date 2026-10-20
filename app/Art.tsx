import { allClubs } from "@/lib/sources";

const thumb = (src: string) => src.replace(/\.(jpe?g|png|webp)$/i, "-632x422.$1");

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Kenttäviivat taiteen päälle
const PITCH = (
  <svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <g fill="none" stroke="#fff" strokeWidth="2">
      <rect x="10" y="10" width="380" height="240" rx="4" />
      <line x1="200" y1="10" x2="200" y2="250" />
      <circle cx="200" cy="130" r="42" />
      <rect x="10" y="70" width="58" height="120" />
      <rect x="332" y="70" width="58" height="120" />
    </g>
  </svg>
);

/** Lähteen oma kuva tai, jos kuvaa ei ole, seuran väreistä generoitu taide. */
export function GenArt({ seed, tags, source }: { seed: string; tags: string[]; source: string }) {
  const club = allClubs.find((c) => tags.includes(c.tag));
  const h = hash(seed);
  const base = source === "laliga" ? ["#ff5a3c", "#3b0d06"] : ["#8b5cf6", "#14062e"];
  const c1 = club?.c1 ?? base[0];
  const c2 = club?.c2 ?? base[1];
  const x = 20 + (h % 60);
  const y = 15 + ((h >> 3) % 50);
  return (
    <div
      className="gen"
      style={{
        background: `radial-gradient(120% 90% at ${x}% ${y}%, ${c1} 0%, transparent 60%), radial-gradient(90% 80% at ${100 - x}% ${100 - y}%, ${c2} 0%, transparent 70%), #0b0e14`,
      }}
    >
      {PITCH}
      <b>{club?.short ?? (source === "laliga" ? "LIGA" : "PL")}</b>
    </div>
  );
}

export default function Art({
  image, seed, tags, source, big, className = "",
}: { image: string | null; seed: string; tags: string[]; source: string; big?: boolean; className?: string }) {
  return (
    <div className={`art ${className}`}>
      {image ? (
        <img
          src={big ? image : thumb(image)}
          onError={(e) => { if (e.currentTarget.src !== image) e.currentTarget.src = image; }}
          alt=""
          loading={big ? "eager" : "lazy"}
          referrerPolicy="no-referrer"
        />
      ) : (
        <GenArt seed={seed} tags={tags} source={source} />
      )}
    </div>
  );
}
