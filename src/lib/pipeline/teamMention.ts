import type { Team } from "@/lib/types";

/** Article-level team filter: city, nickname, abbreviation (PRD — no hardcoded team names in callers). */
export const textMentionsTeam = (text: string, team: Team): boolean => {
  const t = text.toLowerCase();
  const city = team.city.toLowerCase();
  const name = team.name.toLowerCase();
  const abbr = team.abbreviation.toLowerCase();

  if (t.includes(city) || t.includes(name) || t.includes(abbr)) {
    return true;
  }

  const nickname = name.replace(/\s+/g, "");
  if (nickname.length >= 4 && t.includes(nickname)) {
    return true;
  }

  return false;
};
