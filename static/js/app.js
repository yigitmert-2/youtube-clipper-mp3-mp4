/* ══════════════════════════════════════════════════════════════
   YouTube MP3 Clipper — Frontend Application
   ══════════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  /* ── State ─────────────────────────────────────────────────── */
  const state = {
    sessionId: null,
    currentMode: 'audio',
    wavesurfer: null,
    regions: null,
    clips: [],                // { id, regionRef, color, start, end }
    clipColors: [
      'rgba(139, 92, 246, 0.30)',   // purple
      'rgba(6, 182, 212, 0.30)',    // cyan
      'rgba(236, 72, 153, 0.30)',   // pink
      'rgba(34, 197, 94, 0.30)',    // green
      'rgba(245, 158, 11, 0.30)',   // amber
      'rgba(99, 102, 241, 0.30)',   // indigo
      'rgba(139, 92, 246, 0.30)',
      'rgba(6, 182, 212, 0.30)',
      'rgba(236, 72, 153, 0.30)',
      'rgba(34, 197, 94, 0.30)',
      'rgba(245, 158, 11, 0.30)',
      'rgba(99, 102, 241, 0.30)',
      'rgba(244, 63, 94, 0.30)',
      'rgba(14, 165, 233, 0.30)',
      'rgba(168, 85, 247, 0.30)',
      'rgba(20, 184, 166, 0.30)',
    ],
    clipSolidColors: [
      '#8b5cf6', '#06b6d4', '#ec4899', '#22c55e', '#f59e0b',
      '#6366f1', '#f43f5e', '#0ea5e9', '#a855f7', '#14b8a6',
    ],
    colorIndex: 0,
    previewingClipId: null,
    pollTimer: null,
    videoTitle: '',
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dom = {
    urlSection:       $('#url-section'),
    modeTabs:         $$('.mode-tab'),
    urlForm:          $('#url-form'),
    urlInput:         $('#url-input'),
    downloadBtn:      $('#download-btn'),
    cancelBtn:        $('#cancel-btn'),
    btnLabel:         $('#download-btn-label'),
    progressArea:     $('#progress-area'),
    statusText:       $('#status-text'),
    progressPercent:  $('#progress-percent'),
    progressBar:      $('#progress-bar'),
    videoTitle:       $('#video-title'),
    errorArea:        $('#error-area'),
    errorMessage:     $('#error-message'),

    editorSection:    $('#editor-section'),
    editorVideoTitle: $('#editor-video-title'),
    startOverBtn:     $('#start-over-btn'),
    videoWrapper:     $('#video-wrapper'),
    mediaPlayer:      $('#media-player'),
    playPauseBtn:     $('#play-pause-btn'),
    iconPlay:         $('#play-pause-btn .icon-play'),
    iconPause:        $('#play-pause-btn .icon-pause'),
    currentTime:      $('#current-time'),
    totalTime:        $('#total-time'),
    zoomSlider:       $('#zoom-slider'),
    addClipBtn:       $('#add-clip-btn'),

    clipList:         $('#clip-list'),
    clipEmpty:        $('#clip-empty-state'),
    clipCount:        $('#clip-count'),
    downloadFullBtn:  $('#download-full-btn'),
    downloadFullLabel:$('#download-full-label'),
    downloadClipsBtn: $('#download-clips-btn'),

    modal:            $('#download-modal'),
    modalClipList:    $('#modal-clip-list'),
    useDefaultNames:  $('#use-default-names'),
    modalCancelBtn:   $('#modal-cancel-btn'),
    modalDownloadBtn: $('#modal-download-all-btn'),

    lvModal:          $('#large-video-modal'),
    lvDuration:       $('#lv-duration'),
    lvEditorBtn:      $('#lv-editor-btn'),
    lvQuickBtn:       $('#lv-quick-btn'),
    qcPanel:          $('#quick-clip-panel'),
    qcStart:          $('#qc-start'),
    qcEnd:            $('#qc-end'),
    qcCancelBtn:      $('#qc-cancel-btn'),
    qcDownloadBtn:    $('#qc-download-btn'),

    toastContainer:   $('#toast-container'),
  };

  /* ── Utilities ─────────────────────────────────────────────── */

  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '00:00.0';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms   = Math.floor((seconds % 1) * 10);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${ms}`;
  }

  function getNextColor() {
    const idx = state.colorIndex % state.clipColors.length;
    state.colorIndex++;
    return {
      region: state.clipColors[idx],
      solid:  state.clipSolidColors[idx],
    };
  }

  /* ── Toasts ────────────────────────────────────────────────── */

  function showToast(message, type = 'error', duration = 5000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${type === 'error' ? '⚠' : '✓'}</span><span>${message}</span>`;
    dom.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-out');
      toast.addEventListener('animationend', () => toast.remove());
    }, duration);
  }

  function showError(message)   { showToast(message, 'error'); }
  function showSuccess(message) { showToast(message, 'success'); }

  /* ── Tab Switching ─────────────────────────────────────────── */
  /* ── Tab Switching ─────────────────────────────────────────── */
  dom.modeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      dom.modeTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.currentMode = tab.dataset.mode;
      resetDownloadBtn();
      if (dom.modalDownloadBtn) {
        dom.modalDownloadBtn.querySelector('span:last-child').textContent = state.currentMode === 'audio' ? 'Download All MP3s' : 'Download All MP4s';
      }
    });
  });

  /* ── Inline error area (URL section) ───────────────────────── */

  function showInlineError(msg) {
    if (dom.errorMessage && dom.errorArea) {
      dom.errorMessage.textContent = msg;
      dom.errorArea.classList.remove('hidden');
    } else {
      showError(msg);
    }
  }

  function hideInlineError() {
    if (dom.errorArea) {
      dom.errorArea.classList.add('hidden');
    }
  }

  /* ── URL Download Flow ─────────────────────────────────────── */

  dom.urlForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideInlineError();
    
    const url = dom.urlInput.value.trim();
    if (!url) return;

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      showInlineError('Please enter a valid URL starting with http:// or https://');
      return;
    }

    dom.downloadBtn.disabled = true;
    dom.downloadBtn.innerHTML = '<span class="spinner"></span><span class="btn-label">Processing...</span>';

    try {
      const metaRes = await fetch('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const meta = await metaRes.json();
      
      if (meta.error) throw new Error(meta.error);

      if (meta.duration > 600) {
        dom.downloadBtn.disabled = false;
        resetDownloadBtn();
        showLargeVideoModal(url, meta.duration);
        return;
      }
      
      startDownload(url);
    } catch (err) {
      showError(err.message || 'Failed to fetch metadata');
      resetDownloadBtn();
    }
  });

  function showLargeVideoModal(url, duration) {
    state.currentUrl = url;
    dom.lvDuration.textContent = formatTime(duration);
    dom.qcPanel.classList.add('hidden');
    dom.lvModal.classList.remove('hidden');
  }

  dom.lvEditorBtn.addEventListener('click', () => {
    dom.lvModal.classList.add('hidden');
    startDownload(state.currentUrl);
  });

  dom.lvQuickBtn.addEventListener('click', () => {
    dom.qcPanel.classList.remove('hidden');
  });

  dom.qcCancelBtn.addEventListener('click', () => {
    dom.lvModal.classList.add('hidden');
  });

  function parseTimeInput(val) {
    if (!val) return 0;
    if (val.includes(':')) {
      const parts = val.split(':');
      let secs = 0;
      if (parts.length === 3) {
        secs = parseInt(parts[0])*3600 + parseInt(parts[1])*60 + parseFloat(parts[2]);
      } else if (parts.length === 2) {
        secs = parseInt(parts[0])*60 + parseFloat(parts[1]);
      }
      return secs;
    }
    return parseFloat(val);
  }

  dom.qcDownloadBtn.addEventListener('click', async () => {
    const start = parseTimeInput(dom.qcStart.value);
    const end = parseTimeInput(dom.qcEnd.value);
    
    if (end <= start) {
      showError('End time must be greater than start time');
      return;
    }

    const payload = {
      url: state.currentUrl,
      mode: state.currentMode,
      clips: [{ start, end, name: "quick_clip" }]
    };

    dom.qcDownloadBtn.disabled = true;
    dom.qcDownloadBtn.innerHTML = '<span class="spinner"></span> Downloading...';

    try {
      const res = await fetch('/api/quick_clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Quick clip failed');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quick_clip.${state.currentMode === 'audio' ? 'mp3' : 'mp4'}`;
      a.click();
      dom.lvModal.classList.add('hidden');
      
    } catch(err) {
      showError(err.message);
    } finally {
      dom.qcDownloadBtn.disabled = false;
      dom.qcDownloadBtn.innerHTML = '<span>Download Clip</span>';
    }
  });

  async function startDownload(url) {
    dom.downloadBtn.disabled = true;
    dom.downloadBtn.innerHTML = '<span class="spinner"></span><span class="btn-label">Downloading proxy...</span>';
    dom.cancelBtn.classList.remove('hidden');
    dom.progressArea.classList.remove('hidden');
    dom.progressBar.style.width = '0%';
    dom.progressPercent.textContent = '0%';
    dom.statusText.textContent = 'Initializing...';

    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, mode: state.currentMode })
      });
      const data = await res.json();

      if (data.error) throw new Error(data.error);

      state.sessionId = data.id;
      pollStatus();
    } catch (err) {
      showError(err.message || 'Download request failed.');
      resetDownloadBtn();
      dom.cancelBtn.classList.add('hidden');
      dom.progressArea.classList.add('hidden');
    }
  }

  function resetDownloadBtn() {
    const text = state.currentMode === 'audio' ? 'Download Audio' : 'Download Video';
    dom.downloadBtn.disabled = false;
    dom.downloadBtn.innerHTML = `<span class="btn-icon">⬇</span><span class="btn-label">${text}</span>`;
  }

  function cancelSession() {
    if (!confirm('Are you sure you want to start over? Any unsaved clips will be lost.')) return;
    if (state.pollTimer) clearInterval(state.pollTimer);
    if (state.sessionId) fetch(`/api/cleanup/${state.sessionId}`).catch(() => {});
    state.sessionId = null;
    state.clips = [];
    state.colorIndex = 0;
    renderClipList();
    if (state.wavesurfer) {
      state.wavesurfer.destroy();
      state.wavesurfer = null;
    }
    dom.urlSection.style.opacity = '1';
    dom.urlSection.style.pointerEvents = 'auto';
    dom.editorSection.classList.add('hidden');
    dom.progressArea.classList.add('hidden');
    dom.cancelBtn.classList.add('hidden');
    resetDownloadBtn();
  }

  dom.startOverBtn.addEventListener('click', cancelSession);
  dom.cancelBtn.addEventListener('click', cancelSession);

  function pollStatus() {
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = setInterval(async () => {
      try {
        const res = await fetch(`/api/status/${state.sessionId}`);
        const data = await res.json();

        if (data.status === 'error') {
          clearInterval(state.pollTimer);
          showError(data.error || 'An error occurred during download.');
          resetDownloadBtn();
          dom.cancelBtn.classList.add('hidden');
          return;
        }

        const pct = Math.min(100, data.progress || 0);
        dom.progressBar.style.width = `${pct}%`;
        dom.progressPercent.textContent = `${Math.round(pct)}%`;
        
        let sText = data.status === 'downloading' ? 'Downloading...' : 
                    data.status === 'processing'  ? 'Processing...' : 
                    data.status === 'ready'       ? 'Ready!' : data.status;
                    
        dom.statusText.textContent = `${sText} ${data.title ? `- ${data.title}` : ''}`;

        if (data.status === 'ready') {
          clearInterval(state.pollTimer);
          state.pollTimer = null;
          resetDownloadBtn();
          initEditor();
        }
      } catch (err) {
        clearInterval(state.pollTimer);
        state.pollTimer = null;
        resetDownloadBtn();
        showInlineError('Lost connection to server.');
      }
    }, 500);
  }

  /* ── Editor Initialization ─────────────────────────────────── */

  function initEditor() {
    // Collapse URL section, show editor
    dom.urlSection.style.opacity = '0.5';
    dom.urlSection.style.pointerEvents = 'none';
    dom.editorSection.classList.remove('hidden');
    dom.editorVideoTitle.textContent = state.videoTitle || '';
    if (dom.downloadFullLabel) {
      dom.downloadFullLabel.textContent = `Download Full ${state.currentMode === 'audio' ? 'Audio' : 'Video'}`;
    }

    // Scroll into view
    dom.editorSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Create WaveSurfer
    const wsOptions = {
      container: '#waveform',
      waveColor: '#4a3f6b',
      progressColor: '#06b6d4',
      cursorColor: '#8b5cf6',
      cursorWidth: 2,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 128,
      normalize: true,
      url: `/api/audio/${state.sessionId}`,
    };

    if (state.currentMode === 'video') {
      dom.videoWrapper.classList.remove('hidden');
      dom.mediaPlayer.src = `/api/audio/${state.sessionId}`;
      wsOptions.media = dom.mediaPlayer;
    } else {
      dom.videoWrapper.classList.add('hidden');
      dom.mediaPlayer.removeAttribute('src');
    }

    state.wavesurfer = WaveSurfer.create(wsOptions);

    // Register Regions plugin
    state.regions = state.wavesurfer.registerPlugin(
      WaveSurfer.Regions.create()
    );

    // Enable drag-to-create regions
    state.regions.enableDragSelection({
      color: 'rgba(139, 92, 246, 0.25)',
      minLength: 0.5,
    });

    /* ── WaveSurfer Events ───────────────────────────────────── */

    state.wavesurfer.on('ready', () => {
      dom.totalTime.textContent = formatTime(state.wavesurfer.getDuration());
    });

    state.wavesurfer.on('audioprocess', () => {
      const currentTime = state.wavesurfer.getCurrentTime();
      dom.currentTime.textContent = formatTime(currentTime);

      // Stop if we are previewing a clip and it reached the end naturally
      if (state.previewingClipId) {
        const clip = state.clips.find((c) => c.id === state.previewingClipId);
        if (clip && currentTime >= clip.end && currentTime <= clip.end + 0.5) {
          state.wavesurfer.pause();
          state.previewingClipId = null;
          highlightClipCard(clip.id, false);
          // Small rewind to exact end to be tidy
          state.wavesurfer.setTime(clip.end);
        } else if (clip && (currentTime < clip.start - 0.5 || currentTime > clip.end + 1.0)) {
           // User manually scrubbed outside the clip bounds during preview
           // We just silently release the preview lock so they can listen freely
           state.previewingClipId = null;
           highlightClipCard(clip.id, false);
        }
      }
    });

    state.wavesurfer.on('seeking', () => {
      dom.currentTime.textContent = formatTime(state.wavesurfer.getCurrentTime());
    });

    state.wavesurfer.on('play', () => {
      dom.iconPlay.classList.add('hidden');
      dom.iconPause.classList.remove('hidden');
    });

    state.wavesurfer.on('pause', () => {
      dom.iconPlay.classList.remove('hidden');
      dom.iconPause.classList.add('hidden');
      // Clear previewing highlight
      if (state.previewingClipId) {
        highlightClipCard(state.previewingClipId, false);
        state.previewingClipId = null;
      }
    });

    state.wavesurfer.on('finish', () => {
      dom.iconPlay.classList.remove('hidden');
      dom.iconPause.classList.add('hidden');
    });

    /* ── Region Events ───────────────────────────────────────── */

    // When a region is created via drag selection
    state.regions.on('region-created', (region) => {
      // If the region was made by drag-selection it won't be in state.clips yet
      if (!state.clips.find((c) => c.id === region.id)) {
        adoptRegion(region);
      }
    });

    // When a region is updated (resized / dragged)
    state.regions.on('region-updated', (region) => {
      const clip = state.clips.find((c) => c.id === region.id);
      if (clip) {
        clip.start = region.start;
        clip.end   = region.end;
        updateClipTextInDOM(clip);
      }
    });
  }

  /**
   * Adopt a region (from drag-create) into the clip system.
   */
  function adoptRegion(region) {
    const colors = getNextColor();

    region.setOptions({
      color: colors.region,
      drag: true,
      resize: true,
      minLength: 0.5,
    });

    // If the region id looks auto-generated, keep it; otherwise use our own
    const clip = {
      id: region.id,
      regionRef: region,
      color: colors.solid,
      start: region.start,
      end: region.end,
    };

    state.clips.push(clip);
    renderClipList();
  }

  /* ── Transport Controls ────────────────────────────────────── */

  dom.playPauseBtn.addEventListener('click', () => {
    if (!state.wavesurfer) return;
    state.wavesurfer.playPause();
  });

  dom.zoomSlider.addEventListener('input', () => {
    if (!state.wavesurfer) return;
    state.wavesurfer.zoom(Number(dom.zoomSlider.value));
  });

  /* ── Add Clip ──────────────────────────────────────────────── */

  dom.addClipBtn.addEventListener('click', () => {
    if (!state.wavesurfer) return;

    const duration = state.wavesurfer.getDuration();
    const current  = state.wavesurfer.getCurrentTime();

    const start = current;
    const end   = Math.min(current + 5, duration);

    if (end - start < 0.5) {
      showError('Not enough room to add a clip at this position.');
      return;
    }

    state.regions.addRegion({
      start,
      end,
    });
  });

  /* ── Clip List Rendering ───────────────────────────────────── */

  function renderClipList() {
    // Sort clips by start time
    state.clips.sort((a, b) => a.start - b.start);

    // Update count
    const count = state.clips.length;
    dom.clipCount.textContent = `${count} clip${count !== 1 ? 's' : ''}`;
    dom.downloadClipsBtn.disabled = count === 0;

    // Clear list (keep empty state element)
    const cards = dom.clipList.querySelectorAll('.clip-card');
    cards.forEach((c) => c.remove());

    if (count === 0) {
      dom.clipEmpty.classList.remove('hidden');
      return;
    }

    dom.clipEmpty.classList.add('hidden');

    state.clips.forEach((clip, idx) => {
      const card = document.createElement('div');
      card.className = 'clip-card';
      card.dataset.clipId = clip.id;
      card.style.setProperty('--clip-color', clip.color);
      card.style.animationDelay = `${idx * 0.05}s`;

      const dur = clip.end - clip.start;

      card.innerHTML = `
        <span class="clip-color-dot" style="background:${clip.color};box-shadow:0 0 6px ${clip.color}"></span>
        <div class="clip-info">
          <div class="clip-label">Clip ${idx + 1}</div>
          <div class="clip-times">
            ${formatTime(clip.start)} — ${formatTime(clip.end)}
            <span class="clip-duration">(${formatTime(dur)})</span>
          </div>
        </div>
        <div class="clip-actions">
          <button class="btn btn-sm btn-accent clip-play-btn" title="Preview clip">▶</button>
          <button class="btn btn-sm btn-danger-icon clip-delete-btn" title="Delete clip">✕</button>
        </div>
      `;

      // Play preview
      card.querySelector('.clip-play-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        previewClip(clip);
      });

      // Delete
      card.querySelector('.clip-delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteClip(clip.id);
      });

      dom.clipList.appendChild(card);
    });
  }

  function updateClipTextInDOM(clip) {
    const card = dom.clipList.querySelector(`.clip-card[data-clip-id="${clip.id}"]`);
    if (card) {
      const dur = clip.end - clip.start;
      const timesDiv = card.querySelector('.clip-times');
      if (timesDiv) {
        timesDiv.innerHTML = `
          ${formatTime(clip.start)} — ${formatTime(clip.end)}
          <span class="clip-duration">(${formatTime(dur)})</span>
        `;
      }
    }
  }

  function previewClip(clip) {
    if (!state.wavesurfer) return;

    // Clear previous highlight
    if (state.previewingClipId) {
      highlightClipCard(state.previewingClipId, false);
    }

    state.previewingClipId = clip.id;
    highlightClipCard(clip.id, true);
    
    // Jump to the start of the clip
    state.wavesurfer.setTime(clip.start);
    
    // Wait for the HTML media element to seek before calling play.
    // This prevents a race condition where the browser plays the old position
    // for a split millisecond, which instantly trips the pause listener.
    setTimeout(() => {
      if (state.previewingClipId === clip.id) {
        state.wavesurfer.play();
      }
    }, 150);
  }

  function deleteClip(clipId) {
    const idx = state.clips.findIndex((c) => c.id === clipId);
    if (idx === -1) return;

    const clip = state.clips[idx];
    if (clip.regionRef) {
      clip.regionRef.remove();
    }

    state.clips.splice(idx, 1);
    renderClipList();
  }

  function highlightClipCard(clipId, active) {
    const card = dom.clipList.querySelector(`[data-clip-id="${clipId}"]`);
    if (card) {
      card.classList.toggle('active', active);
    }
  }

  if (dom.downloadFullBtn) {
    dom.downloadFullBtn.addEventListener('click', () => {
      if (!state.sessionId) return;
      window.location.href = `/api/download_full/${state.sessionId}`;
    });
  }

  /* ── Download Modal ────────────────────────────────────────── */

  dom.downloadClipsBtn.addEventListener('click', () => {
    if (state.clips.length === 0) {
      showError('Add at least one clip before downloading.');
      return;
    }
    openModal();
  });

  function openModal() {
    dom.useDefaultNames.checked = false;
    populateModalClips();
    dom.modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    dom.modal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  dom.modalCancelBtn.addEventListener('click', closeModal);

  // Close on overlay click
  dom.modal.addEventListener('click', (e) => {
    if (e.target === dom.modal) closeModal();
  });

  // Escape key closes modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !dom.modal.classList.contains('hidden')) {
      closeModal();
    }
  });

  function populateModalClips() {
    dom.modalClipList.innerHTML = '';

    state.clips.forEach((clip, idx) => {
      const num = idx + 1;
      const defaultName = `clip_${String(num).padStart(2, '0')}`;
      const item = document.createElement('div');
      item.className = 'modal-clip-item';
      item.dataset.clipId = clip.id;

      item.innerHTML = `
        <div class="modal-clip-meta">
          <span class="clip-color-dot" style="background:${clip.color};box-shadow:0 0 6px ${clip.color}"></span>
          <span class="modal-clip-number">Clip ${num}</span>
        </div>
        <span class="modal-clip-time">${formatTime(clip.start)} — ${formatTime(clip.end)}</span>
        <input
          type="text"
          class="modal-clip-name-input"
          data-default="${defaultName}"
          value="${defaultName}"
          spellcheck="false"
          placeholder="Filename"
        />
        <button class="btn btn-sm btn-accent modal-preview-btn" title="Preview">▶</button>
      `;

      // Preview
      item.querySelector('.modal-preview-btn').addEventListener('click', () => {
        previewClip(clip);
      });

      dom.modalClipList.appendChild(item);
    });
  }

  /* ── "Use default names for the rest" checkbox ─────────────── */

  dom.useDefaultNames.addEventListener('change', () => {
    const inputs = dom.modalClipList.querySelectorAll('.modal-clip-name-input');
    const checked = dom.useDefaultNames.checked;

    inputs.forEach((input) => {
      const defaultVal = input.dataset.default;
      if (checked) {
        // Fill empty or still-default inputs
        if (!input.value.trim() || input.value === defaultVal) {
          input.value = defaultVal;
          input.disabled = true;
        }
      } else {
        input.disabled = false;
      }
    });
  });

  /* ── Download All ──────────────────────────────────────────── */

  dom.modalDownloadBtn.addEventListener('click', async () => {
    const inputs = dom.modalClipList.querySelectorAll('.modal-clip-name-input');
    const clipData = [];

    state.clips.forEach((clip, idx) => {
      const input = inputs[idx];
      const name = (input?.value || '').trim() || `clip_${String(idx + 1).padStart(2, '0')}`;
      clipData.push({
        start: Math.round(clip.start * 1000) / 1000,
        end:   Math.round(clip.end * 1000) / 1000,
        name,
      });
    });

    // Disable button, show spinner
    dom.modalDownloadBtn.disabled = true;
    dom.modalDownloadBtn.innerHTML = '<span class="spinner"></span><span class="btn-label">Processing…</span>';

    try {
      const res = await fetch('/api/clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: state.sessionId,
          mode: state.currentMode,
          clips: clipData,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Server error (${res.status})`);
      }

      // Trigger download
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      let filename = 'clips.zip';
      // Try to extract filename from header
      const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (match) {
        filename = match[1].replace(/['"]/g, '');
      }

      // If it's a single clip, the backend may return mp3 or mp4
      if (clipData.length === 1 && !filename.endsWith('.zip')) {
        filename = `${clipData[0].name}.${state.currentMode === 'audio' ? 'mp3' : 'mp4'}`;
      }

      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);

      closeModal();
      showSuccess('Download started!');
    } catch (err) {
      showError(err.message || 'Failed to download clips.');
    } finally {
      dom.modalDownloadBtn.disabled = false;
      dom.modalDownloadBtn.innerHTML = `<span class="btn-icon">⬇</span><span class="btn-label">Download ${state.currentMode === 'audio' ? 'All MP3s' : 'All MP4s'}</span>`;
    }
  });

  /* ── Keyboard Shortcuts ────────────────────────────────────── */

  document.addEventListener('keydown', (e) => {
    // Only when editor is visible and modal is hidden
    if (dom.editorSection.classList.contains('hidden')) return;
    if (!dom.modal.classList.contains('hidden')) return;

    if (e.code === 'Space' && document.activeElement?.tagName !== 'INPUT') {
      e.preventDefault();
      state.wavesurfer?.playPause();
    }
  });

})();
