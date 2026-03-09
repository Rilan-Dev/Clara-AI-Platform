import { UserDetailsScreen } from "@/features/users";

export default async function UserDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <UserDetailsScreen userId={id} />;
}
