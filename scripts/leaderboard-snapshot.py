"""Regenerate src/data/leaderboard.json from a flybench checkout.

    python scripts/leaderboard-snapshot.py ../flybench

Run after adding results to flybench, then commit + push to update /bench.
"""
import datetime, glob, json, os, sys

import yaml  # pip install pyyaml

root = sys.argv[1] if len(sys.argv) > 1 else "../flybench"
runs = []
for f in sorted(glob.glob(os.path.join(root, "results", "*.json"))):
    r = json.load(open(f))
    runs.append({
        "label": r["label"], "connectome": r["connectome"],
        "simulator": r.get("simulator", "flybench.sim.LIFSimulator").replace("flybench.sim.", ""),
        "gain": r["params"]["gain"], "w_syn": r["params"]["w_syn_mv"],
        "core": r.get("core_score"), "hard": r.get("hard_score"),
        "seeds": int(r.get("seeds", 1)), "verified": bool(r.get("verified", False)),
        "max_active": max((m["active_fraction"] for t in r["tasks"] for m in t["measurements"].values()), default=0),
        "tasks": {t["task"]: {"passed": t["passed"], "score": t["score"],
                              "checks": [{"d": c["description"], "v": c["value"], "ok": c["passed"]} for c in t["checks"]]}
                  for t in r["tasks"]},
    })
tasks = []
for f in sorted(glob.glob(os.path.join(root, "tasks", "*.yaml"))):
    t = yaml.safe_load(open(f))
    tasks.append({"name": t["name"], "title": t["title"], "tier": t.get("tier", "core"),
                  "description": " ".join(t.get("description", "").split()), "citation": t.get("citation", "")})
out = os.path.join(os.path.dirname(__file__), "..", "src", "data", "leaderboard.json")
json.dump({"generated": datetime.date.today().isoformat(), "source": "https://github.com/brandoncho369/flybench", "runs": runs, "tasks": tasks}, open(out, "w"), indent=1)
print(f"{len(runs)} runs, {len(tasks)} tasks → {os.path.normpath(out)}  (now: npm test && git commit)")
