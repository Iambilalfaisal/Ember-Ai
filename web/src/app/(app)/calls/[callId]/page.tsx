import { CallDetailScreen } from "@/features/calls";

export default async function Page({ params }: { params: Promise<{ callId: string }> }) {
  const { callId } = await params;
  return <CallDetailScreen callId={callId} />;
}
