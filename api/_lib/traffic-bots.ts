export const TRAFFIC_BOT_THRESHOLDS = {
  suspectedScore: 3,
  requestsPerMinute: 60,
  knownBotWeight: 3,
  crawlerWeight: 3,
  previewOrUptimeWeight: 3,
  headlessWeight: 3,
  noJavaScriptWeight: 3,
  scannerPathWeight: 5,
  highRateWeight: 4,
  missingUserAgentWeight: 2,
} as const;

export const TRAFFIC_BOT_PATTERNS = {
  knownBot: '(bot|crawler|spider|slurp)',
  crawler: '(crawl|spider|bingbot|googlebot|yandex|baiduspider|duckduckbot)',
  previewOrUptime: '(bingpreview|facebookexternalhit|twitterbot|slackbot|discordbot|uptime|monitor)',
  headless: '(headlesschrome|phantomjs|puppeteer|playwright|selenium|curl/|wget/|python-requests|python-urllib|go-http-client|scrapy|httpx|aiohttp|node-fetch|axios|okhttp|java/|libwww-perl|mechanize|guzzlehttp|restsharp|powershell)',
  scannerPath: '(^|/)(wp-admin|wp-login\\.php|xmlrpc\\.php|\\.env|\\.git|phpmyadmin|administrator)(/|$)|^/admin(?:\\.php)?/?$|^/admin/(?:login\\.php|wp-admin|phpmyadmin)',
} as const;

export type TrafficBotRule = {
  rule_type: 'user_agent' | 'path';
  pattern: string;
  classification: 'bot' | 'human';
};

export type TrafficHitSignals = {
  path: string;
  userAgent: string;
  javascriptExecuted: boolean;
  requestsPerMinute?: number;
};

export type TrafficClassification = {
  isSuspectedBot: boolean;
  score: number;
  reasons: string[];
};

function ruleMatches(value: string, pattern: string): boolean {
  const expression = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/%/g, '.*')
    .replace(/_/g, '.');
  return new RegExp(`^${expression}$`, 'i').test(value);
}

function matchingRule(
  hit: TrafficHitSignals,
  rules: readonly TrafficBotRule[],
): TrafficBotRule | undefined {
  return rules
    .filter((rule) => ruleMatches(rule.rule_type === 'path' ? hit.path : hit.userAgent, rule.pattern))
    .sort((left, right) => {
      if (left.pattern.length !== right.pattern.length) return right.pattern.length - left.pattern.length;
      if (left.classification !== right.classification) return left.classification === 'human' ? -1 : 1;
      return 0;
    })[0];
}

export function classifyTrafficHit(
  hit: TrafficHitSignals,
  rules: readonly TrafficBotRule[] = [],
): TrafficClassification {
  const manual = matchingRule(hit, rules);
  if (manual) {
    return {
      isSuspectedBot: manual.classification === 'bot',
      score: manual.classification === 'bot' ? TRAFFIC_BOT_THRESHOLDS.suspectedScore : 0,
      reasons: [`manual_${manual.classification}`],
    };
  }

  const userAgent = hit.userAgent.trim();
  const reasons: string[] = [];
  let score = 0;
  const add = (reason: string, weight: number) => {
    reasons.push(reason);
    score += weight;
  };

  if (!userAgent) add('missing_user_agent', TRAFFIC_BOT_THRESHOLDS.missingUserAgentWeight);
  if (new RegExp(TRAFFIC_BOT_PATTERNS.knownBot, 'i').test(userAgent)) {
    add('known_bot', TRAFFIC_BOT_THRESHOLDS.knownBotWeight);
  }
  if (new RegExp(TRAFFIC_BOT_PATTERNS.crawler, 'i').test(userAgent)) {
    add('crawler', TRAFFIC_BOT_THRESHOLDS.crawlerWeight);
  }
  if (new RegExp(TRAFFIC_BOT_PATTERNS.previewOrUptime, 'i').test(userAgent)) {
    add('preview_or_uptime', TRAFFIC_BOT_THRESHOLDS.previewOrUptimeWeight);
  }
  if (new RegExp(TRAFFIC_BOT_PATTERNS.headless, 'i').test(userAgent)) {
    add('headless_or_automation', TRAFFIC_BOT_THRESHOLDS.headlessWeight);
  }
  if (!hit.javascriptExecuted) add('no_javascript_beacon', TRAFFIC_BOT_THRESHOLDS.noJavaScriptWeight);
  if (new RegExp(TRAFFIC_BOT_PATTERNS.scannerPath, 'i').test(hit.path)) {
    add('scanner_path', TRAFFIC_BOT_THRESHOLDS.scannerPathWeight);
  }
  if ((hit.requestsPerMinute ?? 0) > TRAFFIC_BOT_THRESHOLDS.requestsPerMinute) {
    add('high_request_rate', TRAFFIC_BOT_THRESHOLDS.highRateWeight);
  }

  return {
    isSuspectedBot: score >= TRAFFIC_BOT_THRESHOLDS.suspectedScore,
    score,
    reasons,
  };
}

export function trafficClassificationCtes(): string {
  const t = TRAFFIC_BOT_THRESHOLDS;
  const p = TRAFFIC_BOT_PATTERNS;
  return `hit_window AS (
    SELECT hit.*,
           count(*) OVER (
             PARTITION BY coalesce(ip_hash, hit_id::text), date_trunc('minute', created_at)
           )::int AS requests_per_minute
      FROM traffic_hits hit
     WHERE created_at >= $1::date - interval '1 minute'
       AND created_at < $2::date + interval '1 day'
  ),
  hit_signals AS (
    SELECT hit.*,
           rule.classification AS manual_classification,
           (user_agent ~* '${p.knownBot}') AS is_known_bot,
           (user_agent ~* '${p.crawler}') AS is_crawler,
           (user_agent ~* '${p.previewOrUptime}') AS is_preview_or_uptime,
           (user_agent ~* '${p.headless}') AS is_headless,
           (path ~* '${p.scannerPath}') AS is_scanner_path
      FROM hit_window hit
      LEFT JOIN LATERAL (
        SELECT classification
          FROM traffic_bot_rules
         WHERE (rule_type = 'user_agent' AND hit.user_agent ILIKE traffic_bot_rules.pattern)
            OR (rule_type = 'path' AND hit.path ILIKE traffic_bot_rules.pattern)
         ORDER BY length(pattern) DESC,
                  (classification = 'human') DESC,
                  created_at DESC
         LIMIT 1
      ) rule ON true
     WHERE hit.created_at >= $1::date
       AND hit.created_at < $2::date + interval '1 day'
  ),
  classified_hits AS (
    SELECT hit.*,
           CASE
             WHEN manual_classification IS NOT NULL THEN manual_classification = 'bot'
             ELSE (
               CASE WHEN is_known_bot THEN ${t.knownBotWeight} ELSE 0 END
               + CASE WHEN is_crawler THEN ${t.crawlerWeight} ELSE 0 END
               + CASE WHEN is_preview_or_uptime THEN ${t.previewOrUptimeWeight} ELSE 0 END
               + CASE WHEN is_headless THEN ${t.headlessWeight} ELSE 0 END
               + CASE WHEN NOT javascript_executed THEN ${t.noJavaScriptWeight} ELSE 0 END
               + CASE WHEN is_scanner_path THEN ${t.scannerPathWeight} ELSE 0 END
               + CASE WHEN requests_per_minute > ${t.requestsPerMinute} THEN ${t.highRateWeight} ELSE 0 END
               + CASE WHEN btrim(user_agent) = '' THEN ${t.missingUserAgentWeight} ELSE 0 END
             ) >= ${t.suspectedScore}
           END AS is_suspected_bot,
           CASE
             WHEN manual_classification IS NOT NULL THEN ARRAY['manual_' || manual_classification]
             ELSE array_remove(ARRAY[
               CASE WHEN is_known_bot THEN 'known_bot'::text END,
               CASE WHEN is_crawler THEN 'crawler'::text END,
               CASE WHEN is_preview_or_uptime THEN 'preview_or_uptime'::text END,
               CASE WHEN is_headless THEN 'headless_or_automation'::text END,
               CASE WHEN NOT javascript_executed THEN 'no_javascript_beacon'::text END,
               CASE WHEN is_scanner_path THEN 'scanner_path'::text END,
               CASE WHEN requests_per_minute > ${t.requestsPerMinute} THEN 'high_request_rate'::text END,
               CASE WHEN btrim(user_agent) = '' THEN 'missing_user_agent'::text END
             ], NULL)
           END AS bot_reasons
      FROM hit_signals hit
  )`;
}
