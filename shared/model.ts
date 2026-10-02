import { z } from "zod";
export const methodSchema = z.enum(["lightning", "bitcoin", "ark"]);
export type Method = z.infer<typeof methodSchema>;
export const configSchema = z
  .object({
    title: z.string().min(1).max(60),
    event: z.string().min(1).max(100),
    publicUrl: z.url(),
    methods: z.array(methodSchema).min(1),
    chapters: z
      .array(
        z.object({
          scene: z.enum([
            "station",
            "spree",
            "alexanderplatz",
            "gallery",
            "gate",
            "vault",
            "hall",
          ]),
          recruit: z
            .object({
              id: z
                .string()
                .regex(/^[a-z0-9-]+$/)
                .max(32),
              name: z.string().min(1).max(32),
              role: z.string().min(1).max(60),
              sprite: z.enum([
                "volunteer",
                "tinkerer",
                "hacker",
                "artist",
                "builder",
                "host",
              ]),
            })
            .optional(),
          name: z.string(),
          subtitle: z.string(),
          threshold: z.number().int().nonnegative().safe(),
          reward: z
            .enum(["hat", "sunglasses", "shirt", "bag", "key"])
            .nullable(),
        }),
      )
      .length(6),
    goal: z.number().int().positive().safe(),
    contributionPresets: z
      .array(z.number().int().positive().safe().max(1000000000))
      .min(1)
      .max(6)
      .optional(),
  })
  .superRefine((c, ctx) => {
    const ids = c.chapters.map(
      (ch, i) =>
        ch.recruit?.id ?? ["leni", "bo", "mira", "jules", "ada", "oskar"][i],
    );
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: "custom",
        message: "Companion identities must be unique",
      });
    if (
      c.chapters[0].threshold !== 0 ||
      c.chapters.some(
        (x, i) => i > 0 && x.threshold <= c.chapters[i - 1].threshold,
      ) ||
      c.goal <= c.chapters[5].threshold
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Thresholds must begin at zero, increase strictly, and end below the goal",
      });
  });
export type Config = z.infer<typeof configSchema>;
export type Contribution = {
  id: string;
  amount: number;
  name: string;
  method: Method;
  destination: string;
  uri: string;
  expires: number | null;
  created: number;
  status: "pending" | "paid" | "expired";
  received: number;
  onchain?: Observation[];
  acceleration?: AccelerationAttempt;
};
export type Receipt = { key: string; requestId: string; amount: number };
export type State = {
  total: number;
  count: number;
  crew: string[];
  eventMode?: "live" | "archive";
  eventKey?: string;
  onchain?: Observation[];
  level: number;
  chapter: number;
  progress: number;
  remaining: number;
  vaultOpen: boolean;
  rewards: string[];
  treasureTier: number;
  eventId: number;
  mode: "demo" | "signet" | "mainnet";
};
export type Celebration = {
  id: number;
  amount: number;
  name: string;
  level: number;
  previousLevel: number;
  total: number;
  method?: Method;
  requestId?: string;
};
export function progression(total: number, c: Config) {
  const level =
    c.chapters.slice(1).filter((x) => total >= x.threshold).length +
    (total >= c.goal ? 1 : 0);
  const chapter = Math.min(level, 5);
  const start = c.chapters[chapter].threshold;
  const end = c.chapters[chapter + 1]?.threshold ?? c.goal;
  return {
    level,
    chapter,
    crew: c.chapters
      .map((_, i) => ({
        recruit: chapterRecruit(c, i),
        threshold: recruitmentThreshold(c, i),
      }))
      .filter((x) => total >= x.threshold)
      .map((x) => x.recruit.id),
    progress:
      total >= c.goal
        ? 1
        : Math.max(0, Math.min(1, (total - start) / (end - start))),
    remaining: Math.max(0, end - total),
    vaultOpen: total >= c.goal,
    rewards: c.chapters
      .filter((x) => x.threshold <= total && x.reward)
      .map((x) => x.reward!),
    treasureTier:
      total < c.goal
        ? 0
        : Math.min(
            12,
            1 +
              Math.floor((total - c.goal) / Math.max(1, Math.ceil(c.goal / 8))),
          ),
  };
}
export const contributionSchema = z.object({
  amount: z.number().int().min(1).max(1000000000),
  name: z
    .string()
    .trim()
    .max(32)
    .default("")
    .transform((x) => x.replace(/[\u0000-\u001f\u007f]/g, "")),
  method: methodSchema,
});
export const sats = (n: number) => n.toLocaleString("en-US");

export const defaultRecruits = [
  {
    id: "leni",
    name: "Leni",
    role: "Welcoming volunteer",
    sprite: "volunteer",
  },
  { id: "bo", name: "Bo", role: "Bicycle tinkerer", sprite: "tinkerer" },
  { id: "mira", name: "Mira", role: "Signal hacker", sprite: "hacker" },
  { id: "jules", name: "Jules", role: "Mural artist", sprite: "artist" },
  { id: "ada", name: "Ada", role: "Community builder", sprite: "builder" },
  { id: "oskar", name: "Oskar", role: "Event host", sprite: "host" },
] as const;
export type Recruit = {
  id: string;
  name: string;
  role: string;
  sprite: string;
};
export function chapterRecruit(c: Config, index: number): Recruit {
  return c.chapters[index].recruit ?? defaultRecruits[index];
}
export function recruitmentThreshold(c: Config, index: number) {
  const start = c.chapters[index].threshold;
  return (
    start +
    Math.ceil(((c.chapters[index + 1]?.threshold ?? c.goal) - start) / 2)
  );
}
export function giftPresets(c: Config) {
  return (
    c.contributionPresets ?? [
      ...new Set(
        [2000, 400, 200, 40].map((divisor) =>
          Math.max(1, Math.min(1000000000, Math.round(c.goal / divisor))),
        ),
      ),
    ]
  );
}
export type Observation = {
  key: string;
  requestId: string;
  txid: string;
  amount: number;
  name: string;
  status: "pending" | "confirmed" | "replaced" | "dropped";
  replacement?: string;
  acceleration?: "accepted" | "failed";
};
export type AccelerationQuote = {
  id: string;
  requestId: string;
  txid: string;
  totalSats: number;
  boostSats: number;
  serviceSats: number;
  expires: number;
};
export type AccelerationAttempt = {
  txid: string;
  invoiceId: string;
  invoice: string;
  totalSats: number;
  expires: number;
  status: "invoice" | "accepted" | "failed" | "confirmed";
};
export type StoryEvent = {
  id: number;
  kind: "donation" | "onchain" | "acceleration" | "reset";
  created: number;
  payload: any;
};
export type HistoryPage = {
  config: Config;
  eventKey: string;
  events: StoryEvent[];
  cutoff: number;
  after: number;
  more: boolean;
  finalTotal: number;
};
