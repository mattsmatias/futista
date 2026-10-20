"use client";
import { useState } from "react";
import { useBrokenImage } from "@/lib/img";

/** Kuva, joka piiloutuu (eikä näytä rikkinäistä kuvaketta), jos se ei lataudu */
export default function SafeImg(props: React.ImgHTMLAttributes<HTMLImageElement>) {
  const [broken, setBroken] = useState(false);
  const ref = useBrokenImage(() => setBroken(true));
  if (broken) return null;
  return <img alt="" {...props} ref={ref} onError={() => setBroken(true)} />;
}
