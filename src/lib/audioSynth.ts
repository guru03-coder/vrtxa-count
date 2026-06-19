class MilestoneSynth {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = true;

  constructor() {
    // Lazy initialization in browser only
  }

  public enable() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.isMuted = false;
  }

  public disable() {
    this.isMuted = true;
  }

  public toggle(): boolean {
    if (this.isMuted) {
      this.enable();
    } else {
      this.disable();
    }
    return this.isMuted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public playMilestone(milestone: '12h' | '6h' | '1h' | '10min' | '60sec' | 'zero') {
    if (this.isMuted || !this.ctx) return;
    
    // Resume context if suspended (browser security)
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    try {
      const now = this.ctx.currentTime;
      
      if (milestone === 'zero') {
        // Deep space implosion / collapse sound
        // Low saw sweep + white noise blast fading out
        
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(20, now + 1.8);
        
        gain.gain.setValueAtTime(0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 2.2);
        
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(180, now);
        filter.frequency.exponentialRampToValueAtTime(40, now + 1.5);
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start(now);
        osc.stop(now + 2.5);
        
        // Generate a quick white noise buffer
        const bufferSize = this.ctx.sampleRate * 2.0;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2.0 - 1.0;
        }
        
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        
        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.setValueAtTime(400, now);
        noiseFilter.frequency.exponentialRampToValueAtTime(60, now + 1.0);
        
        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.3, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
        
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.ctx.destination);
        
        noise.start(now);
        noise.stop(now + 2.2);
        
      } else if (milestone === '60sec') {
        // High tension warning swell
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(280, now);
        osc.frequency.exponentialRampToValueAtTime(750, now + 1.2);
        
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.25, now + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start(now);
        osc.stop(now + 1.3);
        
      } else {
        // Ambient spatial chime (12h, 6h, 1h, 10min)
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        // Base frequency based on milestone
        let baseFreq = 440; // A4
        if (milestone === '12h') baseFreq = 329.63; // E4 (calm)
        else if (milestone === '6h') baseFreq = 261.63; // C4
        else if (milestone === '1h') baseFreq = 220; // A3
        else if (milestone === '10min') baseFreq = 164.81; // E3 (tense)
        
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(baseFreq, now);
        osc1.frequency.exponentialRampToValueAtTime(baseFreq / 2, now + 0.8);
        
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(baseFreq * 1.5, now); // Perfect fifth harmonic
        
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);
        
        const delay = this.ctx.createDelay();
        delay.delayTime.setValueAtTime(0.25, now);
        
        const feedback = this.ctx.createGain();
        feedback.gain.setValueAtTime(0.35, now);
        
        osc1.connect(gain);
        osc2.connect(gain);
        
        // Spatial Delay Loop
        gain.connect(this.ctx.destination);
        gain.connect(delay);
        delay.connect(feedback);
        feedback.connect(delay);
        feedback.connect(this.ctx.destination);
        
        osc1.start(now);
        osc2.start(now);
        
        osc1.stop(now + 2.0);
        osc2.stop(now + 2.0);
      }
    } catch (e) {
      console.error('Web Audio API execution failed:', e);
    }
  }
}

export const getSynthInstance = () => {
  if (typeof window !== 'undefined') {
    if (!(window as any).__vortexa_synth) {
      (window as any).__vortexa_synth = new MilestoneSynth();
    }
    return (window as any).__vortexa_synth as MilestoneSynth;
  }
  return null;
};
