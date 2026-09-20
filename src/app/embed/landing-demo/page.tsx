import LandingEmbedFrame from "@/features/embed/components/LandingEmbedFrame";

type Props = {
  searchParams: Promise<{ key?: string; mode?: string }>;
};

export default async function LandingDemoPage({ searchParams }: Props) {
  const params = await searchParams;
  const mode = params.mode === "voice" ? "voice" : "fab";
  return <LandingEmbedFrame apiKey={params.key ?? ""} mode={mode} />;
}
