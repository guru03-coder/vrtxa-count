'use client';

import React, { useState, useEffect, useRef } from 'react';
import { getSynthInstance } from '@/lib/audioSynth';

// Define milestones in seconds
const MILESTONES = [
  { name: '12h' as const, seconds: 12 * 3600 },
  { name: '6h' as const, seconds: 6 * 3600 },
  { name: '1h' as const, seconds: 1 * 3600 },
  { name: '10min' as const, seconds: 10 * 60 },
  { name: '60sec' as const, seconds: 60 }
];

interface TimerStateResponse {
  status: 'idle' | 'running' | 'ended';
  remainingSeconds: number;
  durationSeconds: number;
  serverTime: string;
}

export default function VortexaTimerPage() {
  // Application State
  const [status, setStatus] = useState<'idle' | 'running' | 'ended'>('idle');
  const [displaySeconds, setDisplaySeconds] = useState<number>(86400);
  const [durationSeconds, setDurationSeconds] = useState<number>(86400);
  
  // Custom Vortex Cursor State
  const [cursorPos, setCursorPos] = useState({ x: -100, y: -100 });
  const [isHovered, setIsHovered] = useState(false);
  
  // Settings & Toggles
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [isCalmMotion, setIsCalmMotion] = useState<boolean>(false);
  const [isSpectator, setIsSpectator] = useState<boolean>(false);
  
  // Reset Modal state
  const [showResetModal, setShowResetModal] = useState<boolean>(false);
  const [pinInput, setPinInput] = useState<string>('');
  const [pinError, setPinError] = useState<string>('');
  
  // Pulses & Milestones
  const [pulseActive, setPulseActive] = useState<boolean>(false);
  const [oceanFlash, setOceanFlash] = useState<boolean>(false);
  const playedMilestonesRef = useRef<Record<string, boolean>>({});

  // Trigger counts for invisible corner
  const cornerClicksRef = useRef<number>(0);
  const lastCornerClickRef = useRef<number>(0);

  // References for monotonic ticking sync
  const remainingAtSyncRef = useRef<number>(86400);
  const syncedAtPerformanceRef = useRef<number>(0);
  const timerStatusRef = useRef<'idle' | 'running' | 'ended'>('idle');

  // Canvas ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Sync displaySecondsRef with state
  const displaySecondsRef = useRef<number>(86400);
  useEffect(() => {
    displaySecondsRef.current = displaySeconds;
  }, [displaySeconds]);

  // Parse URL search parameters on mount to check for spectator or calm-motion overrides
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      setIsSpectator(params.get('spectator') === 'true' || params.get('view') === 'spectator');
      if (params.get('calm') === 'true') {
        setIsCalmMotion(true);
      }
    }
  }, []);

  // Track cursor position and hover state for custom Vortex Cursor
  useEffect(() => {
    const handleMouse = (e: MouseEvent) => {
      setCursorPos({ x: e.clientX, y: e.clientY });
    };

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        target && (
          target.tagName === 'BUTTON' ||
          target.tagName === 'A' ||
          target.tagName === 'INPUT' ||
          target.closest('button') ||
          target.closest('a') ||
          target.classList.contains('hidden-trigger-corner')
        )
      ) {
        setIsHovered(true);
      } else {
        setIsHovered(false);
      }
    };

    window.addEventListener('mousemove', handleMouse, { passive: true });
    window.addEventListener('mouseover', handleMouseOver, { passive: true });

    return () => {
      window.removeEventListener('mousemove', handleMouse);
      window.removeEventListener('mouseover', handleMouseOver);
    };
  }, []);

  // Sync state helper (client-side only)
  const syncWithServer = () => {
    if (typeof window === 'undefined') return;
    
    const params = new URLSearchParams(window.location.search);
    const startVal = params.get('start');
    
    const duration = 86400; // 24 hours
    setDurationSeconds(duration);
    
    if (!startVal) {
      setStatus('idle');
      timerStatusRef.current = 'idle';
      remainingAtSyncRef.current = duration;
      syncedAtPerformanceRef.current = performance.now();
      setDisplaySeconds(duration);
      return;
    }
    
    const startedAtMs = parseInt(startVal, 10);
    if (isNaN(startedAtMs)) {
      setStatus('idle');
      timerStatusRef.current = 'idle';
      remainingAtSyncRef.current = duration;
      syncedAtPerformanceRef.current = performance.now();
      setDisplaySeconds(duration);
      return;
    }

    const nowMs = Date.now();
    const elapsedSeconds = (nowMs - startedAtMs) / 1000;
    
    if (elapsedSeconds >= duration) {
      // URL timer has expired, show ended screen for spectators/shared screens
      setStatus('ended');
      timerStatusRef.current = 'ended';
      remainingAtSyncRef.current = 0;
      syncedAtPerformanceRef.current = performance.now();
      setDisplaySeconds(0);
    } else {
      setStatus('running');
      timerStatusRef.current = 'running';
      remainingAtSyncRef.current = Math.max(0, duration - elapsedSeconds);
      syncedAtPerformanceRef.current = performance.now();
      setDisplaySeconds(Math.max(0, duration - elapsedSeconds));
    }
  };

  // Initial Sync and Polling Interval (every 15 seconds)
  useEffect(() => {
    syncWithServer();
    const syncInterval = setInterval(syncWithServer, 15000);
    return () => clearInterval(syncInterval);
  }, []);

  // Monotonic Tick Interval (updates local clock every 100ms for sub-second smooth ticks)
  useEffect(() => {
    const tickInterval = setInterval(() => {
      if (timerStatusRef.current !== 'running') {
        if (timerStatusRef.current === 'ended') {
          setDisplaySeconds(0);
        } else {
          setDisplaySeconds(remainingAtSyncRef.current);
        }
        return;
      }

      // Calculate elapsed milliseconds using performance.now (unaffected by system clock changes)
      const elapsedMs = performance.now() - syncedAtPerformanceRef.current;
      const elapsedSeconds = elapsedMs / 1000;
      const computedRemaining = Math.max(0, remainingAtSyncRef.current - elapsedSeconds);
      
      const prevDisplay = displaySeconds;
      setDisplaySeconds(computedRemaining);

      if (computedRemaining <= 0) {
        setStatus('ended');
        timerStatusRef.current = 'ended';
        // Play zero collapse milestone sound
        triggerMilestonePulse('zero');
        // Trigger full-screen ocean flash
        setOceanFlash(true);
        setTimeout(() => setOceanFlash(false), 3500);
        syncWithServer(); // force immediate status refresh from server
        return;
      }

      // Check milestones
      for (const m of MILESTONES) {
        if (prevDisplay > m.seconds && computedRemaining <= m.seconds) {
          if (!playedMilestonesRef.current[m.name]) {
            playedMilestonesRef.current[m.name] = true;
            triggerMilestonePulse(m.name);
          }
        }
      }
    }, 100);

    return () => clearInterval(tickInterval);
  }, [displaySeconds]);

  // Trigger milestone chimes and overlay flashes
  const triggerMilestonePulse = (milestone: '12h' | '6h' | '1h' | '10min' | '60sec' | 'zero') => {
    // 1. Play synthesized spatial sound
    const synth = getSynthInstance();
    if (synth && !isMuted) {
      synth.playMilestone(milestone);
    }
    // 2. Trigger visual pulse
    setPulseActive(true);
    setTimeout(() => setPulseActive(false), 800);
  };

  // Keyboard shortcut listener: Shift + Ctrl + Alt + R to show reset dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if user is typing in a PIN modal input
      if (document.activeElement?.tagName === 'INPUT') {
        return;
      }
      
      if (e.shiftKey && e.ctrlKey && e.altKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        setShowResetModal(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Bottom-right corner invisible element click listener
  const handleCornerClick = () => {
    const now = Date.now();
    if (now - lastCornerClickRef.current > 2000) {
      // Reset clicks if more than 2 seconds elapsed
      cornerClicksRef.current = 1;
    } else {
      cornerClicksRef.current += 1;
    }
    
    lastCornerClickRef.current = now;

    if (cornerClicksRef.current >= 3) {
      cornerClicksRef.current = 0;
      setShowResetModal(true);
    }
  };

  // Start the timer
  const handleStartTimer = () => {
    const startTimestamp = Date.now();
    if (typeof window !== 'undefined') {
      localStorage.setItem('vortexa_timer_start', startTimestamp.toString());
      
      // Update URL to include the start time so it's shareable
      const params = new URLSearchParams(window.location.search);
      params.set('start', startTimestamp.toString());
      const newUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState({}, '', newUrl);
    }
    
    setStatus('running');
    timerStatusRef.current = 'running';
    remainingAtSyncRef.current = 86400;
    syncedAtPerformanceRef.current = performance.now();
    setDisplaySeconds(86400);
    setShowResetModal(false);
  };

  // Reset the timer with Pin code authentication
  const handleResetTimer = (e: React.FormEvent) => {
    e.preventDefault();
    setPinError('');

    if (pinInput !== '2026') {
      setPinError('Unauthorized: Invalid PIN');
      return;
    }

    if (typeof window !== 'undefined') {
      localStorage.removeItem('vortexa_timer_start');
      
      // Perform a clean reload without the start query parameter
      const params = new URLSearchParams(window.location.search);
      params.delete('start');
      const searchStr = params.toString();
      window.location.href = searchStr ? `${window.location.pathname}?${searchStr}` : window.location.pathname;
    }
  };

  // Toggle Mute & Sound Synthesizer Context Initialization
  const handleToggleMute = () => {
    const synth = getSynthInstance();
    if (synth) {
      const isNowMuted = synth.toggle();
      setIsMuted(isNowMuted);
    }
  };

  // Canvas animation logic loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;

    // Particle type representing converging inbound streaks
    interface Particle {
      angle: number;
      distance: number;
      speed: number;
      orbitSpeed: number;
      size: number;
      alpha: number;
      color: string;
    }

    let particles: Particle[] = [];
    let rotationAngle = 0;

    // Water burst animation support classes
    class Shockwave {
      radius: number;
      maxRadius: number;
      speed: number;
      opacity: number;
      color: string;
      lineWidth: number;

      constructor(maxRadius: number, color: string) {
        this.radius = 0;
        this.maxRadius = maxRadius;
        this.speed = 4 + Math.random() * 4;
        this.opacity = 1.0;
        this.color = color;
        this.lineWidth = 10;
      }

      update() {
        this.radius += this.speed;
        this.opacity = Math.max(0, 1 - (this.radius / this.maxRadius));
        this.lineWidth = Math.max(1, 10 * (1 - (this.radius / this.maxRadius)));
      }

      draw(c: CanvasRenderingContext2D, cx: number, cy: number) {
        c.save();
        c.beginPath();
        c.arc(cx, cy, this.radius, 0, Math.PI * 2);
        c.strokeStyle = this.color;
        c.lineWidth = this.lineWidth;
        c.globalAlpha = this.opacity;
        c.shadowBlur = 25;
        c.shadowColor = this.color;
        c.stroke();
        c.restore();
      }
    }

    class BurstParticle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      alpha: number;
      decay: number;
      color: string;

      constructor(cx: number, cy: number, color: string) {
        this.x = cx;
        this.y = cy;
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.5 + Math.random() * 8.5;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.radius = 1.5 + Math.random() * 4.5;
        this.alpha = 1.0;
        this.decay = 0.005 + Math.random() * 0.012;
        this.color = color;
      }

      update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= 0.98;
        this.vy *= 0.98;
        this.alpha = Math.max(0, this.alpha - this.decay);
      }

      draw(c: CanvasRenderingContext2D) {
        c.save();
        c.beginPath();
        c.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        c.fillStyle = this.color;
        c.globalAlpha = this.alpha;
        c.shadowBlur = 12;
        c.shadowColor = this.color;
        c.fill();
        c.restore();
      }
    }

    const shockwaves: Shockwave[] = [];
    const burstParticles: BurstParticle[] = [];
    let hasBurstTriggered = false;

    // Theme values helper
    const getThemeConfig = (secRemaining: number, currentStatus: string) => {
      if (currentStatus === 'idle') {
        return {
          primaryColor: '#7eb4ff', // Soft blue
          secondaryColor: '#b8d8ff', // Light sky blue
          speedMultiplier: 0.5,
          particleDensity: 40,
          horizonRadiusRatio: 0.22,
          isUrgent: false
        };
      }
      
      if (currentStatus === 'ended') {
        return {
          primaryColor: '#a0cfff', // Bright blue-white
          secondaryColor: '#d0e8ff', // Icy blue
          speedMultiplier: 0.05,
          particleDensity: 20,
          horizonRadiusRatio: 0.15,
          isUrgent: true
        };
      }

      // If running, scale based on remaining seconds
      if (secRemaining > 6 * 3600) {
        return {
          primaryColor: '#7eb4ff', // Soft blue
          secondaryColor: '#b8d8ff', // Sky blue
          speedMultiplier: 1.0,
          particleDensity: 80,
          horizonRadiusRatio: 0.22,
          isUrgent: false
        };
      } else if (secRemaining > 1 * 3600) {
        return {
          primaryColor: '#8ac0ff', // Medium blue
          secondaryColor: '#c4deff', // Pale blue
          speedMultiplier: 1.6,
          particleDensity: 130,
          horizonRadiusRatio: 0.21,
          isUrgent: false
        };
      } else if (secRemaining > 60) {
        const ratio = (secRemaining - 60) / 3540;
        const blueShift = interpolateColor('#8ac0ff', '#a8d4ff', 1 - ratio);
        
        return {
          primaryColor: blueShift,
          secondaryColor: interpolateColor('#c4deff', '#dceeff', 1 - ratio),
          speedMultiplier: 2.8,
          particleDensity: 180,
          horizonRadiusRatio: 0.20,
          isUrgent: true
        };
      } else {
        const ratio = secRemaining / 60;
        const contractedRatio = 0.16 + (0.04 * ratio);
        
        return {
          primaryColor: '#a8d4ff', // Bright blue
          secondaryColor: '#dceeff', // Lightest blue
          speedMultiplier: 4.5,
          particleDensity: 260,
          horizonRadiusRatio: contractedRatio,
          isUrgent: true
        };
      }
    };

    // Color Interpolator Helper
    const interpolateColor = (color1: string, color2: string, factor: number) => {
      const c1 = hexToRgb(color1);
      const c2 = hexToRgb(color2);
      
      const r = Math.round(c1.r + (c2.r - c1.r) * factor);
      const g = Math.round(c1.g + (c2.g - c1.g) * factor);
      const b = Math.round(c1.b + (c2.b - c1.b) * factor);
      
      return `rgb(${r}, ${g}, ${b})`;
    };

    const hexToRgb = (hex: string) => {
      const cleaned = hex.replace('#', '');
      const num = parseInt(cleaned, 16);
      return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255
      };
    };

    // Resize Canvas handler
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Seed Particles
    const initParticles = (density: number) => {
      particles = [];
      const maxDist = Math.max(width, height) * 0.7;
      for (let i = 0; i < density; i++) {
        particles.push({
          angle: Math.random() * Math.PI * 2,
          distance: Math.random() * maxDist + 100,
          speed: Math.random() * 2 + 1,
          orbitSpeed: (Math.random() * 0.015 + 0.005) * (Math.random() > 0.5 ? 1 : -1),
          size: Math.random() * 1.5 + 0.5,
          alpha: Math.random() * 0.7 + 0.3,
          color: Math.random() > 0.45 ? 'primary' : 'secondary'
        });
      }
    };

    // Animation Render loop
    const render = () => {
      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      const minDimension = Math.min(width, height);

      // Pull dynamic values from refs
      const currentSeconds = displaySecondsRef.current;
      const currentStatus = timerStatusRef.current;

      const total = durationSeconds > 0 ? durationSeconds : 86400;
      const timeProgress = currentStatus === 'idle' ? 0.0 : Math.max(0, Math.min(1, (total - currentSeconds) / total));

      // Sizing scale factor: starts smaller (0.55 of normal size) and grows to 1.0 as remaining time goes down
      const scaleFactor = currentStatus === 'idle' ? 0.55 : 0.55 + (0.45 * timeProgress);
      
      // Update CSS custom property for HTML clock table scaling
      const container = document.querySelector('.vortex-container') as HTMLElement;
      if (container) {
        container.style.setProperty('--vortex-scale', scaleFactor.toString());
      }

      const theme = getThemeConfig(currentSeconds, currentStatus);
      const horizonRadius = minDimension * theme.horizonRadiusRatio * scaleFactor;

      // Adjust particle count dynamically if matches config
      if (particles.length !== theme.particleDensity && !isCalmMotion) {
        initParticles(theme.particleDensity);
      }

      // Draw particle stream (unless calm motion is toggled)
      if (!isCalmMotion) {
        rotationAngle += 0.002 * theme.speedMultiplier;
        
        particles.forEach((p) => {
          // Inbound physics
          p.distance -= p.speed * theme.speedMultiplier * 0.6;
          p.angle += p.orbitSpeed * theme.speedMultiplier * 0.5;

          // Event horizon boundary collapse
          if (p.distance <= horizonRadius) {
            // Re-spawn particle far out
            p.distance = Math.max(width, height) * 0.6 + Math.random() * 100;
            p.angle = Math.random() * Math.PI * 2;
            p.speed = Math.random() * 2 + 1;
            p.alpha = Math.random() * 0.7 + 0.3;
          }

          // Compute particle positions
          const px = cx + Math.cos(p.angle) * p.distance;
          const py = cy + Math.sin(p.angle) * p.distance;

          // Draw trail stretching in direction of motion (inbound trajectory)
          const tailAngle = p.angle - (p.orbitSpeed * 3) + 0.04;
          const tailDistance = p.distance + (p.speed * 2.5);
          const tx = cx + Math.cos(tailAngle) * tailDistance;
          const ty = cy + Math.sin(tailAngle) * tailDistance;

          const colorVal = p.color === 'primary' ? theme.primaryColor : theme.secondaryColor;
          
          ctx.beginPath();
          ctx.strokeStyle = colorVal;
          ctx.lineWidth = p.size;
          ctx.globalAlpha = p.alpha;
          ctx.moveTo(tx, ty);
          ctx.lineTo(px, py);
          ctx.stroke();
        });
        
        ctx.globalAlpha = 1.0; // reset alpha
      }

      // 1-4: Draw Event Horizon visuals (skip when ended — no black circle after timer finishes)
      if (currentStatus !== 'ended') {
        // 1. Draw Event Horizon Background Shadow
        const grad = ctx.createRadialGradient(cx, cy, horizonRadius * 0.6, cx, cy, horizonRadius * 1.3);
        grad.addColorStop(0, '#020208'); // Deep core
        grad.addColorStop(0.7, 'rgba(8, 10, 20, 0.95)');
        grad.addColorStop(1, 'rgba(126, 180, 255, 0.0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, horizonRadius * 1.5, 0, Math.PI * 2);
        ctx.fill();

        // 2. Draw outer boundary ring
        ctx.shadowBlur = isCalmMotion ? 15 : 25;
        ctx.shadowColor = theme.primaryColor;
        ctx.strokeStyle = theme.primaryColor;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.arc(cx, cy, horizonRadius, 0, Math.PI * 2);
        ctx.stroke();

        // 3. Draw active countdown progress arc
        const progress = currentStatus === 'idle' ? 1.0 : currentSeconds / durationSeconds;
        ctx.shadowBlur = isCalmMotion ? 20 : 35;
        ctx.shadowColor = theme.secondaryColor;
        ctx.strokeStyle = theme.secondaryColor;
        ctx.lineWidth = 4;
        ctx.globalAlpha = 0.85;
        ctx.lineCap = 'round';
        
        ctx.beginPath();
        ctx.arc(cx, cy, horizonRadius, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * progress));
        ctx.stroke();
        
        // Reset shadow effects
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1.0;

        // 4. Draw Event Horizon visual ring glow (slow breathing pulse)
        const breathe = currentStatus === 'idle' 
          ? Math.sin(Date.now() * 0.0015) * 0.03 
          : Math.sin(Date.now() * 0.003 * theme.speedMultiplier) * 0.04;
        
        const glowRadius = horizonRadius * (1.02 + breathe);
        ctx.strokeStyle = theme.primaryColor;
        ctx.lineWidth = isCalmMotion ? 1 : 2;
        ctx.globalAlpha = 0.45;
        ctx.beginPath();
        ctx.arc(cx, cy, glowRadius, rotationAngle, rotationAngle + Math.PI * 1.8);
        ctx.stroke();
        ctx.globalAlpha = 1.0;
      }

      // 5. Check and render final water burst shockwaves and splashes
      if (currentStatus === 'ended') {
        if (!hasBurstTriggered) {
          hasBurstTriggered = true;
          // Spawn layered water rings/shockwaves
          for (let i = 0; i < 4; i++) {
            setTimeout(() => {
              shockwaves.push(new Shockwave(Math.max(width, height) * 0.95, theme.secondaryColor));
              shockwaves.push(new Shockwave(Math.max(width, height) * 0.75, theme.primaryColor));
            }, i * 200);
          }
          // Spawn dense water splash burst particles
          for (let i = 0; i < 180; i++) {
            const color = Math.random() > 0.45 ? theme.secondaryColor : theme.primaryColor;
            burstParticles.push(new BurstParticle(cx, cy, color));
          }
        }
      } else {
        hasBurstTriggered = false;
      }

      // Update and draw shockwaves
      for (let i = shockwaves.length - 1; i >= 0; i--) {
        const sw = shockwaves[i];
        sw.update();
        sw.draw(ctx, cx, cy);
        if (sw.opacity <= 0) {
          shockwaves.splice(i, 1);
        }
      }

      // Update and draw splash particles
      for (let i = burstParticles.length - 1; i >= 0; i--) {
        const bp = burstParticles[i];
        bp.update();
        bp.draw(ctx);
        if (bp.alpha <= 0) {
          burstParticles.splice(i, 1);
        }
      }

      // Repeat frame
      animationFrameId = requestAnimationFrame(render);
    };

    // Pre-initialize particles
    initParticles(80);
    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [isCalmMotion, durationSeconds]);

  // Helper formatting values into components
  const formatTime = (totalSeconds: number) => {
    const rounded = Math.ceil(totalSeconds);
    const hrs = Math.floor(rounded / 3600);
    const mins = Math.floor((rounded % 3600) / 60);
    const secs = rounded % 60;

    return {
      hoursStr: hrs.toString().padStart(2, '0'),
      minutesStr: mins.toString().padStart(2, '0'),
      secondsStr: secs.toString().padStart(2, '0')
    };
  };

  const { hoursStr, minutesStr, secondsStr } = formatTime(displaySeconds);

  // Sub-component wrapper to animate changing numbers
  const TimerDigit = ({ val }: { val: string }) => {
    const [digit, setDigit] = useState(val);
    const [warp, setWarp] = useState(false);

    useEffect(() => {
      if (val !== digit) {
        if (!isCalmMotion) {
          setWarp(true);
          const t = setTimeout(() => setWarp(false), 350);
          setDigit(val);
          return () => clearTimeout(t);
        } else {
          setDigit(val);
        }
      }
    }, [val, digit, isCalmMotion]);

    return (
      <span className={`timer-digit ${warp ? 'spaghettify' : ''}`}>
        {digit}
      </span>
    );
  };

  return (
    <div className={`vortex-container ${isCalmMotion ? 'reduced-motion-override' : ''}`}>
      {/* Fixed Infinite Vortex Video Background */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="global-video-bg"
        src="/Futuristic_ocean_vortex_background_202605151738.mp4"
      />
      <div className="global-video-overlay" />

      {/* Dynamic Starfield Backdrop */}
      <div className="space-bg" />

      {/* Canvas Event Horizon simulation (Fullscreen sibling) */}
      <canvas ref={canvasRef} className="canvas-element" />

      {/* Screen flash pulse on milestone hit */}
      <div className={`pulse-overlay ${pulseActive ? 'pulse-active' : ''}`} />

      {/* Full-screen ocean flash when timer ends */}
      <div className={`ocean-flash-overlay ${oceanFlash ? 'ocean-flash-active' : ''}`} />

      {/* Top Title/Label area */}
      {status !== 'ended' && (
        <header className="header-area">
          <div className="title-glow-backdrop" />
          <p className="hero-kicker">HACKHERE PRESENTS</p>
          <h1 className="title-vortexa">
            {"VORTEXA".split("").map((char, index) => (
              <span 
                key={index} 
                className="animated-char" 
                style={{ '--delay': `${index * 0.1}s` } as React.CSSProperties}
              >
                {char}
              </span>
            ))}
          </h1>
        </header>
      )}

      {/* Central Interactive Horizon Space */}
      <main className={`visual-system timer-stage-${status === 'running' && displaySeconds <= 60 ? '4' : 'normal'}`}>
        {/* Center Clock Digits (The Singularity) */}
        {status === 'ended' ? (
          <div className="ended-view">
            <h2 className="ended-title">
              <div className="ended-title-row">
                {"VORTEX".split("").map((char, index) => (
                  <span 
                    key={index} 
                    className="animated-char" 
                    style={{ '--delay': `${index * 0.06}s` } as React.CSSProperties}
                  >
                    {char}
                  </span>
                ))}
              </div>
              <div className="ended-title-row">
                {"COLLAPSED".split("").map((char, index) => (
                  <span 
                    key={index} 
                    className="animated-char" 
                    style={{ '--delay': `${(index + 6) * 0.06}s` } as React.CSSProperties}
                  >
                    {char}
                  </span>
                ))}
              </div>
            </h2>
            <div className="ended-subtitle">THE HACKATHON HAS ENDED</div>

            {/* Socials & QR Section */}
            <div className="ended-socials-section">
              <p className="socials-text">
                FOLLOW US ON INSTAGRAM AND LINKEDIN FOR FUTURE EVENTS
              </p>
              
              <div className="qr-container">
                {/* Instagram QR */}
                <div className="qr-item">
                  <a 
                    href="https://www.instagram.com/hackhere_connect/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="qr-link"
                  >
                    <div className="qr-box">
                      <div className="qr-corner top-left"></div>
                      <div className="qr-corner top-right"></div>
                      <div className="qr-corner bottom-left"></div>
                      <div className="qr-corner bottom-right"></div>
                      
                      <div className="qr-scanner-line"></div>
                      
                      <img 
                        src="/QR/insta hackhere_transparent.png" 
                        alt="Instagram QR" 
                        className="qr-image"
                      />
                    </div>
                  </a>
                  <span className="qr-label">INSTAGRAM</span>
                </div>

                {/* LinkedIn QR */}
                <div className="qr-item">
                  <a 
                    href="https://www.linkedin.com/in/hack-here-911237403/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="qr-link"
                  >
                    <div className="qr-box">
                      <div className="qr-corner top-left"></div>
                      <div className="qr-corner top-right"></div>
                      <div className="qr-corner bottom-left"></div>
                      <div className="qr-corner bottom-right"></div>
                      
                      <div className="qr-scanner-line"></div>
                      
                      <img 
                        src="/QR/Linkedin hackhere_transparent.png" 
                        alt="LinkedIn QR" 
                        className="qr-image"
                      />
                    </div>
                  </a>
                  <span className="qr-label">LINKEDIN</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="countdown-table">
            <div className="countdown-grid">
              <div className="cd-block">
                <span className="cd-val">
                  <TimerDigit val={hoursStr[0]} />
                  <TimerDigit val={hoursStr[1]} />
                </span>
                <span className="cd-lbl">HRS</span>
              </div>
              <div className="cd-block">
                <span className="cd-val">
                  <TimerDigit val={minutesStr[0]} />
                  <TimerDigit val={minutesStr[1]} />
                </span>
                <span className="cd-lbl">MIN</span>
              </div>
              <div className="cd-block">
                <span className="cd-val">
                  <TimerDigit val={secondsStr[0]} />
                  <TimerDigit val={secondsStr[1]} />
                </span>
                <span className="cd-lbl">SEC</span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Option and Start controllers */}
      <div className="controls-area">
        {status !== 'ended' && (
          <div className="subtitle-timer">
            {status === 'idle' ? 'READY TO INITIATE' : 'EVENT HORIZON COUNTDOWN'}
          </div>
        )}

        {/* Render Start Button in Normal (non-spectator) View when IDLE */}
        {status === 'idle' && !isSpectator && (
          <button className="btn-vortex" onClick={handleStartTimer}>
            Start Countdown
          </button>
        )}


      </div>

      {/* Spectator Mode Watermark Indicator */}
      {isSpectator && (
        <div className="spectator-watermark">
          Spectator View
        </div>
      )}

      {/* Invisible reset click trigger in the bottom right corner */}
      <div 
        className="hidden-trigger-corner" 
        onClick={handleCornerClick} 
        title="Admin Trigger"
      />

      {/* Admin Organizer Reset modal */}
      {showResetModal && (
        <div className="modal-overlay" onClick={() => setShowResetModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Organizer Control</h3>
            <p className="modal-desc">
              {status === 'idle' 
                ? 'Enter organizer PIN to trigger start/reset configurations.'
                : 'Warning: Resetting the countdown back to 24:00:00 will sync to all screens and cannot be undone.'
              }
            </p>
            
            <form onSubmit={handleResetTimer}>
              <input 
                type="password" 
                className="modal-input" 
                placeholder="ENTER PIN" 
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                maxLength={8}
                autoFocus
              />
              
              {pinError && <div className="modal-error">{pinError}</div>}
              
              <div className="modal-btn-row">
                <button 
                  type="button" 
                  className="btn-modal btn-modal-cancel" 
                  onClick={() => {
                    setShowResetModal(false);
                    setPinError('');
                    setPinInput('');
                  }}
                >
                  Cancel
                </button>
                
                {status === 'idle' ? (
                  <button 
                    type="button" 
                    className="btn-modal btn-modal-confirm"
                    onClick={handleStartTimer}
                    style={{ background: 'var(--primary-accent)' }}
                  >
                    Start Timer
                  </button>
                ) : (
                  <button 
                    type="submit" 
                    className="btn-modal btn-modal-confirm"
                  >
                    Reset Timer
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Vortex Cursor */}
      <div
        className={`vortex-cursor ${isHovered ? 'cursor-hovered' : ''}`}
        style={{ left: cursorPos.x, top: cursorPos.y }}
      />
      <div
        className={`vortex-cursor-trail ${isHovered ? 'trail-hovered' : ''}`}
        style={{ left: cursorPos.x, top: cursorPos.y }}
      />
    </div>
  );
}
