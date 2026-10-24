import { z } from "zod";

export const sourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.url(),
});

export const claimSchema = z.object({
  claim: z.string().min(1).max(500),
  sourceIds: z.array(z.string()),
  supportingExcerpt: z.string().max(700),
  status: z.enum(["supported", "needs_review"]),
});

export const sceneSchema = z.object({
  sceneNumber: z.number().int().positive(),
  purpose: z.string().min(1).max(180),
  durationSeconds: z.number().int().min(4).max(12),
  spokenLine: z.string().min(1).max(400),
  visualDescription: z.string().min(1).max(500),
  onScreenText: z.string().max(100),
  flowPrompt: z.string().min(1).max(2500),
});

export const contentPackageSchema = z.object({
  topic: z.string().min(1).max(240),
  targetAudience: z.string().min(1).max(240),
  contentAngle: z.string().min(1).max(500),
  shortTitle: z.string().min(1).max(180),
  hook: z.string().min(1).max(300),
  voiceoverScript: z.string().min(1).max(2500),
  scenePlan: z.array(sceneSchema).min(4).max(6),
  fullFlowPrompt: z.string().min(1).max(3000),
  globalFlowConsistencyPrompt: z.string().min(1).max(1800),
  youtubeTitle: z.string().min(1).max(180),
  youtubeDescription: z.string().min(1).max(1800),
  linkedinPost: z.string().min(1).max(2200),
  ctaText: z.string().min(1).max(300),
  ctaUrl: z.url(),
  sources: z.array(sourceSchema).min(1).max(4),
  claims: z.array(claimSchema).max(20),
  humanReviewNotes: z.array(z.string().max(500)).max(12),
});

export type ContentPackage = z.infer<typeof contentPackageSchema>;
