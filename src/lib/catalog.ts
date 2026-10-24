export const SOURCES = [
  {
    id: "revenue-partners",
    title: "Revenue Partners",
    url: "https://zenti.com/revenue-partners/",
    description: "Zenti's revenue partnership program",
  },
  {
    id: "industries",
    title: "Industries",
    url: "https://zenti.com/industries/",
    description: "Industries served by Zenti",
  },
  {
    id: "high-risk-partnerships",
    title: "High-Risk Reseller Payment Processing Partnerships",
    url: "https://zenti.com/blog/high-risk-reseller-payment-processing-partnerships/",
    description: "Zenti article on high-risk referral partnerships",
  },
  {
    id: "high-risk-explained",
    title: "High-Risk Merchant Services Explained",
    url: "https://zenti.com/blog/high-risk-merchant-services-explained-industries-risks-how-to-get-approved/",
    description: "Zenti article explaining high-risk merchant services",
  },
] as const;

export type SourceId = (typeof SOURCES)[number]["id"];
export type SourceRecord = (typeof SOURCES)[number];

export function getSource(id: string): SourceRecord | undefined {
  return SOURCES.find((source) => source.id === id);
}
