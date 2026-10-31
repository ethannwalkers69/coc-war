const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.COC_API_TOKEN;
const BASE = 'https://cocproxy.royaleapi.dev/v1';

app.use(express.static('public'));

const norm = (tag) => '#' + String(tag).replace(/^#/, '').toUpperCase();
const enc = (tag) => encodeURIComponent(norm(tag));

async function cocGet(path) {
  if (!TOKEN) return { status: 500, data: { reason: 'Walang COC_API_TOKEN sa environment variables.' } };
  try {
    const r = await fetch(BASE + path, { headers: { Authorization: `Bearer ${TOKEN}` } });
    const data = await r.json().catch(() => ({}));
    return { status: r.status, data };
  } catch (e) {
    return { status: 502, data: { reason: 'Hindi maabot ang CoC API.' } };
  }
}
const pass = (path) => async (req, res) => {
  const { status, data } = await cocGet(path(req));
  res.status(status).json(data);
};

// Kasalukuyang war
app.get('/api/war/:tag', pass((req) => `/clans/${enc(req.params.tag)}/currentwar`));

// War history (huling 10)
app.get('/api/warlog/:tag', pass((req) => `/clans/${enc(req.params.tag)}/warlog?limit=10`));

// CWL: kinukuha ang lahat ng rounds at pinagsasama ang stats ng bawat member
app.get('/api/cwl/:tag', async (req, res) => {
  const tag = norm(req.params.tag);
  const g = await cocGet(`/clans/${enc(tag)}/currentwar/leaguegroup`);
  if (g.status !== 200) return res.status(g.status).json(g.data);

  const group = g.data;
  const rounds = [];
  const members = {};

  for (let i = 0; i < (group.rounds || []).length; i++) {
    const tags = (group.rounds[i].warTags || []).filter((t) => t && t !== '#0');
    if (!tags.length) continue;
    const wars = await Promise.all(tags.map((t) => cocGet(`/clanwarleagues/wars/${encodeURIComponent(t)}`)));
    for (const w of wars) {
      if (w.status !== 200) continue;
      const d = w.data;
      const mine = d.clan?.tag === tag ? d.clan : d.opponent?.tag === tag ? d.opponent : null;
      if (!mine) continue;
      const other = mine === d.clan ? d.opponent : d.clan;
      rounds.push({
        round: i + 1, state: d.state,
        opponent: other.name,
        stars: mine.stars, oppStars: other.stars,
        destruction: mine.destructionPercentage, oppDestruction: other.destructionPercentage,
      });
      for (const m of mine.members || []) {
        const x = (members[m.tag] ||= { name: m.name, th: m.townhallLevel, stars: 0, attacks: 0, destruction: 0 });
        for (const a of m.attacks || []) { x.stars += a.stars; x.attacks++; x.destruction += a.destructionPercentage; }
      }
    }
  }
  const list = Object.values(members).sort((a, b) => b.stars - a.stars || b.destruction - a.destruction);
  res.json({ season: group.season, state: group.state, rounds, members: list });
});

app.listen(PORT, () => console.log('Running on port ' + PORT));
