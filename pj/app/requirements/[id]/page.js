import { RequirementDetail } from '@/components/RequirementDetail';

export default async function RequirementDetailPage({ params }) {
  const { id } = await params;
  return <RequirementDetail id={id} />;
}
