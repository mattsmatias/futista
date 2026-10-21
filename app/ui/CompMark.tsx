// Kilpailun tunnusmerkki: lyhenne kilpailun värissä (väri vain tunnisteena)
import { COMP_META } from "@/lib/comps";

export function CompMark({ id }: { id: string }) {
  const m = COMP_META[id as keyof typeof COMP_META];
  return <span className={`cmark cm-${id}`} aria-hidden="true">{m?.mark ?? (id === "intl" ? "MJ" : id.slice(0, 2).toUpperCase())}</span>;
}
