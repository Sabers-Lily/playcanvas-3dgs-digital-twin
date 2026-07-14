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
    this._loadToken = 0;
    this._destroyed = false;

    this._handleLoadedMetadata = this.handlePlayableEvent.bind(this);
    this._handleCanPlay = this.handlePlayableEvent.bind(this);
    this._handlePlaying = this.handlePlaying.bind(this);
    this._handlePause = this.handlePause.bind(this);
    this._handleEnded = this.handleEnded.bind(this);
    this._handleError = this.handleError.bind(this);
    this._handleWaiting = this.handleWaiting.bind(this);
    this._handleStalled = this.handleStalled.bind(this);

    this.videoElement.addEventListener('loadedmetadata', this._handleLoadedMetadata);
    this.videoElement.addEventListener('canplay', this._handleCanPlay);
    this.videoElement.addEventListener('playing', this._handlePlaying);
    this.videoElement.addEventListener('pause', this._handlePause);
    this.videoElement.addEventListener('ended', this._handleEnded);
    this.videoElement.addEventListener('error', this._handleError);
    this.videoElement.addEventListener('waiting', this._handleWaiting);
    this.videoElement.addEventListener('stalled', this._handleStalled);
  }

  getVideoElement() {
    return this.videoElement;
  }

  async load(url = '', options = {}) {
    const normalizedUrl = url || '';
    const shouldLoop = options.loop ?? !isHlsUrl(normalizedUrl);
    const loadToken = this._loadToken + 1;
    this._loadToken = loadToken;

    if (normalizedUrl === this.sourceUrl && !options.forceReload) {
      this.videoElement.loop = shouldLoop;
      if (
        this.videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        this.videoElement.networkState !== HTMLMediaElement.NETWORK_NO_SOURCE
      ) {
        await this.play();
      }
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
    this.videoElement.load();

    if (!normalizedUrl) {
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
        this.lastSample = this.buildSample();
        return this.lastSample;
      }

      if (!Hls.isSupported()) {
        const error = new Error('HLS is not supported in this browser');
        this.lastError = formatVideoError(error);
        this.status = 'error';
        throw error;
      }

      const loaded = await this.loadHls(normalizedUrl, loadToken);
      this.lastSample = this.buildSample();
      return loaded ? this.lastSample : this.lastSample;
    }

    this.videoElement.src = normalizedUrl;
    this.videoElement.load();
    this.lastSample = this.buildSample();
    return this.lastSample;
  }

  loadHls(url, loadToken) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (result, error = null) => {
        if (settled) {
          return;
        }
        settled = true;
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      };

      const hls = new Hls({
        lowLatencyMode: true,
        liveSyncDuration: 2,
        liveMaxLatencyDuration: 4,
        maxLiveSyncPlaybackRate: 1.5,
        backBufferLength: 10
      });

      this.hls = hls;
      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        if (loadToken !== this._loadToken) {
          finish(false);
          return;
        }

        console.log(`${this.logPrefix} hls attached`, {
          runtimeId: this.runtimeId
        });
        hls.loadSource(url);
      });
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (loadToken !== this._loadToken) {
          finish(false);
          return;
        }

        console.log(`${this.logPrefix} hls manifest parsed`, {
          runtimeId: this.runtimeId,
          url
        });
        this.syncToLiveEdge();
        finish(true);
      });
      hls.on(Hls.Events.LEVEL_UPDATED, () => {
        if (loadToken !== this._loadToken) {
          return;
        }
        this.syncToLiveEdge();
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data?.fatal) {
          return;
        }

        console.warn(`${this.logPrefix} HLS fatal error:`, {
          runtimeId: this.runtimeId,
          url,
          data
        });
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          this.status = 'loading';
          this.lastError = data?.details || data?.type || 'HLS network error';
          this.hls?.startLoad();
          return;
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          this.status = 'loading';
          this.lastError = data?.details || data?.type || 'HLS media error';
          this.hls?.recoverMediaError();
          return;
        }

        this.status = 'error';
        this.lastError = data?.details || data?.type || 'HLS fatal error';
        finish(false, new Error(this.lastError));
      });

      hls.attachMedia(this.videoElement);
    });
  }

  handlePlayableEvent() {
    if (this.status !== 'playing') {
      this.status = 'ready';
    }

    this.play();
    this.lastSample = this.buildSample();
  }

  handlePlaying() {
    this.status = 'playing';
    this.lastError = null;
    this._playAttemptPending = false;
    this.lastSample = this.buildSample();
    // console.log(`${this.logPrefix} playing`, {
    //   runtimeId: this.runtimeId,
    //   currentTime: this.lastSample.currentTime,
    //   readyState: this.lastSample.readyState
    // });
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

  handleWaiting() {
    if (isHlsUrl(this.sourceUrl)) {
      this.status = 'loading';
      this.syncToLiveEdge();
      this.play();
    }
    this.lastSample = this.buildSample();
  }

  handleStalled() {
    if (isHlsUrl(this.sourceUrl)) {
      this.status = 'loading';
      this.syncToLiveEdge();
      this.hls?.startLoad();
      this.play();
    }
    this.lastSample = this.buildSample();
  }

  async play() {
    if (!this.videoElement || this._destroyed || !this.sourceUrl || this._playAttemptPending) {
      return false;
    }

    const hasSource =
      (Boolean(this.videoElement.currentSrc) || Boolean(this.videoElement.src)) &&
      this.videoElement.networkState !== HTMLMediaElement.NETWORK_NO_SOURCE;

    if (!hasSource) {
      this.status = 'loading';
      this.lastError = null;
      console.warn(`${this.logPrefix} play skipped: no source`, {
        runtimeId: this.runtimeId,
        url: this.sourceUrl,
        src: this.videoElement.src,
        currentSrc: this.videoElement.currentSrc,
        networkState: this.videoElement.networkState
      });
      this.lastSample = this.buildSample();
      return false;
    }

    if (this.videoElement.readyState < HTMLMediaElement.HAVE_METADATA) {
      this.status = 'loading';
      this.lastError = null;
      this.lastSample = this.buildSample();
      return false;
    }

    this._playAttemptPending = true;
    try {
      const playPromise = this.videoElement.play();
      if (playPromise?.then) {
        await playPromise;
      }
      if (this.status !== 'playing') {
        this.status = this.videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA ? 'ready' : 'loading';
      }
      return true;
    } catch (error) {
      this.status = 'error';
      this.lastError = formatVideoError(error);
      console.warn(`${this.logPrefix} play failed:`, {
        runtimeId: this.runtimeId,
        url: this.sourceUrl,
        src: this.videoElement.src,
        currentSrc: this.videoElement.currentSrc,
        readyState: this.videoElement.readyState,
        networkState: this.videoElement.networkState,
        error
      });
      return false;
    } finally {
      this._playAttemptPending = false;
      this.lastSample = this.buildSample();
    }
  }

  pause() {
    if (!this.videoElement || this._destroyed) {
      return;
    }

    this.videoElement.pause();
    if (this.status !== 'error' && this.status !== 'idle') {
      this.status = 'paused';
    }
    this.lastSample = this.buildSample();
  }

  stop({ clearSource = false } = {}) {
    if (!this.videoElement || this._destroyed) {
      return;
    }

    this.videoElement.pause();
    if (clearSource) {
      this.destroyHls();
      this.sourceUrl = '';
      this.videoElement.removeAttribute('src');
      this.videoElement.load();
    }
    this.status = clearSource ? 'idle' : 'stopped';
    this.lastSample = this.buildSample();
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
      this.play();
    }

    if (
      isHlsUrl(this.sourceUrl) &&
      !this.videoElement.paused &&
      !this.videoElement.ended &&
      this.videoElement.readyState <= HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      this.syncToLiveEdge();
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

  syncToLiveEdge() {
    if (!this.videoElement || !isHlsUrl(this.sourceUrl)) {
      return false;
    }

    const seekable = this.videoElement.seekable;
    if (!seekable || seekable.length <= 0) {
      return false;
    }

    const liveEdge = seekable.end(seekable.length - 1);
    if (!Number.isFinite(liveEdge)) {
      return false;
    }

    const targetTime = Math.max(0, liveEdge - 0.3);
    if (Math.abs((this.videoElement.currentTime ?? 0) - targetTime) < 0.2) {
      return false;
    }

    try {
      this.videoElement.currentTime = targetTime;
      return true;
    } catch (error) {
      console.warn(`${this.logPrefix} syncToLiveEdge failed:`, error);
      return false;
    }
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
    this.videoElement.removeEventListener('waiting', this._handleWaiting);
    this.videoElement.removeEventListener('stalled', this._handleStalled);
    this.videoElement.pause();
    this.videoElement.removeAttribute('src');
    this.videoElement.load();
    this.videoElement.remove();
  }
}
