import argparse, subprocess, os, re, csv
from pathlib import Path
from datetime import datetime

def run(cmd, cwd=None, check=True):
    p = subprocess.run(cmd, cwd=cwd, text=True, capture_output=True)
    if check and p.returncode != 0:
        raise RuntimeError(f"Command failed: {' '.join(cmd)}\n{p.stderr.strip()}")
    return p.stdout

def git_root():
    return run(["git", "rev-parse", "--show-toplevel"]).strip()

def short_hash(h):
    return h[:8]

def earliest_commit_date():
    # ISO date of first commit
    out = run(["git", "log", "--reverse", "--date=iso", "--pretty=format:%ad", "-1"]).strip()
    return out.split(" ")[0] if out else None

def now_iso_local():
    return datetime.now().strftime("%Y-%m-%d %H:%M")

def categorize(files):
    # Heuristic by paths
    areas = set()
    for f in files:
        f = f.replace("\\", "/")
        top = f.split("/")[0] if "/" in f else f
        if top in ("src", "app"):
            areas.add("frontend")
        elif top in ("android", "ios"):
            areas.add("mobile")
        elif top in ("server", "backend", "api", "functions"):
            areas.add("backend")
        elif top in ("infra", "deploy", ".github", "terraform", "ansible", "nginx", "scripts", "vm"):
            areas.add("infra/vm")
        elif top in ("docs", "RELEASES"):
            areas.add("docs")
        else:
            areas.add("misc")
    # prefer a single label
    priority = ["infra/vm","backend","frontend","mobile","docs","misc"]
    for p in priority:
        if p in areas:
            return p
    return "misc"

def normalize_subject(s):
    s = s.strip()
    s = re.sub(r"^(feat|fix|docs|chore|refactor|test|perf|build)(\([^)]+\))?:\s*", "", s, flags=re.I)
    s = re.sub(r"\s+", " ", s).strip().lower()
    # trim very long
    return s[:120]

def make_key(area, subject, files):
    # Overwrite rule key: area + normalized subject + most common top folder touched
    tops = []
    for f in files:
        f = f.replace("\\","/")
        tops.append(f.split("/")[0] if "/" in f else f)
    top = tops[0] if tops else "unknown"
    return f"{area}|{top}|{normalize_subject(subject)}"

def parse_git_log(since, until):
    # We include name-status so we can list files
    cmd = ["git","log","--date=iso","--pretty=format:@@@%ad\t%H\t%s","--name-status"]
    if since: cmd.insert(2, f"--since={since}")
    if until: cmd.insert(2, f"--until={until}")
    raw = run(cmd)
    commits = []
    cur = None
    for line in raw.splitlines():
        if line.startswith("@@@"):
            if cur: commits.append(cur)
            parts = line[3:].split("\t", 2)
            date = parts[0].strip()
            h = parts[1].strip()
            subj = parts[2].strip() if len(parts) > 2 else ""
            cur = {"date":date, "hash":h, "subject":subj, "files":[]}
        elif cur and line.strip():
            # name-status line like: M\tpath
            cols = line.split("\t")
            if len(cols) >= 2:
                path = cols[1].strip()
                cur["files"].append(path)
    if cur: commits.append(cur)
    # newest first from git; keep as-is and also create chronological later
    return commits

def git_status_porcelain():
    return run(["git","status","--porcelain"]).strip()

def diff_vs_base(base):
    out = {}
    out["missing_commits"] = run(["git","log",f"{base}..HEAD","--date=iso","--pretty=format:%ad\t%H\t%s"])
    out["diffstat"] = run(["git","diff","--stat",f"{base}..HEAD"])
    out["files"] = run(["git","diff","--name-only",f"{base}..HEAD"])
    return out

def scan_local_notes(repo):
    # "local folder timestamp" sources: RELEASES + docs + scripts notes
    patterns = [
        "RELEASES/**/*.md",
        "docs/**/*.md",
        "*.md",
    ]
    rows = []
    for pat in patterns:
        for p in Path(repo).glob(pat):
            try:
                st = p.stat()
                rows.append({
                    "mtime": datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M"),
                    "path": str(p.relative_to(repo)).replace("\\","/"),
                    "bytes": st.st_size
                })
            except Exception:
                pass
    rows.sort(key=lambda r: r["mtime"])
    return rows

def write_report(repo, outdir, commits, local_notes, base_gap, since, until):
    outdir = Path(outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    head = run(["git","rev-parse","--short","HEAD"]).strip()

    # chronological (oldest->newest) for “time stamped work done”
    chrono = list(reversed(commits))

    # Latest-overwrites-older: keep last occurrence per key
    latest = {}
    for c in chrono:
        area = categorize(c["files"])
        key = make_key(area, c["subject"], c["files"])
        latest[key] = {**c, "area":area, "key":key}

    latest_list = sorted(latest.values(), key=lambda x: x["date"])

    # Output CSV ledger
    csv_path = outdir / "work_ledger.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["date","hash","area","subject","files"])
        for c in chrono:
            area = categorize(c["files"])
            w.writerow([c["date"], short_hash(c["hash"]), area, c["subject"], " | ".join(c["files"])])

    # Markdown report
    md_path = outdir / "work_report.md"
    with md_path.open("w", encoding="utf-8") as f:
        f.write(f"# Supermandi POS – Full Work Report\n\n")
        f.write(f"**Repo:** {Path(repo).name}\n\n")
        f.write(f"**Window:** {since or 'project start'} → {until or now_iso_local()} (local time)\n\n")
        f.write(f"**HEAD:** `{head}`\n\n")

        f.write("## 1) Time-stamped checklist (chronological)\n\n")
        f.write("| Date | Commit | Area | Summary |\n")
        f.write("|---|---|---|---|\n")
        for c in chrono:
            area = categorize(c["files"])
            subj = c["subject"].replace("|","/")
            f.write(f"| {c['date']} | `{short_hash(c['hash'])}` | {area} | {subj} |\n")

        f.write("\n## 2) Latest state (overwrite rule applied)\n\n")
        f.write("Rule applied: **if the same work item appears again later, the latest entry is the effective one**.\n\n")
        f.write("| Latest Date | Commit | Area | Effective item (latest wins) | Files |\n")
        f.write("|---|---|---|---|---|\n")
        for c in latest_list:
            files = ", ".join(c["files"][:6]) + ("…" if len(c["files"])>6 else "")
            f.write(f"| {c['date']} | `{short_hash(c['hash'])}` | {c['area']} | {c['subject'].replace('|','/')} | {files.replace('|','/')} |\n")

        f.write("\n## 3) Local timestamp sources (notes/releases/docs)\n\n")
        f.write("These are **file modified-time** records from your repo folders (not git commit times).\n\n")
        f.write("| Modified | File | Size |\n|---|---|---|\n")
        for r in local_notes[-200:]:  # cap
            f.write(f"| {r['mtime']} | `{r['path']}` | {r['bytes']} |\n")
        if len(local_notes) > 200:
            f.write("\n> (Showing last 200 entries only.)\n")

        f.write("\n## 4) Missing work vs APK base (optional)\n\n")
        if base_gap:
            base = base_gap["base"]
            f.write(f"Base commit: `{base}`\n\n")
            f.write("### 4.1 Commits present in HEAD but NOT in base (base..HEAD)\n\n")
            lines = base_gap["missing_commits"].strip().splitlines()
            f.write(f"- Missing commit count: **{len(lines)}**\n\n")
            f.write("```\n" + base_gap["missing_commits"].strip()[:20000] + "\n```\n\n")
            f.write("### 4.2 Diffstat (base..HEAD)\n\n")
            f.write("```\n" + base_gap["diffstat"].strip()[:20000] + "\n```\n\n")
            f.write("### 4.3 Files changed (base..HEAD)\n\n")
            f.write("```\n" + base_gap["files"].strip()[:20000] + "\n```\n\n")
        else:
            f.write("No base commit provided; skipping base-vs-HEAD missing section.\n\n")

        f.write("\n## 5) Uncommitted / local-only changes\n\n")
        st = git_status_porcelain()
        if st:
            f.write("```text\n" + st + "\n```\n")
        else:
            f.write("- Clean working tree.\n")

        f.write("\n## 6) Google VM / Infra collection (run manually)\n\n")
        f.write("If you deploy via Google VM, capture deployment evidence using these commands and paste into this report:\n\n")
        f.write("```bash\n")
        f.write("# On your local machine (if gcloud is configured):\n")
        f.write("gcloud compute instances list\n")
        f.write("gcloud compute ssh <VM_NAME> --zone <ZONE>\n")
        f.write("\n# On VM (examples; adjust to your stack):\n")
        f.write("uname -a\n")
        f.write("git --version\n")
        f.write("pm2 list || true\n")
        f.write("sudo systemctl status nginx --no-pager || true\n")
        f.write("sudo journalctl -u nginx --since '7 days ago' --no-pager | tail -n 200 || true\n")
        f.write("sudo journalctl --since '7 days ago' --no-pager | tail -n 200 || true\n")
        f.write("```\n")

    return str(md_path), str(csv_path)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=None, help="Base commit (e.g. e6b504d) to compute missing work vs APK base")
    ap.add_argument("--since", default=None, help="Start date YYYY-MM-DD (defaults to first commit date)")
    ap.add_argument("--until", default=None, help="End datetime (defaults to now)")
    ap.add_argument("--out", default="AUDIT", help="Output directory")
    args = ap.parse_args()

    repo = git_root()
    os.chdir(repo)

    since = args.since or earliest_commit_date()
    until = args.until or now_iso_local()

    commits = parse_git_log(since, until)
    local_notes = scan_local_notes(repo)

    base_gap = None
    if args.base:
        # Validate base exists
        run(["git","cat-file","-e",f"{args.base}^{{commit}}"])
        gap = diff_vs_base(args.base)
        base_gap = {"base": args.base, **gap}

        # Save raw base files too
        outdir = Path(args.out)
        outdir.mkdir(parents=True, exist_ok=True)
        (outdir / "missing_commits_base_to_head.txt").write_text(gap["missing_commits"], encoding="utf-8")
        (outdir / "diffstat_base_to_head.txt").write_text(gap["diffstat"], encoding="utf-8")
        (outdir / "files_base_to_head.txt").write_text(gap["files"], encoding="utf-8")

    md, csvp = write_report(repo, args.out, commits, local_notes, base_gap, since, until)

    print("\n✅ Audit complete")
    print(f"Repo: {Path(repo).name}")
    print(f"Window: {since} -> {until}")
    print(f"HEAD: {run(['git','rev-parse','--short','HEAD']).strip()}")
    if args.base:
        print(f"Base: {args.base}")
    print(f"Report: {md}")
    print(f"Ledger:  {csvp}")
    print(f"Out dir: {args.out}\n")

if __name__ == "__main__":
    main()
