import yt_dlp
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
TOOLS_DIR = BASE_DIR / "tools"

os.environ["PATH"] = str(TOOLS_DIR) + os.pathsep + os.environ.get("PATH", "")

ydl_opts = {
    "format": "bestaudio/best",
    "noplaylist": True,
    "extractor_args": {"youtube": ["player_client=default,web,android"]},
    "js_runtimes": {"node": {"binary": str(TOOLS_DIR / "node.exe")}},
    "remote_components": "ejs:github", # Let's try string? No, let's try ['ejs:github']? Actually yt-dlp might use "remote_components": "ejs:github" if it's not a list.
}

# Actually, let's look at the source for `remote_components` parsing in YoutubeDL.py
# If it iterates over characters, it means it expects a set or a dict or a list.
# Let's try list of strings.
ydl_opts["remote_components"] = ['ejs:github']

print(f"PATH starts with: {os.environ['PATH'][:50]}")

try:
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info("https://www.youtube.com/watch?v=e4vnOAmPpus", download=False)
        print("SUCCESS:", info.get("title"))
except Exception as e:
    print("FAILED:", str(e))
