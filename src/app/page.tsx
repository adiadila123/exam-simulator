import ModeSelect from "@/components/ModeSelect";

export default function Home() {
  return (
    <main className="page">
      <div className="container">
        <header className="header">
          <div>
            <h1 className="title">Economics Exam Simulator</h1>
            <p className="subtitle">
              Timed practice with auto-marking for MCQs and self-mark guidance.
            </p>
          </div>
          <span className="pill">Exam mode</span>
        </header>
        <ModeSelect />
      </div>
    </main>
  );
}
