import React, { useState, useEffect } from "react";
import {
  LayoutDashboard, Users, Shield, Trophy, Calendar, Zap,
  Radio, Tv2, BarChart2, Heart, LogOut, Bell, Play, Pause,
  Square, Plus, Download, Activity, ChevronRight, Award,
  TrendingUp, ArrowLeft, Star, Menu, MapPin, RefreshCw,
  Settings,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip,
} from "recharts";

// ─── BRAND PALETTE ────────────────────────────────────────────────────────────
const BL = "#00d4ff"; // electric blue
const GR = "#39ff14"; // cyber green
const PK = "#ff2d78"; // cyber pink
const PU = "#9b2dff"; // purple
const OR = "#ff6b00"; // orange

// ─── DATA ─────────────────────────────────────────────────────────────────────
const CLUBS = [
  { id:1, name:"Vortex",  color:BL,        abbr:"VTX", city:"Lagos",         div:"Premier", coach:"Marcus Okafor",  roster:12, fans:2840, played:8, w:6, l:2, pf:624, pa:551, pts:18 },
  { id:2, name:"Apex",    color:OR,        abbr:"APX", city:"Nairobi",       div:"Premier", coach:"Amara Diallo",   roster:11, fans:3120, played:8, w:5, l:3, pf:598, pa:567, pts:16 },
  { id:3, name:"Flux",    color:GR,        abbr:"FLX", city:"Accra",         div:"Premier", coach:"Kwame Asante",   roster:10, fans:1950, played:8, w:4, l:4, pf:572, pa:580, pts:14 },
  { id:4, name:"Surge",   color:PK,        abbr:"SRG", city:"Abuja",         div:"Premier", coach:"Zara Mensah",    roster:12, fans:2210, played:8, w:4, l:4, pf:561, pa:558, pts:14 },
  { id:5, name:"Nova",    color:PU,        abbr:"NOV", city:"Johannesburg",  div:"Premier", coach:"Tendai Mwangi",  roster:11, fans:1780, played:8, w:3, l:5, pf:534, pa:590, pts:12 },
  { id:6, name:"Halo",    color:"#ffd700", abbr:"HLO", city:"Dakar",         div:"Premier", coach:"Sola Adeyemi",   roster:10, fans:2560, played:8, w:3, l:5, pf:512, pa:601, pts:10 },
  { id:7, name:"Ember",   color:"#ff4500", abbr:"EMB", city:"Dar es Salaam", div:"Premier", coach:"Nia Kamara",     roster:11, fans:1630, played:8, w:2, l:6, pf:489, pa:618, pts:8  },
  { id:8, name:"Eclipse", color:"#b0ff3d", abbr:"ECL", city:"Cairo",         div:"Premier", coach:"Dre Nkosi",      roster:10, fans:2090, played:8, w:1, l:7, pf:451, pa:643, pts:6  },
];

const PLAYERS = [
  { id:1,  name:"Kofi Ansah",       gender:"M", pos:"PG", ht:'6\'1"',  status:"Active",  draft:"Eligible",     club:"Vortex",  ppg:22.4, rpg:4.1,  apg:8.3  },
  { id:2,  name:"Amara Sesay",      gender:"F", pos:"SG", ht:'5\'11"', status:"Active",  draft:"Eligible",     club:"Apex",    ppg:19.8, rpg:3.6,  apg:5.1  },
  { id:3,  name:"Tunde Bakare",     gender:"M", pos:"SF", ht:'6\'6"',  status:"Active",  draft:"Eligible",     club:"Flux",    ppg:18.2, rpg:7.4,  apg:2.9  },
  { id:4,  name:"Nadia Osei",       gender:"F", pos:"PF", ht:'6\'2"',  status:"Active",  draft:"Not Eligible", club:"Surge",   ppg:16.5, rpg:9.1,  apg:1.8  },
  { id:5,  name:"Jide Coker",       gender:"M", pos:"C",  ht:'6\'9"',  status:"Active",  draft:"Eligible",     club:"Nova",    ppg:14.3, rpg:11.2, apg:1.4  },
  { id:6,  name:"Fatima Dieng",     gender:"F", pos:"PG", ht:'5\'9"',  status:"Active",  draft:"Eligible",     club:"Halo",    ppg:21.1, rpg:3.8,  apg:9.2  },
  { id:7,  name:"Seun Adekoya",     gender:"M", pos:"SG", ht:'6\'3"',  status:"Injured", draft:"Eligible",     club:"Ember",   ppg:17.7, rpg:4.5,  apg:3.3  },
  { id:8,  name:"Amira Boateng",    gender:"F", pos:"SF", ht:'6\'0"',  status:"Active",  draft:"Not Eligible", club:"Eclipse", ppg:15.9, rpg:6.7,  apg:2.6  },
  { id:9,  name:"Kojo Mensah",      gender:"M", pos:"C",  ht:'6\'11"', status:"Active",  draft:"Eligible",     club:"Vortex",  ppg:13.8, rpg:12.4, apg:0.9  },
  { id:10, name:"Zainab Kamara",    gender:"F", pos:"PF", ht:'6\'1"',  status:"Active",  draft:"Eligible",     club:"Apex",    ppg:14.6, rpg:8.9,  apg:2.1  },
  { id:11, name:"Musa Traore",      gender:"M", pos:"PG", ht:'6\'0"',  status:"Active",  draft:"Eligible",     club:"Flux",    ppg:18.9, rpg:3.2,  apg:7.6  },
  { id:12, name:"Chioma Eze",       gender:"F", pos:"SG", ht:'5\'10"', status:"Active",  draft:"Eligible",     club:"Surge",   ppg:16.1, rpg:3.9,  apg:4.4  },
];

const FIXTURES = [
  { id:1, home:"Vortex", away:"Apex",    date:"Aug 15, 2026", time:"14:00", venue:"Lagos Arena",          status:"Upcoming",  hs:null as number|null, as:null as number|null },
  { id:2, home:"Flux",   away:"Surge",   date:"Aug 15, 2026", time:"16:30", venue:"Accra Sports Complex", status:"Upcoming",  hs:null, as:null },
  { id:3, home:"Nova",   away:"Halo",    date:"Aug 15, 2026", time:"19:00", venue:"Jo'burg Dome",         status:"Upcoming",  hs:null, as:null },
  { id:4, home:"Ember",  away:"Eclipse", date:"Aug 22, 2026", time:"15:00", venue:"Dar es Salaam Hall",   status:"Upcoming",  hs:null, as:null },
  { id:5, home:"Vortex", away:"Flux",    date:"Jul 12, 2026", time:"15:00", venue:"Lagos Arena",          status:"Completed", hs:88,   as:74   },
  { id:6, home:"Apex",   away:"Surge",   date:"Jul 12, 2026", time:"17:30", venue:"Nairobi Centre",       status:"Completed", hs:79,   as:81   },
];

const DRAFT_POOL = [
  { id:101, name:"Emeka Nwosu",    pos:"PG", ht:'6\'2"',  school:"Univ of Lagos",       rating:94, drafted:false },
  { id:102, name:"Abena Frimpong", pos:"SG", ht:'5\'11"', school:"Legon Academy",       rating:91, drafted:false },
  { id:103, name:"Femi Adebayo",   pos:"SF", ht:'6\'5"',  school:"Ibadan Sports Inst",  rating:89, drafted:false },
  { id:104, name:"Yemi Obi",       pos:"PF", ht:'6\'7"',  school:"KNUST",               rating:87, drafted:false },
  { id:105, name:"Sade Williams",  pos:"C",  ht:'6\'9"',  school:"Cairo Basketball",    rating:85, drafted:false },
  { id:106, name:"Leke Adeola",    pos:"PG", ht:'5\'10"', school:"Dakar Academy",       rating:83, drafted:false },
  { id:107, name:"Ife Adeyemi",    pos:"SG", ht:'6\'1"',  school:"Nairobi Hoops",       rating:81, drafted:false },
  { id:108, name:"Remi Okafor",    pos:"SF", ht:'6\'4"',  school:"Jo\'burg College",    rating:79, drafted:false },
];

const PERF_DATA = [
  { g:"G1", pts:22, reb:4, ast:9  },
  { g:"G2", pts:18, reb:5, ast:7  },
  { g:"G3", pts:28, reb:3, ast:11 },
  { g:"G4", pts:14, reb:6, ast:8  },
  { g:"G5", pts:24, reb:4, ast:10 },
  { g:"G6", pts:31, reb:2, ast:12 },
];

const NAV_ITEMS = [
  { id:"dashboard",  label:"Dashboard",    icon:LayoutDashboard },
  { id:"clubs",      label:"Clubs",        icon:Shield          },
  { id:"players",    label:"Players",      icon:Users           },
  { id:"draft",      label:"Draft Room",   icon:Zap             },
  { id:"fixtures",   label:"Fixtures",     icon:Calendar        },
  { id:"live",       label:"Live Game",    icon:Radio           },
  { id:"scoreboard", label:"Scoreboard",   icon:Tv2             },
  { id:"table",      label:"League Table", icon:Trophy          },
  { id:"report",     label:"Match Report", icon:BarChart2       },
  { id:"fanclub",    label:"Fan Club",     icon:Heart           },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
type Club = typeof CLUBS[0];
type Player = typeof PLAYERS[0];

function cc(name: string) {
  return CLUBS.find(c => c.name === name)?.color ?? "#888";
}

function initials(name: string) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase();
}

function Badge({ children, color = BL }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider inline-block"
      style={{ color, border: `1px solid ${color}40`, background: `${color}18` }}
    >
      {children}
    </span>
  );
}

function Card({ children, className = "", style = {} }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`rounded-xl border ${className}`}
      style={{ background: "#0e1018", borderColor: "rgba(0,212,255,0.08)", ...style }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children, color = BL }: { children: React.ReactNode; color?: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="w-1 h-4 rounded-full" style={{ background: color }} />
      <span className="text-xs font-bold uppercase tracking-widest" style={{ color }}>
        {children}
      </span>
    </div>
  );
}

function ClubBadge({ club, size = "md" }: { club: Club; size?: "sm" | "md" | "lg" }) {
  const dims = { sm: "w-7 h-7 text-[9px]", md: "w-10 h-10 text-xs", lg: "w-16 h-16 text-base" };
  return (
    <div
      className={`${dims[size]} rounded-xl flex items-center justify-center font-black border flex-shrink-0`}
      style={{ background: `${club.color}18`, borderColor: `${club.color}35`, color: club.color, fontFamily: "'Exo 2', sans-serif" }}
    >
      {club.abbr}
    </div>
  );
}

// ─── SCREEN: LOGIN ────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [role, setRole] = useState("admin");

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: "#06080f", fontFamily: "'DM Sans', sans-serif" }}
    >
      {/* Court grid lines */}
      <div
        className="absolute inset-0 opacity-[0.035] pointer-events-none"
        style={{
          backgroundImage: `
            repeating-linear-gradient(0deg, transparent, transparent 79px, #00d4ff 79px, #00d4ff 80px),
            repeating-linear-gradient(90deg, transparent, transparent 79px, #00d4ff 79px, #00d4ff 80px)
          `,
        }}
      />
      {/* Center circle */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border pointer-events-none"
        style={{ width: 500, height: 500, borderColor: `${BL}18`, borderWidth: 2 }}
      />
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border pointer-events-none"
        style={{ width: 200, height: 200, borderColor: `${BL}12`, borderWidth: 1 }}
      />
      {/* Ambient glows */}
      <div className="absolute top-0 left-1/3 w-[500px] h-[500px] rounded-full blur-[160px] opacity-[0.12] pointer-events-none" style={{ background: BL }} />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full blur-[160px] opacity-[0.08] pointer-events-none" style={{ background: PK }} />

      <div className="relative z-10 w-full max-w-[420px] px-6">
        {/* Logo */}
        <div className="text-center mb-10">
          <div
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-5 border"
            style={{ background: `${BL}12`, borderColor: `${BL}35`, boxShadow: `0 0 40px ${BL}25` }}
          >
            <span style={{ fontSize: 32, color: BL, fontFamily: "'Exo 2', sans-serif", fontWeight: 900 }}>UB</span>
          </div>
          <div style={{ fontFamily: "'Exo 2', sans-serif" }}>
            <div className="text-2xl font-black tracking-tight text-white">ULTRA BASKETBALL</div>
            <div className="text-[11px] tracking-[0.35em] uppercase mt-1.5" style={{ color: `${BL}99` }}>
              League Operating System
            </div>
          </div>
        </div>

        <Card className="p-8">
          {/* Role picker */}
          <div className="mb-6">
            <div className="text-[10px] text-white/30 uppercase tracking-[0.2em] mb-3">Access Role</div>
            <div className="grid grid-cols-3 gap-2">
              {["Admin","Coach","Scout"].map(r => (
                <button
                  key={r}
                  onClick={() => setRole(r.toLowerCase())}
                  className="py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all"
                  style={{
                    background: role === r.toLowerCase() ? BL : "transparent",
                    color: role === r.toLowerCase() ? "#000" : "rgba(255,255,255,0.35)",
                    border: `1px solid ${role === r.toLowerCase() ? BL : "rgba(255,255,255,0.08)"}`,
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Fields */}
          <div className="space-y-4 mb-6">
            <div>
              <label className="text-[10px] text-white/30 uppercase tracking-[0.2em] block mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="operator@ultrabasketball.com"
                className="w-full rounded-lg px-4 py-3 text-sm text-white placeholder-white/20 outline-none transition-all"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
                onFocus={e => { e.target.style.borderColor = BL; }}
                onBlur={e => { e.target.style.borderColor = "rgba(255,255,255,0.1)"; }}
              />
            </div>
            <div>
              <label className="text-[10px] text-white/30 uppercase tracking-[0.2em] block mb-2">Password</label>
              <input
                type="password"
                value={pass}
                onChange={e => setPass(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg px-4 py-3 text-sm text-white placeholder-white/20 outline-none transition-all"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
                onFocus={e => { e.target.style.borderColor = BL; }}
                onBlur={e => { e.target.style.borderColor = "rgba(255,255,255,0.1)"; }}
              />
            </div>
          </div>

          <button
            onClick={onLogin}
            className="w-full py-3.5 rounded-xl font-black text-sm uppercase tracking-[0.2em] transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ background: BL, color: "#000", fontFamily: "'Exo 2', sans-serif", boxShadow: `0 0 30px ${BL}35` }}
          >
            Access System
          </button>

          <p className="text-center text-[11px] text-white/20 mt-5 leading-relaxed">
            Season Zero 2026 · Role-based access enforced<br />
            Unauthorized access is prohibited.
          </p>
        </Card>
      </div>
    </div>
  );
}

// ─── SCREEN: DASHBOARD ────────────────────────────────────────────────────────
function DashboardScreen({ nav }: { nav: (s: string) => void }) {
  const statCards = [
    { label:"Active Season",      value:"Season Zero", sub:"2026",           color:BL },
    { label:"Total Clubs",        value:"8",           sub:"Premier Div",    color:OR },
    { label:"Registered Players", value:"96",          sub:"+4 this week",   color:GR },
    { label:"Upcoming Fixtures",  value:"4",           sub:"Next: Aug 15",   color:PU },
    { label:"Live Games",         value:"1",           sub:"Now Playing",    color:PK },
    { label:"Draft Status",       value:"Round 2",     sub:"Pick 3 of 8",    color:"#ffd700" },
  ];

  const alerts = [
    { msg:"Seun Adekoya (Ember) — injury report filed", level:"warn"  },
    { msg:"Draft Round 2 begins in 45 minutes",         level:"info"  },
    { msg:"Apex vs Surge result awaiting confirmation", level:"warn"  },
    { msg:"Eclipse roster below minimum (10 players)",  level:"error" },
  ];

  const alertColor = (l: string) => l === "error" ? PK : l === "warn" ? OR : BL;

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-[22px] font-black text-white" style={{ fontFamily: "'Exo 2', sans-serif" }}>
            League Dashboard
          </h1>
          <p className="text-xs text-white/40 mt-1">Ultra Basketball · Season Zero 2026</p>
        </div>
        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer"
            style={{ background: `${PK}18`, border: `1px solid ${PK}35` }}
            onClick={() => nav("live")}
          >
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: PK }} />
            <span className="text-xs font-bold" style={{ color: PK }}>1 LIVE</span>
          </div>
          <button className="p-2 rounded-lg hover:bg-white/5 transition-colors relative">
            <Bell size={16} className="text-white/50" />
            <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full" style={{ background: PK }} />
          </button>
          <button className="p-2 rounded-lg hover:bg-white/5 transition-colors">
            <Settings size={16} className="text-white/50" />
          </button>
        </div>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map(s => (
          <Card key={s.label} className="p-3 sm:p-4">
            <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5 leading-tight">{s.label}</div>
            <div className="font-black truncate" style={{ color: s.color, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22 }}>{s.value}</div>
            <div className="text-[10px] text-white/25 mt-1">{s.sub}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Alerts */}
        <Card className="p-5">
          <SectionLabel color={OR}>System Alerts</SectionLabel>
          <div className="space-y-2">
            {alerts.map((a, i) => (
              <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg" style={{ background: `${alertColor(a.level)}08` }}>
                <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: alertColor(a.level) }} />
                <span className="text-[11px] text-white/65 leading-relaxed">{a.msg}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* League table preview */}
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <SectionLabel color={BL}>League Table</SectionLabel>
            <button onClick={() => nav("table")} className="flex items-center gap-1 text-[11px] text-white/30 hover:text-white/60 transition-colors -mt-4">
              View all <ChevronRight size={11} />
            </button>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-white/25 uppercase tracking-wider text-[10px]">
                <th className="text-left pb-2 font-medium w-6">#</th>
                <th className="text-left pb-2 font-medium">Club</th>
                <th className="text-center pb-2 font-medium">W</th>
                <th className="text-center pb-2 font-medium">L</th>
                <th className="text-right pb-2 font-medium">PTS</th>
              </tr>
            </thead>
            <tbody>
              {CLUBS.slice(0, 6).map((c, i) => (
                <tr key={c.id} className="border-t border-white/[0.04]">
                  <td className="py-2 text-white/30 text-xs">{i + 1}</td>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <ClubBadge club={c} size="sm" />
                      <span className="text-white font-semibold">{c.name}</span>
                    </div>
                  </td>
                  <td className="py-2 text-center text-white/60">{c.w}</td>
                  <td className="py-2 text-center text-white/60">{c.l}</td>
                  <td className="py-2 text-right font-black" style={{ color: c.color, fontFamily: "'Barlow Condensed', sans-serif" }}>{c.pts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {/* Upcoming fixtures */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <SectionLabel color={GR}>Upcoming Fixtures</SectionLabel>
          <button onClick={() => nav("fixtures")} className="flex items-center gap-1 text-[11px] text-white/30 hover:text-white/60 transition-colors -mt-4">
            View all <ChevronRight size={11} />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {FIXTURES.filter(f => f.status === "Upcoming").map(f => {
            const hc = CLUBS.find(c => c.name === f.home)!;
            const ac = CLUBS.find(c => c.name === f.away)!;
            return (
              <div key={f.id} className="flex items-center justify-between p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div className="flex items-center gap-3">
                  <ClubBadge club={hc} size="sm" />
                  <span className="text-[11px] text-white/30 font-bold">vs</span>
                  <ClubBadge club={ac} size="sm" />
                  <div>
                    <div className="text-xs font-semibold text-white">{f.home} vs {f.away}</div>
                    <div className="text-[10px] text-white/30">{f.date} · {f.time}</div>
                  </div>
                </div>
                <div className="text-[10px] text-white/25 text-right hidden sm:block">{f.venue}</div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// ─── SCREEN: CLUBS ────────────────────────────────────────────────────────────
function ClubsScreen({ nav, setClub }: { nav: (s: string) => void; setClub: (c: Club) => void }) {
  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-black text-white" style={{ fontFamily: "'Exo 2', sans-serif" }}>Clubs</h1>
          <p className="text-xs text-white/40 mt-1">Ultra Basketball Premier Division · 8 Teams</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {CLUBS.map(c => (
          <Card key={c.id} className="p-5 flex flex-col gap-4 hover:border-white/10 transition-all cursor-pointer group">
            <div className="flex items-start justify-between">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-black border"
                style={{ background: `${c.color}18`, borderColor: `${c.color}35`, color: c.color, fontFamily: "'Exo 2', sans-serif", boxShadow: `0 0 20px ${c.color}18` }}
              >
                {c.abbr}
              </div>
              <Badge color={c.color}>{c.div}</Badge>
            </div>

            <div>
              <div className="text-lg font-black text-white" style={{ fontFamily: "'Exo 2', sans-serif" }}>{c.name}</div>
              <div className="text-xs text-white/35">{c.city}</div>
            </div>

            <div className="grid grid-cols-2 gap-y-3 text-xs">
              <div>
                <div className="text-white/25 uppercase tracking-wider text-[10px] mb-0.5">Coach</div>
                <div className="text-white/70 font-medium">{c.coach.split(" ")[0]}</div>
              </div>
              <div>
                <div className="text-white/25 uppercase tracking-wider text-[10px] mb-0.5">Roster</div>
                <div className="text-white/70 font-medium">{c.roster} players</div>
              </div>
              <div>
                <div className="text-white/25 uppercase tracking-wider text-[10px] mb-0.5">Fans</div>
                <div className="font-bold" style={{ color: c.color }}>{c.fans.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-white/25 uppercase tracking-wider text-[10px] mb-0.5">Record</div>
                <div className="text-white/70 font-medium">{c.w}W – {c.l}L</div>
              </div>
            </div>

            <div className="h-px w-full" style={{ background: `linear-gradient(90deg, ${c.color}60, transparent)` }} />

            <button
              onClick={() => { setClub(c); nav("club-detail"); }}
              className="w-full py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all hover:opacity-90"
              style={{ background: `${c.color}15`, color: c.color, border: `1px solid ${c.color}30` }}
            >
              View Club
            </button>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── SCREEN: CLUB DETAIL ──────────────────────────────────────────────────────
function ClubDetailScreen({ club, nav }: { club: Club; nav: (s: string) => void }) {
  const [tab, setTab] = useState("overview");
  const tabs = [
    { id:"overview",  label:"Overview"  },
    { id:"roster",    label:"Roster"    },
    { id:"fixtures",  label:"Fixtures"  },
    { id:"results",   label:"Results"   },
    { id:"stats",     label:"Stats"     },
    { id:"fan-club",  label:"Fan Club"  },
  ];
  const clubPlayers = PLAYERS.filter(p => p.club === club.name);
  const clubFixtures = FIXTURES.filter(f => f.home === club.name || f.away === club.name);

  return (
    <div className="p-4 sm:p-6">
      <button onClick={() => nav("clubs")} className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors mb-5">
        <ArrowLeft size={13} /> Back to Clubs
      </button>

      {/* Club header */}
      <div
        className="rounded-2xl p-6 mb-6 border relative overflow-hidden"
        style={{ background: `${club.color}06`, borderColor: `${club.color}18` }}
      >
        <div className="absolute right-0 top-0 bottom-0 w-72 pointer-events-none" style={{ background: `radial-gradient(ellipse at 90% 50%, ${club.color}12, transparent 70%)` }} />
        <div className="flex flex-wrap items-start gap-4">
          <div
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center text-lg sm:text-xl font-black border flex-shrink-0"
            style={{ background: `${club.color}18`, borderColor: `${club.color}40`, color: club.color, fontFamily: "'Exo 2', sans-serif", boxShadow: `0 0 30px ${club.color}25` }}
          >
            {club.abbr}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-2xl sm:text-3xl font-black text-white" style={{ fontFamily: "'Exo 2', sans-serif" }}>{club.name}</div>
            <div className="text-sm text-white/40 mt-1">{club.city} · {club.div} Division</div>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm">
              <div><span className="text-white/35 text-xs">Coach </span><span className="text-white font-semibold">{club.coach}</span></div>
              <div><span className="text-white/35 text-xs">Roster </span><span className="font-bold" style={{ color: club.color }}>{club.roster}</span></div>
              <div><span className="text-white/35 text-xs">Fans </span><span className="font-bold" style={{ color: club.color }}>{club.fans.toLocaleString()}</span></div>
            </div>
          </div>
          <div className="flex gap-5 sm:gap-8 flex-shrink-0">
            {([["Pts", club.pts, club.color], ["W", club.w, GR], ["L", club.l, PK]] as [string, number, string][]).map(([l, v, c]) => (
              <div key={l} className="text-center">
                <div className="text-3xl sm:text-4xl font-black" style={{ color: c, fontFamily: "'Barlow Condensed', sans-serif" }}>{v}</div>
                <div className="text-[10px] text-white/30 uppercase tracking-wider">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 mb-6 border-b border-white/[0.07] overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all flex-shrink-0"
            style={{
              color: tab === t.id ? club.color : "rgba(255,255,255,0.28)",
              borderBottom: `2px solid ${tab === t.id ? club.color : "transparent"}`,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Overview */}
      {tab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="p-5">
            <SectionLabel color={club.color}>Team Staff</SectionLabel>
            {[["Head Coach", club.coach], ["Asst. Coach", "Yusuf Barakat"], ["Team Manager", "Priya Ndiaye"], ["Physio", "Dr. Emeka Olu"], ["Scout", "Tobi Adesanya"]].map(([role, name]) => (
              <div key={role} className="flex justify-between py-2 border-b border-white/[0.05] last:border-0 text-xs">
                <span className="text-white/35">{role}</span>
                <span className="text-white font-semibold">{name}</span>
              </div>
            ))}
          </Card>

          <Card className="p-5">
            <SectionLabel color={club.color}>Top Players</SectionLabel>
            <div className="space-y-3">
              {clubPlayers.slice(0, 4).map(p => (
                <div key={p.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[9px] font-black" style={{ background: `${club.color}18`, color: club.color }}>
                      {initials(p.name)}
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-white">{p.name}</div>
                      <div className="text-[10px] text-white/30">{p.pos} · {p.ht}</div>
                    </div>
                  </div>
                  <div className="text-xs font-black" style={{ color: club.color }}>{p.ppg} PPG</div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <SectionLabel color={club.color}>Upcoming Match</SectionLabel>
            {(() => {
              const next = clubFixtures.find(f => f.status === "Upcoming");
              if (!next) return <p className="text-xs text-white/30">No upcoming fixtures</p>;
              return (
                <div className="text-center pt-2">
                  <div className="text-xs text-white/30 mb-4">{next.date} · {next.time}</div>
                  <div className="flex items-center justify-center gap-4">
                    <div className="text-center">
                      <div className="font-black text-lg" style={{ color: cc(next.home), fontFamily: "'Barlow Condensed', sans-serif" }}>{next.home}</div>
                      <div className="text-[9px] text-white/25 uppercase tracking-wider">HOME</div>
                    </div>
                    <div className="text-white/20 font-black text-lg">vs</div>
                    <div className="text-center">
                      <div className="font-black text-lg" style={{ color: cc(next.away), fontFamily: "'Barlow Condensed', sans-serif" }}>{next.away}</div>
                      <div className="text-[9px] text-white/25 uppercase tracking-wider">AWAY</div>
                    </div>
                  </div>
                  <div className="text-[11px] text-white/30 mt-4 flex items-center justify-center gap-1">
                    <MapPin size={10} /> {next.venue}
                  </div>
                </div>
              );
            })()}
          </Card>
        </div>
      )}

      {/* Tab: Roster */}
      {tab === "roster" && (
        <div className="space-y-2">
          {clubPlayers.map(p => (
            <div key={p.id} className="flex items-center justify-between p-3.5 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs" style={{ background: `${club.color}18`, color: club.color }}>
                  {initials(p.name)}
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">{p.name}</div>
                  <div className="text-[11px] text-white/30">{p.pos} · {p.ht}</div>
                </div>
              </div>
              <div className="flex items-center gap-5 text-xs">
                <div className="text-center hidden sm:block"><div className="text-white/25 text-[10px]">PPG</div><div className="font-bold text-white">{p.ppg}</div></div>
                <div className="text-center hidden sm:block"><div className="text-white/25 text-[10px]">RPG</div><div className="font-bold text-white">{p.rpg}</div></div>
                <div className="text-center hidden sm:block"><div className="text-white/25 text-[10px]">APG</div><div className="font-bold text-white">{p.apg}</div></div>
                <Badge color={p.status === "Active" ? GR : PK}>{p.status}</Badge>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Fixtures */}
      {tab === "fixtures" && (
        <div className="space-y-3">
          {clubFixtures.map(f => (
            <div key={f.id} className="flex items-center justify-between p-4 rounded-xl border border-white/[0.05]" style={{ background: "rgba(255,255,255,0.02)" }}>
              <div>
                <div className="font-bold text-white text-sm">{f.home} vs {f.away}</div>
                <div className="text-[11px] text-white/35 mt-1 flex items-center gap-3">
                  <span className="flex items-center gap-1"><Calendar size={9} /> {f.date} · {f.time}</span>
                  <span className="flex items-center gap-1"><MapPin size={9} /> {f.venue}</span>
                </div>
              </div>
              <Badge color={f.status === "Upcoming" ? BL : GR}>{f.status}</Badge>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Results */}
      {tab === "results" && (
        <div className="space-y-3">
          {clubFixtures.filter(f => f.status === "Completed").length === 0 && (
            <p className="text-sm text-white/30 text-center py-12">No results yet</p>
          )}
          {clubFixtures.filter(f => f.status === "Completed").map(f => (
            <div key={f.id} className="p-5 rounded-xl border border-white/[0.05]" style={{ background: "rgba(255,255,255,0.02)" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <div className="font-black" style={{ color: cc(f.home), fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18 }}>{f.home}</div>
                    <div className="text-[9px] text-white/25 uppercase tracking-wider">HOME</div>
                  </div>
                  <div className="text-4xl font-black text-white" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                    {f.hs} <span className="text-white/25">–</span> {f.as}
                  </div>
                  <div className="text-center">
                    <div className="font-black" style={{ color: cc(f.away), fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18 }}>{f.away}</div>
                    <div className="text-[9px] text-white/25 uppercase tracking-wider">AWAY</div>
                  </div>
                </div>
                <div className="text-right">
                  <Badge color={GR}>Final</Badge>
                  <div className="text-[11px] text-white/25 mt-1">{f.date}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {(tab === "stats" || tab === "fan-club") && (
        <div className="flex flex-col items-center justify-center py-20 text-white/25">
          <TrendingUp size={40} className="mb-4 opacity-30" />
          <p className="text-sm">Detailed {tab === "fan-club" ? "fan club" : "stats"} data available after Season Zero begins.</p>
        </div>
      )}
    </div>
  );
}

// ─── SCREEN: PLAYERS ─────────────────────────────────────────────────────────
function PlayersScreen({ nav, setPlayer }: { nav: (s: string) => void; setPlayer: (p: Player) => void }) {
  const [genderF, setGenderF] = useState("All");
  const [posF, setPosF]       = useState("All");
  const [draftF, setDraftF]   = useState("All");
  const [search, setSearch]   = useState("");

  const filtered = PLAYERS.filter(p => {
    if (genderF !== "All" && p.gender !== genderF)               return false;
    if (posF !== "All" && p.pos !== posF)                        return false;
    if (draftF !== "All" && p.draft !== draftF)                  return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function FilterGroup({ label, val, set, opts }: { label: string; val: string; set: (v: string) => void; opts: string[] }) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] text-white/25 uppercase tracking-wider">{label}:</span>
        {opts.map(o => (
          <button
            key={o}
            onClick={() => set(o)}
            className="px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all"
            style={{ background: val === o ? BL : "rgba(255,255,255,0.04)", color: val === o ? "#000" : "rgba(255,255,255,0.45)", border: `1px solid ${val === o ? BL : "rgba(255,255,255,0.08)"}` }}
          >
            {o}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-black text-white" style={{ fontFamily: "'Exo 2', sans-serif" }}>Player Database</h1>
          <p className="text-xs text-white/40 mt-1">{PLAYERS.length} registered players</p>
        </div>
        <button
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all hover:opacity-90"
          style={{ background: `${BL}18`, color: BL, border: `1px solid ${BL}30` }}
        >
          <Plus size={12} /> Register Player
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <div className="flex items-center gap-2 flex-1" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "6px 12px" }}>
          <Search size={13} className="text-white/30" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search players..."
            className="bg-transparent text-xs text-white placeholder-white/25 outline-none flex-1"
          />
        </div>
        <FilterGroup label="Gender" val={genderF} set={setGenderF} opts={["All","M","F"]} />
        <FilterGroup label="Pos" val={posF} set={setPosF} opts={["All","PG","SG","SF","PF","C"]} />
        <FilterGroup label="Draft" val={draftF} set={setDraftF} opts={["All","Eligible"]} />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[700px]">
            <thead>
              <tr className="border-b border-white/[0.07]">
                {["Player","Pos","Height","Club","Status","Draft","PPG","RPG","APG",""].map(h => (
                  <th key={h} className="px-4 py-3.5 text-left text-[10px] text-white/25 uppercase tracking-wider font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} className="border-b border-white/[0.04] hover:bg-white/[0.025] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[9px] font-black flex-shrink-0" style={{ background: `${cc(p.club)}18`, color: cc(p.club) }}>
                        {initials(p.name)}
                      </div>
                      <div>
                        <div className="font-semibold text-white">{p.name}</div>
                        <div className="text-[10px] text-white/25">{p.gender === "M" ? "Male" : "Female"} · {p.ht}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><Badge color={BL}>{p.pos}</Badge></td>
                  <td className="px-4 py-3 text-white/50">{p.ht}</td>
                  <td className="px-4 py-3 font-semibold text-xs" style={{ color: cc(p.club) }}>{p.club}</td>
                  <td className="px-4 py-3"><Badge color={p.status === "Active" ? GR : PK}>{p.status}</Badge></td>
                  <td className="px-4 py-3"><Badge color={p.draft === "Eligible" ? OR : "rgba(255,255,255,0.2)"}>{p.draft === "Eligible" ? "Eligible" : "No"}</Badge></td>
                  <td className="px-4 py-3 font-bold" style={{ color: BL }}>{p.ppg}</td>
                  <td className="px-4 py-3 text-white/60">{p.rpg}</td>
                  <td className="px-4 py-3 text-white/60">{p.apg}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => { setPlayer(p); nav("player-profile"); }}
                      className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all hover:opacity-80"
                      style={{ background: `${BL}15`, color: BL, border: `1px solid ${BL}25` }}
                    >
                      Profile
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─── SCREEN: DRAFT ROOM ───────────────────────────────────────────────────────
function DraftRoomScreen() {
  const [timer, setTimer]     = useState(120);
  const [running, setRunning] = useState(false);
  const [pick, setPick]       = useState(3);
  const [pool, setPool]       = useState(DRAFT_POOL);
  const [selected, setSelected] = useState<typeof DRAFT_POOL[0] | null>(DRAFT_POOL[0]);

  const pickingClub = CLUBS[((pick - 1) % CLUBS.length)];
  const urgent = timer <= 30;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTimer(t => (t > 0 ? t - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [running]);

  function draftPlayer() {
    if (!selected) return;
    setPool(prev => prev.map(p => p.id === selected.id ? { ...p, drafted: true } : p));
    const next = pool.find(p => !p.drafted && p.id !== selected.id) ?? null;
    setSelected(next);
    setPick(p => p + 1);
    setTimer(120);
    setRunning(false);
  }

  const fmtTimer = (t: number) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  const available = pool.filter(p => !p.drafted);
  const drafted   = pool.filter(p => p.drafted);

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-black text-white" style={{ fontFamily: "'Exo 2', sans-serif" }}>Draft Room</h1>
          <p className="text-xs text-white/40 mt-1">Season Zero 2026 · Round 2</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: `${running ? GR : OR}18`, border: `1px solid ${running ? GR : OR}35` }}>
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: running ? GR : OR }} />
          <span className="text-xs font-bold" style={{ color: running ? GR : OR }}>{running ? "LIVE" : "PAUSED"}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Clock */}
        <div className="space-y-4">
          <Card className="p-6 text-center" style={{ borderColor: urgent ? `${PK}50` : `${BL}18`, boxShadow: urgent ? `0 0 30px ${PK}18` : "none" }}>
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/30 mb-1">PICK #{pick}</div>
            <div className="text-xs font-bold uppercase tracking-wider mb-5 flex items-center justify-center gap-2">
              <ClubBadge club={pickingClub} size="sm" />
              <span style={{ color: pickingClub.color }}>{pickingClub.name} ON THE CLOCK</span>
            </div>
            <div
              className="text-[80px] font-black tabular-nums leading-none transition-colors"
              style={{
                color: urgent ? PK : BL,
                fontFamily: "'Barlow Condensed', sans-serif",
                textShadow: `0 0 50px ${urgent ? PK : BL}45`,
              }}
            >
              {fmtTimer(timer)}
            </div>
            <div className="flex justify-center gap-3 mt-6">
              <button
                onClick={() => setRunning(r => !r)}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl font-bold text-xs uppercase tracking-wider transition-all hover:opacity-90"
                style={{ background: running ? `${OR}18` : `${GR}18`, color: running ? OR : GR, border: `1px solid ${running ? OR : GR}30` }}
              >
                {running ? <Pause size={11} /> : <Play size={11} />}
                {running ? "Pause" : "Start"}
              </button>
              <button
                onClick={() => { setTimer(120); setRunning(false); }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-wider transition-all hover:bg-white/10"
                style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <RefreshCw size={11} /> Reset
              </button>
            </div>
          </Card>

          {/* Draft order */}
          <Card className="p-4">
            <SectionLabel color={BL}>Draft Order</SectionLabel>
            <div className="space-y-1">
              {CLUBS.map((c, i) => {
                const isCurrent = i + 1 === ((pick - 1) % 8) + 1;
                return (
                  <div key={c.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg transition-all" style={{ background: isCurrent ? `${c.color}10` : "transparent" }}>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-white/25 w-4">{i + 1}.</span>
                      <ClubBadge club={c} size="sm" />
                      <span className="text-xs text-white/65">{c.name}</span>
                    </div>
                    <span className="text-[10px] text-white/25">{c.roster}/15</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Right: selected + pool */}
        <div className="xl:col-span-2 space-y-4">
          {selected && (
            <Card className="p-5" style={{ borderColor: `${pickingClub.color}25`, background: `${pickingClub.color}05` }}>
              <div className="flex items-start justify-between mb-4">
                <SectionLabel color={BL}>Selected Player</SectionLabel>
                <div className="flex items-center gap-1.5 -mt-4">
                  <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: GR }} />
                  <span className="text-[11px]" style={{ color: GR }}>Available</span>
                </div>
              </div>
              <div className="flex items-center gap-5 flex-wrap">
                <div
                  className="w-20 h-20 rounded-2xl flex items-center justify-center text-xl font-black border flex-shrink-0"
                  style={{ background: `${BL}15`, borderColor: `${BL}30`, color: BL, fontFamily: "'Exo 2', sans-serif" }}
                >
                  {initials(selected.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xl font-black text-white" style={{ fontFamily: "'Exo 2', sans-serif" }}>{selected.name}</div>
                  <div className="text-sm text-white/45 mt-0.5">{selected.school}</div>
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <Badge color={BL}>{selected.pos}</Badge>
                    <span className="text-xs text-white/35">{selected.ht}</span>
                    <div className="flex items-center gap-1.5">
                      <Star size={11} style={{ color: OR }} fill={OR} />
                      <span className="text-xs font-bold" style={{ color: OR }}>{selected.rating} Rating</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={draftPlayer}
                  className="px-6 py-3 rounded-xl font-black text-sm uppercase tracking-wider transition-all hover:opacity-90 active:scale-[0.97] flex-shrink-0"
                  style={{ background: pickingClub.color, color: "#000", fontFamily: "'Exo 2', sans-serif", boxShadow: `0 0 25px ${pickingClub.color}30` }}
                >
                  Draft Player
                </button>
              </div>
            </Card>
          )}

          <Card className="overflow-hidden">
            <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: BL }}>Available Players</span>
              <span className="text-[11px] text-white/30">{available.length} remaining</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[500px]">
                <thead>
                  <tr className="border-b border-white/[0.05]">
                    {["#","Player","Pos","Height","School","Rating"].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-[10px] text-white/25 uppercase tracking-wider font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {available.map((p, i) => (
                    <tr
                      key={p.id}
                      onClick={() => setSelected(p)}
                      className="border-b border-white/[0.03] cursor-pointer transition-all hover:bg-white/[0.03]"
                      style={{ background: selected?.id === p.id ? `${BL}08` : "transparent" }}
                    >
                      <td className="px-4 py-2.5 text-white/25">{i + 1}</td>
                      <td className="px-4 py-2.5 font-semibold text-white">{p.name}</td>
                      <td className="px-4 py-2.5"><Badge color={BL}>{p.pos}</Badge></td>
                      <td className="px-4 py-2.5 text-white/45">{p.ht}</td>
                      <td className="px-4 py-2.5 text-white/45">{p.school}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 rounded-full w-12 bg-white/5">
                            <div className="h-full rounded-full" style={{ width: `${(p.rating - 70) * 3.3}%`, background: p.rating >= 90 ? GR : p.rating >= 85 ? OR : BL }} />
                          </div>
                          <span className="font-bold text-white">{p.rating}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {drafted.map(p => (
                    <tr key={p.id} className="border-b border-white/[0.02] opacity-25">
                      <td className="px-4 py-2 text-white/20">—</td>
                      <td className="px-4 py-2 line-through text-white/25">{p.name}</td>
                      <td className="px-4 py-2 text-white/20">{p.pos}</td>
                      <td colSpan={3} className="px-4 py-2 text-white/20 text-[10px] uppercase tracking-wider">DRAFTED</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── SCREEN: FIXTURES ─────────────────────────────────────────────────────────
function FixturesScreen() {
  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-[22px] font-black text-white" style={{ fontFamily: "'Exo 2', sans-serif" }}>Fixtures & Schedule</h1>
        <p className="text-xs text-white/40 mt-1">Ultra Basketball Season Zero · 2026</p>
      </div>

      {/* Event day banner */}
      <div className="rounded-2xl p-6 mb-6 border relative overflow-hidden" style={{ background: `${BL}06`, borderColor: `${BL}18` }}>
        <div className="absolute right-0 top-0 h-full w-56 pointer-events-none" style={{ background: `linear-gradient(90deg, transparent, ${BL}10)` }} />
        <div className="flex items-center gap-5 flex-wrap">
          <div className="text-center px-4 py-3 rounded-xl border flex-shrink-0" style={{ background: `${BL}18`, borderColor: `${BL}35` }}>
            <div className="text-3xl font-black" style={{ color: BL, fontFamily: "'Barlow Condensed', sans-serif" }}>15</div>
            <div className="text-[10px] text-white/50 uppercase tracking-wider">AUG 2026</div>
          </div>
          <div>
            <div className="text-xl font-black text-white" style={{ fontFamily: "'Exo 2', sans-serif" }}>Ultra Basketball Season Zero — Opening Day</div>
            <div className="text-sm text-white/40 mt-1 flex items-center gap-1.5">
              <MapPin size={12} /> Multiple Venues · 3 Games
            </div>
            <div className="flex gap-2 mt-2">
              <Badge color={BL}>Event Day</Badge>
              <Badge color={GR}>3 Matches</Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Upcoming */}
        <div>
          <SectionLabel color={BL}>Upcoming Fixtures</SectionLabel>
          <div className="space-y-3">
            {FIXTURES.filter(f => f.status === "Upcoming").map(f => {
              const hc = CLUBS.find(c => c.name === f.home)!;
              const ac = CLUBS.find(c => c.name === f.away)!;
              return (
                <div key={f.id} className="flex items-center justify-between p-4 rounded-xl border border-white/[0.06]" style={{ background: "rgba(255,255,255,0.02)" }}>
                  <div className="flex items-center gap-5">
                    <div className="text-center w-14 flex-shrink-0">
                      <div className="text-[10px] text-white/25">{f.date}</div>
                      <div className="text-sm font-black" style={{ color: BL }}>{f.time}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="font-black text-white" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 16 }}>{f.home}</div>
                        <div className="text-[9px]" style={{ color: hc.color }}>HOME</div>
                      </div>
                      <div className="px-2.5 py-1 rounded-lg border border-white/10 text-[10px] text-white/30 font-bold">VS</div>
                      <div className="text-left">
                        <div className="font-black text-white" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 16 }}>{f.away}</div>
                        <div className="text-[9px]" style={{ color: ac.color }}>AWAY</div>
                      </div>
                    </div>
                    <div className="text-[11px] text-white/25 flex items-center gap-1 hidden sm:flex">
                      <MapPin size={10} /> {f.venue}
                    </div>
                  </div>
                  <Badge color={BL}>Scheduled</Badge>
                </div>
              );
            })}
          </div>
        </div>

        {/* Results */}
        <div>
          <SectionLabel color={GR}>Recent Results</SectionLabel>
          <div className="space-y-3">
            {FIXTURES.filter(f => f.status === "Completed").map(f => {
              const homeWon = (f.hs ?? 0) > (f.as ?? 0);
              return (
                <div key={f.id} className="flex items-center justify-between p-4 rounded-xl border border-white/[0.06]" style={{ background: "rgba(255,255,255,0.02)" }}>
                  <div className="flex items-center gap-5">
                    <div className="text-[11px] text-white/25 w-20 flex-shrink-0">{f.date}</div>
                    <div className="flex items-center gap-4">
                      <div className="font-black text-sm" style={{ color: homeWon ? cc(f.home) : "rgba(255,255,255,0.4)", fontFamily: "'Barlow Condensed', sans-serif" }}>{f.home}</div>
                      <div className="text-3xl font-black text-white" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                        {f.hs} <span className="text-white/25">—</span> {f.as}
                      </div>
                      <div className="font-black text-sm" style={{ color: !homeWon ? cc(f.away) : "rgba(255,255,255,0.4)", fontFamily: "'Barlow Condensed', sans-serif" }}>{f.away}</div>
                    </div>
                    <div className="text-[11px] text-white/25 hidden sm:flex items-center gap-1">
                      <MapPin size={10} /> {f.venue}
                    </div>
                  </div>
                  <Badge color={GR}>Final</Badge>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SCREEN: LIVE GAME ────────────────────────────────────────────────────────
function LiveGameScreen() {
  const [homeScore, setHomeScore] = useState(68);
  const [awayScore, setAwayScore] = useState(61);
  const [quarter,   setQuarter]   = useState(3);
  const [gameTimer, setGameTimer] = useState(4 * 60 + 22);
  const [running,   setRunning]   = useState(true);
  const [events, setEvents] = useState([
    { time:"Q3 4:22", text:"Kofi Ansah 3-pointer — Vortex 68-61 Apex" },
    { time:"Q3 5:48", text:"Amara Sesay driving layup — Vortex 65-61 Apex" },
    { time:"Q3 7:12", text:"Foul called on Tunde Bakare (Flux)" },
    { time:"Q3 8:01", text:"Kojo Mensah rebound → Kofi Ansah 2PT — Vortex 63-59 Apex" },
  ]);

  const homeClub = CLUBS[0];
  const awayClub = CLUBS[1];

  useEffect(() => {
    if (!running || gameTimer <= 0) return;
    const id = setInterval(() => setGameTimer(t => Math.max(0, t - 1)), 1000);
    return () => clearInterval(id);
  }, [running, gameTimer]);

  function addEvent(text: string) {
    const t = gameTimer;
    const timeStr = `Q${quarter} ${String(Math.floor(t / 60)).padStart(2,"0")}:${String(t % 60).padStart(2,"0")}`;
    setEvents(prev => [{ time: timeStr, text }, ...prev.slice(0, 9)]);
  }

  function scoreHome(pts: number) {
    setHomeScore(s => s + pts);
    const labels = ["", "free throw", "field goal", "3-pointer"];
    addEvent(`${homeClub.name} ${labels[pts]} (+${pts})`);
  }
  function scoreAway(pts: number) {
    setAwayScore(s => s + pts);
    const labels = ["", "free throw", "field goal", "3-pointer"];
    addEvent(`${awayClub.name} ${labels[pts]} (+${pts})`);
  }

  const fmtT = (t: number) => `${String(Math.floor(t / 60)).padStart(2,"0")}:${String(t % 60).padStart(2,"0")}`;

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-black text-white" style={{ fontFamily: "'Exo 2', sans-serif" }}>Live Game Center</h1>
          <p className="text-xs text-white/40 mt-1">Operator Panel · Season Zero 2026</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: `${PK}18`, border: `1px solid ${PK}40` }}>
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: PK }} />
          <span className="text-xs font-bold" style={{ color: PK }}>LIVE · Q{quarter}</span>
        </div>
      </div>

      {/* Main scoreboard panel */}
      <Card className="p-4 sm:p-6 mb-4" style={{ borderColor: `${BL}18`, background: "linear-gradient(135deg, #0e1018, #0f111e)" }}>
        {/* Score row: always horizontal but score sizes shrink on mobile */}
        <div className="flex items-center justify-between gap-2 mb-4">
          {/* Home */}
          <div className="text-center flex-1 min-w-0">
            <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl mx-auto mb-2 flex items-center justify-center text-sm sm:text-lg font-black border"
              style={{ background: `${homeClub.color}18`, borderColor: `${homeClub.color}40`, color: homeClub.color, fontFamily: "'Exo 2', sans-serif" }}>
              {homeClub.abbr}
            </div>
            <div className="text-sm sm:text-lg font-black text-white truncate" style={{ fontFamily: "'Exo 2', sans-serif" }}>{homeClub.name}</div>
            <div className="text-[9px] text-white/25 uppercase tracking-wider">HOME</div>
            <div className="font-black leading-tight mt-1"
              style={{ color: homeClub.color, fontFamily: "'Barlow Condensed', sans-serif", fontSize: "clamp(52px, 14vw, 90px)", textShadow: `0 0 50px ${homeClub.color}35` }}>
              {homeScore}
            </div>
            <div className="flex justify-center gap-1.5 mt-2">
              {[1, 2, 3].map(pts => (
                <button key={pts} onClick={() => scoreHome(pts)}
                  className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl font-black text-sm transition-all hover:scale-105 active:scale-95"
                  style={{ background: `${homeClub.color}18`, color: homeClub.color, border: `1px solid ${homeClub.color}30` }}>
                  +{pts}
                </button>
              ))}
            </div>
          </div>

          {/* Center */}
          <div className="text-center flex-shrink-0 px-1 sm:px-3">
            <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.2em] text-white/25 mb-1">Q{quarter}</div>
            <div className="font-black tabular-nums"
              style={{ color: BL, fontFamily: "'Barlow Condensed', sans-serif", fontSize: "clamp(28px, 7vw, 56px)", textShadow: `0 0 40px ${BL}45` }}>
              {fmtT(gameTimer)}
            </div>
            <div className="text-white/15 font-black text-lg mt-0.5">—</div>
          </div>

          {/* Away */}
          <div className="text-center flex-1 min-w-0">
            <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl mx-auto mb-2 flex items-center justify-center text-sm sm:text-lg font-black border"
              style={{ background: `${awayClub.color}18`, borderColor: `${awayClub.color}40`, color: awayClub.color, fontFamily: "'Exo 2', sans-serif" }}>
              {awayClub.abbr}
            </div>
            <div className="text-sm sm:text-lg font-black text-white truncate" style={{ fontFamily: "'Exo 2', sans-serif" }}>{awayClub.name}</div>
            <div className="text-[9px] text-white/25 uppercase tracking-wider">AWAY</div>
            <div className="font-black leading-tight mt-1"
              style={{ color: awayClub.color, fontFamily: "'Barlow Condensed', sans-serif", fontSize: "clamp(52px, 14vw, 90px)", textShadow: `0 0 50px ${awayClub.color}35` }}>
              {awayScore}
            </div>
            <div className="flex justify-center gap-1.5 mt-2">
              {[1, 2, 3].map(pts => (
                <button key={pts} onClick={() => scoreAway(pts)}
                  className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl font-black text-sm transition-all hover:scale-105 active:scale-95"
                  style={{ background: `${awayClub.color}18`, color: awayClub.color, border: `1px solid ${awayClub.color}30` }}>
                  +{pts}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Controls row — full width below scores */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-white/[0.06]">
          <button
            onClick={() => setRunning(r => !r)}
            className="flex items-center justify-center gap-1.5 py-2 rounded-xl font-bold text-xs uppercase tracking-wider transition-all col-span-1"
            style={{ background: running ? `${OR}18` : `${GR}18`, color: running ? OR : GR, border: `1px solid ${running ? OR : GR}30` }}
          >
            {running ? <Pause size={11} /> : <Play size={11} />}
            {running ? "Pause" : "Start"}
          </button>
          <button
            onClick={() => setQuarter(q => Math.min(4, q + 1))}
            className="py-2 rounded-xl font-bold text-xs uppercase tracking-wider transition-all hover:bg-white/10"
            style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            Next Q
          </button>
          <button
            className="py-2 rounded-xl font-bold text-xs uppercase tracking-wider transition-all hover:opacity-90"
            style={{ background: `${PK}18`, color: PK, border: `1px solid ${PK}30` }}
          >
            <Square size={10} className="inline mr-1" />
            End Game
          </button>
          <button
            className="py-2 rounded-xl font-bold text-xs uppercase tracking-wider transition-all hover:opacity-90"
            style={{ background: `${GR}18`, color: GR, border: `1px solid ${GR}30` }}
          >
            Confirm Result
          </button>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Event feed */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity size={12} style={{ color: PK }} />
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: PK }}>Live Event Feed</span>
          </div>
          <div className="space-y-1.5 max-h-52 overflow-y-auto">
            {events.map((e, i) => (
              <div key={i} className="flex gap-3 p-2 rounded-lg" style={{ background: i === 0 ? `${BL}08` : "transparent" }}>
                <span className="text-[9px] text-white/25 font-mono flex-shrink-0 pt-0.5 w-14">{e.time}</span>
                <span className="text-[11px] text-white/60 leading-relaxed">{e.text}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Quick actions */}
        <Card className="p-4">
          <SectionLabel color={GR}>Quick Stat Input</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label:"Foul", color:PK,         action:() => addEvent("Foul called") },
              { label:"Timeout", color:OR,       action:() => addEvent("Timeout requested") },
              { label:"Technical", color:PK,     action:() => addEvent("Technical foul called") },
              { label:"Sub", color:BL,           action:() => addEvent("Player substitution") },
              { label:"Rebound", color:GR,       action:() => addEvent("Defensive rebound") },
              { label:"Steal", color:PU,         action:() => addEvent("Steal recorded") },
            ].map(({ label, color, action }) => (
              <button
                key={label}
                onClick={action}
                className="py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all hover:opacity-90"
                style={{ background: `${color}12`, color, border: `1px solid ${color}25` }}
              >
                {label}
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── SCREEN: SCOREBOARD ───────────────────────────────────────────────────────
function ScoreboardScreen() {
  const [countdown, setCountdown] = useState(4 * 60 + 22);
  const homeClub = CLUBS[0];
  const awayClub = CLUBS[1];

  useEffect(() => {
    const id = setInterval(() => setCountdown(t => Math.max(0, t - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  const fmtT = (t: number) => `${String(Math.floor(t / 60)).padStart(2,"0")}:${String(t % 60).padStart(2,"0")}`;

  return (
    <div
      className="flex flex-col items-stretch justify-between min-h-screen p-8 relative overflow-hidden"
      style={{ background: "#03040a", fontFamily: "'DM Sans', sans-serif" }}
    >
      {/* Background glows */}
      <div className="absolute top-1/2 left-[20%] -translate-y-1/2 w-[500px] h-[500px] rounded-full blur-[180px] opacity-[0.14] pointer-events-none" style={{ background: homeClub.color }} />
      <div className="absolute top-1/2 right-[20%] -translate-y-1/2 w-[500px] h-[500px] rounded-full blur-[180px] opacity-[0.14] pointer-events-none" style={{ background: awayClub.color }} />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[200px] rounded-full blur-[100px] opacity-[0.08] pointer-events-none" style={{ background: BL }} />

      {/* Header */}
      <div className="flex items-center justify-between z-10 flex-shrink-0">
        <div className="text-sm font-bold uppercase tracking-[0.3em] text-white/25" style={{ fontFamily: "'Exo 2', sans-serif" }}>ULTRA BASKETBALL</div>
        <div
          className="flex items-center gap-2.5 px-5 py-2 rounded-full border"
          style={{ background: `${PK}12`, borderColor: `${PK}35` }}
        >
          <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: PK }} />
          <span className="text-sm font-black uppercase tracking-[0.2em]" style={{ color: PK }}>LIVE</span>
        </div>
        <div className="text-sm font-bold uppercase tracking-[0.2em] text-white/25">Season Zero 2026</div>
      </div>

      {/* Main score display */}
      <div className="flex items-center justify-between z-10 flex-1 py-8">
        {/* Home */}
        <div className="flex flex-col items-center flex-1">
          <div
            className="w-36 h-36 rounded-3xl mb-6 flex items-center justify-center text-5xl font-black border"
            style={{ background: `${homeClub.color}18`, borderColor: `${homeClub.color}45`, color: homeClub.color, fontFamily: "'Exo 2', sans-serif", boxShadow: `0 0 80px ${homeClub.color}25` }}
          >
            {homeClub.abbr}
          </div>
          <div
            className="text-5xl font-black text-white mb-2 tracking-wider"
            style={{ fontFamily: "'Exo 2', sans-serif" }}
          >
            {homeClub.name.toUpperCase()}
          </div>
          <div className="text-xs text-white/25 uppercase tracking-[0.4em] mb-6">HOME</div>
          <div
            className="font-black leading-none"
            style={{ color: homeClub.color, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 160, textShadow: `0 0 100px ${homeClub.color}40` }}
          >
            68
          </div>
        </div>

        {/* Center */}
        <div className="flex flex-col items-center flex-shrink-0 gap-4 z-10">
          <div className="text-2xl font-black text-white/15">Q3</div>
          <div
            className="text-8xl font-black tabular-nums"
            style={{ color: BL, fontFamily: "'Barlow Condensed', sans-serif", textShadow: `0 0 60px ${BL}55` }}
          >
            {fmtT(countdown)}
          </div>
          <div className="text-white/15 text-4xl font-black mt-2">—</div>
        </div>

        {/* Away */}
        <div className="flex flex-col items-center flex-1">
          <div
            className="w-36 h-36 rounded-3xl mb-6 flex items-center justify-center text-5xl font-black border"
            style={{ background: `${awayClub.color}18`, borderColor: `${awayClub.color}45`, color: awayClub.color, fontFamily: "'Exo 2', sans-serif", boxShadow: `0 0 80px ${awayClub.color}25` }}
          >
            {awayClub.abbr}
          </div>
          <div
            className="text-5xl font-black text-white mb-2 tracking-wider"
            style={{ fontFamily: "'Exo 2', sans-serif" }}
          >
            {awayClub.name.toUpperCase()}
          </div>
          <div className="text-xs text-white/25 uppercase tracking-[0.4em] mb-6">AWAY</div>
          <div
            className="font-black leading-none"
            style={{ color: awayClub.color, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 160, textShadow: `0 0 100px ${awayClub.color}40` }}
          >
            61
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between z-10 flex-shrink-0">
        <div className="text-xs text-white/18 uppercase tracking-widest">Lagos Arena · Aug 15, 2026</div>
        <div className="px-6 py-2.5 rounded-full border border-white/10 text-xs text-white/18 uppercase tracking-widest">
          Presented by [Sponsor]
        </div>
        <div className="text-xs text-white/18 uppercase tracking-widest">Next: Flux vs Surge · 16:30</div>
      </div>
    </div>
  );
}

// ─── SCREEN: LEAGUE TABLE ─────────────────────────────────────────────────────
function LeagueTableScreen() {
  const sorted = [...CLUBS].sort((a, b) => b.pts - a.pts);
  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-[22px] font-black text-white" style={{ fontFamily: "'Exo 2', sans-serif" }}>League Table</h1>
        <p className="text-xs text-white/40 mt-1">Ultra Basketball Premier Division · Season Zero 2026</p>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-white/[0.07]">
                {["#","Club","Played","Won","Lost","PF","PA","PD","Pts"].map(h => (
                  <th key={h} className={`px-5 py-4 text-[10px] text-white/25 uppercase tracking-wider font-medium ${h === "Club" ? "text-left" : "text-center"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((c, i) => {
                const pd = c.pf - c.pa;
                const medallion = i < 3 ? [GR, BL, OR][i] : null;
                return (
                  <tr key={c.id} className="border-b border-white/[0.04] hover:bg-white/[0.025] transition-colors">
                    <td className="px-5 py-4 text-center">
                      {medallion ? (
                        <div className="w-6 h-6 rounded-full mx-auto flex items-center justify-center text-[10px] font-black" style={{ background: `${medallion}20`, color: medallion }}>{i + 1}</div>
                      ) : (
                        <span className="text-white/25 text-xs">{i + 1}</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <ClubBadge club={c} size="sm" />
                        <div>
                          <div className="font-bold text-white">{c.name}</div>
                          <div className="text-[10px] text-white/30">{c.city}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-center text-white/50 text-xs">{c.played}</td>
                    <td className="px-5 py-4 text-center text-xs font-semibold" style={{ color: GR }}>{c.w}</td>
                    <td className="px-5 py-4 text-center text-xs font-semibold" style={{ color: PK }}>{c.l}</td>
                    <td className="px-5 py-4 text-center text-white/50 text-xs">{c.pf}</td>
                    <td className="px-5 py-4 text-center text-white/50 text-xs">{c.pa}</td>
                    <td className="px-5 py-4 text-center text-xs font-semibold" style={{ color: pd >= 0 ? GR : PK }}>
                      {pd >= 0 ? "+" : ""}{pd}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span
                        className="text-2xl font-black"
                        style={{ color: c.color, fontFamily: "'Barlow Condensed', sans-serif" }}
                      >
                        {c.pts}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex items-center gap-6 mt-4 text-[11px] text-white/30">
        <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full" style={{ background: GR }} />Playoffs zone (Top 4)</div>
        <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full" style={{ background: PK }} />Relegation risk (Bottom 2)</div>
      </div>
    </div>
  );
}

// ─── SCREEN: PLAYER PROFILE ───────────────────────────────────────────────────
function PlayerProfileScreen({ player, nav }: { player: Player; nav: (s: string) => void }) {
  const [tab, setTab] = useState("overview");
  const color = cc(player.club);
  const tabs = [{ id:"overview", label:"Overview" }, { id:"game-log", label:"Game Log" }, { id:"scout-notes", label:"Scout Notes" }];

  return (
    <div className="p-4 sm:p-6">
      <button onClick={() => nav("players")} className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors mb-5">
        <ArrowLeft size={13} /> Back to Players
      </button>

      {/* Header */}
      <div className="rounded-2xl p-6 mb-6 border relative overflow-hidden" style={{ background: `${color}06`, borderColor: `${color}18` }}>
        <div className="absolute right-0 top-0 bottom-0 w-72 pointer-events-none" style={{ background: `radial-gradient(ellipse at 90% 50%, ${color}12, transparent 70%)` }} />
        <div className="flex flex-col sm:flex-row items-start gap-5">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center text-xl font-black border flex-shrink-0"
            style={{ background: `${color}18`, borderColor: `${color}40`, color, fontFamily: "'Exo 2', sans-serif", boxShadow: `0 0 25px ${color}20` }}
          >
            {initials(player.name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-3xl font-black text-white" style={{ fontFamily: "'Exo 2', sans-serif" }}>{player.name}</div>
            <div className="flex flex-wrap items-center gap-2.5 mt-2">
              <span className="font-semibold text-sm" style={{ color }}>{player.club}</span>
              <Badge color={BL}>{player.pos}</Badge>
              <span className="text-xs text-white/35">{player.ht}</span>
              <Badge color={player.status === "Active" ? GR : PK}>{player.status}</Badge>
              <Badge color={player.draft === "Eligible" ? OR : "rgba(255,255,255,0.2)"}>{player.draft}</Badge>
            </div>
          </div>
          <div className="flex gap-8 flex-shrink-0">
            {([["PPG", player.ppg, BL], ["RPG", player.rpg, GR], ["APG", player.apg, OR]] as [string, number, string][]).map(([l, v, c]) => (
              <div key={l} className="text-center">
                <div className="text-4xl font-black" style={{ color: c, fontFamily: "'Barlow Condensed', sans-serif" }}>{v}</div>
                <div className="text-[10px] text-white/25 uppercase tracking-wider">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 mb-6 border-b border-white/[0.07]">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all"
            style={{ color: tab === t.id ? color : "rgba(255,255,255,0.28)", borderBottom: `2px solid ${tab === t.id ? color : "transparent"}` }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-5">
            <SectionLabel color={color}>Season Statistics</SectionLabel>
            <div className="space-y-4">
              {([
                ["Points Per Game", player.ppg, 40, BL],
                ["Rebounds Per Game", player.rpg, 15, GR],
                ["Assists Per Game", player.apg, 12, OR],
                ["Field Goal %", 48.2, 100, PU],
                ["3-Point %", 36.5, 100, PK],
                ["Free Throw %", 82.1, 100, "#ffd700"],
              ] as [string, number, number, string][]).map(([label, val, max, c]) => (
                <div key={label}>
                  <div className="flex justify-between mb-1.5 text-xs">
                    <span className="text-white/45">{label}</span>
                    <span className="font-bold text-white">{typeof val === "number" && max === 100 ? `${val}%` : val}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/[0.06]">
                    <div className="h-full rounded-full transition-all" style={{ width: `${(val / max) * 100}%`, background: c }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <SectionLabel color={color}>Performance Trend</SectionLabel>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={PERF_DATA} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="perfGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.28} />
                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="g" tick={{ fill: "rgba(255,255,255,0.28)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.28)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#0e1018", border: `1px solid ${color}25`, borderRadius: 8, color: "#fff", fontSize: 11 }} />
                <Area type="monotone" dataKey="pts" stroke={color} fill="url(#perfGrad)" strokeWidth={2} name="Points" dot={{ fill: color, r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}

      {tab === "game-log" && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[600px]">
              <thead>
                <tr className="border-b border-white/[0.07]">
                  {["Game","Opponent","PTS","REB","AST","FG%","Result"].map(h => (
                    <th key={h} className="px-4 py-3.5 text-left text-[10px] text-white/25 uppercase tracking-wider font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERF_DATA.map((g, i) => {
                  const opp = CLUBS[(i + 1) % CLUBS.length];
                  const won = i % 3 !== 2;
                  return (
                    <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.025] transition-colors">
                      <td className="px-4 py-3 text-white/45">{g.g}</td>
                      <td className="px-4 py-3 font-semibold" style={{ color: opp.color }}>{opp.name}</td>
                      <td className="px-4 py-3 font-black" style={{ color: BL }}>{g.pts}</td>
                      <td className="px-4 py-3 text-white/65">{g.reb}</td>
                      <td className="px-4 py-3 text-white/65">{g.ast}</td>
                      <td className="px-4 py-3 text-white/65">{(44 + i * 2).toFixed(1)}%</td>
                      <td className="px-4 py-3"><Badge color={won ? GR : PK}>{won ? "W" : "L"}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === "scout-notes" && (
        <Card className="p-4 sm:p-6">
          <SectionLabel color={color}>Scouting Report</SectionLabel>
          <div className="space-y-4 text-sm text-white/65 leading-relaxed">
            <p><span className="font-bold text-white">Elite court vision</span> — reads the defense before the play develops. Exceptional at finding cutters late in the shot clock. Rarely turns it over under pressure.</p>
            <p><span className="font-bold text-white">First-step acceleration</span> is among the best at this level. Consistently beats defenders off the dribble and creates contact at the rim. High free throw opportunity rate.</p>
            <p><span className="font-bold text-white">Three-point range</span> is developing — effective from corners (43%), less consistent from the wing (28%). Shot selection in transition needs work.</p>
            <p><span className="font-bold text-white">Leadership and IQ</span> stand out immediately. Commanding presence in pick-and-roll as the ball handler, with advanced understanding of defensive rotations.</p>
            <div className="pt-4 mt-2 border-t border-white/[0.07] flex items-center justify-between text-[11px] text-white/25">
              <span>Scouted by Tobi Adesanya</span>
              <span>Season Zero 2026 · Weeks 3–4</span>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── SCREEN: FAN CLUB ─────────────────────────────────────────────────────────
function FanClubScreen() {
  const [activeClub, setActiveClub] = useState(CLUBS[0]);
  const [voted, setVoted]           = useState<number | null>(null);
  const voteData = [28, 41, 18, 13];

  const clubPlayers = PLAYERS.filter(p => p.club === activeClub.name).slice(0, 4);

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-[22px] font-black text-white" style={{ fontFamily: "'Exo 2', sans-serif" }}>Fan Club</h1>
        <p className="text-xs text-white/40 mt-1">Community Hub · Season Zero 2026</p>
      </div>

      {/* Club selector */}
      <div className="flex gap-2 flex-wrap mb-6">
        {CLUBS.map(c => (
          <button
            key={c.id}
            onClick={() => { setActiveClub(c); setVoted(null); }}
            className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all"
            style={{
              background: activeClub.id === c.id ? `${c.color}18` : "rgba(255,255,255,0.03)",
              color: activeClub.id === c.id ? c.color : "rgba(255,255,255,0.35)",
              border: `1px solid ${activeClub.id === c.id ? c.color + "40" : "rgba(255,255,255,0.07)"}`,
            }}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Club card */}
        <Card className="p-6 flex flex-col items-center text-center" style={{ borderColor: `${activeClub.color}18` }}>
          <div
            className="w-24 h-24 rounded-2xl mb-4 flex items-center justify-center text-2xl font-black border"
            style={{ background: `${activeClub.color}18`, borderColor: `${activeClub.color}40`, color: activeClub.color, fontFamily: "'Exo 2', sans-serif", boxShadow: `0 0 40px ${activeClub.color}20` }}
          >
            {activeClub.abbr}
          </div>
          <div className="text-2xl font-black text-white mb-1" style={{ fontFamily: "'Exo 2', sans-serif" }}>{activeClub.name}</div>
          <div className="text-xs text-white/35 mb-5">{activeClub.city} · Fan Division</div>

          <div className="text-4xl font-black mb-1" style={{ color: activeClub.color, fontFamily: "'Barlow Condensed', sans-serif" }}>
            {activeClub.fans.toLocaleString()}
          </div>
          <div className="text-[10px] text-white/30 uppercase tracking-wider mb-5">Registered Fans</div>

          <div className="text-[10px] text-white/25 mb-1 uppercase tracking-wider">Fan Captain</div>
          <div className="text-sm font-bold text-white mb-5">Kemi Adebisi</div>

          <button
            className="w-full py-3 rounded-xl font-black text-sm uppercase tracking-wider transition-all hover:opacity-90"
            style={{ background: activeClub.color, color: "#000", fontFamily: "'Exo 2', sans-serif" }}
          >
            <Heart size={12} className="inline mr-1.5" fill="#000" />
            Join Fan Club
          </button>

          <div className="flex items-center justify-center gap-4 mt-5">
            {["Twitter","Instagram","TikTok"].map(s => (
              <button key={s} className="text-[10px] text-white/25 hover:text-white/60 transition-colors uppercase tracking-wider">{s}</button>
            ))}
          </div>
        </Card>

        {/* Events + Poll */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-5">
            <SectionLabel color={activeClub.color}>Upcoming Fan Events</SectionLabel>
            <div className="space-y-3">
              {[
                { name:"Opening Day Watch Party", date:"Aug 15, 2026", location:"Lagos Fan Zone", type:"Watch Party" },
                { name:"Meet the Coach — Fan Q&A", date:"Aug 20, 2026", location:"Online via StreamKit", type:"Virtual" },
                { name:"Season Zero Kit Drop", date:"Sep 1, 2026", location:"ultrabasketball.com", type:"Online" },
              ].map((ev, i) => (
                <div key={i} className="flex items-center justify-between p-3.5 rounded-xl border border-white/[0.06]">
                  <div>
                    <div className="text-sm font-semibold text-white">{ev.name}</div>
                    <div className="text-[11px] text-white/30 mt-0.5 flex items-center gap-2">
                      <Calendar size={9} /> {ev.date} · {ev.location}
                    </div>
                  </div>
                  <Badge color={activeClub.color}>{ev.type}</Badge>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <SectionLabel color={activeClub.color}>Fan Vote — Player of the Game</SectionLabel>
            <p className="text-xs text-white/35 mb-4">Cast your vote · Aug 15 vs Apex</p>
            <div className="space-y-3.5">
              {clubPlayers.map((p, i) => {
                const pct = voteData[i] ?? 0;
                const isVoted = voted === p.id;
                return (
                  <div key={p.id}>
                    <div className="flex items-center justify-between mb-2">
                      <button
                        onClick={() => setVoted(p.id)}
                        className="flex items-center gap-2 text-xs font-semibold transition-all hover:opacity-80"
                        style={{ color: isVoted ? activeClub.color : "rgba(255,255,255,0.65)" }}
                      >
                        {isVoted && <Star size={10} fill={activeClub.color} style={{ color: activeClub.color }} />}
                        {p.name}
                        <Badge color={BL}>{p.pos}</Badge>
                      </button>
                      <span className="text-xs font-bold" style={{ color: isVoted ? activeClub.color : "rgba(255,255,255,0.3)" }}>{pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/[0.05]">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: voted !== null ? `${pct}%` : "0%", background: isVoted ? activeClub.color : "rgba(255,255,255,0.15)" }}
                      />
                    </div>
                  </div>
                );
              })}
              {!voted && <p className="text-[11px] text-white/25 text-center pt-1">Tap a player to cast your vote</p>}
              {voted !== null && <p className="text-xs font-semibold text-center pt-1" style={{ color: activeClub.color }}>Vote cast! Results updating live.</p>}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── SCREEN: MATCH REPORT ─────────────────────────────────────────────────────
function MatchReportScreen() {
  const homeClub = CLUBS[0];
  const awayClub = CLUBS[1];

  const timeline = [
    { q:"Q1", time:"0:00",  event:"Tip-off — Vortex win possession",                type:"neutral" },
    { q:"Q1", time:"2:14",  event:"Kofi Ansah 3-pointer — Vortex lead 9-4",         type:"home"    },
    { q:"Q1", time:"8:30",  event:"End Q1 — Vortex 24 – Apex 18",                   type:"neutral" },
    { q:"Q2", time:"3:20",  event:"Amara Sesay hot streak — Apex close gap to 35-38",type:"away"   },
    { q:"Q2", time:"8:00",  event:"End Q2 — Vortex 47 – Apex 42",                   type:"neutral" },
    { q:"Q3", time:"4:22",  event:"Kofi Ansah 3PT — Vortex extend lead 68-61",       type:"home"   },
    { q:"Q4", time:"0:00",  event:"Final buzzer — Vortex 88 – Apex 74",              type:"neutral" },
  ];

  const teamStats = [
    { label:"Field Goals",  home:"32/67",  away:"28/72"  },
    { label:"3-Pointers",   home:"12/28",  away:"9/31"   },
    { label:"Free Throws",  home:"12/15",  away:"9/14"   },
    { label:"Rebounds",     home:38,       away:31       },
    { label:"Assists",      home:22,       away:17       },
    { label:"Turnovers",    home:11,       away:14       },
    { label:"Fouls",        home:16,       away:19       },
  ];

  const topScorers = [
    { name:"Kofi Ansah",   club:"Vortex", pts:31, reb:2,  ast:12 },
    { name:"Amara Sesay",  club:"Apex",   pts:24, reb:4,  ast:5  },
    { name:"Kojo Mensah",  club:"Vortex", pts:18, reb:12, ast:1  },
    { name:"Zainab Kamara",club:"Apex",   pts:17, reb:7,  ast:2  },
  ];

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-black text-white" style={{ fontFamily: "'Exo 2', sans-serif" }}>Match Report</h1>
          <p className="text-xs text-white/40 mt-1">Lagos Arena · Aug 15, 2026</p>
        </div>
        <button
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all hover:opacity-90"
          style={{ background: `${BL}15`, color: BL, border: `1px solid ${BL}28` }}
        >
          <Download size={12} /> Export PDF
        </button>
      </div>

      {/* Final score card */}
      <Card className="p-6 mb-5" style={{ borderColor: `${BL}18`, background: "linear-gradient(135deg, #0e1018, #0f111e)" }}>
        <div className="text-center mb-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/25">Full Time · Season Zero 2026</span>
        </div>
        <div className="flex items-center justify-center gap-10">
          <div className="text-center">
            <ClubBadge club={homeClub} size="lg" />
            <div className="text-lg font-black text-white mt-2" style={{ fontFamily: "'Exo 2', sans-serif" }}>{homeClub.name}</div>
          </div>
          <div className="text-6xl font-black text-white" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            88 <span className="text-white/20">–</span> 74
          </div>
          <div className="text-center">
            <ClubBadge club={awayClub} size="lg" />
            <div className="text-lg font-black text-white mt-2" style={{ fontFamily: "'Exo 2', sans-serif" }}>{awayClub.name}</div>
          </div>
        </div>
        <div className="flex justify-center mt-4">
          <div className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full" style={{ background: `${OR}12`, border: `1px solid ${OR}28` }}>
            <Award size={13} style={{ color: OR }} />
            <span className="text-xs text-white/50">MVP</span>
            <span className="text-xs font-bold" style={{ color: OR }}>Kofi Ansah (Vortex) — 31pts · 12ast</span>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Team stats */}
        <Card className="p-5">
          <SectionLabel color={BL}>Team Statistics</SectionLabel>
          <div className="space-y-2.5">
            {teamStats.map(s => (
              <div key={s.label} className="flex items-center gap-3 text-xs">
                <span className="font-bold flex-1 text-right" style={{ color: homeClub.color }}>{s.home}</span>
                <span className="text-[10px] text-white/25 uppercase tracking-wider w-24 text-center flex-shrink-0">{s.label}</span>
                <span className="font-bold flex-1" style={{ color: awayClub.color }}>{s.away}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Timeline */}
        <Card className="p-5">
          <SectionLabel color={GR}>Game Timeline</SectionLabel>
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {timeline.map((e, i) => (
              <div key={i} className="flex gap-3 p-2 rounded-lg text-xs" style={{
                background: e.type === "home" ? `${homeClub.color}08` : e.type === "away" ? `${awayClub.color}08` : "transparent"
              }}>
                <div className="flex-shrink-0 w-14 text-[9px] font-mono text-white/25 pt-0.5">{e.q} {e.time}</div>
                <div className="text-white/60 leading-relaxed">{e.event}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Top scorers */}
        <Card className="p-5">
          <SectionLabel color={OR}>Top Scorers</SectionLabel>
          <div className="space-y-2">
            {topScorers.map((p, i) => (
              <div key={i} className="flex items-center justify-between p-2.5 rounded-xl" style={{ background: "rgba(255,255,255,0.025)" }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[9px] font-black" style={{ background: `${cc(p.club)}18`, color: cc(p.club) }}>
                    {initials(p.name)}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white">{p.name}</div>
                    <div className="text-[10px]" style={{ color: cc(p.club) }}>{p.club}</div>
                  </div>
                </div>
                <div className="flex gap-5 text-xs">
                  <div className="text-center"><div className="font-black" style={{ color: OR }}>{p.pts}</div><div className="text-white/25 text-[9px]">PTS</div></div>
                  <div className="text-center"><div className="font-semibold text-white/65">{p.reb}</div><div className="text-white/25 text-[9px]">REB</div></div>
                  <div className="text-center"><div className="font-semibold text-white/65">{p.ast}</div><div className="text-white/25 text-[9px]">AST</div></div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Coach & Scout notes */}
        <Card className="p-5">
          <SectionLabel color={PU}>Coach & Scout Notes</SectionLabel>
          <div className="space-y-4 text-xs text-white/55 leading-relaxed">
            <div>
              <div className="text-white font-bold mb-1.5 text-sm">Head Coach — Marcus Okafor (Vortex)</div>
              <p>Strong defensive effort in Q3. Kofi and Kojo executed the pick-and-roll perfectly. Need to improve second-chance points allowed off offensive boards.</p>
            </div>
            <div className="border-t border-white/[0.07] pt-3">
              <div className="text-white font-bold mb-1.5 text-sm">Scout — Tobi Adesanya</div>
              <p>Apex showed improved transition offense. Watch Sesay — she will be a serious draft consideration if she sustains this output. Vortex bench depth remains a concern for a long campaign.</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────
function Sidebar({
  screen,
  setScreen,
  mobileOpen,
  onMobileClose,
}: {
  screen: string;
  setScreen: (s: string) => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  function navTo(id: string) {
    setScreen(id);
    onMobileClose?.();
  }

  const NavContent = () => (
    <>
      {/* Logo area */}
      <div className="flex items-center gap-3 px-3 py-4 border-b" style={{ borderColor: "rgba(0,212,255,0.07)" }}>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black flex-shrink-0 border"
          style={{ background: `${BL}12`, borderColor: `${BL}28`, color: BL, fontFamily: "'Exo 2', sans-serif", boxShadow: `0 0 15px ${BL}15` }}
        >
          UB
        </div>
        {!collapsed && (
          <div style={{ fontFamily: "'Exo 2', sans-serif" }}>
            <div className="text-xs font-black text-white leading-tight">ULTRA</div>
            <div className="text-[9px] tracking-[0.3em]" style={{ color: `${BL}90` }}>BASKETBALL</div>
          </div>
        )}
        <button
          onClick={() => { setCollapsed(c => !c); onMobileClose?.(); }}
          className="ml-auto p-1 rounded-lg hover:bg-white/5 transition-colors flex-shrink-0"
        >
          <Menu size={13} className="text-white/25" />
        </button>
      </div>

      {/* Season badge */}
      {!collapsed && (
        <div className="mx-2.5 mt-3 px-3 py-2 rounded-lg" style={{ background: `${OR}0d`, border: `1px solid ${OR}18` }}>
          <div className="text-[8px] text-white/25 uppercase tracking-[0.2em]">Active Season</div>
          <div className="text-[11px] font-bold" style={{ color: OR }}>Season Zero 2026</div>
        </div>
      )}

      {/* Nav items */}
      <nav className="flex-1 px-2 py-2 overflow-y-auto space-y-0.5">
        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const active = screen === item.id
            || (screen === "club-detail" && item.id === "clubs")
            || (screen === "player-profile" && item.id === "players");
          return (
            <button
              key={item.id}
              onClick={() => navTo(item.id)}
              title={collapsed ? item.label : undefined}
              className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl transition-all text-left"
              style={{
                background: active ? `${BL}12` : "transparent",
                color: active ? BL : "rgba(255,255,255,0.35)",
              }}
            >
              <Icon size={15} className="flex-shrink-0" />
              {!collapsed && (
                <>
                  <span className="text-xs font-semibold">{item.label}</span>
                  {active && <div className="ml-auto w-1.5 h-1.5 rounded-full" style={{ background: BL }} />}
                </>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-2 border-t" style={{ borderColor: "rgba(0,212,255,0.07)" }}>
        <button className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl hover:bg-white/[0.04] transition-colors text-left">
          <LogOut size={15} className="text-white/25 flex-shrink-0" />
          {!collapsed && <span className="text-xs font-semibold text-white/25">Sign Out</span>}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar — hidden on mobile */}
      <div
        className="hidden md:flex flex-col h-full flex-shrink-0 border-r transition-all duration-200"
        style={{ width: collapsed ? 60 : 220, background: "#0a0c14", borderColor: "rgba(0,212,255,0.07)" }}
      >
        <NavContent />
      </div>

      {/* Mobile overlay drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onMobileClose}
          />
          {/* Drawer */}
          <div
            className="relative flex flex-col h-full border-r z-10"
            style={{ width: 240, background: "#0a0c14", borderColor: "rgba(0,212,255,0.07)" }}
          >
            <NavContent />
          </div>
        </div>
      )}
    </>
  );
}

// ─── APP ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen,         setScreen]         = useState("login");
  const [selectedClub,   setSelectedClub]   = useState<Club>(CLUBS[0]);
  const [selectedPlayer, setSelectedPlayer] = useState<Player>(PLAYERS[0]);
  const [mobileNavOpen,  setMobileNavOpen]  = useState(false);

  function nav(s: string) {
    setScreen(s);
    setMobileNavOpen(false);
    document.getElementById("main-content")?.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (screen === "login") {
    return (
      <div className="dark size-full">
        <LoginScreen onLogin={() => nav("dashboard")} />
      </div>
    );
  }

  if (screen === "scoreboard") {
    return (
      <div className="dark size-full">
        <ScoreboardScreen />
      </div>
    );
  }

  const screenLabels: Record<string, string> = {
    dashboard: "Dashboard", clubs: "Clubs", "club-detail": "Club Detail",
    players: "Players", "player-profile": "Player Profile", draft: "Draft Room",
    fixtures: "Fixtures", live: "Live Game", table: "League Table",
    report: "Match Report", fanclub: "Fan Club",
  };

  function renderScreen() {
    switch (screen) {
      case "dashboard":      return <DashboardScreen nav={nav} />;
      case "clubs":          return <ClubsScreen nav={nav} setClub={setSelectedClub} />;
      case "club-detail":    return <ClubDetailScreen club={selectedClub} nav={nav} />;
      case "players":        return <PlayersScreen nav={nav} setPlayer={setSelectedPlayer} />;
      case "player-profile": return <PlayerProfileScreen player={selectedPlayer} nav={nav} />;
      case "draft":          return <DraftRoomScreen />;
      case "fixtures":       return <FixturesScreen />;
      case "live":           return <LiveGameScreen />;
      case "table":          return <LeagueTableScreen />;
      case "report":         return <MatchReportScreen />;
      case "fanclub":        return <FanClubScreen />;
      default:               return <DashboardScreen nav={nav} />;
    }
  }

  return (
    <div
      className="dark flex h-screen overflow-hidden"
      style={{ background: "#090a0f", fontFamily: "'DM Sans', sans-serif" }}
    >
      <Sidebar
        screen={screen}
        setScreen={nav}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Mobile top header — only visible below md */}
        <div
          className="md:hidden flex items-center gap-3 px-4 py-3 border-b flex-shrink-0"
          style={{ background: "#0a0c14", borderColor: "rgba(0,212,255,0.07)" }}
        >
          <button
            onClick={() => setMobileNavOpen(true)}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors"
          >
            <Menu size={18} className="text-white/60" />
          </button>
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black border flex-shrink-0"
            style={{ background: `${BL}12`, borderColor: `${BL}28`, color: BL, fontFamily: "'Exo 2', sans-serif" }}
          >
            UB
          </div>
          <span className="text-sm font-bold text-white" style={{ fontFamily: "'Exo 2', sans-serif" }}>
            {screenLabels[screen] ?? "Ultra Basketball"}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button className="p-2 rounded-lg hover:bg-white/5 transition-colors relative">
              <Bell size={16} className="text-white/50" />
              <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full" style={{ background: PK }} />
            </button>
          </div>
        </div>

        <main
          id="main-content"
          className="flex-1 overflow-y-auto"
          style={{ background: "#090a0f", scrollbarWidth: "none" }}
        >
          {renderScreen()}
        </main>
      </div>
    </div>
  );
}
