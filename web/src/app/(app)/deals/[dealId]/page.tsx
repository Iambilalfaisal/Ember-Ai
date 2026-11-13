import { DealDetailScreen } from "@/features/deals";

export default async function Page({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params;
  return <DealDetailScreen dealId={dealId} />;
}
