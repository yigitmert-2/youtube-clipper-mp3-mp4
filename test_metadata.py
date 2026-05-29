import yt_dlp
import time
import os
os.environ["PATH"] = r"C:\Users\ygtdm\.gemini\antigravity\scratch\yt-mp3-clipper\tools;" + os.environ.get("PATH", "")

ydl_opts = {
    "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best",
    "outtmpl": "test_section.%(ext)s",
    "quiet": False,
    "noplaylist": True,
    "download_ranges": yt_dlp.utils.download_range_func(None, [(10, 20)]), # Download 10s to 20s
    "force_keyframes_at_cuts": True,
    "js_runtimes": {"node": {"binary": r"C:\Users\ygtdm\.gemini\antigravity\scratch\yt-mp3-clipper\tools\node.exe"}},
    "extractor_args": {"youtube": ["player_client=default,web,android"]},
    "ffmpeg_location": r"C:\Users\ygtdm\.gemini\antigravity\scratch\yt-mp3-clipper\tools",
}

print("Starting section download...")
start_time = time.time()
try:
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download(["https://www.youtube.com/watch?v=jNQXAC9IVRw"])
except Exception as e:
    print("Error:", e)
print(f"Finished in {time.time() - start_time:.2f} seconds")
