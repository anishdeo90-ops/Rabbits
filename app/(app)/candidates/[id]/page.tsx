import { redirect } from "next/navigation";

export default function CandidateDetailRedirect({ params }: { params: { id: string } }) {
  const { id } = params;
  redirect(`/candidates?candidate=${encodeURIComponent(id)}`);
}
