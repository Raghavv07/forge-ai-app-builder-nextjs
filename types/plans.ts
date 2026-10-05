import { z } from "zod";

export const planSchema = z.enum(["free", "starter", "pro"]);
export type Plan = z.infer<typeof planSchema>;

export function isPlan(value: unknown): value is Plan {
  return planSchema.validate(value);
}

