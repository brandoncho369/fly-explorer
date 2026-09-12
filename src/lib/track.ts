/**
 * Product events. Cookieless Vercel Analytics; no identifiers, no free text — only the names of
 * things in the app. The funnel we care about: do people play (fly mode, senses), do they use the
 * lab tool (cell types), and does anyone try to submit (preview, open PR).
 */
import { track as vercelTrack } from "@vercel/analytics";

export type Event =
  | { name: "dataset_load"; dataset: string }
  | { name: "stimulate"; population: string; hold: boolean }
  | { name: "cell_type_fire"; cellType: string; hold: boolean }
  | { name: "fly_mode"; on: boolean }
  | { name: "fly_escape" }
  | { name: "guide_never_stops_shown" }
  | { name: "submit_preview_click"; gain: number }
  | { name: "submit_pr_click"; gain: number; simulator: string; seeds: number };

export function track(e: Event): void {
  try {
    const { name, ...props } = e;
    vercelTrack(name, props as Record<string, string | number | boolean>);
  } catch {
    /* analytics must never break the app */
  }
}
