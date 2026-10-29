import subprocess
import os

env = dict(os.environ)
env["CLOUDFLARE_API_TOKEN"] = open(r"C:\Users\Hewlett Packard\Desktop\fl.ru\demo-project\.env").readlines()[0].split("=", 1)[1].strip()
env["CLOUDFLARE_ACCOUNT_ID"] = open(r"C:\Users\Hewlett Packard\Desktop\fl.ru\demo-project\.env").readlines()[1].split("=", 1)[1].strip()

os.chdir(r"C:\Users\Hewlett Packard\Desktop\fl.ru\demo-project")

node = r"C:\Program Files\nodejs\node.exe"
script = r"C:\Users\Hewlett Packard\AppData\Roaming\npm\node_modules\wrangler\bin\wrangler.js"

cmd = [node, script, "pages", "deploy", "frontend/dist", "--project-name", "demo-fullstack-frontend", "--commit-dirty"]
r = subprocess.run(cmd, env=env, capture_output=True, text=True)
print(r.stdout[-2000:] if r.stdout else "")
print("STDERR:", r.stderr[-800:] if r.stderr else "")
print("RC:", r.returncode)
