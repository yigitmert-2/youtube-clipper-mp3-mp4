import os
import re
import uuid
import time
import shutil
import zipfile
import threading
from pathlib import Path

from flask import Flask, request, jsonify, send_file, send_from_directory, Response, render_template
from pydub import AudioSegment
import yt_dlp

# ---------------------------------------------------------------------------
# Paths & FFmpeg configuration
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).parent.resolve()
TEMP_DIR = BASE_DIR / "temp"
CLIPS_DIR = BASE_DIR / "clips"
TOOLS_DIR = BASE_DIR / "tools"

# Add TOOLS_DIR to PATH so yt-dlp can find ffmpeg
import os
os.environ["PATH"] = str(TOOLS_DIR) + os.pathsep + os.environ.get("PATH", "")

# Resolve ffmpeg / ffprobe – prefer local tools/ copies, fall back to PATH
ffmpeg_path = str(TOOLS_DIR / "ffmpeg.exe") if (TOOLS_DIR / "ffmpeg.exe").exists() else shutil.which("ffmpeg") or "ffmpeg"
ffprobe_path = str(TOOLS_DIR / "ffprobe.exe") if (TOOLS_DIR / "ffprobe.exe").exists() else shutil.which("ffprobe") or "ffprobe"

AudioSegment.converter = ffmpeg_path
AudioSegment.ffprobe = ffprobe_path

# ---------------------------------------------------------------------------
# Flask app
# ---------------------------------------------------------------------------

app = Flask(__name__, static_folder="static")

# In-memory progress store  –  { session_id: { status, progress, title, filename, error } }
downloads: dict[str, dict] = {}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

VALID_DOMAIN_RE = re.compile(
    r"^(https?://)?(www\.)?"
    r"(youtube\.com|youtu\.be|twitter\.com|x\.com|tiktok\.com|instagram\.com|reddit\.com|"
    r"facebook\.com|fb\.watch|twitch\.tv|vimeo\.com|soundcloud\.com|rumble\.com|odysee\.com)/.+"
)


def is_valid_url(url: str) -> bool:
    return bool(VALID_DOMAIN_RE.match(url))


def cleanup_old_temp(max_age_hours: int = 24) -> None:
    """Delete temp session dirs older than *max_age_hours*."""
    if not TEMP_DIR.exists():
        return
    cutoff = time.time() - max_age_hours * 3600
    for entry in TEMP_DIR.iterdir():
        if entry.is_dir():
            try:
                if entry.stat().st_mtime < cutoff:
                    shutil.rmtree(entry)
                    print(f"  Cleaned up old session: {entry.name}")
            except Exception:
                pass


def _download_media(session_id: str, url: str, mode: str) -> None:
    """Run yt-dlp in a background thread and update *downloads* dict."""
    session_dir = TEMP_DIR / session_id
    session_dir.mkdir(parents=True, exist_ok=True)

    def progress_hook(d):
        if d["status"] == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate")
            if total:
                percent = int(d["downloaded_bytes"] / total * 100)
                downloads[session_id]["progress"] = percent
        elif d["status"] == "finished":
            downloads[session_id]["progress"] = 100
            
    # For Audio: smallest m4a stream
    # For Video: smallest mp4 video + worst audio
    format_str = "worst[ext=m4a]/worstaudio" if mode == "audio" else "worstvideo[ext=mp4]+worstaudio[ext=m4a]/worst[ext=mp4]/worst"

    ydl_opts = {
        "format": format_str,
        "outtmpl": str(session_dir / "%(title)s.%(ext)s"),
        "progress_hooks": [progress_hook],
        "quiet": True,
        "noplaylist": True,
        "js_runtimes": {"node": {"binary": str(TOOLS_DIR / "node.exe")}},
        "extractor_args": {"youtube": ["player_client=default,web,android"]},
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            title = info.get("title", "audio")
            duration = info.get("duration", 0)

        # Find the resulting file
        media_files = list(session_dir.glob("*.*"))
        # Filter out non-media
        media_files = [f for f in media_files if f.suffix not in ['.part', '.ytdl']]

        if not media_files:
            raise FileNotFoundError("Media file was not created by yt-dlp")

        filename = media_files[0].name

        downloads[session_id].update(
            {
                "status": "ready",
                "progress": 100,
                "title": title,
                "duration": duration,
                "filename": filename,
                "mode": mode,
            }
        )
    except Exception as exc:
        err_msg = re.sub(r'\x1b\[[0-9;]*m', '', str(exc))
        downloads[session_id].update(
            {
                "status": "error",
                "progress": 0,
                "error": err_msg,
            }
        )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/metadata", methods=["POST"])
def api_metadata():
    data = request.get_json(silent=True)
    if not data or "url" not in data:
        return jsonify({"error": "No URL provided"}), 400

    url = data["url"]
    ydl_opts = {
        "quiet": True,
        "noplaylist": True,
        "js_runtimes": {"node": {"binary": str(TOOLS_DIR / "node.exe")}},
        "extractor_args": {"youtube": ["player_client=default,web,android"]},
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return jsonify({
                "title": info.get("title", "Unknown"),
                "duration": info.get("duration", 0)
            })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/download", methods=["POST"])
def api_download():
    data = request.get_json(silent=True)
    if not data or "url" not in data:
        return jsonify({"error": "Missing 'url' in request body"}), 400

    url = data["url"].strip()
    mode = data.get("mode", "audio")
    if not is_valid_url(url):
        return jsonify({"error": "Invalid or unsupported URL"}), 400

    session_id = str(uuid.uuid4())
    downloads[session_id] = {
        "status": "processing",
        "progress": 0,
        "url": url,
        "mode": mode,
        "filename": None,
        "title": None,
    }

    thread = threading.Thread(target=_download_media, args=(session_id, url, mode), daemon=True)
    thread.start()

    return jsonify({"id": session_id, "status": "downloading"}), 202


@app.route("/api/status/<session_id>")
def api_status(session_id: str):
    info = downloads.get(session_id)
    if info is None:
        return jsonify({"error": "Unknown session ID"}), 404

    payload = {
        "status": info["status"],
        "progress": info["progress"],
        "title": info.get("title", ""),
    }
    if info["status"] == "error":
        payload["error"] = info.get("error", "Unknown error")
    if info["status"] == "ready":
        payload["duration"] = info.get("duration", 0)
        payload["filename"] = info.get("filename", "")

    return jsonify(payload)


@app.route("/api/audio/<session_id>")
def api_audio(session_id: str):
    info = downloads.get(session_id)
    if info is None or info["status"] != "ready":
        return jsonify({"error": "Audio not ready or session not found"}), 404

    filepath = TEMP_DIR / session_id / info["filename"]
    if not filepath.exists():
        return jsonify({"error": "Audio file not found on disk"}), 404

    file_size = filepath.stat().st_size

    # ------ Range-request support for wavesurfer.js seeking ------
    range_header = request.headers.get("Range")
    if range_header:
        match = re.search(r"bytes=(\d+)-(\d*)", range_header)
        if match:
            start = int(match.group(1))
            end = int(match.group(2)) if match.group(2) else file_size - 1
            end = min(end, file_size - 1)
            length = end - start + 1

            with open(filepath, "rb") as f:
                f.seek(start)
                data = f.read(length)

            mimetype = "video/mp4" if filepath.suffix == ".mp4" else "audio/mpeg"
            resp = Response(
                data,
                status=206,
                mimetype=mimetype,
                direct_passthrough=True,
            )
            resp.headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"
            resp.headers["Accept-Ranges"] = "bytes"
            resp.headers["Content-Length"] = str(length)
            return resp

    mimetype = "video/mp4" if filepath.suffix == ".mp4" else "audio/mpeg"
    return send_file(filepath, mimetype=mimetype)


@app.route("/api/clip", methods=["POST"])
def api_clip():
    data = request.get_json(silent=True)
    if not data or "id" not in data or "clips" not in data:
        return jsonify({"error": "Missing 'id' or 'clips' in request body"}), 400

    session_id = data["id"]
    clips = data["clips"]

    if not isinstance(clips, list) or len(clips) == 0:
        return jsonify({"error": "'clips' must be a non-empty array"}), 400

    info = downloads.get(session_id)
    if info is None or info["status"] != "ready":
        return jsonify({"error": "Audio not ready or session not found"}), 404

    source_path = TEMP_DIR / session_id / info["filename"]
    if not source_path.exists():
        return jsonify({"error": "Source audio file not found"}), 404

    clip_dir = CLIPS_DIR / session_id
    clip_dir.mkdir(parents=True, exist_ok=True)
    mode = info.get("mode", "audio")
    url = info.get("url")

    clip_paths: list[Path] = []
    try:
        for clip_def in clips:
            start_sec = float(clip_def["start"])
            end_sec = float(clip_def["end"])
            name = clip_def.get("name", "clip") or "clip"
            safe_name = re.sub(r'[<>:"/\\|?*]', "_", name)
            
            ext = "mp3" if mode == "audio" else "mp4"
            out_path = clip_dir / f"{safe_name}.{ext}"

            ydl_opts = {
                "format": "bestaudio/best" if mode == "audio" else "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best",
                "outtmpl": str(out_path).replace(f".{ext}", ".%(ext)s"),
                "quiet": True,
                "noplaylist": True,
                "download_ranges": yt_dlp.utils.download_range_func(None, [(start_sec, end_sec)]),
                "force_keyframes_at_cuts": True,
                "js_runtimes": {"node": {"binary": str(TOOLS_DIR / "node.exe")}},
                "extractor_args": {"youtube": ["player_client=default,web,android"]},
            }

            if mode == "audio":
                ydl_opts["postprocessors"] = [{
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "320",
                }]

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                res_info = ydl.extract_info(url, download=True)
                # Ensure we capture the final extension (if postprocessor changed it to mp3, or it became mp4)
                final_ext = res_info.get("ext", ext)
                actual_out_path = clip_dir / f"{safe_name}.{final_ext}"
                if actual_out_path.exists():
                    clip_paths.append(actual_out_path)
                elif out_path.exists():
                    clip_paths.append(out_path)
                else:
                    raise Exception("Failed to produce clip file")

        if len(clip_paths) == 1:
            return send_file(
                clip_paths[0],
                mimetype="video/mp4" if mode == "video" else "audio/mpeg",
                as_attachment=True,
                download_name=clip_paths[0].name,
            )

        # Multiple clips → ZIP
        zip_path = clip_dir / "clips.zip"
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for cp in clip_paths:
                zf.write(cp, cp.name)

        # Clean up individual clip files (ZIP already written)
        for cp in clip_paths:
            cp.unlink(missing_ok=True)

        return send_file(
            zip_path,
            mimetype="application/zip",
            as_attachment=True,
            download_name="clips.zip",
        )

    except KeyError as exc:
        return jsonify({"error": f"Each clip must have 'start' and 'end': {exc}"}), 400
    except Exception as exc:
        return jsonify({"error": f"Clipping failed: {exc}"}), 500


@app.route("/api/quick_clip", methods=["POST"])
def api_quick_clip():
    data = request.get_json(silent=True)
    if not data or "url" not in data or "clips" not in data:
        return jsonify({"error": "Missing url or clips"}), 400

    session_id = str(uuid.uuid4())
    url = data["url"]
    clips = data["clips"]
    mode = data.get("mode", "audio")

    # Reuse the same clipping logic by creating a dummy download entry
    downloads[session_id] = {
        "status": "ready",
        "url": url,
        "mode": mode,
        "filename": "dummy"
    }
    
    # We must format the request correctly for api_clip logic
    # But since api_clip reads from request, we'll just extract the clipping logic or inline it.
    # Actually, inlining the yt-dlp part is cleaner for quick clip.
    clip_dir = CLIPS_DIR / session_id
    clip_dir.mkdir(parents=True, exist_ok=True)

    clip_paths: list[Path] = []
    try:
        for clip_def in clips:
            start_sec = float(clip_def["start"])
            end_sec = float(clip_def["end"])
            name = clip_def.get("name", "clip") or "clip"
            safe_name = re.sub(r'[<>:"/\\|?*]', "_", name)
            
            ext = "mp3" if mode == "audio" else "mp4"
            out_path = clip_dir / f"{safe_name}.{ext}"

            ydl_opts = {
                "format": "bestaudio/best" if mode == "audio" else "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best",
                "outtmpl": str(out_path).replace(f".{ext}", ".%(ext)s"),
                "quiet": True,
                "noplaylist": True,
                "download_ranges": yt_dlp.utils.download_range_func(None, [(start_sec, end_sec)]),
                "force_keyframes_at_cuts": True,
                "js_runtimes": {"node": {"binary": str(TOOLS_DIR / "node.exe")}},
                "extractor_args": {"youtube": ["player_client=default,web,android"]},
            }

            if mode == "audio":
                ydl_opts["postprocessors"] = [{
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "320",
                }]

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                res_info = ydl.extract_info(url, download=True)
                final_ext = res_info.get("ext", ext)
                actual_out_path = clip_dir / f"{safe_name}.{final_ext}"
                if actual_out_path.exists():
                    clip_paths.append(actual_out_path)
                elif out_path.exists():
                    clip_paths.append(out_path)
                else:
                    raise Exception("Failed to produce clip file")

        if len(clip_paths) == 1:
            return send_file(
                clip_paths[0],
                mimetype="video/mp4" if mode == "video" else "audio/mpeg",
                as_attachment=True,
                download_name=clip_paths[0].name,
            )

        zip_path = clip_dir / "clips.zip"
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for cp in clip_paths:
                zf.write(cp, cp.name)

        return send_file(
            zip_path,
            mimetype="application/zip",
            as_attachment=True,
            download_name="clips.zip",
        )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
    finally:
        # Cleanup
        downloads.pop(session_id, None)


@app.route("/api/cleanup/<session_id>", methods=["GET"])
def api_cleanup(session_id: str):
    # Remove temp audio
    session_dir = TEMP_DIR / session_id
    if session_dir.exists():
        shutil.rmtree(session_dir, ignore_errors=True)

    # Remove clips
    clip_dir = CLIPS_DIR / session_id
    if clip_dir.exists():
        shutil.rmtree(clip_dir, ignore_errors=True)

    # Remove in-memory entry
    downloads.pop(session_id, None)

    return jsonify({"status": "cleaned"})


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------

def _ensure_dirs() -> None:
    for d in (TEMP_DIR, CLIPS_DIR, TOOLS_DIR):
        d.mkdir(parents=True, exist_ok=True)


if __name__ == "__main__":
    print("=" * 50)
    print("  YouTube MP3 Clipper — Starting up")
    print("=" * 50)

    _ensure_dirs()

    print(f"  FFmpeg : {ffmpeg_path}")
    print(f"  FFprobe: {ffprobe_path}")

    cleanup_old_temp()

    print()
    print("  Server running at: http://localhost:5000")
    print("=" * 50)

    app.run(host="0.0.0.0", port=5000, debug=False)
