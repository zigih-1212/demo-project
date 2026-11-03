import subprocess
import os
import secrets
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


def run(cmd, input_data=None, label="", attempts=4):
    for attempt in range(1, attempts + 1):
        print(f"=== {label} (attempt {attempt}/{attempts}) ===")
        r = subprocess.run(
            cmd, cwd=worker_dir, env=env,
            capture_output=True, text=True,
            encoding="utf-8", errors="replace",
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
            time.sleep(5 * attempt)
    return False


# 1. Apply D1 migrations (0004_sync)
if not run([node, wrangler, "d1", "migrations", "apply", "demo-fullstack-db", "--remote"], label="D1 MIGRATIONS"):
    sys.exit("MIGRATIONS FAILED")

# 2. Deploy worker FIRST: the old plaintext JWT_SECRET var (leaked in git via
#    wrangler.toml) is removed by the deploy because it is no longer in [vars].
if not run([node, wrangler, "deploy"], label="WORKER DEPLOY"):
    sys.exit("DEPLOY FAILED")

# 3. Now the binding name is free: rotate the secret (encrypted at rest by Cloudflare).
new_secret = secrets.token_hex(32)
if not run([node, wrangler, "secret", "put", "JWT_SECRET"], input_data=new_secret + "\n", label="JWT_SECRET ROTATION"):
    sys.exit("SECRET FAILED")

print("\nWORKER DEPLOYED SUCCESSFULLY")
