/**
 * Rose Petal Heart Opening Animation
 * Self-contained component for romantic invitation opening sequence.
 * 
 * Flow:
 * Floating Petals -> User Touch/Click -> Organic Scatter ->
 * Mathematical Heart Formation -> Heartbeat Pulse & Glow ->
 * Smooth Dissolve & Existing Invitation Reveal
 */

(function (window, document) {
    'use strict';

    const RosePetalHeartIntro = {
        // State
        canvas: null,
        ctx: null,
        container: null,
        promptEl: null,
        skipBtn: null,
        animationFrameId: null,
        hasStarted: false,
        isRevealed: false,
        isDestroyed: false,
        readyToOpen: false,
        prefersReducedMotion: false,
        startTime: 0,
        scatterStartTime: 0,
        formationStartTime: 0,
        pulseStartTime: 0,
        revealStartTime: 0,
        state: 'idle', // 'idle' | 'scattering' | 'converging' | 'pulsing' | 'revealing' | 'done'

        // Dimensions
        width: 0,
        height: 0,
        dpr: 1,
        centerX: 0,
        centerY: 0,
        heartScale: 1,

        // Assets & Sprites
        petalSprites: [],
        spritesReady: false,

        // Particle Collections
        petals: [],
        sparkles: [],

        // Configuration
        options: {
            petalAssetUrl: 'image/nikkah_images/flower_fall.png',
            totalPetals: 118,
            sparkleCount: 35,
            scatterDuration: 900,     // ms
            convergenceDuration: 1800,// ms
            pulseDuration: 1400,      // ms
            revealDuration: 950,      // ms
            onReveal: null
        },

        init: function (userOptions) {
            if (this.container) return; // Prevent multiple initializations

            if (userOptions) {
                for (let key in userOptions) {
                    if (userOptions.hasOwnProperty(key)) {
                        this.options[key] = userOptions[key];
                    }
                }
            }

            this.container = document.getElementById('rose-petal-heart-intro');
            if (!this.container) {
                console.warn('[RosePetalHeart] Intro container #rose-petal-heart-intro not found');
                return;
            }

            this.canvas = document.getElementById('rose-petal-canvas');
            if (!this.canvas) {
                console.warn('[RosePetalHeart] Canvas #rose-petal-canvas not found');
                return;
            }

            this.ctx = this.canvas.getContext('2d');
            this.promptEl = this.container.querySelector('.rose-intro-prompt');
            this.skipBtn = this.container.querySelector('.rose-intro-skip');
            this.namesEl = this.container.querySelector('.rose-heart-names');
            this.copyEl = this.container.querySelector('.rose-heart-copy');

            // Mirror the invitation's existing couple names inside the heart.
            const topName = document.querySelector('[data-id="top-name"]');
            const bottomName = document.querySelector('[data-id="bottom-name"]');
            if (topName && topName.textContent.trim()) {
                this.container.querySelector('[data-rose-name="top"]').textContent = topName.textContent.trim();
            }
            if (bottomName && bottomName.textContent.trim()) {
                this.container.querySelector('[data-rose-name="bottom"]').textContent = bottomName.textContent.trim();
            }

            // Check reduced motion preference
            this.prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            if (this.prefersReducedMotion) {
                if (this.skipBtn) {
                    this.skipBtn.textContent = 'View Invitation';
                }
            }

            this.handleResize();
            this.bindEvents();
            this.loadSprites();
        },

        handleResize: function () {
            if (!this.canvas || this.isDestroyed) return;

            this.width = window.innerWidth || document.documentElement.clientWidth || 360;
            this.height = window.innerHeight || document.documentElement.clientHeight || 640;
            this.dpr = Math.min(window.devicePixelRatio || 1, 2);

            this.canvas.width = Math.floor(this.width * this.dpr);
            this.canvas.height = Math.floor(this.height * this.dpr);
            this.canvas.style.width = this.width + 'px';
            this.canvas.style.height = this.height + 'px';

            this.ctx.setTransform(1, 0, 0, 1, 0, 0);
            this.ctx.scale(this.dpr, this.dpr);

            this.centerX = this.width / 2;
            
            // Calculate responsive scale for the mathematical heart
            // Heart extent in formula: x in [-16, 16], y in [-17, 16.5]
            const minDim = Math.min(this.width, this.height);
            const isMobile = this.width < 768;
            // Give the heart a stronger visual presence while reserving a clear
            // area below it for the invitation copy.
            const maxHeartDiameter = isMobile ? Math.min(this.width * 0.9, this.height * 0.6) : Math.min(this.width * 0.58, this.height * 0.66, 680);
            
            this.heartScale = maxHeartDiameter / 33.5;
            // Center of mass vertical offset (shift up slightly so heart sits gracefully above prompt)
            this.centerY = (this.height * (isMobile ? 0.38 : 0.46)) - (this.heartScale * 0.2);

            // Align the names to the heart's true center and place the exact
            // three-line invitation lockup below the floral edge.
            // Lower the names slightly for a more balanced visual center while
            // keeping the entire lockup safely inside the floral border.
            this.container.style.setProperty('--rose-heart-center-y', (this.centerY + (isMobile ? 14 : 18)) + 'px');
            this.container.style.setProperty('--rose-heart-copy-top', (this.centerY + (maxHeartDiameter / 2) + (isMobile ? 34 : 42)) + 'px');

            // Recompute target coordinates if petals exist
            if (this.petals.length > 0) {
                this.updateHeartTargets();
            }
        },

        bindEvents: function () {
            const self = this;

            this._resizeHandler = function () {
                self.handleResize();
            };
            window.addEventListener('resize', this._resizeHandler, { passive: true });
            window.addEventListener('orientationchange', this._resizeHandler, { passive: true });

            // User interaction trigger
            this._triggerHandler = function (e) {
                // If clicked on skip button, let skip handler deal with it
                if (e.target && (e.target.classList.contains('rose-intro-skip') || e.target.closest('.rose-intro-skip'))) {
                    return;
                }
                if (self.readyToOpen) {
                    self.triggerReveal();
                } else {
                    self.startSequence();
                }
            };

            // Use pointerdown or touchstart/click
            if (window.PointerEvent) {
                this.container.addEventListener('pointerdown', this._triggerHandler);
            } else {
                this.container.addEventListener('touchstart', this._triggerHandler, { passive: true });
                this.container.addEventListener('click', this._triggerHandler);
            }

            // Keyboard accessibility (Space or Enter)
            this._keyHandler = function (e) {
                if (e.key === ' ' || e.key === 'Enter') {
                    self.startSequence();
                }
            };
            window.addEventListener('keydown', this._keyHandler);

            // Skip button
            if (this.skipBtn) {
                this._skipHandler = function (e) {
                    e.stopPropagation();
                    e.preventDefault();
                    self.skip();
                };
                this.skipBtn.addEventListener('click', this._skipHandler);
            }
        },

        loadSprites: function () {
            const self = this;
            const img = new Image();
            img.crossOrigin = 'anonymous';

            img.onload = function () {
                self.generateTintedSprites(img);
                self.initPetals();
                self.initSparkles();
                self.spritesReady = true;
                self.startTime = performance.now();
                self.loop(self.startTime);
            };

            img.onerror = function () {
                console.warn('[RosePetalHeart] Failed to load petal asset, generating procedural petal sprites');
                self.generateProceduralSprites();
                self.initPetals();
                self.initSparkles();
                self.spritesReady = true;
                self.startTime = performance.now();
                self.loop(self.startTime);
            };

            img.src = this.options.petalAssetUrl;
        },

        generateTintedSprites: function (sourceImg) {
            // Generate multiple harmonic color variations matching wedding palette
            const tints = [
                { color: 'rgba(194, 30, 86, 0.84)', label: 'rose-pink' },
                { color: 'rgba(194, 30, 86, 0.72)', label: 'deep-rose' },
                { color: 'rgba(194, 30, 86, 0.60)', label: 'blush-rose' },
                { color: 'rgba(145, 20, 64, 0.72)', label: 'berry-rose' },
                { color: 'rgba(244, 170, 193, 0.60)', label: 'soft-pink' }
            ];

            const w = sourceImg.naturalWidth || 100;
            const h = sourceImg.naturalHeight || 100;

            tints.forEach(function (tint) {
                const offCanvas = document.createElement('canvas');
                offCanvas.width = w;
                offCanvas.height = h;
                const offCtx = offCanvas.getContext('2d');

                offCtx.drawImage(sourceImg, 0, 0, w, h);

                if (tint.color) {
                    offCtx.globalCompositeOperation = 'source-atop';
                    offCtx.fillStyle = tint.color;
                    offCtx.fillRect(0, 0, w, h);

                    // Add delicate specular highlight
                    const grad = offCtx.createLinearGradient(0, 0, w, h);
                    grad.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
                    grad.addColorStop(0.5, 'transparent');
                    grad.addColorStop(1, 'rgba(180, 100, 70, 0.15)');
                    offCtx.fillStyle = grad;
                    offCtx.fillRect(0, 0, w, h);
                }

                RosePetalHeartIntro.petalSprites.push(offCanvas);
            });
        },

        generateProceduralSprites: function () {
            // High-fidelity procedural rose petal shapes using Bezier curves
            const palettes = [
                ['#F7B4C9', '#C21E56', '#8E1642'],
                ['#FFD5E1', '#C21E56', '#9C1748'],
                ['#F4A1BB', '#C21E56', '#781035'],
                ['#FFE5ED', '#C21E56', '#A7194E']
            ];

            palettes.forEach(function (colors) {
                const offCanvas = document.createElement('canvas');
                const size = 120;
                offCanvas.width = size;
                offCanvas.height = size;
                const ctx = offCanvas.getContext('2d');

                ctx.save();
                ctx.translate(size / 2, size / 2);

                ctx.beginPath();
                ctx.moveTo(0, 48);
                ctx.bezierCurveTo(-38, 30, -52, -22, 0, -48);
                ctx.bezierCurveTo(52, -22, 38, 30, 0, 48);
                ctx.closePath();

                const grad = ctx.createRadialGradient(-8, -12, 6, 0, 0, 52);
                grad.addColorStop(0, colors[0]);
                grad.addColorStop(0.65, colors[1]);
                grad.addColorStop(1, colors[2]);

                ctx.fillStyle = grad;
                ctx.shadowColor = 'rgba(120, 70, 40, 0.25)';
                ctx.shadowBlur = 8;
                ctx.fill();

                // Subtle petal central vein
                ctx.beginPath();
                ctx.moveTo(0, 44);
                ctx.quadraticCurveTo(-4, 0, 0, -42);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.lineWidth = 1.5;
                ctx.stroke();

                ctx.restore();
                RosePetalHeartIntro.petalSprites.push(offCanvas);
            });
        },

        /**
         * Mathematical Heart Formula
         * x(t) = 16 * sin^3(t)
         * y(t) = 13*cos(t) - 5*cos(2t) - 2*cos(3t) - cos(4t)
         * Screen Y is inverted: Y_screen = CenterY - y(t) * scale
         */
        getHeartPoint: function (t) {
            const sinT = Math.sin(t);
            const cosT = Math.cos(t);
            const x = 16 * Math.pow(sinT, 3);
            const y = 13 * cosT - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);

            // Compute curve tangent for natural floral alignment
            const dx = 48 * Math.pow(sinT, 2) * cosT;
            const dy = -13 * sinT + 10 * Math.sin(2 * t) + 6 * Math.sin(3 * t) + 4 * Math.sin(4 * t);
            const tangentAngle = Math.atan2(-dy, dx);

            return { x, y, tangentAngle };
        },

        initPetals: function () {
            const total = this.options.totalPetals;
            this.petals = [];

            // Calculate heart target positions for each petal
            // We distribute petals across concentric layers:
            // Layer 1: Outer perimeter (~44 petals)
            // Layer 2: Inner perimeter (~32 petals)
            // Layer 3: Mid-interior (~24 petals)
            // Layer 4: Center core fill (~18 petals)
            const layers = [
                { count: 52, radius: 1.00, jitter: 0.025, scaleMult: 1.12 },
                { count: 34, radius: 0.975, jitter: 0.035, scaleMult: 1.04 },
                { count: 20, radius: 0.95, jitter: 0.045, scaleMult: 0.96 },
                { count: 12, radius: 0.925, jitter: 0.055, scaleMult: 0.88 }
            ];

            let petalIndex = 0;
            const TWO_PI = Math.PI * 2;

            for (let l = 0; l < layers.length; l++) {
                const layer = layers[l];
                const angleStep = TWO_PI / layer.count;
                // Offset alternating layers for interlaced petal packing
                const layerOffset = (l % 2) * (angleStep * 0.5);

                for (let i = 0; i < layer.count; i++) {
                    const t = (i * angleStep + layerOffset) % TWO_PI;
                    const heartData = this.getHeartPoint(t);

                    const spriteIndex = Math.floor(Math.random() * this.petalSprites.length);
                    const basePetalSize = (Math.random() * 10 + 28) * layer.scaleMult;

                    // Initial floating placement: organically distributed around center
                    const initDist = Math.random() * Math.min(this.width * 0.32, 190) + 20;
                    const initAngle = Math.random() * TWO_PI;
                    const initX = this.centerX + Math.cos(initAngle) * initDist;
                    const initY = this.centerY + Math.sin(initAngle) * initDist;

                    this.petals.push({
                        id: petalIndex++,
                        layerIndex: l,
                        sprite: this.petalSprites[spriteIndex],
                        size: basePetalSize,

                        // Current Coordinates & Physics
                        x: initX,
                        y: initY,
                        z: Math.random() * 0.4 + 0.8, // 3D depth
                        rotation: Math.random() * TWO_PI,
                        pitch: Math.random() * 0.6 - 0.3,
                        yaw: Math.random() * 0.6 - 0.3,
                        opacity: Math.random() * 0.18 + 0.82,

                        // Idle Sway
                        idleX: initX,
                        idleY: initY,
                        idleRadius: Math.random() * 22 + 10,
                        idleSpeed: Math.random() * 0.0015 + 0.0008,
                        idlePhase: Math.random() * TWO_PI,
                        idleRotSpeed: (Math.random() - 0.5) * 0.0008,

                        // Target Heart Position
                        heartT: t,
                        layerRadius: layer.radius,
                        layerJitter: layer.jitter,
                        tangentAngle: heartData.tangentAngle,
                        targetX: 0,
                        targetY: 0,
                        targetRotation: heartData.tangentAngle + (Math.random() * 0.4 - 0.2) + Math.PI / 2,

                        // Scatter & Bezier Interpolation State
                        scatterStartX: 0,
                        scatterStartY: 0,
                        scatterEndX: 0,
                        scatterEndY: 0,
                        scatterRot: 0,
                        controlX: 0,
                        controlY: 0,
                        delay: Math.random() * 280, // Staggered arrival
                        convergeDuration: this.options.convergenceDuration + (Math.random() * 240 - 120),
                        progress: 0
                    });
                }
            }

            this.updateHeartTargets();
        },

        updateHeartTargets: function () {
            const self = this;
            this.petals.forEach(function (p) {
                const heart = self.getHeartPoint(p.heartT);
                // Apply radial layer multiplier + organic jitter
                const r = p.layerRadius + (Math.random() * p.layerJitter - p.layerJitter / 2);
                p.targetX = self.centerX + (heart.x * self.heartScale * r);
                p.targetY = self.centerY - (heart.y * self.heartScale * r);
            });
        },

        initSparkles: function () {
            this.sparkles = [];
            const count = this.options.sparkleCount;
            for (let i = 0; i < count; i++) {
                this.sparkles.push({
                    x: Math.random() * this.width,
                    y: Math.random() * this.height,
                    size: Math.random() * 2.5 + 1,
                    alpha: Math.random() * 0.7 + 0.2,
                    speedY: Math.random() * 0.4 + 0.2,
                    driftX: (Math.random() - 0.5) * 0.3,
                    pulseSpeed: Math.random() * 0.003 + 0.002,
                    pulsePhase: Math.random() * Math.PI * 2
                });
            }
        },

        startSequence: function () {
            if (this.hasStarted) return;
            this.hasStarted = true;

            // Reduced-motion users get a short, direct reveal instead of particle motion.
            if (this.prefersReducedMotion) {
                if (this.promptEl) {
                    this.promptEl.classList.add('prompt-fade-out');
                }
                this.showOpenPrompt();
                return;
            }

            this.state = 'scattering';
            this.scatterStartTime = performance.now();

            // Prime existing audio element immediately on user interaction gesture
            this.primeAudio();

            // Fade out the interactive prompt gently
            if (this.promptEl) {
                this.promptEl.classList.add('prompt-fade-out');
            }

            // Calculate scatter velocities & burst trajectories
            const self = this;
            const TWO_PI = Math.PI * 2;

            this.petals.forEach(function (p) {
                p.scatterStartX = p.x;
                p.scatterStartY = p.y;

                // Scatter angle: explosion outward from center with natural jitter
                const angleFromCenter = Math.atan2(p.y - self.centerY, p.x - self.centerX);
                const scatterAngle = angleFromCenter + (Math.random() * 1.2 - 0.6);
                const burstDistance = Math.random() * Math.min(self.width * 0.44, 280) + 90;

                p.scatterEndX = p.x + Math.cos(scatterAngle) * burstDistance;
                p.scatterEndY = p.y + Math.sin(scatterAngle) * burstDistance;
                p.scatterRot = p.rotation + (Math.random() * 6 - 3);

                // Curved Bezier Control Point for sweeping trajectory toward heart
                const midX = (p.scatterEndX + p.targetX) / 2;
                const midY = (p.scatterEndY + p.targetY) / 2;
                const perpAngle = Math.atan2(p.targetY - p.scatterEndY, p.targetX - p.scatterEndX) + (Math.PI / 2);
                const arcIntensity = (Math.random() * 160 + 60) * (Math.random() < 0.5 ? 1 : -1);

                p.controlX = midX + Math.cos(perpAngle) * arcIntensity;
                p.controlY = midY + Math.sin(perpAngle) * arcIntensity;
            });
        },

        primeAudio: function () {
            try {
                const audio = document.getElementById('audio');
                if (audio) {
                    audio.src = 'assets/song/wedding-nasheed.mp3';
                    // Prime loading in browser audio engine
                    audio.load();
                }
            } catch (err) {
                console.warn('[RosePetalHeart] Audio prime note:', err);
            }
        },

        skip: function () {
            if (this.isRevealed) return;
            this.hasStarted = true;
            this.state = 'revealing';
            this.revealStartTime = performance.now();
            this.triggerReveal();
        },

        triggerReveal: function () {
            if (this.isRevealed) return;
            this.isRevealed = true;

            const self = this;

            // Add fading class for smooth CSS background transition
            if (this.container) {
                this.container.classList.add('intro-fading');
            }

            // Trigger the existing invitation opening
            if (typeof this.options.onReveal === 'function') {
                try {
                    this.options.onReveal();
                } catch (e) {
                    console.error('[RosePetalHeart] onReveal execution error:', e);
                }
            }

            // Cleanup intro container after fade completes
            setTimeout(function () {
                self.destroy();
            }, 1100);
        },

        destroy: function () {
            this.isDestroyed = true;
            this.state = 'done';

            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
                this.animationFrameId = null;
            }

            if (this.container) {
                this.container.classList.add('intro-hidden');
            }

            // Clean up event listeners
            window.removeEventListener('resize', this._resizeHandler);
            window.removeEventListener('orientationchange', this._resizeHandler);
            window.removeEventListener('keydown', this._keyHandler);

            if (this.container && this._triggerHandler) {
                this.container.removeEventListener('pointerdown', this._triggerHandler);
                this.container.removeEventListener('touchstart', this._triggerHandler);
                this.container.removeEventListener('click', this._triggerHandler);
            }
            if (this.skipBtn && this._skipHandler) {
                this.skipBtn.removeEventListener('click', this._skipHandler);
            }

            // Free canvas resources
            if (this.canvas) {
                this.canvas.width = 1;
                this.canvas.height = 1;
            }
            this.petals = [];
            this.sparkles = [];
            this.petalSprites = [];
        },

        // Quadratic Bezier interpolation
        quadBezier: function (p0, p1, p2, t) {
            const oneMinusT = 1 - t;
            return oneMinusT * oneMinusT * p0 + 2 * oneMinusT * t * p1 + t * t * p2;
        },

        // Smooth cubic ease out
        easeOutCubic: function (t) {
            return 1 - Math.pow(1 - t, 3);
        },

        // Smooth cubic ease in out
        easeInOutCubic: function (t) {
            return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        },

        // Main 60 FPS Render Loop
        loop: function (currentTime) {
            if (this.isDestroyed) return;

            const self = this;
            this.animationFrameId = requestAnimationFrame(function (time) {
                self.loop(time);
            });

            if (!this.spritesReady) return;

            this.update(currentTime);
            this.render(currentTime);
        },

        update: function (now) {
            const self = this;

            // 1. Idle Floating State
            if (this.state === 'idle') {
                this.petals.forEach(function (p) {
                    const elapsed = now - self.startTime;
                    const sway = Math.sin(elapsed * p.idleSpeed + p.idlePhase) * p.idleRadius;
                    const driftY = Math.cos(elapsed * (p.idleSpeed * 0.8) + p.idlePhase) * (p.idleRadius * 0.7);

                    p.x = p.idleX + sway;
                    p.y = p.idleY + driftY;
                    p.rotation += p.idleRotSpeed;
                    p.pitch = Math.sin(elapsed * 0.001 + p.idlePhase) * 0.35;
                    p.yaw = Math.cos(elapsed * 0.0012 + p.idlePhase) * 0.35;
                });
            }

            // 2. Scattering State
            else if (this.state === 'scattering') {
                const elapsed = now - this.scatterStartTime;
                const rawProgress = Math.min(elapsed / this.options.scatterDuration, 1.0);
                const progress = this.easeOutCubic(rawProgress);

                this.petals.forEach(function (p) {
                    p.x = p.scatterStartX + (p.scatterEndX - p.scatterStartX) * progress;
                    p.y = p.scatterStartY + (p.scatterEndY - p.scatterStartY) * progress;
                    p.rotation = p.rotation + (p.scatterRot - p.rotation) * 0.08;
                    p.pitch = Math.sin(progress * Math.PI * 2) * 0.6;
                    p.yaw = Math.cos(progress * Math.PI * 2) * 0.6;
                });

                if (rawProgress >= 1.0) {
                    this.state = 'converging';
                    this.formationStartTime = now;
                }
            }

            // 3. Converging into Heart State
            else if (this.state === 'converging') {
                const elapsed = now - this.formationStartTime;
                let allArrived = true;

                this.petals.forEach(function (p) {
                    const petalElapsed = Math.max(0, elapsed - p.delay);
                    const rawProgress = Math.min(petalElapsed / p.convergeDuration, 1.0);
                    const progress = self.easeInOutCubic(rawProgress);

                    if (rawProgress < 1.0) {
                        allArrived = false;
                    }

                    p.x = self.quadBezier(p.scatterEndX, p.controlX, p.targetX, progress);
                    p.y = self.quadBezier(p.scatterEndY, p.controlY, p.targetY, progress);

                    // Interpolate orientation to target heart alignment
                    p.rotation = p.scatterRot + (p.targetRotation - p.scatterRot) * progress;
                    p.pitch = Math.sin((1 - progress) * Math.PI) * 0.4;
                    p.yaw = Math.cos((1 - progress) * Math.PI) * 0.4;
                });

                if (allArrived && elapsed >= this.options.convergenceDuration + 200) {
                    this.state = 'pulsing';
                    this.pulseStartTime = now;
                }
            }

            // 4. Heart Formed & Heartbeat Pulse State
            else if (this.state === 'pulsing') {
                const elapsed = now - this.pulseStartTime;

                // Double-thump heartbeat curve
                // Cycle: ~1100ms
                const cycle = (elapsed % 1100) / 1100;
                let pulseScale = 1.0;
                let pulseGlow = 0.2;

                if (cycle < 0.14) {
                    // First beat (strong)
                    const p = Math.sin((cycle / 0.14) * Math.PI);
                    pulseScale = 1.0 + 0.052 * p;
                    pulseGlow = 0.2 + 0.45 * p;
                } else if (cycle > 0.20 && cycle < 0.34) {
                    // Second beat (gentle echo)
                    const p = Math.sin(((cycle - 0.20) / 0.14) * Math.PI);
                    pulseScale = 1.0 + 0.032 * p;
                    pulseGlow = 0.2 + 0.28 * p;
                }

                this.currentHeartPulse = pulseScale;
                this.currentGlowIntensity = pulseGlow;

                // Petals have subtle breathing movement around their heart targets
                this.petals.forEach(function (p) {
                    const offsetX = (p.targetX - self.centerX) * (pulseScale - 1);
                    const offsetY = (p.targetY - self.centerY) * (pulseScale - 1);
                    p.x = p.targetX + offsetX;
                    p.y = p.targetY + offsetY;

                    // Subtle micro-wobble
                    p.rotation = p.targetRotation + Math.sin(elapsed * 0.002 + p.id) * 0.05;
                });

                // Pause on the formed heart until the user chooses to open.
                if (elapsed >= this.options.pulseDuration) {
                    this.showOpenPrompt();
                }
            }

            // 5. Revealing Transition
            else if (this.state === 'revealing') {
                const elapsed = now - this.revealStartTime;
                const rawProgress = Math.min(elapsed / this.options.revealDuration, 1.0);
                const progress = this.easeOutCubic(rawProgress);

                // Heart expands gently and fades
                const expandScale = 1.0 + progress * 0.14;
                const fadeOpacity = Math.max(0, 1.0 - progress * 1.35);

                this.petals.forEach(function (p) {
                    const offsetX = (p.targetX - self.centerX) * (expandScale - 1);
                    const offsetY = (p.targetY - self.centerY) * (expandScale - 1);
                    p.x = p.targetX + offsetX;
                    p.y = p.targetY + offsetY;
                    p.opacity = fadeOpacity;
                });
            }

            // Update ambient floating sparkles / fairy light particles
            this.sparkles.forEach(function (s) {
                s.y -= s.speedY;
                s.x += s.driftX;
                if (s.y < -10) {
                    s.y = self.height + 10;
                    s.x = Math.random() * self.width;
                }
            });
        },

        showOpenPrompt: function () {
            if (this.readyToOpen || this.isRevealed) return;
            this.readyToOpen = true;
            this.state = 'pulsing';
            if (this.namesEl) {
                this.namesEl.classList.add('is-visible');
            }
            if (this.copyEl) {
                this.copyEl.classList.add('is-visible');
            }
            if (this.promptEl) {
                // The final composition contains only the heart and the three
                // requested invitation lines below it.
                this.promptEl.classList.add('prompt-fade-out');
            }
        },

        render: function (now) {
            const ctx = this.ctx;
            ctx.clearRect(0, 0, this.width, this.height);

            // 1. Draw Romantic Ambient Glow behind the Heart
            if (this.state === 'pulsing' || this.state === 'converging' || this.state === 'revealing') {
                ctx.save();
                const glowRadius = Math.min(this.width * 0.45, 340);
                const glowIntensity = this.currentGlowIntensity || 0.25;
                const glowGrad = ctx.createRadialGradient(
                    this.centerX, this.centerY, 10,
                    this.centerX, this.centerY, glowRadius
                );
                glowGrad.addColorStop(0, 'rgba(255, 230, 200, ' + (glowIntensity * 0.8) + ')');
                glowGrad.addColorStop(0.4, 'rgba(248, 195, 170, ' + (glowIntensity * 0.45) + ')');
                glowGrad.addColorStop(1, 'rgba(254, 244, 233, 0)');

                ctx.fillStyle = glowGrad;
                ctx.beginPath();
                ctx.arc(this.centerX, this.centerY, glowRadius, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }

            // 2. Draw Floating Romantic Sparkles
            ctx.save();
            this.sparkles.forEach(function (s) {
                const pulse = Math.sin(now * s.pulseSpeed + s.pulsePhase) * 0.35 + 0.65;
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(215, 160, 115, ' + (s.alpha * pulse) + ')';
                ctx.shadowColor = 'rgba(255, 220, 180, 0.6)';
                ctx.shadowBlur = 6;
                ctx.fill();
            });
            ctx.restore();

            // 3. Draw All Rose Petals (ordered by layer/z for natural overlapping)
            for (let i = 0; i < this.petals.length; i++) {
                const p = this.petals[i];
                if (p.opacity <= 0.01) continue;

                ctx.save();
                ctx.translate(p.x, p.y);

                // 3D rotation simulation (pitch & yaw via transform)
                const scaleX = Math.cos(p.yaw || 0);
                const scaleY = Math.cos(p.pitch || 0);
                ctx.rotate(p.rotation);
                ctx.scale(scaleX, scaleY);

                ctx.globalAlpha = Math.min(Math.max(p.opacity, 0), 1);

                // Subtle soft shadow behind petal
                ctx.shadowColor = 'rgba(130, 80, 50, 0.16)';
                ctx.shadowBlur = 8;
                ctx.shadowOffsetX = 2;
                ctx.shadowOffsetY = 4;

                const drawSize = p.size;
                ctx.drawImage(
                    p.sprite,
                    -drawSize / 2,
                    -drawSize / 2,
                    drawSize,
                    drawSize
                );

                ctx.restore();
            }
        }
    };

    window.RosePetalHeartIntro = RosePetalHeartIntro;

})(window, document);
