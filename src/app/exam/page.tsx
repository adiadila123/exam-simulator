import ExamRunner from "@/components/ExamRunner";

type ExamPageProps = {
  searchParams?: { set?: string };
};

export default function ExamPage({ searchParams }: ExamPageProps) {
  const setId = searchParams?.set ?? "A";

  return (
    <main className="page">
      <div className="container">
        <ExamRunner key={setId} setId={setId} />
      </div>
    </main>
  );
}
