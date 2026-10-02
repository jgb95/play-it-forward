import { z } from "zod";
export const presentationSchema = z.object({
  pace: z.enum(["cinematic", "snappy"]).default("cinematic"),
  cueSeconds: z.number().min(1).max(8).default(3.6),
  volume: z.number().min(0).max(1).default(0.45),
});
export type Presentation = z.infer<typeof presentationSchema> & {
  skip: number;
};
export const defaultPresentation: Presentation = {
  pace: "cinematic",
  cueSeconds: 3.6,
  volume: 0.45,
  skip: 0,
};
