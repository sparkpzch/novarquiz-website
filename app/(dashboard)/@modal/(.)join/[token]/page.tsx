import JoinInvitation from '@/components/play/JoinInvitation';

// Soft navigation from a dashboard page opens the invitation as a modal over it.
export default async function JoinModal({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <JoinInvitation token={token} />;
}
