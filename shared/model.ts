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
          ]),
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
  })
  .superRefine((c, ctx) => {
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
};
export type Receipt = { key: string; requestId: string; amount: number };
export type State = {
  total: number;
  count: number;
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
        : Math.min(12, 1 + Math.floor((total - c.goal) / 250000)),
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
