import { useState } from "react";
import type { ReflectionArea } from "./notebook";
import type { Noticed, NoticedSource } from "./noticed";
import { AREA_NAMES } from "./reflect";
import { Disc, type Tone } from "./ui/Disc";
import { Icon, type IconName } from "./ui/icons";

// What you've noticed (Reflect): strengths and areas to grow across the
// eight parts of a life. Every item names where it came from: your answers,
// your Circle (blended, five friends or more), or your reflections (only if
// the person turned that on). Areas to grow are opportunities, never
// judgements, and an area with nothing real to say says so.

const AREAS: ReflectionArea[] = [
  "work",
  "school",
  "family",
  "culture",
  "social",
  "health",
  "money",
  "self",
];
const ICONS: Record<ReflectionArea, IconName> = {
  work: "briefcase",
  school: "notebook",
  family: "heart",
  culture: "globe",
  social: "people",
  health: "leaf",
  money: "bars",
  self: "you",
};
const TONES: Record<ReflectionArea, Tone> = {
  work: "blue",
  school: "blue",
  family: "rose",
  culture: "blue",
  social: "blue",
  health: "green",
  money: "amber",
  self: "purple",
};
const SOURCE: Record<NoticedSource, string> = {
  answers: "From your answers",
  week: "From your answers this week",
  circle: "From your Circle",
  reflections: "From your reflections",
};

const AREA_SHORT: Record<ReflectionArea, string> = {
  ...AREA_NAMES,
  culture: "Culture",
  social: "Social",
  self: "Self",
};

type Props = { noticed: Noticed[]; onReflect: (n: Noticed) => void };

export function ReflectNoticed({ noticed, onReflect }: Props) {
  const [group, setGroup] = useState<"strength" | "grow">("strength");
  const shown = AREAS.map((area) => ({
    area,
    item: noticed.find((n) => n.area === area && n.group === group),
  }));
  return (
    <section className="reflect-noticed" aria-labelledby="noticed-title">
      <div className="card-head">
        <div>
          <h3 id="noticed-title" className="title">
            What you’ve noticed
          </h3>
          <p className="muted small">
            Insights from your answers, your Circle and, if you choose, your
            reflections.
          </p>
        </div>
      </div>
      <div className="u-tabs" role="group" aria-label="Show">
        <button
          type="button"
          className="u-tab"
          aria-pressed={group === "strength"}
          onClick={() => setGroup("strength")}
        >
          Strengths
        </button>
        <button
          type="button"
          className="u-tab"
          aria-pressed={group === "grow"}
          onClick={() => setGroup("grow")}
        >
          Areas to grow
        </button>
      </div>
      {group === "grow" && (
        <p className="muted small">
          Places to grow are openings, not verdicts.
        </p>
      )}
      {shown.every((s) => !s.item) ? (
        <p className="notice">
          {group === "strength"
            ? "Answer a few questions and what they say about you shows here, area by area."
            : "Places to grow show here as your answers build up. None yet, and that is fine."}
        </p>
      ) : (
        <ul
          className="noticed-grid"
          aria-label={group === "strength" ? "Strengths" : "Areas to grow"}
        >
          {shown.map(({ area, item }) => (
            <li
              key={area}
              className={item ? "noticed-card" : "noticed-card is-empty"}
            >
              <p className="noticed-area">
                <Disc icon={ICONS[area]} tone={TONES[area]} size={30} /> {AREA_SHORT[area]}
              </p>
              {item ? (
                <>
                  <p className="noticed-text">{item.text}</p>
                  <p className="noticed-source">{SOURCE[item.source]}</p>
                  <button
                    type="button"
                    className="text-button"
                    aria-label={`Reflect on ${AREA_SHORT[area]}`}
                    onClick={() => onReflect(item)}
                  >
                    <Icon name="chevron" size={16} />
                  </button>
                </>
              ) : (
                <p className="muted small">Nothing here yet.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
