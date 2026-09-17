import { z } from 'zod';
import { loadModel } from '../types';
import type { Endpoint, FieldDefinition } from '@jetic/model';

// ── Faker template mapping ───────────────────────────────────────────────────

/**
 * Maps a model field definition to a faker template string or literal value.
 * Returns null when no auto-mapping is possible — field will use {{human:key}}.
 */
function fieldToFakerValue(
  name: string,
  field: FieldDefinition
): string | number | boolean | null {
  if (field.enum && field.enum.length > 0) return field.enum[0];

  // Format-precise mappings
  if (field.format === 'email') return '{{faker.internet.email}}';
  if (field.format === 'uuid') return '{{faker.string.uuid}}';
  if (field.format === 'date') return '{{faker.date.past}}';
  if (field.format === 'date-time') return '{{faker.date.recent}}';
  if (field.format === 'uri' || field.format === 'url') return '{{faker.internet.url}}';
  if (field.format === 'hostname') return '{{faker.internet.domainName}}';
  if (field.format === 'ipv4') return '{{faker.internet.ip}}';

  // Name heuristics
  const n = name.toLowerCase().replace(/[_-]/g, '');
  if (n === 'email' || n.endsWith('email')) return '{{faker.internet.email}}';
  if (n.includes('password') || n.includes('pwd')) return '{{faker.internet.password}}';
  if (n === 'phone' || n.includes('phone') || n.includes('mobile')) return '{{faker.phone.number}}';
  if (n === 'name' || n === 'fullname' || n === 'displayname') return '{{faker.person.fullName}}';
  if (n === 'firstname') return '{{faker.person.firstName}}';
  if (n === 'lastname') return '{{faker.person.lastName}}';
  if (n === 'username') return '{{faker.internet.username}}';
  if (n === 'title') return '{{faker.lorem.sentence}}';
  if (n === 'description' || n === 'bio' || n === 'summary') return '{{faker.lorem.paragraph}}';
  if (n === 'url' || n.endsWith('url') || n === 'avatar') return '{{faker.internet.url}}';
  if (n === 'company' || n.includes('company') || n.includes('organization') || n.includes('workspace')) return '{{faker.company.name}}';
  if (n === 'city') return '{{faker.location.city}}';
  if (n === 'country') return '{{faker.location.country}}';
  if (n.includes('address')) return '{{faker.location.streetAddress}}';
  if (n === 'zip' || n === 'zipcode' || n.includes('postal')) return '{{faker.location.zipCode}}';
  if (n === 'state' || n === 'province') return '{{faker.location.state}}';
  if (n === 'latitude' || n === 'lat') return '{{faker.location.latitude}}';
  if (n === 'longitude' || n === 'lon' || n === 'lng') return '{{faker.location.longitude}}';
  if (n === 'color' || n === 'colour') return '{{faker.color.human}}';
  if (n === 'amount' || n === 'price') return field.min ?? 1;
  if (n === 'quantity' || n === 'count' || n === 'limit') return field.min ?? 10;
  if (n === 'slug') return '{{faker.lorem.slug}}';
  // Sensitive / volatile fields require human input
  if (n === 'token' || n === 'secret' || n === 'key' || n === 'otp' || n === 'code' || n === 'pin') return null;

  // Type fallbacks
  if (field.type === 'string') return '{{faker.lorem.word}}';
  if (field.type === 'number' || field.type === 'integer') return field.min ?? 1;
  if (field.type === 'boolean') return true;
  return null;
}

/** Normalises a dot-path field name into a camelCase memory key. */
function tokenMemoryKey(schemeName: string, fieldPath: string): string {
  const last = fieldPath.split('.').pop() || schemeName;
  return last.charAt(0).toLowerCase() + last.slice(1);
}

/** True when a field is likely needed in a later step (credentials, IDs). */
function isReuseCandidate(name: string): boolean {
  const n = name.toLowerCase().replace(/[_-]/g, '');
  return ['email', 'password', 'username', 'phone', 'name', 'id', 'slug'].some(
    (k) => n === k || n.endsWith(k)
  );
}

// ── Schema ───────────────────────────────────────────────────────────────────

export const scaffoldWorkflowSchema = z.object({
  projectPath: z.string().optional().describe('Path to project root or .jetic folder'),
  endpoints: z
    .array(
      z.union([
        z.string().describe('Method + path string, e.g. "POST /api/auth/login"'),
        z.object({ method: z.string(), path: z.string() }),
      ])
    )
    .min(1)
    .describe(
      'ORDERED list of endpoints to scaffold into steps. ' +
        'Order matters: token-producer endpoints (e.g. login) must come before consumers (e.g. protected routes).'
    ),
  workflowName: z.string().optional().describe('Suggested workflow name'),
  environment: z.string().optional().describe('Target environment name from model'),
});

// ── Handler ──────────────────────────────────────────────────────────────────

export function handleScaffoldWorkflow(args: z.infer<typeof scaffoldWorkflowSchema>) {
  const { model } = loadModel(args.projectPath);

  // Normalise input to { method, path }
  const requested = args.endpoints.map((ep) => {
    if (typeof ep === 'string') {
      const parts = ep.trim().split(/\s+/);
      return { method: (parts[0] || 'GET').toUpperCase(), path: parts.slice(1).join(' ') || '/' };
    }
    return { method: ep.method.toUpperCase(), path: ep.path };
  });

  // ── Security scheme index ─────────────────────────────────────────────────
  type SecInfo = { memKey: string; producedByEndpoint: string; fieldPath: string };
  const securityMemKeys: Record<string, SecInfo> = {};
  for (const [schemeName, scheme] of Object.entries(model.securitySchemes || {})) {
    if (scheme.obtainedFrom) {
      securityMemKeys[schemeName] = {
        memKey: tokenMemoryKey(schemeName, scheme.obtainedFrom.field),
        producedByEndpoint: scheme.obtainedFrom.endpoint.toUpperCase().trim(),
        fieldPath: scheme.obtainedFrom.field,
      };
    }
  }

  // Reverse: "METHOD /path" -> [{ memKey, fieldPath }]
  const tokenProducers: Record<string, Array<{ memKey: string; fieldPath: string }>> = {};
  for (const si of Object.values(securityMemKeys)) {
    if (!tokenProducers[si.producedByEndpoint]) tokenProducers[si.producedByEndpoint] = [];
    tokenProducers[si.producedByEndpoint].push({ memKey: si.memKey, fieldPath: si.fieldPath });
  }

  // ── Step-by-step scaffolding ──────────────────────────────────────────────
  const draftSteps: Record<string, any>[] = [];
  const missingFields: Record<string, string[]> = {};
  const allHumanKeys = new Set<string>();
  const securityChain: string[] = [];
  const producedKeys = new Set<string>(); // workflow:key values available for later steps

  for (let idx = 0; idx < requested.length; idx++) {
    const req = requested[idx];
    const routeKey = `${req.method} ${req.path}`;
    const routeKeyNorm = routeKey.toUpperCase().trim();

    const endpoint = (model.endpoints || []).find(
      (e: Endpoint) => e.method.toUpperCase() === req.method && e.path === req.path
    );

    if (!endpoint) {
      draftSteps.push({
        name: routeKey,
        method: req.method,
        path: req.path,
        description: `WARNING: "${routeKey}" not found in model.json — add it with jetic_add_endpoint first.`,
        expectStatus: 200,
      });
      missingFields[routeKey] = [`Endpoint "${routeKey}" not found in model.json.`];
      continue;
    }

    const step: Record<string, any> = {
      name: endpoint.name || routeKey,
      method: req.method,
      path: endpoint.path,
    };
    if (endpoint.description) step.description = endpoint.description;

    const missing: string[] = [];

    // ── body ────────────────────────────────────────────────────────────────
    if (endpoint.requestBody?.fields && Object.keys(endpoint.requestBody.fields).length > 0) {
      const body: Record<string, any> = {};

      for (const [fname, fdef] of Object.entries(endpoint.requestBody.fields)) {
        // 1. Check endpoint.consumes for a prior step's produced key
        let fromMem: string | null = null;
        if (endpoint.consumes) {
          for (const c of endpoint.consumes) {
            if (c.usedAs === fname || c.variable === fname) {
              const k = `workflow:${c.variable}`;
              if (producedKeys.has(k)) { fromMem = k; break; }
            }
          }
        }
        // 2. Name-match fallback against all produced keys
        if (!fromMem) {
          for (const pk of producedKeys) {
            const pkName = pk.split(':').pop() || '';
            if (pkName.toLowerCase() === fname.toLowerCase()) { fromMem = pk; break; }
          }
        }

        if (fromMem) {
          body[fname] = `{{${fromMem}}}`;
          continue;
        }

        // 3. Faker / literal
        const val = fieldToFakerValue(fname, fdef as FieldDefinition);
        if (val !== null) {
          body[fname] = val;
        } else {
          body[fname] = `{{human:${fname}}}`;
          allHumanKeys.add(fname);
          missing.push(
            `"${fname}" (type: ${(fdef as FieldDefinition).type || 'unknown'}) — no auto-mapping. ` +
              `Using {{human:${fname}}} (will pause for interactive input at runtime).`
          );
        }
      }
      step.body = body;

      // captureInput: persist required, reusable fields to memory for later steps
      const ci: Record<string, string> = {};
      for (const [fname, fdef] of Object.entries(endpoint.requestBody.fields)) {
        if ((fdef as FieldDefinition).required && isReuseCandidate(fname)) {
          const k = `workflow:${fname}`;
          if (!producedKeys.has(k)) { ci[k] = fname; producedKeys.add(k); }
        }
      }
      if (Object.keys(ci).length > 0) step.captureInput = ci;
    }

    // ── inject (security) ──────────────────────────────────────────────────
    if (endpoint.security && endpoint.security.length > 0) {
      const inject: Record<string, string> = {};
      for (const sec of endpoint.security) {
        if (sec.scheme === 'none') continue;
        const si = securityMemKeys[sec.scheme];
        if (!si) {
          missing.push(
            `Security scheme "${sec.scheme}" has no obtainedFrom in model.securitySchemes — add inject manually.`
          );
          continue;
        }
        const tokenKey = `workflow:${si.memKey}`;
        const available =
          producedKeys.has(tokenKey) ||
          requested
            .slice(0, idx)
            .some((r) => `${r.method} ${r.path}`.toUpperCase().trim() === si.producedByEndpoint);

        if (available) {
          const rawScheme = model.securitySchemes?.[sec.scheme];
          const prefix =
            rawScheme?.valuePrefix != null
              ? rawScheme.valuePrefix
              : rawScheme?.scheme?.toLowerCase() === 'bearer'
                ? 'Bearer '
                : '';
          inject['header:Authorization'] = `${prefix}{{${tokenKey}}}`;
          securityChain.push(
            `Step ${idx + 1} (${routeKey}) ← inject ${tokenKey} (produced by ${si.producedByEndpoint})`
          );
        } else {
          missing.push(
            `Security scheme "${sec.scheme}" requires "${tokenKey}" from "${si.producedByEndpoint}" ` +
              `— place that endpoint earlier in the list.`
          );
        }
      }
      if (Object.keys(inject).length > 0) step.inject = inject;
    }

    // ── capture (endpoint.produces + token producers) ─────────────────────
    const capture: Record<string, string> = {};

    if (endpoint.produces) {
      for (const p of endpoint.produces) {
        if (p.variable && p.responseField) {
          const k = `workflow:${p.variable}`;
          capture[k] = p.responseField;
          producedKeys.add(k);
        }
      }
    }

    // If this endpoint is the source of a security token
    if (tokenProducers[routeKeyNorm]) {
      for (const { memKey, fieldPath } of tokenProducers[routeKeyNorm]) {
        const k = `workflow:${memKey}`;
        if (!capture[k]) {
          capture[k] = fieldPath;
          producedKeys.add(k);
          securityChain.push(
            `Step ${idx + 1} (${routeKey}) → produces ${k} from response.${fieldPath}`
          );
        }
      }
    }

    if (Object.keys(capture).length > 0) step.capture = capture;

    // ── expectStatus ────────────────────────────────────────────────────────
    const codes = Object.keys(endpoint.responses || {}).map(Number).filter(Boolean);
    const successCode = codes.find((c) => c >= 200 && c < 300);
    step.expectStatus = successCode ?? 200;

    if (missing.length > 0) missingFields[routeKey] = missing;
    draftSteps.push(step);
  }

  // ── Result ───────────────────────────────────────────────────────────────
  const defaultName =
    args.workflowName ||
    requested
      .map((r) => r.path.split('/').filter(Boolean).pop() || r.path)
      .join(' \u2192 ') + ' workflow';

  return {
    workflowName: defaultName,
    ...(args.environment ? { environment: args.environment } : {}),
    draftSteps,
    stepsCount: draftSteps.length,
    missingFields: Object.keys(missingFields).length > 0 ? missingFields : undefined,
    humanKeys: [...allHumanKeys].sort(),
    securityChain: securityChain.length > 0 ? securityChain : undefined,
    instructions: [
      '1. Review draftSteps. Resolve any missingFields entries before proceeding.',
      '2. humanKeys will pause the workflow at runtime for interactive input — they are intentional when needed.',
      '3. Validate: jetic_validate_workflow { definition: { name: "<workflowName>", steps: <draftSteps> } }',
      '4. Save:     jetic_create_workflow { name: "<workflowName>", steps: <draftSteps> }',
      '5. Run:      jetic_simulate_workflow { workflow: "<slug>" }',
    ].join('\n'),
  };
}
