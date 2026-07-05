import Hls from 'hls.js';

function isHlsUrl(videoUrl) {
  return typeof videoUrl === 'string' && videoUrl.toLowerCase().includes('.m3u8');
}

function formatVideoError(error) {
  if (!error) {
    return null;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error.message) {
    return error.message;
  }

  return String(error);
}

export class CameraVideoRuntime {
  constructor({ runtimeId = 'camera-video-runtime', logPrefix = '[CameraVideoRuntime]' } = {}) {
    this.runtimeId = runtimeId;
    this.logPrefix = logPrefix;
    this.videoElement = document.createElement('video');
    this.videoElement.muted = true;
    this.videoElement.autoplay = true;
    this.videoElement.playsInline = true;
    this.videoElement.crossOrigin = 'anonymous';
    this.videoElement.preload = 'auto';
    this.videoElement.controls = true;
    this.videoElement.setAttribute('playsinline', '');
    this.videoElement.setAttribute('webkit-playsinline', '');
    this.videoElement.dataset.cameraVideoRuntime = runtimeId;
    this.videoElement.className = 'inspector-video-preview';

    this.hls = null;
    this.sourceUrl = '';
    this.status = 'idle';
    this.lastError = null;
    this.lastSample = this.buildSample();
    this._playAttemptPending = false;
    this._destroyed = false;

    this._handleLoadedMetadata = this.handlePlayableEvent.bind(this);
    this._handleCanPlay = this.handlePlayableEvent.bind(this);
    this._handlePlaying = this.handlePlaying.bind(this);
    this._handlePause = this.handlePause.bind(this);
    this._handleEnded = this.handleEnded.bind(this);
    this._handleError = this.handleError.bind(this);

    this.videoElement.addEventListener('loadedmetadata', this._handleLoadedMetadata);
    this.videoElement.addEventListener('canplay', this._handleCanPlay);
    this.videoElement.addEventListener('playing', this._handlePlaying);
    this.videoElement.addEventListener('pause', this._handlePause);
    this.videoElement.addEventListener('ended', this._handleEnded);
    this.videoElement.addEventListener('error', this._handleError);
  }

  getVideoElement() {
    return this.videoElement;
  }

  async load(url = '', options = {}) {
    const normalizedUrl = url || '';
    const shouldLoop = options.loop ?? !isHlsUrl(normalizedUrl);

    if (normalizedUrl === this.sourceUrl && !options.forceReload) {
      this.videoElement.loop = shouldLoop;
      this.tryPlay();
      this.lastSample = this.buildSample();
      return this.lastSample;
    }

    this.sourceUrl = normalizedUrl;
    this.status = normalizedUrl ? 'loading' : 'idle';
    this.lastError = null;
    this.videoElement.loop = shouldLoop;

    this.destroyHls();
    this.videoElement.pause();
    this.videoElement.removeAttribute('src');

    if (!normalizedUrl) {
      this.videoElement.load();
      this.lastSample = this.buildSample();
      return this.lastSample;
    }

    console.log(`${this.logPrefix} load`, {
      runtimeId: this.runtimeId,
      url: normalizedUrl
    });

    if (isHlsUrl(normalizedUrl)) {
      if (this.videoElement.canPlayType('application/vnd.apple.mpegurl')) {
        this.videoElement.src = normalizedUrl;
        this.videoElement.load();
        this.tryPlay();
        this.lastSample = this.buildSample();
        return this.lastSample;
      }

      if (!Hls.isSupported()) {
        const error = new Error('HLS is not supported in this browser');
        this.lastError = formatVideoError(error);
        this.status = 'error';
        throw error;
      }

      this.hls = new Hls({
        lowLatencyMode: true,
        liveSyncDuration: 2,
        maxLiveSyncPlaybackRate: 1.5
      });
      this.hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        console.log(`${this.logPrefix} hls attached`, {
          runtimeId: this.runtimeId
        });
        this.tryPlay();
      });
      this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
        this.tryPlay();
      });
      this.hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data?.fatal) {
          this.status = 'error';
          this.lastError = data?.details || data?.type || 'HLS fatal error';
          console.warn(`${this.logPrefix} HLS fatal error:`, data);
        }
      });
      this.hls.loadSource(normalizedUrl);
      this.hls.attachMedia(this.videoElement);
      this.lastSample = this.buildSample();
      return this.lastSample;
    }

    this.videoElement.src = normalizedUrl;
    this.videoElement.load();
    this.tryPlay();
    this.lastSample = this.buildSample();
    return this.lastSample;
  }

  handlePlayableEvent() {
    if (this.status !== 'playing') {
      this.status = 'ready';
    }

    this.tryPlay();
    this.lastSample = this.buildSample();
  }

  handlePlaying() {
    this.status = 'playing';
    this.lastError = null;
    this._playAttemptPending = false;
    this.lastSample = this.buildSample();
    console.log(`${this.logPrefix} playing`, {
      runtimeId: this.runtimeId,
      currentTime: this.lastSample.currentTime,
      readyState: this.lastSample.readyState
    });
  }

  handlePause() {
    if (this.status !== 'error' && this.status !== 'idle' && !this.videoElement.ended) {
      this.status = 'paused';
    }

    this.lastSample = this.buildSample();
  }

  handleEnded() {
    this.status = 'ended';
    this.lastSample = this.buildSample();
  }

  handleError(event) {
    const mediaError = event?.target?.error;
    this.status = 'error';
    this.lastError = formatVideoError(mediaError) || 'Video playback failed';
    this.lastSample = this.buildSample();
    console.warn(`${this.logPrefix} error:`, mediaError || event);
  }

  tryPlay() {
    if (!this.videoElement || this._destroyed || !this.sourceUrl || this._playAttemptPending) {
      return;
    }

    const playPromise = this.videoElement.play();
    if (!playPromise?.then) {
      return;
    }

    this._playAttemptPending = true;
    playPromise
      .catch((error) => {
        this.lastError = formatVideoError(error);
        if (this.status !== 'error') {
          this.status = this.videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA ? 'ready' : 'loading';
        }
        console.warn(`${this.logPrefix} play failed:`, error);
      })
      .finally(() => {
        this._playAttemptPending = false;
        this.lastSample = this.buildSample();
      });
  }

  update() {
    if (this._destroyed) {
      return false;
    }

    if (
      this.sourceUrl &&
      this.videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      this.videoElement.paused &&
      !this.videoElement.ended
    ) {
      this.tryPlay();
    }

    const nextSample = this.buildSample();
    const changed =
      nextSample.status !== this.lastSample.status ||
      nextSample.currentTime !== this.lastSample.currentTime ||
      nextSample.readyState !== this.lastSample.readyState ||
      nextSample.paused !== this.lastSample.paused ||
      nextSample.videoWidth !== this.lastSample.videoWidth ||
      nextSample.videoHeight !== this.lastSample.videoHeight ||
      nextSample.lastError !== this.lastSample.lastError;

    this.lastSample = nextSample;
    return changed;
  }

  buildSample() {
    return {
      runtimeId: this.runtimeId,
      sourceUrl: this.sourceUrl,
      status: this.status,
      currentTime: Number.isFinite(this.videoElement.currentTime) ? Number(this.videoElement.currentTime.toFixed(3)) : 0,
      readyState: this.videoElement.readyState ?? 0,
      paused: this.videoElement.paused ?? true,
      ended: this.videoElement.ended ?? false,
      videoWidth: this.videoElement.videoWidth ?? 0,
      videoHeight: this.videoElement.videoHeight ?? 0,
      lastError: this.lastError
    };
  }

  getState() {
    return {
      ...this.lastSample,
      previewVideoElement: this.videoElement
    };
  }

  destroyHls() {
    if (!this.hls) {
      return;
    }

    this.hls.destroy();
    this.hls = null;
  }

  destroy() {
    if (this._destroyed) {
      return;
    }

    this._destroyed = true;
    this.destroyHls();
    this.videoElement.removeEventListener('loadedmetadata', this._handleLoadedMetadata);
    this.videoElement.removeEventListener('canplay', this._handleCanPlay);
    this.videoElement.removeEventListener('playing', this._handlePlaying);
    this.videoElement.removeEventListener('pause', this._handlePause);
    this.videoElement.removeEventListener('ended', this._handleEnded);
    this.videoElement.removeEventListener('error', this._handleError);
    this.videoElement.pause();
    this.videoElement.removeAttribute('src');
    this.videoElement.load();
    this.videoElement.remove();
  }
}
