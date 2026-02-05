import ExamRunner from "@/components/ExamRunner";

type ExamSearchParams = {
  set?: string;
  mode?: string;
};

type ExamPageProps = {
  searchParams?: Promise<ExamSearchParams>;
};

export default async function ExamPage({ searchParams }: ExamPageProps) {
  const sp = await searchParams;
  const setId = sp?.set ?? "A";
  const mode = sp?.mode === "practice" ? "practice" : "real_exam";

  return (
    <main className="page">
      <div className="container">
        <ExamRunner key={`${setId}-${mode}`} setId={setId} mode={mode} />
      </div>
    </main>
  );
}
