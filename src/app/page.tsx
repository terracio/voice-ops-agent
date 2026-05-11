import { scaffoldStatus } from "@/domain/schema";

export default function Home() {
  const status = scaffoldStatus();

  return (
    <main className="shell">
      <section className="panel">
        <p className="eyebrow">MealPlan VoiceOps</p>
        <h1>Operational safety scaffold</h1>
        <p>
          The first implementation slice is ready for domain schemas, typed
          tools, ChangeSets, audit logs, and replay evals.
        </p>
        <dl>
          <div>
            <dt>Project</dt>
            <dd>{status.project}</dd>
          </div>
          <div>
            <dt>Scaffold</dt>
            <dd>{status.ready ? "ready" : "not ready"}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
