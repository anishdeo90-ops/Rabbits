import { redirect } from "next/navigation";

export default async function CandidateRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/candidates?candidate=${encodeURIComponent(id)}`);
}
