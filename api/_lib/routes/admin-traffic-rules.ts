import {
  auditedMutation,
  auditActorForUser,
} from '../audit.js';
import {
  findTrafficBotRule,
  isUniqueViolation,
  listTrafficBotRules,
} from '../db.js';
import { ApiError, endpoint, parseJsonBody, sendJson } from '../http.js';
import { parseInput, trafficBotRuleSchema } from '../validation.js';
import { requireSuperAdmin } from '../staff.js';

function ruleDiff(input: {
  rule_type: 'user_agent' | 'path';
  pattern: string;
  classification: 'bot' | 'human';
}) {
  return {
    rule_type: input.rule_type,
    pattern: input.pattern,
    classification: input.classification,
  };
}

export default endpoint({ methods: ['GET', 'POST', 'DELETE'] }, async (req, res) => {
  const { session, user } = await requireSuperAdmin(req, res);
  if (req.method === 'GET') {
    sendJson(res, 200, { rules: await listTrafficBotRules() });
    return;
  }

  const data = parseInput(trafficBotRuleSchema, parseJsonBody(req));
  const actor = await auditActorForUser(session.userId);

  if (data.action === 'create' && req.method === 'POST') {
    const after = ruleDiff({
      rule_type: data.ruleType,
      pattern: data.pattern,
      classification: data.classification,
    });
    try {
      const created = await auditedMutation<{ id: string }>({
        mutationSql: `INSERT INTO traffic_bot_rules
                        (rule_type, pattern, classification, created_by)
                      VALUES ($1, $2, $3, $4)
                      RETURNING id`,
        mutationParams: [data.ruleType, data.pattern, data.classification, user.id],
        actor,
        action: 'traffic.bot_rule.create',
        entity: { type: 'traffic_bot_rule', label: `${data.ruleType}: ${data.pattern}` },
        after,
        req,
      });
      if (!created[0]) throw new Error('Traffic bot rule insert returned no row.');
      sendJson(res, 201, { rule: { id: created[0].id, ...after } });
      return;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApiError(409, 'rule_exists', 'That classification rule already exists.');
      }
      throw error;
    }
  }

  if (data.action === 'delete' && req.method === 'DELETE') {
    const existing = await findTrafficBotRule(data.id);
    if (!existing) throw new ApiError(404, 'rule_not_found', 'That classification rule no longer exists.');
    const before = ruleDiff(existing);
    const deleted = await auditedMutation<{ id: string }>({
      mutationSql: 'DELETE FROM traffic_bot_rules WHERE id = $1 RETURNING id',
      mutationParams: [data.id],
      actor,
      action: 'traffic.bot_rule.delete',
      entity: {
        type: 'traffic_bot_rule',
        id: data.id,
        label: `${existing.rule_type}: ${existing.pattern}`,
      },
      before,
      req,
    });
    if (!deleted[0]) throw new ApiError(404, 'rule_not_found', 'That classification rule no longer exists.');
    sendJson(res, 200, { ok: true });
    return;
  }

  throw new ApiError(405, 'method_not_allowed', 'Use POST to create a rule or DELETE to remove one.');
});
