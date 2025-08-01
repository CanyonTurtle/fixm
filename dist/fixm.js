/**
 * Fixm - Ultralight Cross-Platform Game Library
 * A minimalist game engine using WebGL for retro-style pixelated graphics
 */

(function() {
    'use strict';

    const Fixm = {
        canvas: null,
        gl: null,
        framebuffer: null,
        texture: null,
        program: null,
        width: 320,
        height: 240,
        mode: 'truecolor', // 'palette' or 'truecolor'
        expandableWidth: false,
        expandableHeight: false,
        minWidth: 320,
        minHeight: 240,
        palette: new Uint8Array(768), // 256 colors * 3 (RGB)
        buffer: null,
        audioContext: null,
        audioChannels: {},
        spritesheets: new Map(),
        initialized: false,
        
        // Text rendering system
        defaultFont: null,
        currentFont: null,
        
        // Event loop system
        updateCallback: null,
        running: false,
        lastTime: 0,
        loopId: 0,
        
        // Startup animation system
        showStartup: true,
        startupActive: false,
        startupTime: 0,
        startupDuration: 3000, // 3 seconds
        startupFadeOut: false,
        startupFadeTime: 0,
        startupFadeDuration: 800, // 800ms fade out
        
        // Input system
        keys: new Set(),
        gamepads: {},
        touchControls: null,
        showMobileControls: true,
        
        // Button bit flags
        BUTTON_UP: 0x01,
        BUTTON_DOWN: 0x02,
        BUTTON_LEFT: 0x04,
        BUTTON_RIGHT: 0x08,
        BUTTON_A: 0x10,
        BUTTON_B: 0x20,
        BUTTON_X: 0x40,
        BUTTON_Y: 0x80,
        
        // Default key mappings for player 0
        keyMappings: {
            0: {
                up: ['ArrowUp', 'KeyW'],
                down: ['ArrowDown', 'KeyS'],
                left: ['ArrowLeft', 'KeyA'],
                right: ['ArrowRight', 'KeyD'],
                a: ['KeyZ', 'Space'],
                b: ['KeyX', 'ShiftLeft'],
                x: ['KeyC', 'KeyN'],
                y: ['KeyV', 'KeyM']
            },
            1: {
                up: ['KeyI'],
                down: ['KeyK'],
                left: ['KeyJ'],
                right: ['KeyL'],
                a: ['KeyU'],
                b: ['KeyO'],
                x: ['KeyY'],
                y: ['KeyP']
            }
        }
    };

    // Teardown existing instance
    Fixm.teardown = function() {
        if (!this.initialized) return;

        // Stop event loop
        this.stopEventLoop();

        // Stop all audio channels
        for (let channel in this.audioChannels) {
            if (this.audioChannels[channel]) {
                this.audioChannels[channel].stop();
            }
        }
        this.audioChannels = {};

        // Close audio context
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }

        // Remove canvas from DOM
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }

        // Remove touch controls
        if (this.touchControls && this.touchControls.parentNode) {
            this.touchControls.parentNode.removeChild(this.touchControls);
        }

        // Remove injected CSS styles
        const styleElement = document.getElementById('fixm-default-styles');
        if (styleElement && styleElement.parentNode) {
            styleElement.parentNode.removeChild(styleElement);
        }

        // Remove fullscreen button
        const fullscreenButton = document.getElementById('fullscreen-toggle');
        if (fullscreenButton && fullscreenButton.parentNode) {
            fullscreenButton.parentNode.removeChild(fullscreenButton);
        }

        // Clear WebGL resources
        if (this.gl) {
            // Delete WebGL resources
            if (this.texture) this.gl.deleteTexture(this.texture);
            if (this.framebuffer) this.gl.deleteFramebuffer(this.framebuffer);
            if (this.program) this.gl.deleteProgram(this.program);
        }

        // Reset state
        this.canvas = null;
        this.gl = null;
        this.framebuffer = null;
        this.texture = null;
        this.program = null;
        this.buffer = null;
        this.audioContext = null;
        this.touchControls = null;
        this.keys.clear();
        this.gamepads = {};
        this.spritesheets.clear();
        this.running = false;
        this.initialized = false;
        this.startupActive = false;
        this.startupFadeOut = false;
        this.updateCallback = null;
        this.loopId++; // Increment to invalidate any pending requestAnimationFrame callbacks
    };

    // Calculate internal resolution based on container size and expandable settings
    Fixm.calculateInternalResolution = function() {
        // Get container dimensions - never modify the container
        const gameContainer = document.querySelector('.game-container');
        const container = gameContainer || document.body;
        const containerWidth = container.clientWidth || window.innerWidth;
        const containerHeight = container.clientHeight || window.innerHeight;
        
        // Start with minimum dimensions
        this.width = this.minWidth;
        this.height = this.minHeight;
        
        if (this.expandableWidth || this.expandableHeight) {
            if (this.expandableWidth && this.expandableHeight) {
                // Both expandable: find largest scale that fits, maintaining aspect ratio
                const scaleX = containerWidth / this.minWidth;
                const scaleY = containerHeight / this.minHeight;
                const scale = Math.min(scaleX, scaleY);
                
                if (scale >= 1) {
                    this.width = Math.floor(this.minWidth * scale);
                    this.height = Math.floor(this.minHeight * scale);
                }
            } else if (this.expandableWidth) {
                // Width expandable: height determines scale, width uses remaining space
                const scale = Math.max(1, containerHeight / this.minHeight);
                this.height = this.minHeight;
                this.width = Math.max(this.minWidth, Math.floor(containerWidth / scale));
            } else if (this.expandableHeight) {
                // Height expandable: width determines scale, height uses remaining space
                const scale = Math.max(1, containerWidth / this.minWidth);
                this.width = this.minWidth;
                this.height = Math.max(this.minHeight, Math.floor(containerHeight / scale));
            }
        }
    };

    // Inject default CSS styles for game container, canvas, and fullscreen button
    Fixm.injectDefaultCSS = function() {
        // Check if styles are already injected to avoid duplicates
        if (document.getElementById('fixm-default-styles')) {
            return;
        }

        const styleElement = document.createElement('style');
        styleElement.id = 'fixm-default-styles';
        styleElement.textContent = `
            body, html {
                margin: 0;
                padding: 0;
                background: #000;
                overflow: hidden;
            }
            
            .game-container {
                width: 100vw;
                height: 100vh;
                display: flex;
                justify-content: center;
                align-items: center;
            }
            
            canvas {
                max-width: 100vw;
                max-height: 100vh;
                image-rendering: pixelated;
                image-rendering: crisp-edges;
                outline: 0px;
            }
            
            /* Fullscreen toggle button */
            .fullscreen-toggle {
                position: fixed;
                top: 20px;
                right: 20px;
                width: 40px;
                height: 40px;
                background: rgba(0, 0, 0, 0.6);
                border: 2px solid rgba(255, 255, 255, 0.3);
                border-radius: 8px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 2000;
                transition: all 0.2s ease;
                user-select: none;
                touch-action: manipulation;
            }
            
            .fullscreen-toggle:hover {
                background: rgba(0, 0, 0, 0.8);
                border-color: rgba(255, 255, 255, 0.6);
                transform: scale(1.1);
            }
            
            .fullscreen-toggle:active {
                transform: scale(0.95);
            }
            
            .fullscreen-toggle svg {
                width: 20px;
                height: 20px;
                fill: rgba(255, 255, 255, 0.8);
            }
            
            .fullscreen-toggle:hover svg {
                fill: rgba(255, 255, 255, 1);
            }
            
            /* Hide fullscreen button when already in fullscreen */
            .fullscreen-active .fullscreen-toggle {
                opacity: 0.5;
            }
            
            .fullscreen-active .fullscreen-toggle:hover {
                opacity: 1;
            }
        `;

        document.head.appendChild(styleElement);
        
        // Create fullscreen button now that styles are loaded
        this.createFullscreenButton();
    };

    // Create fullscreen toggle button programmatically
    Fixm.createFullscreenButton = function() {
        // Remove existing fullscreen button if it exists
        const existingButton = document.querySelector('.fullscreen-toggle');
        if (existingButton && existingButton.parentNode) {
            existingButton.parentNode.removeChild(existingButton);
        }

        // Create fullscreen button
        const fullscreenButton = document.createElement('div');
        fullscreenButton.className = 'fullscreen-toggle';
        fullscreenButton.id = 'fullscreen-toggle';
        fullscreenButton.title = 'Toggle Fullscreen';

        // Create SVG icon
        fullscreenButton.innerHTML = `
            <svg viewBox="0 0 24 24">
                <path id="fullscreen-icon" d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
            </svg>
        `;

        // Add to document body
        document.body.appendChild(fullscreenButton);

        // Set up fullscreen functionality
        this.setupFullscreenEvents();
    };

    // Set up fullscreen event listeners
    Fixm.setupFullscreenEvents = function() {
        let isFullscreen = false;

        const toggleFullscreen = () => {
            if (!isFullscreen) {
                // Enter fullscreen
                const element = document.documentElement;
                if (element.requestFullscreen) {
                    element.requestFullscreen();
                } else if (element.webkitRequestFullscreen) {
                    element.webkitRequestFullscreen();
                } else if (element.mozRequestFullScreen) {
                    element.mozRequestFullScreen();
                } else if (element.msRequestFullscreen) {
                    element.msRequestFullscreen();
                }
            } else {
                // Exit fullscreen
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                } else if (document.mozCancelFullScreen) {
                    document.mozCancelFullScreen();
                } else if (document.msExitFullscreen) {
                    document.msExitFullscreen();
                }
            }
        };

        const updateFullscreenState = () => {
            isFullscreen = !!(document.fullscreenElement || 
                             document.webkitFullscreenElement || 
                             document.mozFullScreenElement || 
                             document.msFullscreenElement);
            
            document.body.classList.toggle('fullscreen-active', isFullscreen);
            
            // Update icon
            const icon = document.getElementById('fullscreen-icon');
            if (icon) {
                if (isFullscreen) {
                    // Exit fullscreen icon
                    icon.setAttribute('d', 'M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z');
                } else {
                    // Enter fullscreen icon
                    icon.setAttribute('d', 'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z');
                }
            }
        };

        // Fullscreen event listeners
        const fullscreenButton = document.getElementById('fullscreen-toggle');
        if (fullscreenButton) {
            fullscreenButton.addEventListener('click', toggleFullscreen);
            fullscreenButton.addEventListener('touchstart', (e) => {
                e.preventDefault();
                toggleFullscreen();
            });
        }

        // Listen for fullscreen changes
        document.addEventListener('fullscreenchange', updateFullscreenState);
        document.addEventListener('webkitfullscreenchange', updateFullscreenState);
        document.addEventListener('mozfullscreenchange', updateFullscreenState);
        document.addEventListener('MSFullscreenChange', updateFullscreenState);

        // Escape key handling
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isFullscreen) {
                toggleFullscreen();
            }
        });

        // Handle Android back button
        window.addEventListener('popstate', (e) => {
            if (isFullscreen) {
                e.preventDefault();
                toggleFullscreen();
                history.pushState(null, null, location.href);
            }
        });

        // Push state to handle back button on mobile
        if (history.pushState) {
            history.pushState(null, null, location.href);
        }
    };

    // Initialize the graphics system
    Fixm.init = function(options = {}) {
        // Preserve update callback during reinitialization
        let preservedUpdateCallback = null;
        if (this.initialized) {
            preservedUpdateCallback = this.updateCallback;
            this.teardown();
        }

        this.minWidth = options.width || 320;
        this.minHeight = options.height || 240;
        this.mode = options.mode || 'truecolor';
        this.expandableWidth = options.expandableWidth || false;
        this.expandableHeight = options.expandableHeight || false;
        this.showStartup = options.showStartup !== false; // Default to true unless explicitly false
        
        // Calculate internal resolution based on expandable settings
        this.calculateInternalResolution();

        // Inject default CSS styles
        this.injectDefaultCSS();

        // Create canvas
        this.canvas = document.createElement('canvas');
        this.canvas.style.imageRendering = 'pixelated';
        this.canvas.style.imageRendering = 'crisp-edges';
        
        // Append to game container if it exists, otherwise body
        const gameContainer = document.querySelector('.game-container');
        if (gameContainer) {
            gameContainer.appendChild(this.canvas);
        } else {
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            this.canvas.style.objectFit = 'contain';
            document.body.appendChild(this.canvas);
        }

        // Get WebGL context
        this.gl = this.canvas.getContext('webgl') || this.canvas.getContext('experimental-webgl');
        if (!this.gl) {
            throw new Error('WebGL not supported');
        }

        this.setupWebGL();
        this.setupAudio();
        this.setupSpritesheetComponents();
        this.setupInput();
        this.setupMobileControls();
        this.setupFont();
        this.resize();

        window.addEventListener('resize', () => this.resize());
        this.initialized = true;
        
        // Start with startup animation if enabled
        if (this.showStartup) {
            this.startupActive = true;
            this.startupTime = 0;
            this.startupFadeOut = false;
            this.startupFadeTime = 0;
            this.playStartupSound();
        }
        
        // Restore update callback if we're reinitializing
        if (preservedUpdateCallback) {
            this.updateCallback = preservedUpdateCallback;
        }
        
        // Only start event loop if we have an update callback
        if (this.updateCallback) {
            this.startEventLoop();
        }
    };

    Fixm.setupWebGL = function() {
        const gl = this.gl;

        // Create shaders
        const vertexShaderSource = `
            attribute vec2 a_position;
            attribute vec2 a_texCoord;
            varying vec2 v_texCoord;
            void main() {
                gl_Position = vec4(a_position, 0.0, 1.0);
                v_texCoord = a_texCoord;
            }
        `;

        const fragmentShaderSource = `
            precision mediump float;
            uniform sampler2D u_texture;
            varying vec2 v_texCoord;
            void main() {
                gl_FragColor = texture2D(u_texture, v_texCoord);
            }
        `;

        const vertexShader = this.createShader(gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);

        this.program = gl.createProgram();
        gl.attachShader(this.program, vertexShader);
        gl.attachShader(this.program, fragmentShader);
        gl.linkProgram(this.program);

        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            throw new Error('Program link failed: ' + gl.getProgramInfoLog(this.program));
        }

        // Create framebuffer texture
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

        // Create vertex buffer
        const vertices = new Float32Array([
            -1, -1, 0, 1,
             1, -1, 1, 1,
            -1,  1, 0, 0,
             1,  1, 1, 0
        ]);

        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        // Setup attributes
        const positionLocation = gl.getAttribLocation(this.program, 'a_position');
        const texCoordLocation = gl.getAttribLocation(this.program, 'a_texCoord');

        gl.enableVertexAttribArray(positionLocation);
        gl.enableVertexAttribArray(texCoordLocation);

        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 16, 0);
        gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 16, 8);

        // Create pixel buffer
        const bufferSize = this.mode === 'palette' ? this.width * this.height : this.width * this.height * 4;
        this.buffer = new Uint8Array(bufferSize);

        // Set default palette (grayscale)
        for (let i = 0; i < 256; i++) {
            this.palette[i * 3] = i;
            this.palette[i * 3 + 1] = i;
            this.palette[i * 3 + 2] = i;
        }
    };

    Fixm.createShader = function(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            throw new Error('Shader compile failed: ' + gl.getShaderInfoLog(shader));
        }

        return shader;
    };

    Fixm.setupAudio = function() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('Audio not supported');
        }
    };

    Fixm.setupSpritesheetComponents = function() {
        class FixmSpritesheet extends HTMLElement {
            connectedCallback() {
                const img = this.querySelector('img');
                if (img) {
                    const name = this.getAttribute('name') || 'default';
                    
                    // Wait for image to load if it hasn't already
                    if (img.complete) {
                        Fixm.spritesheets.set(name, img);
                    } else {
                        img.onload = () => {
                            Fixm.spritesheets.set(name, img);
                        };
                    }
                }
            }
        }

        if (!customElements.get('fixm-spritesheet')) {
            customElements.define('fixm-spritesheet', FixmSpritesheet);
        }
        
        // Process any existing spritesheet elements that might already be in the DOM
        setTimeout(() => {
            const existingSpritesheets = document.querySelectorAll('fixm-spritesheet');
            existingSpritesheets.forEach(element => {
                const img = element.querySelector('img');
                if (img) {
                    const name = element.getAttribute('name') || 'default';
                    if (img.complete) {
                        Fixm.spritesheets.set(name, img);
                    } else {
                        img.onload = () => {
                            Fixm.spritesheets.set(name, img);
                        };
                    }
                }
            });
        }, 0);
    };

    // Input system setup
    Fixm.setupInput = function() {
        // Keyboard events
        document.addEventListener('keydown', (e) => {
            this.keys.add(e.code);
            e.preventDefault();
        });
        
        document.addEventListener('keyup', (e) => {
            this.keys.delete(e.code);
            e.preventDefault();
        });
        
        // Prevent context menu on canvas
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        
        // Focus canvas to receive keyboard events
        this.canvas.tabIndex = 1;
        this.canvas.focus();
    };

    // Mobile touch controls setup
    Fixm.setupMobileControls = function() {
        if (!this.showMobileControls) return;
        
        // Detect if we're on a mobile device
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                         ('ontouchstart' in window);
        
        if (!isMobile) return;
        
        // Create touch controls overlay
        this.touchControls = document.createElement('div');
        this.touchControls.id = 'fixm-touch-controls';
        this.touchControls.innerHTML = `
            <div class="dpad">
                <div class="dpad-up" data-button="up">▲</div>
                <div class="dpad-left" data-button="left">◀</div>
                <div class="dpad-center"></div>
                <div class="dpad-right" data-button="right">▶</div>
                <div class="dpad-down" data-button="down">▼</div>
            </div>
            <div class="action-buttons">
                <div class="btn btn-y" data-button="y">Y</div>
                <div class="btn btn-x" data-button="x">X</div>
                <div class="btn btn-b" data-button="b">B</div>
                <div class="btn btn-a" data-button="a">A</div>
            </div>
        `;
        
        // Add CSS for touch controls
        if (!document.getElementById('fixm-touch-styles')) {
            const style = document.createElement('style');
            style.id = 'fixm-touch-styles';
            style.textContent = `
                #fixm-touch-controls {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    pointer-events: none;
                    z-index: 10;
                    font-family: monospace;
                    user-select: none;
                }
                
                .dpad, .action-buttons {
                    position: absolute;
                    pointer-events: all;
                }
                
                .dpad {
                    bottom: 20px;
                    left: 20px;
                    width: 120px;
                    height: 120px;
                    display: grid;
                    grid-template-columns: 1fr 1fr 1fr;
                    grid-template-rows: 1fr 1fr 1fr;
                    gap: 2px;
                }
                
                .dpad > div {
                    background: rgba(0, 0, 0, 0.3);
                    border: 2px solid rgba(255, 255, 255, 0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-size: 20px;
                    border-radius: 8px;
                    touch-action: none;
                }
                
                .dpad-up { grid-column: 2; grid-row: 1; }
                .dpad-left { grid-column: 1; grid-row: 2; }
                .dpad-center { grid-column: 2; grid-row: 2; background: transparent; border: none; }
                .dpad-right { grid-column: 3; grid-row: 2; }
                .dpad-down { grid-column: 2; grid-row: 3; }
                
                .action-buttons {
                    bottom: 20px;
                    right: 20px;
                    width: 120px;
                    height: 120px;
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    grid-template-rows: 1fr 1fr;
                    gap: 8px;
                }
                
                .btn {
                    background: rgba(0, 0, 0, 0.3);
                    border: 2px solid rgba(255, 255, 255, 0.3);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-size: 16px;
                    font-weight: bold;
                    touch-action: none;
                }
                
                .btn-y { grid-column: 1; grid-row: 1; }
                .btn-x { grid-column: 2; grid-row: 1; }
                .btn-b { grid-column: 1; grid-row: 2; }
                .btn-a { grid-column: 2; grid-row: 2; }
                
                .dpad > div.active, .btn.active {
                    background: rgba(255, 255, 255, 0.3);
                    border-color: rgba(255, 255, 255, 0.8);
                    transform: scale(0.95);
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(this.touchControls);
        
        // Touch event handlers with proper drag-off handling
        let activeTouchButtons = new Set();
        
        const updateTouchButtons = (e) => {
            e.preventDefault();
            
            // Get all currently touched buttons
            const currentlyTouched = new Set();
            
            for (let touch of e.touches || []) {
                const element = document.elementFromPoint(touch.clientX, touch.clientY);
                if (element && element.dataset.button) {
                    currentlyTouched.add(element.dataset.button);
                }
            }
            
            // Remove buttons that are no longer being touched
            for (let button of activeTouchButtons) {
                if (!currentlyTouched.has(button)) {
                    // Find the button element and deactivate it
                    const buttonElement = this.touchControls.querySelector(`[data-button="${button}"]`);
                    if (buttonElement) {
                        buttonElement.classList.remove('active');
                        this.simulateKeyUp(button, 0);
                    }
                }
            }
            
            // Add newly touched buttons
            for (let button of currentlyTouched) {
                if (!activeTouchButtons.has(button)) {
                    // Find the button element and activate it
                    const buttonElement = this.touchControls.querySelector(`[data-button="${button}"]`);
                    if (buttonElement) {
                        buttonElement.classList.add('active');
                        this.simulateKeyDown(button, 0);
                    }
                }
            }
            
            // Update our tracking set
            activeTouchButtons = currentlyTouched;
        };
        
        const clearAllTouches = (e) => {
            e.preventDefault();
            
            // Clear all active buttons
            for (let button of activeTouchButtons) {
                const buttonElement = this.touchControls.querySelector(`[data-button="${button}"]`);
                if (buttonElement) {
                    buttonElement.classList.remove('active');
                    this.simulateKeyUp(button, 0);
                }
            }
            
            activeTouchButtons.clear();
        };
        
        this.touchControls.addEventListener('touchstart', updateTouchButtons);
        this.touchControls.addEventListener('touchmove', updateTouchButtons);
        this.touchControls.addEventListener('touchend', clearAllTouches);
        this.touchControls.addEventListener('touchcancel', clearAllTouches);
    };

    // Simulate key events for touch controls
    Fixm.simulateKeyDown = function(button, player) {
        if (!this.gamepads[player]) this.gamepads[player] = 0;
        this.gamepads[player] |= this['BUTTON_' + button.toUpperCase()];
    };

    Fixm.simulateKeyUp = function(button, player) {
        if (!this.gamepads[player]) this.gamepads[player] = 0;
        this.gamepads[player] &= ~this['BUTTON_' + button.toUpperCase()];
    };

    Fixm.resize = function() {
        // Recalculate internal resolution based on current container size
        const oldWidth = this.width;
        const oldHeight = this.height;
        this.calculateInternalResolution();
        
        // Recreate buffer if resolution changed
        if (oldWidth !== this.width || oldHeight !== this.height) {
            if (this.mode === 'palette') {
                this.buffer = new Uint8Array(this.width * this.height);
            } else {
                this.buffer = new Uint8Array(this.width * this.height * 4);
            }
        }

        // Get container dimensions
        const container = this.canvas.parentElement || document.body;
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;

        // Set canvas internal resolution
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        
        // Calculate the largest scale that fits the canvas in the container
        const scale = Math.max(1, Math.min(containerWidth / this.width, containerHeight / this.height));
        
        // Set canvas display size (this creates the black bars automatically)
        this.canvas.style.width = (this.width * scale) + 'px';
        this.canvas.style.height = (this.height * scale) + 'px';

        if (this.gl) {
            this.gl.viewport(0, 0, this.width, this.height);
        }
    };

    // Drawing functions
    Fixm.clear = function(color = 0) {
        if (this.mode === 'palette') {
            this.buffer.fill(color);
        } else {
            const r = (color >> 16) & 0xFF;
            const g = (color >> 8) & 0xFF;
            const b = color & 0xFF;
            for (let i = 0; i < this.buffer.length; i += 4) {
                this.buffer[i] = r;
                this.buffer[i + 1] = g;
                this.buffer[i + 2] = b;
                this.buffer[i + 3] = 255;
            }
        }
    };

    Fixm.setPixel = function(x, y, color) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;

        if (this.mode === 'palette') {
            this.buffer[y * this.width + x] = color;
        } else {
            const offset = (y * this.width + x) * 4;
            this.buffer[offset] = (color >> 16) & 0xFF;
            this.buffer[offset + 1] = (color >> 8) & 0xFF;
            this.buffer[offset + 2] = color & 0xFF;
            this.buffer[offset + 3] = 255;
        }
    };

    Fixm.drawRect = function(x, y, width, height, color) {
        for (let dy = 0; dy < height; dy++) {
            for (let dx = 0; dx < width; dx++) {
                this.setPixel(x + dx, y + dy, color);
            }
        }
    };

    Fixm.blitSub = function(sx, sy, sw, sh, dx, dy, spritesheetName = 'default') {
        const spritesheet = this.spritesheets.get(spritesheetName);
        if (!spritesheet) return;

        // Create a temporary canvas to extract pixel data from the spritesheet
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = sw;
        tempCanvas.height = sh;

        tempCtx.drawImage(spritesheet, sx, sy, sw, sh, 0, 0, sw, sh);
        const imageData = tempCtx.getImageData(0, 0, sw, sh);

        for (let y = 0; y < sh; y++) {
            for (let x = 0; x < sw; x++) {
                const srcOffset = (y * sw + x) * 4;
                const r = imageData.data[srcOffset];
                const g = imageData.data[srcOffset + 1];
                const b = imageData.data[srcOffset + 2];
                const a = imageData.data[srcOffset + 3];

                if (a > 0) { // Skip transparent pixels
                    const color = (r << 16) | (g << 8) | b;
                    this.setPixel(dx + x, dy + y, color);
                }
            }
        }
    };

    // Get image information (dimensions) for a spritesheet
    Fixm.getImageInfo = function(spritesheetName = 'default') {
        const spritesheet = this.spritesheets.get(spritesheetName);
        if (!spritesheet) {
            return null;
        }

        return {
            width: spritesheet.naturalWidth || spritesheet.width,
            height: spritesheet.naturalHeight || spritesheet.height,
            name: spritesheetName
        };
    };

    // Get current screen dimensions (internal resolution)
    Fixm.getScreenSize = function() {
        return {
            width: this.width,
            height: this.height
        };
    };

    // Font and text rendering system
    Fixm.setupFont = function() {
        // Default 8x8 bitmap font (each character is 8 bytes, 1 bit per pixel)
        this.defaultFont = {
            width: 8,
            height: 8,
            spacing: 1,
            data: {
                'A': [0x70,0x88,0x88,0xF8,0x88,0x88,0x88,0x00],
                'B': [0xF0,0x88,0x88,0xF0,0x88,0x88,0xF0,0x00],
                'C': [0x70,0x88,0x80,0x80,0x80,0x88,0x70,0x00],
                'D': [0xF0,0x88,0x88,0x88,0x88,0x88,0xF0,0x00],
                'E': [0xF8,0x80,0x80,0xF0,0x80,0x80,0xF8,0x00],
                'F': [0xF8,0x80,0x80,0xF0,0x80,0x80,0x80,0x00],
                'G': [0x70,0x88,0x80,0x98,0x88,0x88,0x70,0x00],
                'H': [0x88,0x88,0x88,0xF8,0x88,0x88,0x88,0x00],
                'I': [0x70,0x20,0x20,0x20,0x20,0x20,0x70,0x00],
                'J': [0x38,0x08,0x08,0x08,0x88,0x88,0x70,0x00],
                'K': [0x88,0x90,0xA0,0xC0,0xA0,0x90,0x88,0x00],
                'L': [0x80,0x80,0x80,0x80,0x80,0x80,0xF8,0x00],
                'M': [0x88,0xD8,0xA8,0x88,0x88,0x88,0x88,0x00],
                'N': [0x88,0xC8,0xA8,0x98,0x88,0x88,0x88,0x00],
                'O': [0x70,0x88,0x88,0x88,0x88,0x88,0x70,0x00],
                'P': [0xF0,0x88,0x88,0xF0,0x80,0x80,0x80,0x00],
                'Q': [0x70,0x88,0x88,0x88,0xA8,0x90,0x68,0x00],
                'R': [0xF0,0x88,0x88,0xF0,0xA0,0x90,0x88,0x00],
                'S': [0x70,0x88,0x80,0x70,0x08,0x88,0x70,0x00],
                'T': [0xF8,0x20,0x20,0x20,0x20,0x20,0x20,0x00],
                'U': [0x88,0x88,0x88,0x88,0x88,0x88,0x70,0x00],
                'V': [0x88,0x88,0x88,0x88,0x50,0x20,0x20,0x00],
                'W': [0x88,0x88,0x88,0xA8,0xA8,0xD8,0x88,0x00],
                'X': [0x88,0x50,0x20,0x20,0x50,0x88,0x88,0x00],
                'Y': [0x88,0x88,0x50,0x20,0x20,0x20,0x20,0x00],
                'Z': [0xF8,0x08,0x10,0x20,0x40,0x80,0xF8,0x00],
                '0': [0x70,0x88,0x98,0xA8,0xC8,0x88,0x70,0x00],
                '1': [0x20,0x60,0x20,0x20,0x20,0x20,0x70,0x00],
                '2': [0x70,0x88,0x08,0x30,0x40,0x80,0xF8,0x00],
                '3': [0x70,0x88,0x08,0x30,0x08,0x88,0x70,0x00],
                '4': [0x10,0x30,0x50,0x90,0xF8,0x10,0x10,0x00],
                '5': [0xF8,0x80,0xF0,0x08,0x08,0x88,0x70,0x00],
                '6': [0x30,0x40,0x80,0xF0,0x88,0x88,0x70,0x00],
                '7': [0xF8,0x08,0x10,0x20,0x40,0x40,0x40,0x00],
                '8': [0x70,0x88,0x88,0x70,0x88,0x88,0x70,0x00],
                '9': [0x70,0x88,0x88,0x78,0x08,0x10,0x60,0x00],
                ' ': [0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00],
                '.': [0x00,0x00,0x00,0x00,0x00,0x60,0x60,0x00],
                ',': [0x00,0x00,0x00,0x00,0x00,0x60,0x20,0x40],
                ':': [0x00,0x60,0x60,0x00,0x60,0x60,0x00,0x00],
                ';': [0x00,0x60,0x60,0x00,0x60,0x20,0x40,0x00],
                '!': [0x20,0x20,0x20,0x20,0x20,0x00,0x20,0x00],
                '?': [0x70,0x88,0x08,0x30,0x20,0x00,0x20,0x00],
                '+': [0x00,0x20,0x20,0xF8,0x20,0x20,0x00,0x00],
                '-': [0x00,0x00,0x00,0xF8,0x00,0x00,0x00,0x00],
                '*': [0x00,0x88,0x50,0x20,0x50,0x88,0x00,0x00],
                '/': [0x08,0x08,0x10,0x20,0x40,0x80,0x80,0x00],
                '\\': [0x80,0x80,0x40,0x20,0x10,0x08,0x08,0x00],
                '(': [0x10,0x20,0x40,0x40,0x40,0x20,0x10,0x00],
                ')': [0x40,0x20,0x10,0x10,0x10,0x20,0x40,0x00],
                '[': [0x70,0x40,0x40,0x40,0x40,0x40,0x70,0x00],
                ']': [0x70,0x10,0x10,0x10,0x10,0x10,0x70,0x00],
                '>': [0x10,0x20,0x40,0x80,0x40,0x20,0x10,0x00],
                '<': [0x80,0x40,0x20,0x10,0x20,0x40,0x80,0x00],
                '=': [0x00,0x00,0xF8,0x00,0xF8,0x00,0x00,0x00],
                '_': [0x00,0x00,0x00,0x00,0x00,0x00,0xF8,0x00],
                '|': [0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x00],
                '"': [0x50,0x50,0x50,0x00,0x00,0x00,0x00,0x00],
                "'": [0x20,0x20,0x20,0x00,0x00,0x00,0x00,0x00],
                '#': [0x50,0x50,0xF8,0x50,0xF8,0x50,0x50,0x00],
                '%': [0xC0,0xC8,0x10,0x20,0x40,0x98,0x18,0x00],
                '&': [0x40,0xA0,0x40,0xA8,0x90,0x98,0x60,0x00],
                '@': [0x70,0x88,0xB8,0xA8,0xB8,0x80,0x78,0x00]
            }
        };
        
        // Set default font as current
        this.currentFont = this.defaultFont;
    };

    Fixm.drawChar = function(char, x, y, color) {
        const font = this.currentFont || this.defaultFont;
        if (!font) return;
        
        // Get character pattern, fallback to space if not found
        const upperChar = char.toUpperCase();
        const pattern = font.data[upperChar] || font.data[' '] || font.data['?'] || [0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00];
        
        // Draw the character bitmap
        for (let row = 0; row < font.height; row++) {
            const rowData = pattern[row] || 0;
            for (let col = 0; col < font.width; col++) {
                if (rowData & (0x80 >> col)) {
                    this.setPixel(x + col, y + row, color);
                }
            }
        }
    };

    Fixm.drawText = function(text, x, y, color) {
        if (!text) return;
        
        const font = this.currentFont || this.defaultFont;
        if (!font) return;
        
        let currentX = x;
        
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            
            // Handle newlines
            if (char === '\n') {
                currentX = x;
                y += font.height + font.spacing;
                continue;
            }
            
            // Draw the character
            this.drawChar(char, currentX, y, color);
            
            // Move to next character position
            currentX += font.width + font.spacing;
        }
    };

    Fixm.setFont = function(fontData) {
        // Validate font data structure
        if (!fontData || typeof fontData !== 'object') {
            console.warn('Invalid font data provided, keeping current font');
            return;
        }
        
        // Set defaults for missing properties
        this.currentFont = {
            width: fontData.width || 8,
            height: fontData.height || 8,
            spacing: fontData.spacing !== undefined ? fontData.spacing : 1,
            data: fontData.data || {}
        };
        
        // Ensure we have at least a space character
        if (!this.currentFont.data[' ']) {
            this.currentFont.data[' '] = new Array(this.currentFont.height).fill(0);
        }
    };

    Fixm.resetFont = function() {
        this.currentFont = this.defaultFont;
    };

    // Startup animation system
    Fixm.playStartupSound = function() {
        if (!this.audioContext) return;
        
        // Play a nice startup chord progression
        const frequencies = [523, 659, 784]; // C5, E5, G5 - major chord
        
        frequencies.forEach((freq, index) => {
            setTimeout(() => {
                this.channelSet(index, freq, 'sine');
                setTimeout(() => this.channelSet(index, 0), 400);
            }, index * 100);
        });
        
        // Final high note
        setTimeout(() => {
            this.channelSet(0, 1047, 'sine'); // C6
            setTimeout(() => this.channelSet(0, 0), 600);
        }, 800);
    };

    Fixm.renderStartupAnimation = function(deltaTime) {
        this.startupTime += deltaTime;
        const progress = this.startupTime / this.startupDuration;
        
        // Clear with subtle gradient background (no flashing)
        const bgBase = 16; // Dark blue base
        const bgVariation = Math.floor(Math.sin(this.startupTime * 0.001) * 8 + 8); // Gentle variation
        this.clear((bgBase << 16) | ((bgBase + bgVariation) << 8) | (bgBase * 3));
        
        // Draw animated particles (avoiding text area)
        for (let i = 0; i < 20; i++) {
            const angle = (this.startupTime * 0.002 + i * 0.314) % (Math.PI * 2);
            
            // Create two radius ranges: inner ring and outer ring to avoid text
            const isOuterRing = i % 2 === 0;
            const baseRadius = isOuterRing ? 80 : 25; // Outer or inner ring
            const radiusVariation = Math.sin(this.startupTime * 0.003 + i) * 10;
            const radius = baseRadius + radiusVariation;
            
            const x = this.width / 2 + Math.cos(angle) * radius;
            const y = this.height / 2 + Math.sin(angle) * radius;
            const size = 2 + Math.sin(this.startupTime * 0.004 + i) * 1.5;
            
            // Skip particles that would overlap with text area (center region)
            const textCenterX = this.width / 2;
            const textCenterY = this.height / 2;
            const distanceFromTextCenter = Math.sqrt((x - textCenterX) ** 2 + (y - textCenterY) ** 2);
            
            if (distanceFromTextCenter > 35) { // Only draw if outside text area
                // Colorful particles with softer colors
                const hue = (i * 45 + this.startupTime * 0.08) % 360;
                const color = this.hslToRgb(hue, 0.7, 0.5);
                
                this.drawRect(Math.floor(x), Math.floor(y), Math.floor(size), Math.floor(size), color);
            }
        }
        
        // Animate FIXM text
        const textProgress = Math.max(0, (progress - 0.1) * 2.0); // Start text after 10% and animate 2x faster
        
        if (textProgress > 0) {
            // FIXM letters animate in one by one
            const letters = ['F', 'I', 'X', 'M'];
            const letterSpacing = 20;
            const startX = this.width / 2 - (letters.length * letterSpacing) / 2;
            
            letters.forEach((letter, index) => {
                const letterProgress = Math.max(0, Math.min(1, textProgress * 6 - index * 0.8)); // Faster cascade
                
                if (letterProgress > 0) {
                    // Letter slides in from above with bounce
                    const bounceY = Math.sin(letterProgress * Math.PI) * 15;
                    const finalY = this.height / 2 - 20;
                    const y = finalY - (1 - letterProgress) * 60 + bounceY;
                    
                    // Distinct colors for letters - bright neon colors different from particles
                    const letterColors = [
                        0xFF0080, // Hot pink/magenta
                        0x00FF80, // Bright green  
                        0x8000FF, // Electric purple
                        0xFF8000  // Bright orange
                    ];
                    const color = letterColors[index];
                    
                    // Scale effect
                    const scale = 0.5 + letterProgress * 0.5;
                    
                    // Draw letter with scale effect (simplified - just draw multiple times for effect)
                    for (let sx = 0; sx < scale * 2; sx++) {
                        for (let sy = 0; sy < scale * 2; sy++) {
                            this.drawChar(letter, 
                                Math.floor(startX + index * letterSpacing + sx), 
                                Math.floor(y + sy), 
                                color);
                        }
                    }
                }
            });
            
            // Subtitle appears after main text
            if (textProgress > 0.7) {
                const subtitleProgress = (textProgress - 0.7) / 0.3;
                const intensity = Math.floor(subtitleProgress * 255);
                const subtitleColor = (intensity << 16) | (intensity << 8) | intensity; // Gray with fade-in
                
                this.drawText('GAME LIBRARY', this.width / 2 - 44, this.height / 2 + 20, subtitleColor);
            }
        }
        
        // Check if animation is complete or should start fade-out
        if (progress >= 1.0 && !this.startupFadeOut) {
            this.startupFadeOut = true;
            this.startupFadeTime = 0;
        }
        
        // Handle fade-out phase
        if (this.startupFadeOut) {
            this.startupFadeTime += deltaTime;
            const fadeProgress = this.startupFadeTime / this.startupFadeDuration;
            
            if (fadeProgress >= 1.0) {
                // Fade-out complete, end animation
                this.startupActive = false;
                this.startupFadeOut = false;
                this.startupFadeTime = 0;
            } else {
                // Simple fade-out: draw a black rectangle with increasing opacity
                const alpha = Math.floor(fadeProgress * 255);
                const fadeColor = alpha << 24; // Black with alpha
                
                // Draw fade overlay as black rectangles
                for (let y = 0; y < this.height; y++) {
                    for (let x = 0; x < this.width; x++) {
                        const fadeAmount = 1.0 - fadeProgress;
                        const originalOffset = (y * this.width + x) * 4;
                        
                        // Blend with black based on fade progress
                        const r = Math.floor(this.buffer[originalOffset] * fadeAmount);
                        const g = Math.floor(this.buffer[originalOffset + 1] * fadeAmount);
                        const b = Math.floor(this.buffer[originalOffset + 2] * fadeAmount);
                        
                        this.setPixel(x, y, (r << 16) | (g << 8) | b);
                    }
                }
            }
        }
    };

    // Helper function to convert HSL to RGB
    Fixm.hslToRgb = function(h, s, l) {
        h /= 360;
        const a = s * Math.min(l, 1 - l);
        const f = n => {
            const k = (n + h / (1/12)) % 1;
            return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        };
        
        const r = Math.floor(f(0) * 255);
        const g = Math.floor(f(8) * 255);
        const b = Math.floor(f(4) * 255);
        
        return (r << 16) | (g << 8) | b;
    };

    // Input functions
    Fixm.getGamepad = function(player = 0) {
        // Initialize player gamepad state if not exists
        if (!this.gamepads[player]) {
            this.gamepads[player] = 0;
        }
        
        // Get key mappings for this player
        const mapping = this.keyMappings[player];
        if (!mapping) return this.gamepads[player]; // Return touch/simulated input only
        
        let gamepadState = this.gamepads[player]; // Start with touch controls state
        
        // Check keyboard inputs and combine with touch inputs
        if (mapping.up && mapping.up.some(key => this.keys.has(key))) {
            gamepadState |= this.BUTTON_UP;
        }
        if (mapping.down && mapping.down.some(key => this.keys.has(key))) {
            gamepadState |= this.BUTTON_DOWN;
        }
        if (mapping.left && mapping.left.some(key => this.keys.has(key))) {
            gamepadState |= this.BUTTON_LEFT;
        }
        if (mapping.right && mapping.right.some(key => this.keys.has(key))) {
            gamepadState |= this.BUTTON_RIGHT;
        }
        if (mapping.a && mapping.a.some(key => this.keys.has(key))) {
            gamepadState |= this.BUTTON_A;
        }
        if (mapping.b && mapping.b.some(key => this.keys.has(key))) {
            gamepadState |= this.BUTTON_B;
        }
        if (mapping.x && mapping.x.some(key => this.keys.has(key))) {
            gamepadState |= this.BUTTON_X;
        }
        if (mapping.y && mapping.y.some(key => this.keys.has(key))) {
            gamepadState |= this.BUTTON_Y;
        }
        
        return gamepadState;
    };

    // Configure key mappings for a player
    Fixm.setKeyMapping = function(player, button, keys) {
        if (!this.keyMappings[player]) {
            this.keyMappings[player] = {};
        }
        this.keyMappings[player][button] = Array.isArray(keys) ? keys : [keys];
    };

    // Set whether mobile controls should be shown
    Fixm.setMobileControlsVisible = function(visible) {
        this.showMobileControls = visible;
        if (this.touchControls) {
            this.touchControls.style.display = visible ? 'block' : 'none';
        }
    };

    // Audio functions
    Fixm.channelSet = function(channel, frequency, effect = 'sine', duration = 0) {
        if (!this.audioContext) return;

        // Stop existing oscillator if any
        if (this.audioChannels[channel]) {
            this.audioChannels[channel].stop();
        }

        if (frequency > 0) {
            let source;
            const gainNode = this.audioContext.createGain();

            if (effect === 'noise') {
                // Create white noise using a buffer source
                const bufferSize = this.audioContext.sampleRate * 0.1; // 0.1 second of noise
                const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
                const output = buffer.getChannelData(0);
                
                for (let i = 0; i < bufferSize; i++) {
                    output[i] = Math.random() * 2 - 1; // White noise
                }
                
                source = this.audioContext.createBufferSource();
                source.buffer = buffer;
                source.loop = duration === 0; // Loop if no duration specified
                
                // Filter the noise based on frequency for different drum sounds
                const filter = this.audioContext.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(frequency * 4, this.audioContext.currentTime);
                
                source.connect(filter);
                filter.connect(gainNode);
            } else {
                // Regular oscillator for tonal sounds
                source = this.audioContext.createOscillator();
                source.type = effect;
                source.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
                source.connect(gainNode);
            }

            gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
            gainNode.connect(this.audioContext.destination);

            source.start();
            this.audioChannels[channel] = source;
            
            // Auto-stop after duration if specified
            if (duration > 0) {
                source.stop(this.audioContext.currentTime + duration / 1000);
            }
        }
    };

    // Render function
    Fixm.present = function() {
        const gl = this.gl;

        let textureData;
        if (this.mode === 'palette') {
            // Convert palette indices to RGBA
            textureData = new Uint8Array(this.width * this.height * 4);
            for (let i = 0; i < this.buffer.length; i++) {
                const paletteIndex = this.buffer[i];
                const offset = i * 4;
                textureData[offset] = this.palette[paletteIndex * 3];
                textureData[offset + 1] = this.palette[paletteIndex * 3 + 1];
                textureData[offset + 2] = this.palette[paletteIndex * 3 + 2];
                textureData[offset + 3] = 255;
            }
        } else {
            textureData = this.buffer;
        }

        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, textureData);

        gl.useProgram(this.program);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    // Event loop system
    Fixm.setUpdate = function(callback) {
        this.updateCallback = callback;
        if (!this.running && this.initialized) {
            this.startEventLoop();
        }
    };

    Fixm.startEventLoop = function() {
        if (this.running) return;
        this.running = true;
        this.lastTime = performance.now();
        this.gameLoop();
    };

    Fixm.stopEventLoop = function() {
        this.running = false;
    };

    Fixm.gameLoop = function() {
        if (!this.running) return;

        // Capture current loop ID to detect if we've been invalidated
        const currentLoopId = this.loopId;

        const currentTime = performance.now();
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;

        // Handle startup animation first
        if (this.startupActive) {
            // Allow skipping startup animation with any input
            const gamepad = this.getGamepad(0);
            if (gamepad !== 0 || this.keys.size > 0) {
                this.startupActive = false;
                this.startupFadeOut = false;
                this.startupFadeTime = 0;
            } else {
                this.renderStartupAnimation(deltaTime);
                this.present();
            }
        } else {
            // Call user update function if set and startup is complete
            if (this.updateCallback) {
                this.updateCallback(deltaTime);
            }
        }

        requestAnimationFrame(() => {
            // Only continue if we haven't been invalidated by a teardown
            if (currentLoopId === this.loopId) {
                this.gameLoop();
            }
        });
    };

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => Fixm.init());
    } else {
        Fixm.init();
    }

    // Export to global scope
    window.Fixm = Fixm;

})();