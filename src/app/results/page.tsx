import ResultsSummary from "@/components/ResultsSummary";

type ResultsPageProps = {
  searchParams?: Promise<{ set?: string }>;
};

export default async function ResultsPage({ searchParams }: ResultsPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const setId = params?.set ?? "A";

  return (
    <main className="page">
      <div className="container">
        <ResultsSummary setId={setId} />
      </div>
    </main>
  );
}
