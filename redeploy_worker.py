import subprocess
import os
import sys
import time

base = r"C:\Users\Hewlett Packard\Desktop\fl.ru\demo-project"
worker_dir = os.path.join(base, "worker")

env_vars = {}
with open(os.path.join(base, ".env")) as f:
    for line in f:
        line = line.strip()
        if line and "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env_vars[k.strip()] = v.strip()

env = dict(os.environ)
env["CLOUDFLARE_API_TOKEN"] = env_vars["CLOUDFLARE_API_TOKEN"]
env["CLOUDFLARE_ACCOUNT_ID"] = env_vars["CLOUDFLARE_ACCOUNT_ID"]

node = r"C:\Program Files\nodejs\node.exe"
wrangler = r"C:\Users\Hewlett Packard\AppData\Roaming\npm\node_modules\wrangler\bin\wrangler.js"


def run(cmd, label, input_data=None, attempts=2):
    for attempt in range(1, attempts + 1):
        print(f"=== {label} (attempt {attempt}/{attempts}) ===", flush=True)
        r = subprocess.run(
            cmd,
            cwd=worker_dir,
            env=env,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            input=input_data,
        )
        out = (r.stdout or "")[-1800:]
        err = (r.stderr or "")[-1000:]
        if out:
            print(out.encode("ascii", "replace").decode("ascii"))
        if err:
            print("STDERR:", err.encode("ascii", "replace").decode("ascii"))
        print("RC:", r.returncode)
        if r.returncode == 0:
            return True
        if attempt < attempts:
            time.sleep(3)
    return False


# 1. Typecheck
if not run([node, "node_modules/typescript/bin/tsc", "--noEmit"], "TYPECHECK"):
    sys.exit("TYPECHECK FAILED")

# 2. Unit + integration tests
if not run(
    [node, "node_modules/vitest/vitest.mjs", "run"], "VITEST (unit + integration)"
):
    sys.exit("TESTS FAILED")

# 3. D1 migrations (idempotent; 0004_sync already applied remotely)
if not run(
    [node, wrangler, "d1", "migrations", "apply", "demo-fullstack-db", "--remote"],
    "D1 MIGRATIONS",
):
    sys.exit("MIGRATIONS FAILED")

# 4. Deploy worker. JWT_SECRET already stored as encrypted secret (rotated earlier);
#    a fresh deploy does not remove secrets, so no rotation here.
if not run([node, wrangler, "deploy"], "WORKER DEPLOY"):
    sys.exit("DEPLOY FAILED")

print("\nWORKER REDEPLOYED SUCCESSFULLY (no secret rotation this time)")
