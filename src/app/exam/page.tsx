import ExamRunner from "@/components/ExamRunner";

type ExamSearchParams = {
  set?: string;
};

type ExamPageProps = {
  searchParams?: Promise<ExamSearchParams>;
};

export default async function ExamPage({ searchParams }: ExamPageProps) {
  const sp = await searchParams;
  const setId = sp?.set ?? "A";

  return (
    <main className="page">
      <div className="container">
        <ExamRunner key={setId} setId={setId} />
      </div>
    </main>
  );
}
