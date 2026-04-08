import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const teams = [
  { name: "Bills", city: "Buffalo", slug: "buffalo-bills", abbreviation: "BUF", primary_color: "#00338D", secondary_color: "#C60C30", accent_color: "#FFFFFF", division: "AFC East", conference: "AFC" },
  { name: "Dolphins", city: "Miami", slug: "miami-dolphins", abbreviation: "MIA", primary_color: "#008E97", secondary_color: "#FC4C02", accent_color: "#005778", division: "AFC East", conference: "AFC" },
  { name: "Patriots", city: "New England", slug: "new-england-patriots", abbreviation: "NE", primary_color: "#002244", secondary_color: "#C60C30", accent_color: "#B0B7BC", division: "AFC East", conference: "AFC" },
  { name: "Jets", city: "New York", slug: "new-york-jets", abbreviation: "NYJ", primary_color: "#125740", secondary_color: "#FFFFFF", accent_color: "#000000", division: "AFC East", conference: "AFC" },
  { name: "Ravens", city: "Baltimore", slug: "baltimore-ravens", abbreviation: "BAL", primary_color: "#241773", secondary_color: "#9E7C0C", accent_color: "#000000", division: "AFC North", conference: "AFC" },
  { name: "Bengals", city: "Cincinnati", slug: "cincinnati-bengals", abbreviation: "CIN", primary_color: "#FB4F14", secondary_color: "#000000", accent_color: "#FFFFFF", division: "AFC North", conference: "AFC" },
  { name: "Browns", city: "Cleveland", slug: "cleveland-browns", abbreviation: "CLE", primary_color: "#311D00", secondary_color: "#FF3C00", accent_color: "#FFFFFF", division: "AFC North", conference: "AFC" },
  { name: "Steelers", city: "Pittsburgh", slug: "pittsburgh-steelers", abbreviation: "PIT", primary_color: "#FFB612", secondary_color: "#101820", accent_color: "#FFFFFF", division: "AFC North", conference: "AFC" },
  { name: "Texans", city: "Houston", slug: "houston-texans", abbreviation: "HOU", primary_color: "#03202F", secondary_color: "#A71930", accent_color: "#FFFFFF", division: "AFC South", conference: "AFC" },
  { name: "Colts", city: "Indianapolis", slug: "indianapolis-colts", abbreviation: "IND", primary_color: "#002C5F", secondary_color: "#A2AAAD", accent_color: "#FFFFFF", division: "AFC South", conference: "AFC" },
  { name: "Jaguars", city: "Jacksonville", slug: "jacksonville-jaguars", abbreviation: "JAX", primary_color: "#006778", secondary_color: "#101820", accent_color: "#D7A22A", division: "AFC South", conference: "AFC" },
  { name: "Titans", city: "Tennessee", slug: "tennessee-titans", abbreviation: "TEN", primary_color: "#0C2340", secondary_color: "#4B92DB", accent_color: "#C8102E", division: "AFC South", conference: "AFC" },
  { name: "Broncos", city: "Denver", slug: "denver-broncos", abbreviation: "DEN", primary_color: "#FB4F14", secondary_color: "#002244", accent_color: "#FFFFFF", division: "AFC West", conference: "AFC" },
  { name: "Chiefs", city: "Kansas City", slug: "kansas-city-chiefs", abbreviation: "KC", primary_color: "#E31837", secondary_color: "#FFB81C", accent_color: "#FFFFFF", division: "AFC West", conference: "AFC" },
  { name: "Raiders", city: "Las Vegas", slug: "las-vegas-raiders", abbreviation: "LV", primary_color: "#000000", secondary_color: "#A5ACAF", accent_color: "#FFFFFF", division: "AFC West", conference: "AFC" },
  { name: "Chargers", city: "Los Angeles", slug: "los-angeles-chargers", abbreviation: "LAC", primary_color: "#0080C6", secondary_color: "#FFC20E", accent_color: "#FFFFFF", division: "AFC West", conference: "AFC" },
  { name: "Cowboys", city: "Dallas", slug: "dallas-cowboys", abbreviation: "DAL", primary_color: "#003594", secondary_color: "#041E42", accent_color: "#869397", division: "NFC East", conference: "NFC" },
  { name: "Giants", city: "New York", slug: "new-york-giants", abbreviation: "NYG", primary_color: "#0B2265", secondary_color: "#A71930", accent_color: "#A5ACAF", division: "NFC East", conference: "NFC" },
  { name: "Eagles", city: "Philadelphia", slug: "philadelphia-eagles", abbreviation: "PHI", primary_color: "#004C54", secondary_color: "#A5ACAF", accent_color: "#ACC0C6", division: "NFC East", conference: "NFC" },
  { name: "Commanders", city: "Washington", slug: "washington-commanders", abbreviation: "WAS", primary_color: "#5A1414", secondary_color: "#FFB612", accent_color: "#FFFFFF", division: "NFC East", conference: "NFC" },
  { name: "Bears", city: "Chicago", slug: "chicago-bears", abbreviation: "CHI", primary_color: "#0B162A", secondary_color: "#C83803", accent_color: "#FFFFFF", division: "NFC North", conference: "NFC" },
  { name: "Lions", city: "Detroit", slug: "detroit-lions", abbreviation: "DET", primary_color: "#0076B6", secondary_color: "#B0B7BC", accent_color: "#000000", division: "NFC North", conference: "NFC" },
  { name: "Packers", city: "Green Bay", slug: "green-bay-packers", abbreviation: "GB", primary_color: "#203731", secondary_color: "#FFB612", accent_color: "#FFFFFF", division: "NFC North", conference: "NFC" },
  { name: "Vikings", city: "Minnesota", slug: "minnesota-vikings", abbreviation: "MIN", primary_color: "#4F2683", secondary_color: "#FFC62F", accent_color: "#FFFFFF", division: "NFC North", conference: "NFC" },
  { name: "Falcons", city: "Atlanta", slug: "atlanta-falcons", abbreviation: "ATL", primary_color: "#A71930", secondary_color: "#000000", accent_color: "#A5ACAF", division: "NFC South", conference: "NFC" },
  { name: "Panthers", city: "Carolina", slug: "carolina-panthers", abbreviation: "CAR", primary_color: "#0085CA", secondary_color: "#101820", accent_color: "#BFC0BF", division: "NFC South", conference: "NFC" },
  { name: "Saints", city: "New Orleans", slug: "new-orleans-saints", abbreviation: "NO", primary_color: "#D3BC8D", secondary_color: "#101820", accent_color: "#FFFFFF", division: "NFC South", conference: "NFC" },
  { name: "Buccaneers", city: "Tampa Bay", slug: "tampa-bay-buccaneers", abbreviation: "TB", primary_color: "#D50A0A", secondary_color: "#34302B", accent_color: "#FF7900", division: "NFC South", conference: "NFC" },
  { name: "Cardinals", city: "Arizona", slug: "arizona-cardinals", abbreviation: "ARI", primary_color: "#97233F", secondary_color: "#000000", accent_color: "#FFB612", division: "NFC West", conference: "NFC" },
  { name: "Rams", city: "Los Angeles", slug: "los-angeles-rams", abbreviation: "LAR", primary_color: "#003594", secondary_color: "#FFA300", accent_color: "#FF8200", division: "NFC West", conference: "NFC" },
  { name: "49ers", city: "San Francisco", slug: "san-francisco-49ers", abbreviation: "SF", primary_color: "#AA0000", secondary_color: "#B3995D", accent_color: "#000000", division: "NFC West", conference: "NFC" },
  { name: "Seahawks", city: "Seattle", slug: "seattle-seahawks", abbreviation: "SEA", primary_color: "#002244", secondary_color: "#69BE28", accent_color: "#A5ACAF", division: "NFC West", conference: "NFC" }
];

const sources = [
  { team_id: null, url: "https://www.espn.com/espn/rss/nfl/news", name: "ESPN NFL", type: "general", status: "approved" },
  { team_id: null, url: "https://profootballtalk.nbcsports.com/feed/", name: "Pro Football Talk", type: "general", status: "approved" },
  { team_id: null, url: "https://theathletic.com/rss/nfl", name: "The Athletic NFL", type: "general", status: "approved" }
];

const { error: teamsError } = await supabase
  .from("teams")
  .upsert(teams, { onConflict: "slug" });

if (teamsError) throw teamsError;

const { error: sourcesError } = await supabase
  .from("sources")
  .upsert(sources, { onConflict: "url" });

if (sourcesError) throw sourcesError;

const { error: cleanupError } = await supabase
  .from("sources")
  .delete()
  .in("url", ["https://www.nfl.com/rss/rsslanding", "https://apnews.com/apf-sports"]);

if (cleanupError) throw cleanupError;

console.log("Seed complete.");
