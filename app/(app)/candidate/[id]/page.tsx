import { redirect } from "next/navigation";

export default function CandidateRedirect({ params }: { params: { id: string } }) {
  const { id } = params;
  redirect(`/candidates?candidate=${encodeURIComponent(id)}`);
}
