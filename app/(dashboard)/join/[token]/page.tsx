import JoinInvitation from '@/components/play/JoinInvitation';
import HomePage from '../../page';

// Opened directly (QR code or shared link): show the invitation as a modal
// over Home. Soft navigation from inside the app uses @modal/(.)join instead.
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <>
    <HomePage />
    <JoinInvitation token={token} />
  </>;
}
