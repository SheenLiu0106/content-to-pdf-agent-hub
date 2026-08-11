import {
  formatActor,
  formatTime,
  RUN_EVENT_LABELS,
  RUN_STATUS_LABELS,
  type RunEvent,
} from "../../lib/runTypes";
import { RawDetail } from "./ui";

/**
 * run_events, translated. The internal event name never reaches the page as primary
 * text, and detail_json is only reachable through a collapsed section.
 */
export default function RunTimeline({ events }: { events: RunEvent[] }) {
  const ordered = [...events].sort((a, b) => b.seq - a.seq);

  return (
    <section className="panel-card">
      <div className="panel-head">
        <h4>Event history</h4>
        <span>Most recent first</span>
      </div>
      <div className="panel-body">
        {ordered.length === 0 ? (
          <p className="text-[9px] text-ink-mute">No events recorded yet.</p>
        ) : (
          <ol>
            {ordered.map((event) => (
              <li key={event.id} className="task-line">
                <span className="task-check" aria-hidden="true">
                  {event.type === "failed" ? "✕" : "•"}
                </span>
                <span className="min-w-0">
                  <strong>{RUN_EVENT_LABELS[event.type] ?? event.type}</strong>
                  <p>
                    {formatActor(event.actor)}
                    {event.fromStatus && event.toStatus && (
                      <>
                        {" · "}
                        {RUN_STATUS_LABELS[event.fromStatus]}
                        <span aria-label="changed to"> → </span>
                        {RUN_STATUS_LABELS[event.toStatus]}
                      </>
                    )}
                    {!event.fromStatus && event.toStatus && (
                      <> · Now {RUN_STATUS_LABELS[event.toStatus]}</>
                    )}
                  </p>
                  <RawDetail detail={event.detail} />
                </span>
                <time>{formatTime(event.createdAt)}</time>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
