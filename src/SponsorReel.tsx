import React, { useEffect, useState } from "react";
import type { Sponsor, Sponsors } from "../shared/model";

function SponsorLogo({ sponsor }: { sponsor: Sponsor }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [sponsor.logo]);
  return (
    <div className="sponsor-card">
      {sponsor.logo && !failed ? (
        <img
          src={sponsor.logo}
          alt={sponsor.name}
          onError={() => setFailed(true)}
        />
      ) : (
        <strong>{sponsor.name}</strong>
      )}
    </div>
  );
}

export function SponsorReel({
  sponsors,
  reduced,
}: {
  sponsors?: Sponsors;
  reduced: boolean;
}) {
  const [index, setIndex] = useState(0);
  const roster = sponsors?.supporting ?? [];
  useEffect(() => {
    setIndex(0);
    if (reduced || roster.length < 2) return;
    const timer = setInterval(
      () => {
        if (!document.hidden) setIndex((i) => (i + 1) % roster.length);
      },
      (sponsors?.seconds ?? 8) * 1000,
    );
    return () => clearInterval(timer);
  }, [sponsors, reduced]);
  if (!sponsors || (!sponsors.headline.length && !roster.length)) return null;
  const current = roster[index % roster.length];
  return (
    <section className="sponsor-reel" aria-label="Event sponsors">
      {!!sponsors.headline.length && (
        <div className="sponsor-headline">
          <span className="sponsor-caption">HEADLINE SPONSORS</span>
          {sponsors.headline.map((s, i) => (
            <SponsorLogo key={`${s.name}/${i}`} sponsor={s} />
          ))}
        </div>
      )}
      {!!roster.length && (
        <div
          className={`sponsor-supporting ${reduced ? "sponsor-static" : ""}`}
        >
          <span className="sponsor-caption">
            {reduced
              ? "OUR SUPPORTERS"
              : (current.tier ?? "OUR SUPPORTERS").toUpperCase()}
          </span>
          {reduced ? (
            roster.map((s, i) => (
              <SponsorLogo key={`${s.name}/${i}`} sponsor={s} />
            ))
          ) : (
            <SponsorLogo key={index} sponsor={current} />
          )}
          {!reduced && roster.length > 1 && (
            <span
              className="sponsor-count"
              aria-label={`Sponsor ${index + 1} of ${roster.length}`}
            >
              {index + 1} / {roster.length}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
