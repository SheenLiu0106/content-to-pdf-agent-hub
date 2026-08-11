import { formatTime } from "../../lib/runTypes";
import {
  PHASE_KIND_LABELS,
  type AgentPhase,
  type AgentStage,
} from "../../lib/agentUx";

interface Props {
  phase: AgentPhase;
  /** Real stages from runStages()/createStages() — never a synthetic step list. */
  stages: AgentStage[];
  /** True while a stage is genuinely executing, which is the only time it animates. */
  live?: boolean;
  headline: string;
  body?: string;
  /** Pause semantics, where a pause is actually possible. */
  pauseNote?: string;
  paused?: boolean;
  /** 'is-intake' renders the panel at Create's reading size. */
  className?: string;
}

const ACTOR_LABELS = { system: "System", agent: "Agent", human: "You" } as const;

/**
 * The agent's work, as far as the backend reports it: what is happening now, what
 * finished, and what comes next.
 *
 * There is no percentage, no ETA and no step ticked off without a recorded event or
 * approval behind it. A stage the backend has not timestamped simply shows no time.
 */
export default function AgentProgress({
  phase,
  stages,
  live = false,
  headline,
  body,
  pauseNote,
  paused = false,
  className = "",
}: Props) {
  const current = stages.find((s) => s.state === "current");
  const next = stages.find((s) => s.state === "next");

  return (
    <section className={`agent-summary ${className}`} aria-label="Agent progress">
      {/*
        The eyebrow carries the category (system / agent / human / approved); the
        heading carries the phase itself. Printing both phrases would just say the
        same thing twice.
      */}
      <div className="agent-label">
        <span className={`agent-dot${live && !paused ? " is-live" : ""}`} aria-hidden="true" />
        <span>
          {PHASE_KIND_LABELS[phase.kind]}
          {paused ? " · Agent paused for review" : ""}
        </span>
      </div>
      <h3>{headline}</h3>
      {body && <p>{body}</p>}

      <ol className="stage-list" role="status" aria-live="polite">
        {stages.map((stage) => (
          <li key={stage.key} className={`stage-line is-${stage.state}`}>
            <span className="stage-mark" aria-hidden="true">
              {stage.state === "done" ? (
                "✓"
              ) : stage.state === "current" && live && !paused ? (
                <span className="spinner-dot" />
              ) : stage.state === "current" ? (
                "●"
              ) : (
                "○"
              )}
            </span>
            <span className="min-w-0">
              <strong>
                {stage.label}
                <span className="stage-actor">{ACTOR_LABELS[stage.actor]}</span>
                <span className="sr-only">
                  {stage.state === "done"
                    ? " — completed"
                    : stage.state === "current"
                      ? paused
                        ? " — current stage, paused"
                        : " — in progress now"
                      : stage.state === "next"
                        ? " — next"
                        : " — later"}
                </span>
              </strong>
              {stage.note && <p>{stage.note}</p>}
            </span>
            {stage.at && <time dateTime={stage.at}>{formatTime(stage.at)}</time>}
          </li>
        ))}
      </ol>

      <p className="stage-foot">
        {current ? (
          <>
            <b>Now:</b> {current.label}.{" "}
          </>
        ) : null}
        {next ? (
          <>
            <b>Next:</b> {next.label}
            {next.actor === "human" ? " — your decision." : "."}
          </>
        ) : current ? (
          <>
            <b>Next:</b> nothing further — this is the last stage, and the run closes once
            it is done.
          </>
        ) : (
          "This run is closed."
        )}
      </p>

      {pauseNote && <p className="stage-foot">{pauseNote}</p>}
    </section>
  );
}
