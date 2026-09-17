import { z } from 'zod';
import { loadModel } from '../types';
import { handleVerifyModel } from './validation-tools';

// ── jetic_get_session_phase ──────────────────────────────────────────────────
// First tool the AI should call every session. Returns the current phase
// (1–4) and the next action the AI must take before advancing.
//
// Phase 1 — INITIALIZE : no model.json exists yet
// Phase 2 — SCAN       : model exists but has 0 endpoints
// Phase 3 — VERIFY     : endpoints exist but model invalid or fields incomplete
// Phase 4 — SIMULATE   : model valid + all fields filled → ask user for goal

export const getSessionPhaseSchema = z.object({
  projectPath: z
    .string()
    .optional()
    .describe('Path to the project root or .jetic folder (defaults to JETIC_PROJECT_PATH / cwd)'),
});

export type Phase = 1 | 2 | 3 | 4;
export type PhaseName = 'init' | 'scan' | 'verify' | 'simulate';

export interface SessionPhaseResult {
  phase: Phase;
  phaseName: PhaseName;
  modelExists: boolean;
  endpointsCount: number;
  modelIsValid: boolean;
  allFieldsFilled: boolean;
  /** Human-readable instruction for the AI's immediate next action. */
  nextAction: string;
}

/** Fields required to be non-empty on every endpoint for Phase 3 → 4 gate. */
function checkAllFieldsFilled(
  model: import('@jetic/model').BehavioralModel
): { allFilled: boolean; incompleteCount: number } {
  let incompleteCount = 0;
  for (const ep of model.endpoints) {
    let incomplete = false;

    if (!ep.description || ep.description.trim() === '') incomplete = true;
    if (!ep.tags || ep.tags.length === 0) incomplete = true;

    // Check param descriptions
    if (ep.parameters) {
      for (const p of ep.parameters) {
        if (!p.description || p.description.trim() === '') {
          incomplete = true;
          break;
        }
      }
    }

    // Check response descriptions
    if (ep.responses) {
      for (const resp of Object.values(ep.responses)) {
        const r = resp as any;
        if (!r.description || String(r.description).trim() === '') {
          incomplete = true;
          break;
        }
      }
    }

    if (incomplete) incompleteCount++;
  }
  return { allFilled: incompleteCount === 0, incompleteCount };
}

export function handleGetSessionPhase(
  args: z.infer<typeof getSessionPhaseSchema>
): SessionPhaseResult {
  // ── Phase 1: no model ──
  const { model, exists } = loadModel(args.projectPath);

  if (!exists) {
    return {
      phase: 1,
      phaseName: 'init',
      modelExists: false,
      endpointsCount: 0,
      modelIsValid: false,
      allFieldsFilled: false,
      nextAction:
        'PHASE 1 — INITIALIZE: No .jetic/model.json found. Call jetic_init now to scaffold the project. Do not proceed until modelExists is true.',
    };
  }

  const endpointsCount = model.endpoints?.length ?? 0;

  // ── Phase 2: model exists but no endpoints ──
  if (endpointsCount === 0) {
    return {
      phase: 2,
      phaseName: 'scan',
      modelExists: true,
      endpointsCount: 0,
      modelIsValid: false,
      allFieldsFilled: false,
      nextAction:
        'PHASE 2 — SCAN: Model exists but has no endpoints. If the project has tsconfig.json (Express+TypeScript), call jetic_scan. Otherwise read the source code and call jetic_add_endpoint for every API route. Do not proceed to Phase 3 until endpointsCount > 0.',
    };
  }

  // ── Phase 3: endpoints exist — check validity and field completeness ──
  let modelIsValid = false;
  try {
    const verification = handleVerifyModel({ projectPath: args.projectPath });
    modelIsValid = verification.isValid;
  } catch {
    modelIsValid = false;
  }

  const { allFilled, incompleteCount } = checkAllFieldsFilled(model);

  if (!modelIsValid || !allFilled) {
    const reasons: string[] = [];
    if (!modelIsValid)
      reasons.push('model has validation errors (call jetic_verify_model to see them)');
    if (!allFilled)
      reasons.push(
        `${incompleteCount} endpoint(s) have incomplete fields (missing description, tags, parameter descriptions, or response descriptions — call jetic_verify_model to see the full list)`
      );

    return {
      phase: 3,
      phaseName: 'verify',
      modelExists: true,
      endpointsCount,
      modelIsValid,
      allFieldsFilled: allFilled,
      nextAction: `PHASE 3 — VERIFY: ${reasons.join('; ')}. Fix all issues with jetic_update_endpoint / jetic_add_endpoint, then call jetic_verify_model until both modelIsValid and allFieldsFilled are true. Do not touch any workflow tool until Phase 4 is reached.`,
    };
  }

  // ── Phase 4: model valid + all fields filled → ask user for simulation goal ──
  return {
    phase: 4,
    phaseName: 'simulate',
    modelExists: true,
    endpointsCount,
    modelIsValid: true,
    allFieldsFilled: true,
    nextAction:
      'PHASE 4 — SIMULATE: The model is valid and complete. ASK THE USER: "What simulation or workflow do you want to build?" Wait for their answer before calling any workflow tool. Do not invent a workflow goal — the user must specify it.',
  };
}
