/**
 * Interactive Spatial GIS Canvas Renderer
 */
export class CanvasRenderer {
  constructor(canvasElement, containerElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.container = containerElement;
    
    // Viewing State
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.isDragging = false;
    this.startX = 0;
    this.startY = 0;
    
    // Options
    this.currentLayer = 'raw';
    this.gridSize = 10;
    this.fieldData = null;
    this.pipelineStep = 0;
    
    // Offscreen Canvas Cache
    this.orthoCanvas = null;
    this.demCanvas = null;
    this.twiCanvas = null;
    this.ndviCanvas = null;
    
    this.initEvents();
  }

  /**
   * Bind mouse/touch events to allow zoom & pan navigation
   */
  initEvents() {
    const canvas = this.canvas;
    
    canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.startX = e.clientX - this.panX;
      this.startY = e.clientY - this.panY;
    });

    canvas.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      this.panX = e.clientX - this.startX;
      this.panY = e.clientY - this.startY;
      this.render();
    });

    canvas.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    canvas.addEventListener('mouseleave', () => {
      this.isDragging = false;
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = 1.1;
      const mouseX = e.clientX - canvas.getBoundingClientRect().left;
      const mouseY = e.clientY - canvas.getBoundingClientRect().top;
      
      const canvasX = (mouseX - this.panX) / this.zoom;
      const canvasY = (mouseY - this.panY) / this.zoom;
      
      if (e.deltaY < 0) {
        this.zoom *= zoomFactor;
      } else {
        this.zoom /= zoomFactor;
      }
      
      this.zoom = Math.max(0.1, Math.min(20, this.zoom));
      this.panX = mouseX - canvasX * this.zoom;
      this.panY = mouseY - canvasY * this.zoom;
      
      this.render();
    }, { passive: false });
  }

  /**
   * Resizes canvas and fits procedural layout
   */
  resize() {
    this.canvas.width = this.container.clientWidth;
    this.canvas.height = this.container.clientHeight;
    
    if (this.fieldData) {
      this.zoom = Math.min(this.canvas.width / this.fieldData.width, this.canvas.height / this.fieldData.height) * 0.9;
      this.panX = (this.canvas.width - this.fieldData.width * this.zoom) / 2;
      this.panY = (this.canvas.height - this.fieldData.height * this.zoom) / 2;
    }
    this.render();
  }

  zoomIn() {
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    const tx = (cx - this.panX) / this.zoom;
    const ty = (cy - this.panY) / this.zoom;
    
    this.zoom *= 1.25;
    this.panX = cx - tx * this.zoom;
    this.panY = cy - ty * this.zoom;
    this.render();
  }

  zoomOut() {
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    const tx = (cx - this.panX) / this.zoom;
    const ty = (cy - this.panY) / this.zoom;
    
    this.zoom /= 1.25;
    this.panX = cx - tx * this.zoom;
    this.panY = cy - ty * this.zoom;
    this.render();
  }

  resetView() {
    this.resize();
  }

  setLayer(layerId) {
    this.currentLayer = layerId;
    this.render();
  }

  setGridSize(size) {
    this.gridSize = size;
    this.render();
  }

  setFieldData(data) {
    this.fieldData = data;
    if (data) {
      this.preRenderLayers(data);
    } else {
      this.orthoCanvas = null;
      this.demCanvas = null;
      this.twiCanvas = null;
      this.ndviCanvas = null;
    }
    this.resize();
  }

  setPipelineStep(step) {
    this.pipelineStep = step;
    this.render();
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (!this.fieldData) {
      // Background Grid placeholder
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      for (let x = 0; x < this.canvas.width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, this.canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < this.canvas.height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(this.canvas.width, y);
        ctx.stroke();
      }
      return;
    }

    ctx.save();
    ctx.translate(this.panX, this.panY);
    ctx.scale(this.zoom, this.zoom);

    const fd = this.fieldData;

    // 1. Draw Raster Layer
    switch (this.currentLayer) {
      case 'ortho':
        if (this.orthoCanvas) {
          ctx.drawImage(this.orthoCanvas, 0, 0);
        } else {
          this.drawOrthoRaster(fd);
        }
        break;
      case 'dem':
        if (this.demCanvas) {
          ctx.drawImage(this.demCanvas, 0, 0);
        } else {
          this.drawDemRaster(fd);
        }
        break;
      case 'twi':
        if (this.twiCanvas) {
          ctx.drawImage(this.twiCanvas, 0, 0);
        } else {
          this.drawTwiRaster(fd);
        }
        break;
      case 'ndvi':
        if (this.ndviCanvas) {
          ctx.drawImage(this.ndviCanvas, 0, 0);
        } else {
          this.drawNdviRaster(fd);
        }
        break;
      case 'ml':
        this.drawMlRiskGrid(fd);
        break;
      default:
        // Default raw camera background
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, fd.width, fd.height);
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, fd.width, fd.height);
        break;
    }

    // 2. Draw Camera Overlay
    if (this.currentLayer === 'raw' || this.currentLayer === 'ortho') {
      this.drawCamerasAndFlightpath(fd);
    }

    ctx.restore();
  }

  drawCamerasAndFlightpath(fd) {
    const ctx = this.ctx;
    
    // Flight trajectory
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 162, 255, 0.45)';
    ctx.lineWidth = 1.5;
    fd.cameras.forEach((cam, idx) => {
      if (idx === 0) ctx.moveTo(cam.x, cam.y);
      else ctx.lineTo(cam.x, cam.y);
    });
    ctx.stroke();

    // Camera coordinate points
    fd.cameras.forEach((cam) => {
      ctx.beginPath();
      ctx.arc(cam.x, cam.y, 4, 0, 2 * Math.PI);
      
      if (this.pipelineStep >= 2) {
        if (cam.qcPassed) {
          ctx.fillStyle = '#10b981';
        } else {
          ctx.fillStyle = '#ef4444';
          // Warning Circle
          ctx.beginPath();
          ctx.arc(cam.x, cam.y, 8, 0, 2 * Math.PI);
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = '#00a2ff';
      }
      ctx.fill();
    });
  }

  drawOrthoRaster(fd) {
    const ctx = this.ctx;
    
    // Background soil
    ctx.fillStyle = '#3f6212';
    ctx.fillRect(0, 0, fd.width, fd.height);

    // Circular crop patterns
    ctx.fillStyle = '#4d7c0f';
    ctx.beginPath();
    ctx.arc(200, 200, 150, 0, 2 * Math.PI);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(600, 400, 180, 0, 2 * Math.PI);
    ctx.fill();

    // Rows
    ctx.strokeStyle = '#1e3a0a';
    ctx.lineWidth = 1.5;
    for (let y = 30; y < fd.height; y += 15) {
      ctx.beginPath();
      ctx.moveTo(10, y + Math.sin(y / 40) * 8);
      ctx.lineTo(fd.width - 10, y + Math.sin(y / 40) * 8);
      ctx.stroke();
    }

    // Dirt access lane
    ctx.beginPath();
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 12;
    ctx.moveTo(fd.width / 2, 0);
    ctx.lineTo(fd.width / 2, fd.height);
    ctx.stroke();

    // Bare patch
    ctx.fillStyle = '#92400e';
    ctx.beginPath();
    ctx.arc(150, 480, 80, 0, 2 * Math.PI);
    ctx.fill();
  }

  drawDemRaster(fd) {
    const ctx = this.ctx;
    const elData = fd.elevation;
    const pixelSize = 4;
    
    for (let r = 0; r < elData.length; r++) {
      for (let c = 0; c < elData[r].length; c++) {
        const elev = elData[r][c];
        const ratio = Math.max(0, Math.min(1, (elev - 150) / 70));
        
        let red = 0, green = 0, blue = 0;
        if (ratio < 0.5) {
          blue = Math.round(255 * (1 - ratio * 2));
          green = Math.round(255 * (ratio * 2));
        } else {
          green = Math.round(255 * (1 - (ratio - 0.5) * 2));
          red = Math.round(255 * ((ratio - 0.5) * 2));
        }

        ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
        ctx.fillRect(c * pixelSize, r * pixelSize, pixelSize, pixelSize);
      }
    }

    // Contour lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    for (let elevTarget = 155; elevTarget < 220; elevTarget += 10) {
      ctx.beginPath();
      let isPathOpen = false;
      for (let x = 10; x < fd.width - 10; x += 10) {
        const y = fd.height / 2 + Math.sin(x / 100) * 80 + (elevTarget - 150) * 2;
        if (y > 0 && y < fd.height) {
          if (!isPathOpen) {
            ctx.moveTo(x, y);
            isPathOpen = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      }
      ctx.stroke();
    }
  }

  drawTwiRaster(fd) {
    const ctx = this.ctx;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, fd.width, fd.height);

    ctx.strokeStyle = 'rgba(0, 200, 255, 0.7)';
    ctx.shadowColor = 'rgba(0, 162, 255, 0.8)';
    
    fd.flowPaths.forEach((path, idx) => {
      ctx.beginPath();
      ctx.lineWidth = idx === fd.flowPaths.length - 1 ? 5 : 2;
      ctx.shadowBlur = idx === fd.flowPaths.length - 1 ? 8 : 0;
      
      path.forEach((pt, pIdx) => {
        if (pIdx === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();
    });
    ctx.shadowBlur = 0;
  }

  drawNdviRaster(fd) {
    const ctx = this.ctx;
    const vegData = fd.vegetation;
    const pixelSize = 10;

    for (let r = 0; r < vegData.length; r++) {
      for (let c = 0; c < vegData[r].length; c++) {
        const ndvi = vegData[r][c];
        let red = 0, green = 0, blue = 0;
        
        if (ndvi < 0.2) {
          red = 150; green = 75; blue = 0;
        } else if (ndvi < 0.5) {
          red = 230; green = 200; blue = 50;
        } else {
          const intensity = Math.round(255 * ((ndvi - 0.5) / 0.5));
          red = 16; green = Math.max(120, intensity); blue = 80;
        }

        ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
        ctx.fillRect(c * pixelSize, r * pixelSize, pixelSize, pixelSize);
      }
    }
  }

  drawMlRiskGrid(fd) {
    const ctx = this.ctx;
    this.drawOrthoRaster(fd);
    
    ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.fillRect(0, 0, fd.width, fd.height);

    const size = this.gridSize * 2;
    
    for (let x = 0; x < fd.width; x += size) {
      for (let y = 0; y < fd.height; y += size) {
        const centerValY = fd.height / 2 + Math.sin(x / 100) * 80;
        const isWaterlogging = Math.abs(y - centerValY) < 30;
        const isErosion = y < 100 && x > 500;
        const isDry = Math.hypot(x - 150, y - 480) < 90;

        let fill = 'rgba(16, 185, 129, 0.2)';
        let border = 'rgba(16, 185, 129, 0.4)';
        
        if (isWaterlogging) {
          fill = 'rgba(59, 130, 246, 0.35)';
          border = 'rgba(59, 130, 246, 0.6)';
        } else if (isErosion) {
          fill = 'rgba(239, 68, 68, 0.35)';
          border = 'rgba(239, 68, 68, 0.6)';
        } else if (isDry) {
          fill = 'rgba(245, 158, 11, 0.35)';
          border = 'rgba(245, 158, 11, 0.6)';
        }

      }
    }
  }

  // ── VALUE NOISE & FRACTAL BROWNIAN MOTION (fBm) GENERATOR ────────────────
  noise(x, y) {
    let n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453123;
    return n - Math.floor(n);
  }

  smoothNoise(x, y) {
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    
    const n00 = this.noise(ix, iy);
    const n10 = this.noise(ix + 1, iy);
    const n01 = this.noise(ix, iy + 1);
    const n11 = this.noise(ix + 1, iy + 1);
    
    const tx1 = n00 + xf * (n10 - n00);
    const tx2 = n01 + xf * (n11 - n01);
    return tx1 + yf * (tx2 - tx1);
  }

  fbm(x, y, octaves = 3) {
    let value = 0;
    let amplitude = 0.5;
    let frequency = 1.0;
    for (let i = 0; i < octaves; i++) {
      value += amplitude * this.smoothNoise(x * frequency, y * frequency);
      amplitude *= 0.5;
      frequency *= 2.0;
    }
    return value;
  }

  // ── OFFSCREEN RASTER PRE-RENDERING ENGINE ─────────────────────────────────
  preRenderLayers(fd) {
    const width = fd.width;
    const height = fd.height;

    this.orthoCanvas = document.createElement('canvas');
    this.orthoCanvas.width = width;
    this.orthoCanvas.height = height;

    this.demCanvas = document.createElement('canvas');
    this.demCanvas.width = width;
    this.demCanvas.height = height;

    this.twiCanvas = document.createElement('canvas');
    this.twiCanvas.width = width;
    this.twiCanvas.height = height;

    this.ndviCanvas = document.createElement('canvas');
    this.ndviCanvas.width = width;
    this.ndviCanvas.height = height;

    this.generateOrtho(fd);
    this.generateDem(fd);
    this.generateTwi(fd);
    this.generateNdvi(fd);
  }

  generateOrtho(fd) {
    const ctx = this.orthoCanvas.getContext('2d');
    const width = fd.width;
    const height = fd.height;

    ctx.fillStyle = '#795c34';
    ctx.fillRect(0, 0, width, height);

    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const n = this.fbm(x * 0.015, y * 0.015, 3);
        const rowPattern = Math.abs(Math.sin(x * 0.5 + y * 0.05));
        
        let r = 121, g = 92, b = 52; // Soil

        if (n > 0.45) {
          if (rowPattern > 0.35) {
            r = 76; g = 154; b = 42; // Crops green
          } else {
            r = 46; g = 117; b = 29; // Shadow green
          }
        } else if (n > 0.35) {
          r = 139; g = 120; b = 90; // Dry grass/sandy soil
        }
        
        // Dark dirt winding access path
        const roadCenter = width / 2 + Math.sin(y * 0.008) * 80;
        if (Math.abs(x - roadCenter) < 12) {
          r = 101; g = 75; b = 45;
        }

        const idx = (y * width + x) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }

  generateDem(fd) {
    const ctx = this.demCanvas.getContext('2d');
    const width = fd.width;
    const height = fd.height;

    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const rIdx = Math.min(fd.elevation.length - 1, Math.floor(y / 4));
        const cIdx = Math.min(fd.elevation[0].length - 1, Math.floor(x / 4));
        const elev = fd.elevation[rIdx][cIdx];

        const ratio = Math.max(0, Math.min(1, (elev - 145) / 80));
        
        let r = 0, g = 0, b = 0;
        if (ratio < 0.25) {
          const t = ratio / 0.25;
          r = 30; g = Math.round(144 * t); b = 255; // Blue to Cyan
        } else if (ratio < 0.5) {
          const t = (ratio - 0.25) / 0.25;
          r = Math.round(34 * t); g = 139; b = Math.round(255 * (1 - t)); // Cyan to Green
        } else if (ratio < 0.75) {
          const t = (ratio - 0.5) / 0.25;
          r = Math.round(34 + 171 * t); g = Math.round(139 + 30 * t); b = Math.round(34 * (1 - t)); // Green to Brown
        } else {
          const t = (ratio - 0.75) / 0.25;
          r = Math.round(205 + 50 * t); g = Math.round(169 + 86 * t); b = Math.round(150 + 105 * t); // Brown to White
        }

        const idx = (y * width + x) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    // Dynamic contour lines overlay
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;

    for (let elevTarget = 150; elevTarget <= 220; elevTarget += 5) {
      ctx.beginPath();
      let isPathOpen = false;
      for (let x = 10; x < width - 10; x += 12) {
        const rIdx = Math.min(fd.elevation.length - 1, Math.floor((height / 2 + Math.sin(x / 100) * 80 + (elevTarget - 180) * 2.2) / 4));
        if (rIdx >= 0 && rIdx < fd.elevation.length) {
          const y = rIdx * 4;
          if (y > 10 && y < height - 10) {
            if (!isPathOpen) {
              ctx.moveTo(x, y);
              isPathOpen = true;
            } else {
              ctx.lineTo(x, y);
            }
          }
        }
      }
      ctx.stroke();
    }
  }

  generateTwi(fd) {
    const ctx = this.twiCanvas.getContext('2d');
    const width = fd.width;
    const height = fd.height;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const rIdx = Math.min(fd.elevation.length - 1, Math.floor(y / 4));
        const cIdx = Math.min(fd.elevation[0].length - 1, Math.floor(x / 4));
        const elev = fd.elevation[rIdx][cIdx];
        
        const shade = Math.round(30 + (elev - 150) * 0.4);
        
        const idx = (y * width + x) * 4;
        data[idx] = Math.max(10, Math.min(40, shade - 10));
        data[idx + 1] = Math.max(15, Math.min(50, shade));
        data[idx + 2] = Math.max(25, Math.min(70, shade + 15));
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    ctx.strokeStyle = 'rgba(0, 200, 255, 0.75)';
    ctx.shadowColor = 'rgba(0, 162, 255, 0.9)';
    
    fd.flowPaths.forEach((path, idx) => {
      ctx.beginPath();
      ctx.lineWidth = idx === fd.flowPaths.length - 1 ? 4.5 : 1.5;
      ctx.shadowBlur = idx === fd.flowPaths.length - 1 ? 10 : 0;
      
      path.forEach((pt, pIdx) => {
        if (pIdx === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();
    });
    ctx.shadowBlur = 0;
  }

  generateNdvi(fd) {
    const ctx = this.ndviCanvas.getContext('2d');
    const width = fd.width;
    const height = fd.height;

    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const rIdx = Math.min(fd.vegetation.length - 1, Math.floor(y / 10));
        const cIdx = Math.min(fd.vegetation[0].length - 1, Math.floor(x / 10));
        let ndvi = fd.vegetation[rIdx][cIdx];

        ndvi += (this.fbm(x * 0.05, y * 0.05, 2) - 0.5) * 0.08;
        ndvi = Math.max(-1.0, Math.min(1.0, ndvi));

        const roadCenter = width / 2 + Math.sin(y * 0.008) * 80;
        if (Math.abs(x - roadCenter) < 12) {
          ndvi = -0.15 + (Math.random() - 0.5) * 0.05; // Road
        }

        let r = 0, g = 0, b = 0;
        if (ndvi < 0.1) {
          r = 211; g = 47; b = 47; // Stressed/Soil
        } else if (ndvi < 0.45) {
          const t = (ndvi - 0.1) / 0.35;
          r = Math.round(255 - (255 - 245) * t);
          g = Math.round(235 - (235 - 124) * t);
          b = 0; // Yellow/Orange
        } else {
          const t = (ndvi - 0.45) / 0.55;
          r = Math.round(245 - (245 - 27) * t);
          g = Math.round(124 + (139 - 124) * t);
          b = Math.round(0 + 32 * t); // Lush green
        }

        const idx = (y * width + x) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }
}
