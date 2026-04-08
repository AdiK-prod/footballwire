insert into public.teams
  (name, city, slug, abbreviation, primary_color, secondary_color, accent_color, division, conference)
values
  ('Bills', 'Buffalo', 'buffalo-bills', 'BUF', '#00338D', '#C60C30', '#FFFFFF', 'AFC East', 'AFC'),
  ('Dolphins', 'Miami', 'miami-dolphins', 'MIA', '#008E97', '#FC4C02', '#005778', 'AFC East', 'AFC'),
  ('Patriots', 'New England', 'new-england-patriots', 'NE', '#002244', '#C60C30', '#B0B7BC', 'AFC East', 'AFC'),
  ('Jets', 'New York', 'new-york-jets', 'NYJ', '#125740', '#FFFFFF', '#000000', 'AFC East', 'AFC'),
  ('Ravens', 'Baltimore', 'baltimore-ravens', 'BAL', '#241773', '#9E7C0C', '#000000', 'AFC North', 'AFC'),
  ('Bengals', 'Cincinnati', 'cincinnati-bengals', 'CIN', '#FB4F14', '#000000', '#FFFFFF', 'AFC North', 'AFC'),
  ('Browns', 'Cleveland', 'cleveland-browns', 'CLE', '#311D00', '#FF3C00', '#FFFFFF', 'AFC North', 'AFC'),
  ('Steelers', 'Pittsburgh', 'pittsburgh-steelers', 'PIT', '#FFB612', '#101820', '#FFFFFF', 'AFC North', 'AFC'),
  ('Texans', 'Houston', 'houston-texans', 'HOU', '#03202F', '#A71930', '#FFFFFF', 'AFC South', 'AFC'),
  ('Colts', 'Indianapolis', 'indianapolis-colts', 'IND', '#002C5F', '#A2AAAD', '#FFFFFF', 'AFC South', 'AFC'),
  ('Jaguars', 'Jacksonville', 'jacksonville-jaguars', 'JAX', '#006778', '#101820', '#D7A22A', 'AFC South', 'AFC'),
  ('Titans', 'Tennessee', 'tennessee-titans', 'TEN', '#0C2340', '#4B92DB', '#C8102E', 'AFC South', 'AFC'),
  ('Broncos', 'Denver', 'denver-broncos', 'DEN', '#FB4F14', '#002244', '#FFFFFF', 'AFC West', 'AFC'),
  ('Chiefs', 'Kansas City', 'kansas-city-chiefs', 'KC', '#E31837', '#FFB81C', '#FFFFFF', 'AFC West', 'AFC'),
  ('Raiders', 'Las Vegas', 'las-vegas-raiders', 'LV', '#000000', '#A5ACAF', '#FFFFFF', 'AFC West', 'AFC'),
  ('Chargers', 'Los Angeles', 'los-angeles-chargers', 'LAC', '#0080C6', '#FFC20E', '#FFFFFF', 'AFC West', 'AFC'),
  ('Cowboys', 'Dallas', 'dallas-cowboys', 'DAL', '#003594', '#041E42', '#869397', 'NFC East', 'NFC'),
  ('Giants', 'New York', 'new-york-giants', 'NYG', '#0B2265', '#A71930', '#A5ACAF', 'NFC East', 'NFC'),
  ('Eagles', 'Philadelphia', 'philadelphia-eagles', 'PHI', '#004C54', '#A5ACAF', '#ACC0C6', 'NFC East', 'NFC'),
  ('Commanders', 'Washington', 'washington-commanders', 'WAS', '#5A1414', '#FFB612', '#FFFFFF', 'NFC East', 'NFC'),
  ('Bears', 'Chicago', 'chicago-bears', 'CHI', '#0B162A', '#C83803', '#FFFFFF', 'NFC North', 'NFC'),
  ('Lions', 'Detroit', 'detroit-lions', 'DET', '#0076B6', '#B0B7BC', '#000000', 'NFC North', 'NFC'),
  ('Packers', 'Green Bay', 'green-bay-packers', 'GB', '#203731', '#FFB612', '#FFFFFF', 'NFC North', 'NFC'),
  ('Vikings', 'Minnesota', 'minnesota-vikings', 'MIN', '#4F2683', '#FFC62F', '#FFFFFF', 'NFC North', 'NFC'),
  ('Falcons', 'Atlanta', 'atlanta-falcons', 'ATL', '#A71930', '#000000', '#A5ACAF', 'NFC South', 'NFC'),
  ('Panthers', 'Carolina', 'carolina-panthers', 'CAR', '#0085CA', '#101820', '#BFC0BF', 'NFC South', 'NFC'),
  ('Saints', 'New Orleans', 'new-orleans-saints', 'NO', '#D3BC8D', '#101820', '#FFFFFF', 'NFC South', 'NFC'),
  ('Buccaneers', 'Tampa Bay', 'tampa-bay-buccaneers', 'TB', '#D50A0A', '#34302B', '#FF7900', 'NFC South', 'NFC'),
  ('Cardinals', 'Arizona', 'arizona-cardinals', 'ARI', '#97233F', '#000000', '#FFB612', 'NFC West', 'NFC'),
  ('Rams', 'Los Angeles', 'los-angeles-rams', 'LAR', '#003594', '#FFA300', '#FF8200', 'NFC West', 'NFC'),
  ('49ers', 'San Francisco', 'san-francisco-49ers', 'SF', '#AA0000', '#B3995D', '#000000', 'NFC West', 'NFC'),
  ('Seahawks', 'Seattle', 'seattle-seahawks', 'SEA', '#002244', '#69BE28', '#A5ACAF', 'NFC West', 'NFC')
on conflict (slug) do update set
  name = excluded.name,
  city = excluded.city,
  abbreviation = excluded.abbreviation,
  primary_color = excluded.primary_color,
  secondary_color = excluded.secondary_color,
  accent_color = excluded.accent_color,
  division = excluded.division,
  conference = excluded.conference;

insert into public.sources
  (team_id, url, name, type, status)
values
  (null, 'https://www.espn.com/espn/rss/nfl/news', 'ESPN NFL', 'general', 'approved'),
  (null, 'https://www.nfl.com/rss/rsslanding', 'NFL.com', 'general', 'approved'),
  (null, 'https://apnews.com/apf-sports', 'AP Sports NFL', 'general', 'approved'),
  (null, 'https://profootballtalk.nbcsports.com/feed/', 'Pro Football Talk', 'general', 'approved'),
  (null, 'https://theathletic.com/rss/nfl', 'The Athletic NFL', 'general', 'approved')
on conflict (url) do update set
  name = excluded.name,
  type = excluded.type,
  status = excluded.status,
  team_id = excluded.team_id;
