import React, { useId } from "react";
import { sponsorLimits, type Sponsor, type Sponsors } from "../shared/model";

type Group = "headline" | "supporting";

export function SponsorEditor({
  value,
  onChange,
  disabled,
}: {
  value: Sponsors;
  onChange: (value: Sponsors) => void;
  disabled: boolean;
}) {
  const id = useId();
  function edit(
    group: Group,
    index: number,
    field: keyof Sponsor,
    text: string,
  ) {
    onChange({
      ...value,
      [group]: value[group].map((s, i) =>
        i === index
          ? { ...s, [field]: field === "name" ? text : text || undefined }
          : s,
      ),
    });
  }
  function move(group: Group, index: number, offset: number) {
    const roster = [...value[group]];
    const [sponsor] = roster.splice(index, 1);
    roster.splice(index + offset, 0, sponsor);
    onChange({ ...value, [group]: roster });
  }
  function switchGroup(group: Group, index: number) {
    const other: Group = group === "headline" ? "supporting" : "headline";
    onChange({
      ...value,
      [group]: value[group].filter((_, i) => i !== index),
      [other]: [...value[other], value[group][index]],
    });
  }
  return (
    <details className="sponsor-editor">
      <summary>
        Sponsors for the next run · {value.headline.length} always visible ·{" "}
        {value.supporting.length} rotating
      </summary>
      <p>
        Keep two or three main sponsors visible. Any sponsor can move between
        the fixed slots and rotation. Changes are saved when you start the run.
      </p>
      {(["headline", "supporting"] as const).map((group) => {
        const other: Group = group === "headline" ? "supporting" : "headline";
        const label = group === "headline" ? "Always visible" : "Rotating";
        return (
          <fieldset key={group} disabled={disabled}>
            <legend>
              {label} · up to {sponsorLimits[group]}
            </legend>
            {value[group].map((sponsor, i) => (
              <div className="sponsor-edit-row" key={i}>
                <div className="sponsor-edit-fields">
                  <label htmlFor={`${id}-${group}-${i}-name`}>
                    Name
                    <input
                      id={`${id}-${group}-${i}-name`}
                      value={sponsor.name ?? ""}
                      maxLength={80}
                      onChange={(e) => edit(group, i, "name", e.target.value)}
                    />
                  </label>
                  <label htmlFor={`${id}-${group}-${i}-logo`}>
                    Logo path (optional)
                    <input
                      id={`${id}-${group}-${i}-logo`}
                      value={sponsor.logo ?? ""}
                      placeholder="/sponsors/your-logo.png"
                      onChange={(e) => edit(group, i, "logo", e.target.value)}
                    />
                  </label>
                  <label htmlFor={`${id}-${group}-${i}-tier`}>
                    Tier (optional)
                    <input
                      id={`${id}-${group}-${i}-tier`}
                      value={sponsor.tier ?? ""}
                      maxLength={40}
                      onChange={(e) => edit(group, i, "tier", e.target.value)}
                    />
                  </label>
                </div>
                <div className="sponsor-edit-actions">
                  <button
                    type="button"
                    className="secondary"
                    disabled={i === 0}
                    aria-label={`Move ${sponsor.name || "sponsor"} earlier`}
                    onClick={() => move(group, i, -1)}
                  >
                    Earlier
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={i === value[group].length - 1}
                    aria-label={`Move ${sponsor.name || "sponsor"} later`}
                    onClick={() => move(group, i, 1)}
                  >
                    Later
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={value[other].length >= sponsorLimits[other]}
                    aria-label={`${group === "headline" ? "Rotate" : "Keep visible"} ${sponsor.name || "sponsor"}`}
                    onClick={() => switchGroup(group, i)}
                  >
                    {group === "headline" ? "Rotate" : "Keep visible"}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    aria-label={`Remove ${sponsor.name || "sponsor"}`}
                    onClick={() =>
                      onChange({
                        ...value,
                        [group]: value[group].filter((_, j) => i !== j),
                      })
                    }
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="secondary"
              disabled={value[group].length >= sponsorLimits[group]}
              onClick={() =>
                onChange({ ...value, [group]: [...value[group], { name: "" }] })
              }
            >
              Add {group === "headline" ? "fixed sponsor" : "rotating sponsor"}
            </button>
          </fieldset>
        );
      })}
      <label htmlFor={`${id}-seconds`}>
        Seconds per rotating sponsor (4–60)
        <input
          id={`${id}-seconds`}
          type="number"
          min={4}
          max={60}
          value={Number.isFinite(value.seconds) ? value.seconds : ""}
          disabled={disabled}
          onChange={(e) =>
            onChange({ ...value, seconds: e.target.valueAsNumber })
          }
        />
      </label>
      <p>
        Logo files must already be bundled in the app. Leave the path empty to
        display the name.
      </p>
    </details>
  );
}
