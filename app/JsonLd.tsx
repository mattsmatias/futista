// JSON-LD (schema.org) script-elementti; "<" koodataan, ettei sisältö voi katkaista script-tagia
export default function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
