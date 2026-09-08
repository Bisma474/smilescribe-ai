import CitationWorkspace from "@/components/features/poc/CitationWorkspace";
import PageIndexPanel from "@/components/features/poc/PageIndexPanel";
import "@/styles/poc.css";

export default function PocPage() {
  return (
    <div>
      <CitationWorkspace />
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 16px 40px" }}>
        <PageIndexPanel />
      </div>
    </div>
  );
}
