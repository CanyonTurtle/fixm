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
        palette: new Uint8Array(768), // 256 colors * 3 (RGB)
        buffer: null,
        audioContext: null,
        audioChannels: {},
        spritesheets: new Map(),
        initialized: false
    };

    // Initialize the graphics system
    Fixm.init = function(options = {}) {
        if (this.initialized) return;

        this.width = options.width || 320;
        this.height = options.height || 240;
        this.mode = options.mode || 'truecolor';

        // Create canvas
        this.canvas = document.createElement('canvas');
        this.canvas.style.imageRendering = 'pixelated';
        this.canvas.style.imageRendering = 'crisp-edges';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.objectFit = 'contain';
        document.body.appendChild(this.canvas);

        // Get WebGL context
        this.gl = this.canvas.getContext('webgl') || this.canvas.getContext('experimental-webgl');
        if (!this.gl) {
            throw new Error('WebGL not supported');
        }

        this.setupWebGL();
        this.setupAudio();
        this.setupSpritesheetComponents();
        this.resize();

        window.addEventListener('resize', () => this.resize());
        this.initialized = true;
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
                    Fixm.spritesheets.set(name, img);
                }
            }
        }

        if (!customElements.get('fixm-spritesheet')) {
            customElements.define('fixm-spritesheet', FixmSpritesheet);
        }
    };

    Fixm.resize = function() {
        const container = this.canvas.parentElement || document.body;
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;

        const scale = Math.floor(Math.min(containerWidth / this.width, containerHeight / this.height));
        const scaledWidth = this.width * scale;
        const scaledHeight = this.height * scale;

        this.canvas.width = scaledWidth;
        this.canvas.height = scaledHeight;
        this.canvas.style.width = scaledWidth + 'px';
        this.canvas.style.height = scaledHeight + 'px';

        if (this.gl) {
            this.gl.viewport(0, 0, scaledWidth, scaledHeight);
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

    // Audio functions
    Fixm.channelSet = function(channel, frequency, effect = 'sine') {
        if (!this.audioContext) return;

        // Stop existing oscillator if any
        if (this.audioChannels[channel]) {
            this.audioChannels[channel].stop();
        }

        if (frequency > 0) {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();

            oscillator.type = effect;
            oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
            gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);

            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            oscillator.start();
            this.audioChannels[channel] = oscillator;
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

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => Fixm.init());
    } else {
        Fixm.init();
    }

    // Export to global scope
    window.Fixm = Fixm;

})();