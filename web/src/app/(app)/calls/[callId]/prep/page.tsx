import { BriefScreen } from "@/features/calls";

export default async function Page({ params }: { params: Promise<{ callId: string }> }) {
  const { callId } = await params;
  return <BriefScreen callId={callId} />;
}
