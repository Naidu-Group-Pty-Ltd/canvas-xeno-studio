/** Structured production plan contract shared by Director UI and the server. */

export interface PlanShot {
  shot_number: number;
  name: string;
  description: string;
  camera_shot?: string;
  camera_angle?: string;
  camera_movement?: string;
  lighting?: string;
  colour?: string;
  duration?: number;
  audio_direction?: string;
  prompt: string;
  negative_constraints?: string;
  operation_type?: string;
  recommended_model_id?: string | null;
  eligible_model_ids?: string[];
  estimated_cost?: number | null;
}

export interface PlanScene {
  scene_number: number;
  name: string;
  purpose?: string;
  environment?: string;
  continuity_requirements?: string;
  shots: PlanShot[];
}

export interface ProductionPlan {
  title: string;
  objective?: string;
  creative_summary?: string;
  target_platforms?: string[];
  target_duration?: number;
  primary_aspect_ratio?: string;
  alternate_aspect_ratios?: string[];
  creative_direction?: {
    visual_style?: string;
    colour_direction?: string;
    lighting?: string;
    atmosphere?: string;
    pacing?: string;
    cinematography?: string;
    sound_direction?: string;
  };
  scenes: PlanScene[];
  risk_notes?: string[];
  production_notes?: string[];
  unsupported_capability?: string[];
}

/** JSON schema handed to the reasoning provider (strict-ish, tolerant of omissions). */
export const PRODUCTION_PLAN_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    title: { type: "string" },
    objective: { type: "string" },
    creative_summary: { type: "string" },
    target_platforms: { type: "array", items: { type: "string" } },
    target_duration: { type: "number" },
    primary_aspect_ratio: { type: "string" },
    alternate_aspect_ratios: { type: "array", items: { type: "string" } },
    creative_direction: {
      type: "object",
      properties: {
        visual_style: { type: "string" },
        colour_direction: { type: "string" },
        lighting: { type: "string" },
        atmosphere: { type: "string" },
        pacing: { type: "string" },
        cinematography: { type: "string" },
        sound_direction: { type: "string" },
      },
    },
    scenes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          scene_number: { type: "number" },
          name: { type: "string" },
          purpose: { type: "string" },
          environment: { type: "string" },
          continuity_requirements: { type: "string" },
          shots: {
            type: "array",
            items: {
              type: "object",
              properties: {
                shot_number: { type: "number" },
                name: { type: "string" },
                description: { type: "string" },
                camera_shot: { type: "string" },
                camera_angle: { type: "string" },
                camera_movement: { type: "string" },
                lighting: { type: "string" },
                colour: { type: "string" },
                duration: { type: "number" },
                audio_direction: { type: "string" },
                prompt: { type: "string" },
                negative_constraints: { type: "string" },
                operation_type: { type: "string" },
                recommended_model_id: { type: "string" },
                eligible_model_ids: { type: "array", items: { type: "string" } },
              },
              required: ["shot_number", "name", "description", "prompt"],
            },
          },
        },
        required: ["scene_number", "name", "shots"],
      },
    },
    risk_notes: { type: "array", items: { type: "string" } },
    production_notes: { type: "array", items: { type: "string" } },
    unsupported_capability: { type: "array", items: { type: "string" } },
  },
  required: ["title", "scenes"],
};
