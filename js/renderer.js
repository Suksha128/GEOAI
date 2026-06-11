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
    ctx.strokeStyle = 'rgba(229, 169, 59, 0.55)';
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
          ctx.fillStyle = '#2e7d32';
        } else {
          ctx.fillStyle = '#b91c1c';
          // Warning Circle
          ctx.beginPath();
          ctx.arc(cam.x, cam.y, 8, 0, 2 * Math.PI);
          ctx.strokeStyle = 'rgba(185, 28, 28, 0.5)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = '#e5a93b';
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

  // ── HILLSHADE LIGHTING MODEL ─────────────────────────────────────────────
  getHillshade(fd, x, y) {
    const rIdx = Math.min(fd.elevation.length - 1, Math.floor(y / 4));
    const cIdx = Math.min(fd.elevation[0].length - 1, Math.floor(x / 4));
    
    const rPrev = Math.max(0, rIdx - 1);
    const rNext = Math.min(fd.elevation.length - 1, rIdx + 1);
    const cPrev = Math.max(0, cIdx - 1);
    const cNext = Math.min(fd.elevation[0].length - 1, cIdx + 1);
    
    const z_left = fd.elevation[rIdx][cPrev];
    const z_right = fd.elevation[rIdx][cNext];
    const z_top = fd.elevation[rPrev][cIdx];
    const z_bottom = fd.elevation[rNext][cIdx];
    
    // Gradients
    const dz_dx = (z_right - z_left) * 0.25;
    const dz_dy = (z_bottom - z_top) * 0.25;
    
    // Slope and Aspect
    const slope = Math.atan(Math.sqrt(dz_dx * dz_dx + dz_dy * dz_dy));
    const aspect = Math.atan2(-dz_dy, dz_dx);
    
    // Sun lighting angles: Azimuth = 315° (NW), Altitude = 45°
    const sunAzimuth = 315 * Math.PI / 180;
    const sunZenith = 45 * Math.PI / 180;
    
    const hillshade = Math.cos(sunZenith) * Math.cos(slope) + 
                      Math.sin(sunZenith) * Math.sin(slope) * Math.cos(sunAzimuth - aspect);
                      
    return Math.max(0, Math.min(1, hillshade));
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

    let avgX = 0, avgY = 0;
    fd.cameras.forEach(cam => { avgX += cam.x; avgY += cam.y; });
    avgX /= fd.cameras.length;
    avgY /= fd.cameras.length;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const noiseVal = (this.noise(x, y) - 0.5) * 15;
        const vegNoise = this.fbm(x * 0.008, y * 0.008, 3);
        
        let r = 139, g = 115, b = 85; // Sandy Soil

        const isPivotCircle = Math.hypot(x - (avgX - 180), y - (avgY - 100)) < 130;
        const isRectField1 = x > avgX && y < avgY + 50;
        const isRectField2 = x < avgX && y > avgY + 50;
        
        if (isPivotCircle) {
          const dist = Math.hypot(x - (avgX - 180), y - (avgY - 100));
          const ringPattern = Math.abs(Math.sin(dist * 0.3));
          if (ringPattern > 0.35) {
            r = 34; g = 139; b = 34; // Crops
          } else {
            r = 143; g = 120; b = 75; // Harvested
          }
        } else if (isRectField1) {
          const rowPattern = Math.abs(Math.sin(x * 0.4));
          if (rowPattern > 0.4) {
            r = 46; g = 125; b = 50;
          } else {
            r = 85; g = 65; b = 35;
          }
        } else if (isRectField2) {
          const rowPattern = Math.abs(Math.sin(y * 0.3));
          if (rowPattern > 0.35) {
            r = 100; g = 180; b = 50;
          } else {
            r = 90; g = 75; b = 45;
          }
        } else {
          if (vegNoise > 0.42) {
            r = 27; g = 94; b = 32; // Trees
          } else if (vegNoise > 0.35) {
            r = 107; g = 142; b = 35; // Wild grass
          }
        }

        const roadCenter = width / 2 + Math.sin(y * 0.006) * 110;
        const isRoad = Math.abs(x - roadCenter) < 14;
        
        const tireTrack1 = Math.abs(x - (roadCenter + 60)) < 1.5 || Math.abs(x - (roadCenter + 66)) < 1.5;
        const tireTrack2 = Math.abs(y - (avgY + 120)) < 1.5 || Math.abs(y - (avgY + 126)) < 1.5;
        
        if (isRoad) {
          r = 110; g = 85; b = 55;
          if (Math.abs(x - roadCenter) > 4 && Math.abs(x - roadCenter) < 8) {
            r = 85; g = 65; b = 40;
          }
        } else if (tireTrack1 && (isRectField1 || vegNoise > 0.3)) {
          r = 75; g = 60; b = 35;
        } else if (tireTrack2 && (isRectField2 || vegNoise > 0.3)) {
          r = 75; g = 60; b = 35;
        }

        r = Math.max(0, Math.min(255, r + noiseVal));
        g = Math.max(0, Math.min(255, g + noiseVal));
        b = Math.max(0, Math.min(255, b + noiseVal));

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
        if (ratio < 0.2) {
          r = 10; g = 50; b = 180; // Water channels
        } else if (ratio < 0.4) {
          const t = (ratio - 0.2) / 0.2;
          r = Math.round(10 + 100 * t); g = Math.round(120 + 60 * t); b = Math.round(180 * (1 - t)); // Low plains
        } else if (ratio < 0.6) {
          const t = (ratio - 0.4) / 0.2;
          r = Math.round(110 + 130 * t); g = Math.round(180 + 40 * t); b = Math.round(30 * t); // Mid plains
        } else if (ratio < 0.8) {
          const t = (ratio - 0.6) / 0.2;
          r = Math.round(240 - 55 * t); g = Math.round(220 - 140 * t); b = Math.round(30 * (1 - t)); // Hills
        } else {
          const t = (ratio - 0.8) / 0.2;
          r = Math.round(185 + 70 * t); g = Math.round(80 + 175 * t); b = Math.round(20 + 235 * t); // High peaks
        }

        const shade = this.getHillshade(fd, x, y);
        const scale = 0.35 + shade * 0.75;
        r = Math.max(0, Math.min(255, Math.round(r * scale)));
        g = Math.max(0, Math.min(255, Math.round(g * scale)));
        b = Math.max(0, Math.min(255, Math.round(b * scale)));

        const idx = (y * width + x) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
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

    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    let avgX = 0, avgY = 0;
    fd.cameras.forEach(cam => { avgX += cam.x; avgY += cam.y; });
    avgX /= fd.cameras.length;
    avgY /= fd.cameras.length;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const rIdx = Math.min(fd.elevation.length - 1, Math.floor(y / 4));
        const cIdx = Math.min(fd.elevation[0].length - 1, Math.floor(x / 4));
        const elev = fd.elevation[rIdx][cIdx];

        const centerValY = avgY + Math.sin(x / 100) * 80;
        const distToRiver = Math.abs(y - centerValY);
        
        const elevFactor = 1 - Math.max(0, Math.min(1, (elev - 145) / 80));
        const riverFactor = Math.exp(-distToRiver * 0.015);
        const wetness = Math.max(0, Math.min(1, elevFactor * 0.4 + riverFactor * 0.6));

        let r = 0, g = 0, b = 0;
        if (wetness < 0.3) {
          const t = wetness / 0.3;
          r = Math.round(15 + 30 * t);
          g = Math.round(23 + 32 * t);
          b = Math.round(42 + 28 * t); // Slate
        } else if (wetness < 0.75) {
          const t = (wetness - 0.3) / 0.45;
          r = Math.round(45 - 45 * t);
          g = Math.round(55 + 75 * t);
          b = Math.round(70 + 110 * t); // Moist
        } else {
          const t = (wetness - 0.75) / 0.25;
          r = 0;
          g = Math.round(130 + 125 * t);
          b = Math.round(180 + 75 * t); // Saturated cyan
        }

        const shade = this.getHillshade(fd, x, y);
        const scale = 0.5 + shade * 0.6;
        r = Math.max(0, Math.min(255, Math.round(r * scale)));
        g = Math.max(0, Math.min(255, Math.round(g * scale)));
        b = Math.max(0, Math.min(255, Math.round(b * scale)));

        const idx = (y * width + x) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    ctx.strokeStyle = 'rgba(0, 240, 255, 0.85)';
    ctx.shadowColor = 'rgba(0, 200, 255, 0.9)';
    
    fd.flowPaths.forEach((path, idx) => {
      ctx.beginPath();
      ctx.lineWidth = idx === fd.flowPaths.length - 1 ? 5.0 : 1.8;
      ctx.shadowBlur = idx === fd.flowPaths.length - 1 ? 12 : 0;
      
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

    let avgX = 0, avgY = 0;
    fd.cameras.forEach(cam => { avgX += cam.x; avgY += cam.y; });
    avgX /= fd.cameras.length;
    avgY /= fd.cameras.length;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const vegNoise = this.fbm(x * 0.008, y * 0.008, 3);
        
        let ndvi = 0.15;

        const isPivotCircle = Math.hypot(x - (avgX - 180), y - (avgY - 100)) < 130;
        const isRectField1 = x > avgX && y < avgY + 50;
        const isRectField2 = x < avgX && y > avgY + 50;
        
        if (isPivotCircle) {
          const dist = Math.hypot(x - (avgX - 180), y - (avgY - 100));
          const ringPattern = Math.sin(dist * 0.3);
          ndvi = ringPattern > 0.35 ? 0.78 : 0.18;
        } else if (isRectField1) {
          const rowPattern = Math.sin(x * 0.4);
          ndvi = rowPattern > 0.4 ? 0.82 : 0.20;
        } else if (isRectField2) {
          const rowPattern = Math.sin(y * 0.3);
          ndvi = rowPattern > 0.35 ? 0.72 : 0.16;
        } else {
          if (vegNoise > 0.42) {
            ndvi = 0.85;
          } else if (vegNoise > 0.35) {
            ndvi = 0.55;
          }
        }

        const roadCenter = width / 2 + Math.sin(y * 0.006) * 110;
        const isRoad = Math.abs(x - roadCenter) < 14;
        
        const tireTrack1 = Math.abs(x - (roadCenter + 60)) < 1.5 || Math.abs(x - (roadCenter + 66)) < 1.5;
        const tireTrack2 = Math.abs(y - (avgY + 120)) < 1.5 || Math.abs(y - (avgY + 126)) < 1.5;

        if (isRoad) {
          ndvi = -0.15;
        } else if ((tireTrack1 && isRectField1) || (tireTrack2 && isRectField2)) {
          ndvi = 0.08;
        }

        ndvi += (this.noise(x, y) - 0.5) * 0.08;
        ndvi = Math.max(-1.0, Math.min(1.0, ndvi));

        let r = 0, g = 0, b = 0;
        if (ndvi < 0.1) {
          r = 211; g = 47; b = 47; // Red/brown (soil/road)
        } else if (ndvi < 0.45) {
          const t = (ndvi - 0.1) / 0.35;
          r = Math.round(255 - (255 - 245) * t);
          g = Math.round(235 - (235 - 124) * t);
          b = 0; // Yellow/orange
        } else if (ndvi < 0.78) {
          const t = (ndvi - 0.45) / 0.33;
          r = Math.round(245 - (245 - 27) * t);
          g = Math.round(124 + (139 - 124) * t);
          b = Math.round(0 + 32 * t); // Bright green
        } else {
          const t = (ndvi - 0.78) / 0.22;
          r = Math.round(27 - (27 - 10) * t);
          g = Math.round(139 - (139 - 80) * t);
          b = Math.round(32 - (32 - 15) * t); // Dark forest green
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
