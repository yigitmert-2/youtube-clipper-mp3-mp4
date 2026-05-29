# YouTube MP3 Clipper ✂️

A sleek, premium web application built with Flask and Vanilla JS that allows you to easily download audio (MP3) or video (MP4) from YouTube, visualize the audio waveform, and create high-precision custom clips directly in your browser.

## ✨ Features

- **Dual Modes:** Download full YouTube videos (MP4) or extract just the audio (MP3).
- **Interactive Visual Editor:** Drag and resize regions across a beautiful, dynamic waveform using `wavesurfer.js`.
- **High-Precision Clipping:** Play back specific clips and sync directly with the YouTube video preview.
- **Batch Downloading:** Create as many clips as you want, name them, and download them all at once in a convenient `.zip` file.
- **Premium UI:** A fluid, dark-themed responsive interface featuring glassmorphism, smooth animations, and detailed error handling.
- **Auto-Setup:** Comes with an intelligent `.bat` script that handles all the heavy lifting—from creating virtual environments to downloading FFmpeg automatically!

---

## 🚀 Quick Start (Windows)

1. Ensure you have **Python 3.8+** installed (and added to your system PATH).
2. Clone or download this repository.
3. Double-click **`start.bat`**.

That's it! The script will automatically:
- Create a Python virtual environment.
- Install all required libraries (`flask`, `yt-dlp`, `pydub`).
- Detect if you have FFmpeg installed, and if not, it will **automatically download a portable version** into a `tools/` directory.
- Boot up the local server and open your default web browser to `http://localhost:5000`.

---

## 🛠️ Tech Stack

- **Backend:** Python, Flask
- **Media Processing:** `yt-dlp` (for YouTube downloads), `pydub` (for audio slicing), `FFmpeg`
- **Frontend Core:** HTML5, Vanilla JavaScript, Vanilla CSS (No bulky frameworks!)
- **Audio Visualization:** `wavesurfer.js` (v7) + Regions Plugin

---

## 💡 How to Use

1. **Step 1:** Choose whether you want an **Audio (MP3)** or **Video (MP4)** clip. Paste the YouTube URL and hit Download.
2. **Step 2:** Wait for the file to process. Once ready, the visual editor will appear.
3. **Step 3:** Click and drag anywhere on the purple waveform to create a clip region, or click "Add Clip".
4. **Step 4:** Refine your clip by dragging the edges. You can preview exactly what the clip sounds like using the ▶ button.
5. **Step 5:** Click "Download Clips". Name your clips in the modal (or check the box to use default names) and get your finalized files instantly!

---

## 🧑‍💻 Manual Installation

If you prefer to run things manually or are on macOS/Linux:

1. **Install FFmpeg:**
   Make sure `ffmpeg` and `ffprobe` are installed on your system and available in your PATH.
   - *Mac:* `brew install ffmpeg`
   - *Linux:* `sudo apt install ffmpeg`

2. **Set up Python Environment:**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows use: venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. **Run the Server:**
   ```bash
   python app.py
   ```
   Then open `http://localhost:5000` in your browser.

---

## 📝 License

This project is open-source and free to use. Use it responsibly and respect YouTube's Terms of Service regarding copyrighted content.
