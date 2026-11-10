import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { authRequest } from '../../lib/authClient';

type TrafficBotRule = {
  id: string;
  rule_type: 'user_agent' | 'path';
  pattern: string;
  classification: 'bot' | 'human';
  created_at: string;
};

function isAccessDenied(code: string): boolean {
  return code === 'admin_only' || code === 'super_admin_only' || code === 'permission_denied';
}

export default function TrafficBotRules() {
  const [rules, setRules] = useState<TrafficBotRule[]>([]);
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ruleType, setRuleType] = useState<'user_agent' | 'path'>('user_agent');
  const [pattern, setPattern] = useState('');
  const [classification, setClassification] = useState<'bot' | 'human'>('bot');
  const [error, setError] = useState<string | null>(null);

  const loadRules = useCallback(async () => {
    const result = await authRequest<{ rules: TrafficBotRule[] }>('/api/admin/traffic-rules', {
      method: 'GET',
    });
    if (!result.ok) {
      if (isAccessDenied(result.failure.code)) {
        setAvailable(false);
        setLoading(false);
        return;
      }
      setError(result.failure.error);
      setAvailable(true);
      setLoading(false);
      return;
    }
    setRules(result.data.rules);
    setAvailable(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  async function submitRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const result = await authRequest('/api/admin/traffic-rules', {
      method: 'POST',
      body: { action: 'create', ruleType, pattern, classification },
    });
    if (!result.ok) {
      setError(result.failure.error);
      setSaving(false);
      return;
    }
    setPattern('');
    await loadRules();
    setSaving(false);
  }

  async function removeRule(id: string) {
    setSaving(true);
    setError(null);
    const result = await authRequest('/api/admin/traffic-rules', {
      method: 'DELETE',
      body: { action: 'delete', id },
    });
    if (!result.ok) {
      setError(result.failure.error);
      setSaving(false);
      return;
    }
    await loadRules();
    setSaving(false);
  }

  if (loading || !available) return null;

  return (
    <section className="mt-6 rounded-2xl border border-charcoal/10 bg-white p-4 sm:p-6">
      <h2 className="font-[family-name:var(--font-heading)] text-xl font-bold text-charcoal">
        Traffic classification rules
      </h2>
      <p className="mt-1 text-xs text-charcoal/60">
        Rules override automatic scoring. Use % as a wildcard, such as %HeadlessChrome% or /.env%.
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-terracotta/30 bg-terracotta/10 px-3 py-2 text-sm text-terracotta">
          {error}
        </p>
      )}

      <form onSubmit={submitRule} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1.5fr_1fr_auto]">
        <label className="text-xs font-semibold text-charcoal/70">
          Match
          <select
            value={ruleType}
            onChange={(event) => setRuleType(event.target.value as 'user_agent' | 'path')}
            className="mt-1 min-h-10 w-full rounded-lg border border-charcoal/15 bg-white px-3 text-sm text-charcoal"
          >
            <option value="user_agent">User agent</option>
            <option value="path">Path</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-charcoal/70">
          Pattern
          <input
            required
            minLength={2}
            maxLength={120}
            value={pattern}
            onChange={(event) => setPattern(event.target.value)}
            className="mt-1 min-h-10 w-full rounded-lg border border-charcoal/15 bg-white px-3 text-sm text-charcoal"
          />
        </label>
        <label className="text-xs font-semibold text-charcoal/70">
          Classify as
          <select
            value={classification}
            onChange={(event) => setClassification(event.target.value as 'bot' | 'human')}
            className="mt-1 min-h-10 w-full rounded-lg border border-charcoal/15 bg-white px-3 text-sm text-charcoal"
          >
            <option value="bot">Suspected bot</option>
            <option value="human">Human traffic</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={saving}
          className="min-h-10 self-end rounded-full bg-deep-green px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          Add rule
        </button>
      </form>

      {rules.length === 0 ? (
        <p className="mt-5 text-sm text-charcoal/50">No custom rules yet.</p>
      ) : (
        <ul className="mt-5 divide-y divide-charcoal/10">
          {rules.map((rule) => (
            <li key={rule.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
              <span className="min-w-0">
                <span className={`mr-2 rounded-full px-2 py-1 text-[0.65rem] font-bold uppercase ${
                  rule.classification === 'bot' ? 'bg-terracotta/10 text-terracotta' : 'bg-deep-green/10 text-deep-green'
                }`}>
                  {rule.classification}
                </span>
                <span className="text-xs text-charcoal/50">{rule.rule_type === 'path' ? 'Path' : 'User agent'}:</span>
                <code className="ml-1 break-all text-xs text-charcoal">{rule.pattern}</code>
              </span>
              <button
                type="button"
                disabled={saving}
                onClick={() => void removeRule(rule.id)}
                className="min-h-9 rounded-full border border-charcoal/15 px-3 text-xs font-semibold text-charcoal/70 disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
