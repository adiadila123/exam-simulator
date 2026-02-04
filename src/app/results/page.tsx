import ResultsSummary from "@/components/ResultsSummary";

type ResultsPageProps = {
  searchParams?: { set?: string };
};

export default function ResultsPage({ searchParams }: ResultsPageProps) {
  const setId = searchParams?.set ?? "A";

  return (
    <main className="page">
      <div className="container">
        <ResultsSummary setId={setId} />
      </div>
    </main>
  );
}
