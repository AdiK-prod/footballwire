export type Conference = "AFC" | "NFC";

export type Team = {
  id: number;
  name: string;
  city: string;
  slug: string;
  abbreviation: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  division: string;
  conference: Conference;
};
