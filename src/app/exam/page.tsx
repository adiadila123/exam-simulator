import ExamRunner from "@/components/ExamRunner";

type ExamPageProps = {
  searchParams?: Promise<{ set?: string }>;
};

export default async function ExamPage({ searchParams }: ExamPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const setId = params?.set ?? "A";

  return (
    <main className="page">
      <div className="container">
        <ExamRunner key={setId} setId={setId} />
      </div>
    </main>
  );
}
