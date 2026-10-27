import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import SEO from '../../components/SEO';
import AdminShell from '../../components/admin/AdminShell';
import { authRequest, onSessionEnded } from '../../lib/authClient';

/**
 * /admin/stats - the staff dashboard.
 *
 * Aggregates only: the API returns counts and series, never a registrant row.
 * The page is hidden from non-staff by RequireAuth, but every request is checked
 * again on the server by requireStaff.
 */

type CategoryCount = { total: number; last7: number; prev7: number; change: number };
type SeriesRow = {
  day: string;
  registrations: number;
  subscriptions: number;
  consultations: number;
  talent: number;
  employers: number;
};
type Stats = {
  range: RangeKey;
  from: string;
  to: string;
  counts: {
    registrations: CategoryCount;
    subscriptions: CategoryCount;
    consultations: CategoryCount;
    talent: CategoryCount;
    employers: CategoryCount;
  };
  series: SeriesRow[];
  events: { event_slug: string; total: number }[];
};
type TopRow = { label: string; views: number };
type Traffic = {
  totals: { views: number; uniques: number };
  previous: { views: number; uniques: number } | null;
  daily: { day: string; views: number; uniques: number }[];
  pages: TopRow[];
  referrers: TopRow[];
  countries: TopRow[];
  devices: TopRow[];
};
type RangeKey = '7' | '30' | '90' | 'all';

const RANGES: { value: RangeKey; label: string }[] = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: 'all', label: 'All time' },
];

const CATEGORY_META = [
  { key: 'registrations', label: 'Event registrations', color: '#1B4332' },
  { key: 'subscriptions', label: 'Email subscriptions', color: '#2F855A' },
  { key: 'consultations', label: 'Consultations', color: '#C05621' },
  { key: 'talent', label: 'Talent signups', color: '#4A5568' },
  { key: 'employers', label: 'Employer signups', color: '#B7791F' },
] as const;

function percentChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function changeLabel(value: number, basis = 'previous 7 days'): string {
  if (value === 0) return 'no change';
  return `${value > 0 ? '+' : ''}${value}% vs ${basis}`;
}

const COUNTRY_STRING = `AD:Andorra;AE:United Arab Emirates;AF:Afghanistan;AG:Antigua and Barbuda;AI:Anguilla;AL:Albania;AM:Armenia;AO:Angola;AQ:Antarctica;AR:Argentina;AS:American Samoa;AT:Austria;AU:Australia;AW:Aruba;AX:Aland Islands;AZ:Azerbaijan;BA:Bosnia and Herzegovina;BB:Barbados;BD:Bangladesh;BE:Belgium;BF:Burkina Faso;BG:Bulgaria;BH:Bahrain;BI:Burundi;BJ:Benin;BL:Saint Barthelemy;BM:Bermuda;BN:Brunei;BO:Bolivia;BQ:Bonaire, Sint Eustatius and Saba;BR:Brazil;BS:Bahamas;BT:Bhutan;BV:Bouvet Island;BW:Botswana;BY:Belarus;BZ:Belize;CA:Canada;CC:Cocos Islands;CD:Democratic Republic of the Congo;CF:Central African Republic;CG:Republic of the Congo;CH:Switzerland;CI:Ivory Coast;CK:Cook Islands;CL:Chile;CM:Cameroon;CN:China;CO:Colombia;CR:Costa Rica;CU:Cuba;CV:Cabo Verde;CW:Curacao;CX:Christmas Island;CY:Cyprus;CZ:Czechia;DE:Germany;DJ:Djibouti;DK:Denmark;DM:Dominica;DO:Dominican Republic;DZ:Algeria;EC:Ecuador;EE:Estonia;EG:Egypt;EH:Western Sahara;ER:Eritrea;ES:Spain;ET:Ethiopia;FI:Finland;FJ:Fiji;FK:Falkland Islands;FM:Micronesia;FO:Faroe Islands;FR:France;GA:Gabon;GB:United Kingdom;GD:Grenada;GE:Georgia;GF:French Guiana;GG:Guernsey;GH:Ghana;GI:Gibraltar;GL:Greenland;GM:Gambia;GN:Guinea;GP:Guadeloupe;GQ:Equatorial Guinea;GR:Greece;GS:South Georgia and the South Sandwich Islands;GT:Guatemala;GU:Guam;GW:Guinea-Bissau;GY:Guyana;HK:Hong Kong;HM:Heard Island and McDonald Islands;HN:Honduras;HR:Croatia;HT:Haiti;HU:Hungary;ID:Indonesia;IE:Ireland;IL:Israel;IM:Isle of Man;IN:India;IO:British Indian Ocean Territory;IQ:Iraq;IR:Iran;IS:Iceland;IT:Italy;JE:Jersey;JM:Jamaica;JO:Jordan;JP:Japan;KE:Kenya;KG:Kyrgyzstan;KH:Cambodia;KI:Kiribati;KM:Comoros;KN:Saint Kitts and Nevis;KP:North Korea;KR:South Korea;KW:Kuwait;KY:Cayman Islands;KZ:Kazakhstan;LA:Laos;LB:Lebanon;LC:Saint Lucia;LI:Liechtenstein;LK:Sri Lanka;LR:Liberia;LS:Lesotho;LT:Lithuania;LU:Luxembourg;LV:Latvia;LY:Libya;MA:Morocco;MC:Monaco;MD:Moldova;ME:Montenegro;MF:Saint Martin (French part);MG:Madagascar;MH:Marshall Islands;MK:North Macedonia;ML:Mali;MM:Myanmar;MN:Mongolia;MO:Macao;MP:Northern Mariana Islands;MQ:Martinique;MR:Mauritania;MS:Montserrat;MT:Malta;MU:Mauritius;MV:Maldives;MW:Malawi;MX:Mexico;MY:Malaysia;MZ:Mozambique;NA:Namibia;NC:New Caledonia;NE:Niger;NF:Norfolk Island;NG:Nigeria;NI:Nicaragua;NL:Netherlands;NO:Norway;NP:Nepal;NR:Nauru;NU:Niue;NZ:New Zealand;OM:Oman;PA:Panama;PE:Peru;PF:French Polynesia;PG:Papua New Guinea;PH:Philippines;PK:Pakistan;PL:Poland;PM:Saint Pierre and Miquelon;PN:Pitcairn;PR:Puerto Rico;PS:Palestine;PT:Portugal;PW:Palau;PY:Paraguay;QA:Qatar;RE:Reunion;RO:Romania;RS:Serbia;RU:Russia;RW:Rwanda;SA:Saudi Arabia;SB:Solomon Islands;SC:Seychelles;SD:Sudan;SE:Sweden;SG:Singapore;SH:Saint Helena;SI:Slovenia;SJ:Svalbard and Jan Mayen;SK:Slovakia;SL:Sierra Leone;SM:San Marino;SN:Senegal;SO:Somalia;SR:Suriname;SS:South Sudan;ST:Sao Tome and Principe;SV:El Salvador;SX:Sint Maarten (Dutch part);SY:Syria;SZ:Eswatini;TC:Turks and Caicos Islands;TD:Chad;TF:French Southern Territories;TG:Togo;TH:Thailand;TJ:Tajikistan;TK:Tokelau;TL:Timor-Leste;TM:Turkmenistan;TN:Tunisia;TO:Tonga;TR:Turkey;TT:Trinidad and Tobago;TV:Tuvalu;TW:Taiwan;TZ:Tanzania;UA:Ukraine;UG:Uganda;UM:United States Minor Outlying Islands;US:United States;UY:Uruguay;UZ:Uzbekistan;VA:Vatican City;VC:Saint Vincent and the Grenadines;VE:Venezuela;VG:Virgin Islands (British);VI:Virgin Islands (U.S.);VN:Vietnam;VU:Vanuatu;WF:Wallis and Futuna;WS:Samoa;YE:Yemen;YT:Mayotte;ZA:South Africa;ZM:Zambia;ZW:Zimbabwe`;

const COUNTRY_NAMES: Record<string, string> = Object.fromEntries(
  COUNTRY_STRING.split(';').map((entry) => {
    const [code, name] = entry.split(':');
    return [code, name];
  }),
);

/** Country names instead of codes; ZZ (and unknown codes) read as Unknown. */
function countryName(code: string): string {
  const upper = code.trim().toUpperCase();
  if (!upper || upper === 'ZZ') return 'Unknown';
  return COUNTRY_NAMES[upper] ?? upper;
}

function shortDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function LineChart({
  labels,
  series,
}: {
  labels: string[];
  series: { key: string; label: string; color: string; values: number[] }[];
}) {
  const width = 760;
  const height = 220;
  const pad = 30;
  const max = Math.max(1, ...series.flatMap((line) => line.values));
  const x = (index: number) =>
    labels.length <= 1 ? pad : pad + (index / (labels.length - 1)) * (width - pad * 2);
  const y = (value: number) => height - pad - (value / max) * (height - pad * 2);

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={series[0]?.label ?? 'Activity per day'} className="w-full">
        {[0, 0.5, 1].map((fraction) => (
          <line
            key={fraction}
            x1={pad}
            x2={width - pad}
            y1={y(max * fraction)}
            y2={y(max * fraction)}
            stroke="#E5E1D8"
            strokeWidth="1"
          />
        ))}
        {labels.length > 1 &&
          [0, Math.floor((labels.length - 1) / 2), labels.length - 1].map((index) => (
            <text key={index} x={x(index)} y={height - 8} textAnchor="middle" fontSize="10" fill="#6B6B6B">
              {shortDay(labels[index])}
            </text>
          ))}
        {series.map((line) => (
          <polyline
            key={line.key}
            fill="none"
            stroke={line.color}
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={line.values.map((value, index) => `${x(index)},${y(value)}`).join(' ')}
          />
        ))}
      </svg>
    </div>
  );
}

export default function AdminStats() {
  const [range, setRange] = useState<RangeKey>('30');
  const [stats, setStats] = useState<Stats | null>(null);
  const [traffic, setTraffic] = useState<Traffic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState<Record<string, boolean>>(
    Object.fromEntries(CATEGORY_META.map((item) => [item.key, true])),
  );

  const navigate = useNavigate();

  const endSession = useCallback(() => {
    navigate('/admin/login?expired=1', {
      replace: true,
      state: { from: '/admin/stats' },
    });
  }, [navigate]);

  useEffect(() => onSessionEnded(() => endSession()), [endSession]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const [statsResult, trafficResult] = await Promise.all([
        authRequest<Stats>(`/api/admin/stats?range=${range}`, { method: 'GET' }),
        authRequest<Traffic>(`/api/admin/traffic?range=${range}`, { method: 'GET' }),
      ]);
      if (signal?.aborted) return;
      if (!statsResult.ok) {
        setError(statsResult.failure.error);
        setLoading(false);
        return;
      }
      if (!trafficResult.ok) {
        setError(trafficResult.failure.error);
        setLoading(false);
        return;
      }
      setStats(statsResult.data);
      setTraffic(trafficResult.data);
      setError(null);
      setLoading(false);
    },
    [range],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const labels = useMemo(() => stats?.series.map((row) => row.day) ?? [], [stats]);
  const chartSeries = useMemo(
    () =>
      CATEGORY_META.filter((meta) => visible[meta.key]).map((meta) => ({
        key: meta.key,
        label: meta.label,
        color: meta.color,
        values: stats?.series.map((row) => row[meta.key]) ?? [],
      })),
    [stats, visible],
  );

  const trafficChange = traffic?.previous
    ? {
        views: percentChange(traffic.totals.views, traffic.previous.views),
        uniques: percentChange(traffic.totals.uniques, traffic.previous.uniques),
      }
    : null;

  return (
    <>
      <SEO title="Dashboard | People Growth Africa" description="Staff dashboard for registrations and site activity." />
      <AdminShell
        title="Dashboard"
        subtitle="Registrations, signups and website traffic in one place."
        actions={
          <div className="inline-flex flex-wrap rounded-full border border-charcoal/15 bg-white p-1">
            {RANGES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRange(option.value)}
                className={`min-h-[36px] cursor-pointer rounded-full border-0 px-3 py-1.5 font-[family-name:var(--font-body)] text-xs font-semibold transition-colors ${
                  range === option.value ? 'bg-deep-green text-white' : 'text-charcoal/70 hover:bg-cream'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      >
          {error && (
            <p role="alert" className="mb-5 rounded-[10px] border border-terracotta/30 bg-terracotta/10 px-4 py-3 text-sm text-terracotta">
              {error}
            </p>
          )}

          {loading || !stats || !traffic ? (
            <p className="rounded-2xl border border-charcoal/10 bg-white px-5 py-10 text-center text-sm text-charcoal/50">
              Loading dashboard…
            </p>
          ) : (
            <>
              <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
                {CATEGORY_META.map((meta, index) => {
                  const count = stats.counts[meta.key];
                  return (
                    <div key={meta.key} className={`rounded-2xl border border-charcoal/10 bg-white p-4 ${index === CATEGORY_META.length - 1 ? 'col-span-2 lg:col-span-1' : ''}`}>
                      <p className="text-[0.72rem] font-semibold uppercase tracking-wider text-charcoal/50">{meta.label}</p>
                      <p className="mt-2 font-[family-name:var(--font-heading)] text-3xl font-bold text-charcoal">{count.total}</p>
                      <p className="mt-1 text-xs text-charcoal/60">{count.last7} in the last 7 days</p>
                      <p className={`mt-1 text-xs font-semibold ${count.change >= 0 ? 'text-deep-green' : 'text-terracotta'}`}>
                        {changeLabel(count.change)}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="mb-6 rounded-2xl border border-charcoal/10 bg-white p-4 sm:p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-[family-name:var(--font-heading)] text-xl font-bold text-charcoal">Activity per day</h2>
                  <div className="w-full overflow-x-auto pb-1 lg:w-auto lg:overflow-visible">
                    <div className="flex w-max gap-2">
                      {CATEGORY_META.map((meta) => (
                        <button
                          key={meta.key}
                          type="button"
                          onClick={() => setVisible((current) => ({ ...current, [meta.key]: !current[meta.key] }))}
                          className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold ${
                            visible[meta.key] ? 'border-charcoal/20 text-charcoal' : 'border-charcoal/10 text-charcoal/35'
                          }`}
                        >
                          <span className="h-2 w-2 rounded-full" style={{ background: visible[meta.key] ? meta.color : '#D1CCC2' }} />
                          {meta.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {labels.length === 0 ? (
                  <p className="py-8 text-center text-sm text-charcoal/45">No activity in this period yet.</p>
                ) : (
                  <LineChart labels={labels} series={chartSeries} />
                )}
              </div>

              <div className="mb-6 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-charcoal/10 bg-white p-4 sm:p-6">
                  <h2 className="font-[family-name:var(--font-heading)] text-xl font-bold text-charcoal">Registrations per event</h2>
                  {stats.events.length === 0 ? (
                    <p className="py-8 text-center text-sm text-charcoal/45">No registrations in this period.</p>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {stats.events.map((event) => {
                        const max = Math.max(1, ...stats.events.map((row) => row.total));
                        return (
                          <div key={event.event_slug}>
                            <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                              <span className="truncate font-semibold text-charcoal">{event.event_slug}</span>
                              <span className="text-charcoal/60">{event.total}</span>
                            </div>
                            <div className="h-2.5 overflow-hidden rounded-full bg-cream">
                              <div className="h-full rounded-full bg-brand-green" style={{ width: `${(event.total / max) * 100}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-charcoal/10 bg-white p-4 sm:p-6">
                  <h2 className="font-[family-name:var(--font-heading)] text-xl font-bold text-charcoal">Website traffic</h2>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-cream/60 p-3">
                      <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-charcoal/50">Page views</p>
                      <p className="mt-1 text-2xl font-bold text-charcoal">{traffic.totals.views}</p>
                      {trafficChange && <p className="text-[0.7rem] text-charcoal/55">{changeLabel(trafficChange.views, 'previous period')}</p>}
                    </div>
                    <div className="rounded-xl bg-cream/60 p-3">
                      <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-charcoal/50">Unique visitors</p>
                      <p className="mt-1 text-2xl font-bold text-charcoal">{traffic.totals.uniques}</p>
                      {trafficChange && <p className="text-[0.7rem] text-charcoal/55">{changeLabel(trafficChange.uniques, 'previous period')}</p>}
                    </div>
                  </div>
                  <div className="mt-4">
                    <LineChart
                      labels={traffic.daily.map((row) => row.day)}
                      series={[
                        { key: 'views', label: 'Page views', color: '#1B4332', values: traffic.daily.map((row) => row.views) },
                        { key: 'uniques', label: 'Unique visitors', color: '#C05621', values: traffic.daily.map((row) => row.uniques) },
                      ]}
                    />
                  </div>
                  <p className="mt-3 text-[0.7rem] text-charcoal/45">
                    Counted without cookies. Staff pages and known bots are excluded.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { title: 'Top pages', rows: traffic.pages },
                  { title: 'Top referrers', rows: traffic.referrers },
                  { title: 'Top countries', rows: traffic.countries },
                  { title: 'Devices', rows: traffic.devices },
                ].map((block) => (
                  <div key={block.title} className="rounded-2xl border border-charcoal/10 bg-white p-4">
                    <h3 className="text-sm font-bold text-charcoal">{block.title}</h3>
                    {block.rows.length === 0 ? (
                      <p className="mt-4 text-xs text-charcoal/45">No data yet.</p>
                    ) : (
                      <ol className="mt-3 space-y-2">
                        {block.rows.map((row) => (
                          <li key={row.label} className="flex items-start justify-between gap-2 text-xs">
                            <span className="truncate text-charcoal/75" title={row.label}>
                              {block.title === 'Top countries' ? countryName(row.label) : row.label}
                            </span>
                            <span className="shrink-0 font-semibold text-charcoal">{row.views}</span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
      </AdminShell>
    </>
  );
}
