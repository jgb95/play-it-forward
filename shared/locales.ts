import {
  configSchema,
  localeSchema,
  defaultRecruits,
  type Config,
  type Locale,
} from "./model.ts";

export const locales = [
  {
    id: "berlin",
    name: "Berlin, Germany",
    city: "Berlin",
    music: "Spree after dark",
  },
  {
    id: "seoul",
    name: "Seoul, South Korea",
    city: "Seoul",
    music: "Seoul night walk",
  },
] as const;
const stories = {
  berlin: {
    event: "bitcoin++ Berlin · payments edition",
    names: [
      "Berlin Hauptbahnhof",
      "Along the Spree",
      "Alexanderplatz",
      "East Side Gallery",
      "Brandenburg Gate",
      "The Hackathon Hall",
    ],
    subtitles: [
      "New city. Empty satchel. An invitation to build together.",
      "A riverside meeting. A little light for the journey.",
      "Find your people in the heart of the city.",
      "Leave the world a little more colourful.",
      "We arrived alone. We go forward together.",
      "Bring Berlin to bitcoin++. Let the build night begin.",
    ],
    crew: ["Leni", "Bo", "Mira", "Jules", "Ada", "Oskar"],
  },
  seoul: {
    event: "bitcoin++ Seoul · privacy edition",
    names: [
      "Seoul Station",
      "Cheonggyecheon",
      "Gwangjang Market",
      "Namsan Tower",
      "Gyeongbokgung",
      "Community House Masil",
    ],
    subtitles: [
      "Arrive in Seoul. Find the first light of the journey.",
      "Follow the stream through the city. Build a quiet connection.",
      "Meet at the market. There is room for one more.",
      "Carry the signal above the rooftops.",
      "Walk through the gates together.",
      "Bring Seoul to bitcoin++. Build privacy together.",
    ],
    crew: ["Min", "Joon", "Hana", "Yuri", "Ara", "Ji"],
  },
};
export function cityName(config: Pick<Config, "locale">) {
  return config.locale === "seoul" ? "Seoul" : "Berlin";
}
export function withLocale(base: Config, locale: Locale): Config {
  localeSchema.parse(locale);
  const story = stories[locale];
  return configSchema.parse({
    ...base,
    locale,
    event: story.event,
    sponsors: base.sponsorLocales?.[locale] ?? base.sponsors,
    chapters: base.chapters.map((chapter, i) => ({
      ...chapter,
      scene: ["station", "spree", "alexanderplatz", "gallery", "gate", "hall"][
        i
      ],
      name: story.names[i],
      subtitle: story.subtitles[i],
      recruit: {
        ...(chapter.recruit ?? defaultRecruits[i]),
        name: story.crew[i],
      },
    })),
  });
}
