import ProtectedRoute from "@/components/features/auth/ProtectedRoute";
import CitationWorkspace from "@/components/features/review/CitationWorkspace";
import PageIndexPanel from "@/components/features/review/PageIndexPanel";
import "@/styles/review.css";

export default function ReviewPage() {
  return (
    <ProtectedRoute><div>
      <CitationWorkspace />
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 16px 40px" }}>
        <PageIndexPanel />
      </div>
    </div></ProtectedRoute>
  );
}
