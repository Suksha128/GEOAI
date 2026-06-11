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
        this.drawOrthoRaster(fd);
        break;
      case 'dem':
        this.drawDemRaster(fd);
        break;
      case 'twi':
        this.drawTwiRaster(fd);
        break;
      case 'ndvi':
        this.drawNdviRaster(fd);
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

        ctx.fillStyle = fill;
        ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
        
        ctx.strokeStyle = border;
        ctx.strokeRect(x, y, size, size);
      }
    }
  }
}
