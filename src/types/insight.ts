export type InsightType = 'spending_pattern' | 'prediction' | 'opportunity' | 'anomaly';

export type InsightPriority = 'critical' | 'opportunity' | 'fyi';

export type InsightCtaLabel = 'See Details' | 'Take Action';

export interface Insight {
  type: InsightType;
  headline: string;
  detail: string;
  ctaLabel: InsightCtaLabel;
  ctaRoute?: string;
  priority: InsightPriority;
}
