import { T } from "@/lib/i18n";

export default function NotFound() {
  return (
    <main className="wrap" style={{ paddingBlock: 64 }}>
      <h1 style={{ fontFamily: "var(--display)" }}><T k="notFound" /></h1>
      <p><T k="notFoundTxt" /> <a href="/" style={{ color: "var(--pl)" }}><T k="toHome" /></a>.</p>
    </main>
  );
}
