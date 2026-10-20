"use client";
import { useEffect, useRef } from "react";

/** Lukupalkki artikkelin yläreunassa */
export default function Progress() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const on = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      if (ref.current) ref.current.style.width = `${max > 0 ? (scrollY / max) * 100 : 0}%`;
    };
    on();
    addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, []);
  return <div className="progress" ref={ref} />;
}
