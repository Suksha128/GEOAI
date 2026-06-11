/**
 * Main Application Entry Point & Orchestrator
 * Supports Dual-Mode: Simulated Offline Mode (Port 5500) and Live API Mode (Port 8000)
 */
import { IngestionManager } from './uploader.js';
import { CanvasRenderer } from './renderer.js';
import { generateAIReport } from './reporter.js';

// Global State
const state = {
  currentStep: 0,
  pipelineCompleted: false,
  fieldData: null,
  projectId: "offline_project",
  liveMode: false,
  statusPollInterval: null,
  
  // Configurations
  concurrencyLimit: 12,
  gridSize: 10,
  vegIndexMode: 'auto',
  errorCorrectionEnabled: true,
  sinkFillingEnabled: true,
};

// UI Elements
const dropZone = document.getElementById('dropZone');
const folderInput = document.getElementById('folderInput');
const startUploadBtn = document.getElementById('startUploadBtn');
const resetUploadBtn = document.getElementById('resetUploadBtn');
const concurrencySlider = document.getElementById('concurrencySlider');
const concurrencyVal = document.getElementById('concurrencyVal');
const gridSizeSelect = document.getElementById('gridSizeSelect');
const vegIndexSelect = document.getElementById('vegIndexSelect');
const errorCorrectionToggle = document.getElementById('errorCorrectionToggle');
const sinkFillingToggle = document.getElementById('sinkFillingToggle');

const statsFilesCount = document.getElementById('statsFilesCount');
const statsFolderCount = document.getElementById('statsFolderCount');
const statsSpeed = document.getElementById('statsSpeed');
const statsActiveConnections = document.getElementById('statsActiveConnections');
const statsUploadedSize = document.getElementById('statsUploadedSize');
const statsPercentage = document.getElementById('statsPercentage');
const progressBar = document.getElementById('progressBar');
const statsEta = document.getElementById('statsEta');

const systemStatusDot = document.getElementById('systemStatusDot');
const systemStatusText = document.getElementById('systemStatusText');
const reportContent = document.getElementById('reportContent');
const canvasInstruction = document.getElementById('canvasInstruction');

// Instances
let uploader = null;
let renderer = null;

// Initialize
function init() {
  // 1. Detect environment
  state.liveMode = window.location.port === "8000";
  console.log(`[GeoAI Platform] Initialized in ${state.liveMode ? 'LIVE' : 'SIMULATED'} mode`);
  
  // Update badge in UI to reflect port mapping
  const badge = document.querySelector('.azure-badge');
  if (badge) {
    badge.innerText = state.liveMode ? "API Active (Local)" : "Offline Sandbox";
  }

  // 2. Generate local field database
  generateProceduralFieldData();
  
  // 3. Initialize modules
  uploader = new IngestionManager({
    onProgress: (metrics) => {
      statsFilesCount.innerText = `${metrics.uploadedFiles} / ${metrics.totalFiles}`;
      statsUploadedSize.innerText = `${formatBytes(metrics.uploadedSize)} / ${formatBytes(metrics.totalSize)}`;
      statsPercentage.innerText = `${Math.round(metrics.percentage)}% completed`;
      progressBar.style.width = `${metrics.percentage}%`;
      statsActiveConnections.innerText = `${metrics.activeConnections} active connections`;
      
      if (metrics.speedMBs !== undefined) {
        statsSpeed.innerText = `${metrics.speedMBs.toFixed(1)} MB/s`;
      }
      if (metrics.eta !== undefined && statsEta) {
        statsEta.innerText = metrics.eta;
      }

      // Update Node 1 details
      const node1 = document.getElementById('node-1');
      if (node1) {
        node1.querySelector('.node-details').innerText = `${metrics.uploadedFiles} / ${metrics.totalFiles} images`;
      }
    },
    onStatusChange: (change) => {
      if (change.status === 'uploading') {
        updateSystemStatus(change.text, 'pulse-blue');
        updatePipelineStep(1, 'active', 'Uploading...');
      }
    },
    onComplete: () => {
      statsSpeed.innerText = '0.0 MB/s';
      statsActiveConnections.innerText = '0 active connections';
      if (statsEta) statsEta.innerText = '00:00:00';
      
      updatePipelineStep(1, 'completed', 'Completed', `${uploader.files.length} images`);
      
      if (state.liveMode) {
        startLiveBackendPipeline();
      } else {
        runProcessingPipelineSimulated();
      }
    },
    onFileParsed: (meta) => {
      statsFilesCount.innerText = `0 / ${meta.filesCount}`;
      statsFolderCount.innerText = `${meta.foldersCount} folder(s) parsed`;
      statsUploadedSize.innerText = `0.0 MB / ${formatBytes(meta.totalSize)}`;
      statsPercentage.innerText = '0% completed';
      
      startUploadBtn.disabled = meta.filesCount === 0;
      resetUploadBtn.disabled = meta.filesCount === 0;
      
      updateSystemStatus('Upload Ready - Awaiting Trigger', 'pulse-green');
      resetPipelineUI();
      
      // Regenerate procedural simulation data to match the actual file count!
      generateProceduralFieldData(meta.filesCount);
      
      renderer.setFieldData(state.fieldData);
      renderer.setPipelineStep(0);
      canvasInstruction.style.display = 'none';
    }
  });

  renderer = new CanvasRenderer(
    document.getElementById('gisCanvas'),
    document.getElementById('canvasContainer')
  );

  // 4. Bind UI events
  initUIEvents();

  // 5. Initialize Chatbot
  initChatbot();
}

function initUIEvents() {
  // Concurrency slider
  if (concurrencySlider) {
    concurrencySlider.addEventListener('input', (e) => {
      state.concurrencyLimit = parseInt(e.target.value);
      if (concurrencyVal) concurrencyVal.innerText = state.concurrencyLimit;
    });
  }

  // Checkbox config changes
  gridSizeSelect.addEventListener('change', (e) => {
    state.gridSize = parseInt(e.target.value);
    renderer.setGridSize(state.gridSize);
    if (state.pipelineCompleted) {
      triggerReportRecompile();
    }
  });

  vegIndexSelect.addEventListener('change', (e) => {
    state.vegIndexMode = e.target.value;
    if (state.pipelineCompleted) {
      triggerReportRecompile();
    }
  });

  errorCorrectionToggle.addEventListener('change', (e) => {
    state.errorCorrectionEnabled = e.target.checked;
  });

  sinkFillingToggle.addEventListener('change', (e) => {
    state.sinkFillingEnabled = e.target.checked;
  });

  // Ingest operations
  folderInput.addEventListener('change', (e) => {
    uploader.parseFileList(e.target.files);
  });

  // Drag over dropzone
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.items) {
      await uploader.parseDroppedItems(e.dataTransfer.items);
    }
  });

  // Start upload action
  startUploadBtn.addEventListener('click', () => {
    if (uploader.uploadActive) return;
    startUploadBtn.disabled = true;
    if (concurrencySlider) concurrencySlider.disabled = true;
    
    // Assign project ID
    state.projectId = state.liveMode ? "proj_" + Date.now() : "offline_project";
    uploader.startUpload(state.concurrencyLimit, state.liveMode, state.projectId);
  });

  // Reset upload action
  resetUploadBtn.addEventListener('click', () => {
    if (state.statusPollInterval) clearInterval(state.statusPollInterval);
    uploader.reset();
    resetUploadUI();
    resetPipelineUI();
    renderer.setFieldData(null);
    canvasInstruction.style.display = 'flex';
  });
}

// LIVE BACKEND INTERACTION
function startLiveBackendPipeline() {
  updateSystemStatus('Starting photogrammetry API pipeline...', 'pulse-blue');
  
  fetch(`/api/pipeline/start/${state.projectId}`, { method: 'POST' })
    .then(res => {
      if (!res.ok) throw new Error("FastAPI pipeline starter failed");
      return res.json();
    })
    .then(() => {
      // Begin status polling
      state.statusPollInterval = setInterval(pollLivePipelineStatus, 1000);
    })
    .catch(err => {
      console.error(err);
      updateSystemStatus('API Start Failed - Check Server Console', 'pulse-red');
    });
}

function pollLivePipelineStatus() {
  fetch(`/api/pipeline/status/${state.projectId}`)
    .then(res => {
      if (!res.ok) throw new Error("Status query failed");
      return res.json();
    })
    .then(data => {
      const stepIdx = data.step;
      const pipelineStatus = data.status;
      const message = data.message;
      
      // Update field coordinates with real flight data if returned by the backend
      if (data.cameras && data.cameras.length > 0 && (!state.fieldData || state.fieldData.cameras.length !== data.cameras.length)) {
        const mappedData = convertGpsToLocalCoordinates(data.cameras);
        generateProceduralMapsForRealCameras(mappedData);
        state.fieldData = mappedData;
        renderer.setFieldData(state.fieldData);
      }
      
      // Update UI Header Status
      updateSystemStatus(`[Live Backend] ${message}`, pipelineStatus === 'failed' ? 'pulse-red' : 'pulse-orange');
      
      // Light up nodes sequentially
      for (let i = 2; i <= 10; i++) {
        if (i < stepIdx) {
          updatePipelineStep(i, 'completed', 'Completed');
        } else if (i === stepIdx && pipelineStatus !== 'completed') {
          updatePipelineStep(i, 'active', 'Processing...');
          renderer.setPipelineStep(i);
        } else {
          updatePipelineStep(i, 'pending', 'Pending');
        }
      }

      // Update layers dynamically based on pipeline completion steps
      if (stepIdx > 3) {
        enableLayer('ortho');
        enableLayer('dem');
      }
      if (stepIdx > 6) {
        enableLayer('twi');
      }
      if (stepIdx > 7) {
        enableLayer('ndvi');
      }
      if (stepIdx > 9) {
        enableLayer('ml');
      }

      // If pipeline completed successfully
      if (pipelineStatus === 'completed') {
        clearInterval(state.statusPollInterval);
        state.pipelineCompleted = true;
        updatePipelineStep(10, 'completed', 'Completed', 'Brief ready');
        updateSystemStatus('Pipeline Executed Successfully - Complete', 'pulse-green');
        
        // Show AI report
        if (data.report_html) {
          reportContent.innerHTML = data.report_html;
        } else {
          triggerReportRecompile();
        }
        
        // Map layers trigger view
        renderer.setLayer('ml');
        const mlBtn = document.querySelector(`.layer-btn[data-layer="ml"]`);
        if (mlBtn) {
          document.querySelectorAll('.layer-btn').forEach(b => b.classList.remove('active'));
          mlBtn.classList.add('active');
        }
      }
      
      if (pipelineStatus === 'failed') {
        clearInterval(state.statusPollInterval);
        updateSystemStatus(`Pipeline Failed: ${message}`, 'pulse-red');
      }
    })
    .catch(err => {
      console.error("Polling error:", err);
    });
}

// SIMULATED PIPELINE FLOW (Offline fallback)
const stepQueue = [];
let isStepRunning = false;

function runProcessingPipelineSimulated() {
  state.pipelineCompleted = false;
  stepQueue.length = 0; 
  isStepRunning = false;

  enqueueStep(2, 2500, () => {
    const failedCount = state.fieldData.cameras.filter(c => !c.qcPassed).length;
    const totalCount = state.fieldData.cameras.length;
    
    if (failedCount > 0) {
      updatePipelineStep(2, 'warning', 'QC Flagged', `${failedCount} flagged / ${totalCount} passed`);
    } else {
      updatePipelineStep(2, 'completed', 'Passed', `${totalCount} images checked`);
    }
    renderer.setPipelineStep(2);
  });

  enqueueStep(3, 4000, () => {
    updatePipelineStep(3, 'completed', 'Optimized', 'GSD: 2.1cm, RMS: 0.12px');
    enableLayer('ortho');
    enableLayer('dem');
    renderer.setPipelineStep(3);
    renderer.setLayer('ortho');
  });

  enqueueStep(4, 3000, () => {
    if (state.errorCorrectionEnabled) {
      updatePipelineStep(4, 'completed', 'Corrected', 'Outliers pruned (re-optimized)');
    } else {
      updatePipelineStep(4, 'warning', 'Skipped', 'Self-calibration disabled');
    }
  });

  enqueueStep(5, 2500, () => {
    if (state.sinkFillingEnabled) {
      updatePipelineStep(5, 'completed', 'Validated', 'Wang-Liu sink filling applied');
    } else {
      updatePipelineStep(5, 'warning', 'Bypassed', 'Raw DEM outputs preserved');
    }
  });

  enqueueStep(6, 3500, () => {
    updatePipelineStep(6, 'completed', 'Calculated', 'Slope, Aspect, D8 Flow, TWI');
    enableLayer('twi');
  });

  enqueueStep(7, 2500, () => {
    let details = 'NDVI calculated';
    if (state.vegIndexMode === 'vari') details = 'VARI fallback applied';
    else if (state.vegIndexMode === 'auto') details = 'Auto detected NIR bands';
    
    updatePipelineStep(7, 'completed', 'Computed', details);
    enableLayer('ndvi');
    renderer.setLayer('ndvi');
  });

  enqueueStep(8, 2000, () => {
    updatePipelineStep(8, 'completed', 'Aggregated', `Zonal stats on ${state.gridSize}m grid`);
  });

  enqueueStep(9, 3000, () => {
    updatePipelineStep(9, 'completed', 'Predicted', 'XGBoost multi-risk classification');
    enableLayer('ml');
    renderer.setLayer('ml');
  });

  enqueueStep(10, 2000, () => {
    updatePipelineStep(10, 'completed', 'Generated', 'Decision support brief ready');
    
    state.pipelineCompleted = true;
    triggerReportRecompile();
    updateSystemStatus('Pipeline Executed Successfully - Complete', 'pulse-green');
  });

  processNextStep();
}

function enqueueStep(stepIndex, duration, completionCallback) {
  stepQueue.push({ stepIndex, duration, completionCallback });
}

function processNextStep() {
  if (isStepRunning || stepQueue.length === 0) return;
  
  isStepRunning = true;
  const { stepIndex, duration, completionCallback } = stepQueue.shift();
  
  updatePipelineStep(stepIndex, 'active', 'Processing...');
  updateSystemStatus(`Processing Stage ${stepIndex}: ${getStepName(stepIndex)}`, 'pulse-orange');

  setTimeout(() => {
    completionCallback();
    isStepRunning = false;
    processNextStep();
  }, duration);
}

function getStepName(idx) {
  const names = [
    '', 'Upload', 'Quality Control', 'Photogrammetry', 'Error Correction',
    'DEM Validation', 'GIS Analysis', 'Vegetation Analysis', 'Grid Zonal Stats',
    'GeoAI ML Layer', 'AI Reporting'
  ];
  return names[idx] || '';
}

function updatePipelineStep(stepIndex, statusClass, statusText, detailsText = null) {
  const node = document.getElementById(`node-${stepIndex}`);
  if (!node) return;
  
  node.className = `pipeline-node ${statusClass}`;
  node.querySelector('.node-status').innerText = statusText;
  if (detailsText) {
    node.querySelector('.node-details').innerText = detailsText;
  }
}

function triggerReportRecompile() {
  const failedCount = state.fieldData.cameras.filter(c => !c.qcPassed).length;
  const totalCount = state.fieldData.cameras.length;

  const html = generateAIReport({
    totalFiles: totalCount,
    flaggedFiles: failedCount,
    gridSize: state.gridSize,
    vegIndexMode: state.vegIndexMode
  });
  reportContent.innerHTML = html;
}

// UTILITIES
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function updateSystemStatus(text, pulseClass) {
  if (systemStatusDot) {
    systemStatusDot.className = 'status-dot';
    systemStatusDot.classList.add(pulseClass);
  }
  if (systemStatusText) {
    systemStatusText.innerText = text;
  }
}

function enableLayer(layerName) {
  const btn = document.querySelector(`.layer-btn[data-layer="${layerName}"]`);
  if (btn) {
    btn.removeAttribute('disabled');
  }
}


function resetUploadUI() {
  statsFilesCount.innerText = '0 / 0';
  statsFolderCount.innerText = '0 folders parsed';
  statsSpeed.innerText = '0.0 MB/s';
  statsActiveConnections.innerText = '0 active connections';
  statsUploadedSize.innerText = '0.0 MB / 0.0 MB';
  statsPercentage.innerText = '0% completed';
  progressBar.style.width = '0%';
  if (statsEta) statsEta.innerText = '--:--:--';
  
  startUploadBtn.disabled = true;
  resetUploadBtn.disabled = true;
  if (concurrencySlider) concurrencySlider.disabled = false;
  folderInput.value = '';

  updateSystemStatus('System Ready - Idle', 'pulse-green');
}

function resetPipelineUI() {
  const nodes = document.querySelectorAll('.pipeline-node');
  nodes.forEach(node => {
    node.className = 'pipeline-node pending';
    node.querySelector('.node-status').innerText = 'Pending';
  });

  const layerBtns = document.querySelectorAll('.layer-btn');
  layerBtns.forEach(btn => {
    if (btn.getAttribute('data-layer') !== 'raw') {
      btn.disabled = true;
      btn.classList.remove('active');
    } else {
      btn.classList.add('active');
    }
  });
  renderer.setLayer('raw');
  
  reportContent.innerHTML = `
    <div class="empty-report-state">
      <div class="doc-icon"></div>
      <h3>Agronomic Report Staged</h3>
      <p>Complete the photogrammetry and machine learning pipeline to generate AI reports, drainage metrics, crop recommendations, and land classification maps.</p>
    </div>
  `;
}

// Procedural Field DB Generator (Same as old layout)
function generateProceduralFieldData(numFiles) {
  const width = 800;
  const height = 600;
  const data = {
    width,
    height,
    cameras: [],
    elevation: [],
    flowPaths: [],
    vegetation: [],
    grids: {}
  };

  // Determine grid based on number of files (cap at 400 nodes to avoid browser lag, but reflect density)
  const count = numFiles ? Math.min(400, numFiles) : 192;
  const ratio = 4 / 3;
  const rows = Math.max(2, Math.round(Math.sqrt(count / ratio)));
  const cols = Math.max(2, Math.round(rows * ratio));

  const rowSpacing = height / (rows + 1);
  const colSpacing = width / (cols + 1);

  for (let r = 0; r < rows; r++) {
    const y = rowSpacing * (r + 1);
    const colsRange = r % 2 === 0 ? Array.from({length: cols}, (_, i) => i) : Array.from({length: cols}, (_, i) => cols - 1 - i);
    
    for (const c of colsRange) {
      const x = colSpacing * (c + 1);
      const gpsDriftX = (Math.random() - 0.5) * 6;
      const gpsDriftY = (Math.random() - 0.5) * 6;
      
      data.cameras.push({
        id: data.cameras.length,
        x: x + gpsDriftX,
        y: y + gpsDriftY,
        z: 80 + (Math.random() - 0.5) * 2,
        filename: `DJI_${String(data.cameras.length).padStart(4, '0')}.JPG`,
        pitch: (Math.random() - 0.5) * 2,
        roll: (Math.random() - 0.5) * 2,
        yaw: r % 2 === 0 ? 0 : 180,
        qcPassed: true
      });
    }
  }

  // Generate dynamic, hash-based randomized QC status for camera nodes so it is different for every dataset size!
  data.cameras.forEach(cam => {
    // Generate simple hash from id and coordinates
    const hash = Math.abs(Math.sin(cam.id) * 10000);
    // Flag about 2.5% of cameras as blurry/faulty
    if ((hash - Math.floor(hash)) < 0.025) {
      cam.qcPassed = false;
    }
  });

  // Elevation matrix
  for (let y = 0; y < height; y += 4) {
    const row = [];
    for (let x = 0; x < width; x += 4) {
      const valley = Math.abs(y - (height / 2 + Math.sin(x / 100) * 80)) * 0.3;
      const distToHill = Math.hypot(x - 700, y - 100);
      const hill = Math.max(0, 150 - distToHill * 0.4);
      row.push(150 + valley + hill + (Math.random() - 0.5) * 2);
    }
    data.elevation.push(row);
  }

  // Flow channels
  for (let x = 20; x < width; x += 60) {
    const path = [];
    let curX = x;
    let curY = Math.random() > 0.5 ? 20 : height - 20;
    const targetY = height / 2 + Math.sin(curX / 100) * 80;
    
    while (Math.abs(curY - targetY) > 15 && curX > 10 && curX < width - 10) {
      path.push({x: curX, y: curY});
      curY += curY < targetY ? 8 : -8;
      curX += (Math.random() - 0.5) * 12 + (targetY - curY) * 0.02;
    }
    data.flowPaths.push(path);
  }

  const mainRiver = [];
  for (let x = 10; x < width; x += 10) {
    mainRiver.push({
      x,
      y: height / 2 + Math.sin(x / 100) * 80 + (Math.random() - 0.5) * 6
    });
  }
  data.flowPaths.push(mainRiver);

  // Vegetation (NDVI)
  for (let y = 0; y < height; y += 10) {
    const row = [];
    for (let x = 0; x < width; x += 10) {
      const riverDist = Math.abs(y - (height / 2 + Math.sin(x / 100) * 80));
      let ndvi = 0.75 - (riverDist * 0.0008) + (Math.random() - 0.5) * 0.1;
      
      const dryPatchDist = Math.hypot(x - 150, y - 480);
      if (dryPatchDist < 120) {
        ndvi -= (120 - dryPatchDist) * 0.004;
      }
      row.push(Math.max(0.05, Math.min(0.95, ndvi)));
    }
    data.vegetation.push(row);
  }

  state.fieldData = data;
}

function convertGpsToLocalCoordinates(cameras) {
  if (!cameras || cameras.length === 0) return { width: 800, height: 600, cameras: [] };

  let minLat = Infinity, maxLat = -Infinity;
  let minLon = Infinity, maxLon = -Infinity;

  cameras.forEach(cam => {
    const lat = cam.lat;
    const lon = cam.lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  });

  const latSpan = maxLat - minLat;
  const lonSpan = maxLon - minLon;

  const width = 800;
  const height = 600;

  const localCameras = cameras.map((cam, idx) => {
    const lat = cam.lat;
    const lon = cam.lon;
    
    // Normalize and scale to canvas bounds with margins
    const x = lonSpan > 0 ? ((lon - minLon) / lonSpan) * (width - 160) + 80 : width / 2;
    const y = latSpan > 0 ? (1 - (lat - minLat) / latSpan) * (height - 160) + 80 : height / 2;

    return {
      id: cam.id,
      x: x,
      y: y,
      z: cam.alt || 80.0,
      filename: cam.filename,
      qcPassed: cam.qcPassed
    };
  });

  return {
    width,
    height,
    cameras: localCameras,
    minLat,
    maxLat,
    minLon,
    maxLon
  };
}

function generateProceduralMapsForRealCameras(mappedData) {
  const width = mappedData.width;
  const height = mappedData.height;
  
  // Calculate centroid of the actual coordinates to center features
  let avgX = 0, avgY = 0;
  mappedData.cameras.forEach(cam => {
    avgX += cam.x;
    avgY += cam.y;
  });
  avgX /= mappedData.cameras.length;
  avgY /= mappedData.cameras.length;

  // 1. Elevation matrix
  mappedData.elevation = [];
  for (let y = 0; y < height; y += 4) {
    const row = [];
    for (let x = 0; x < width; x += 4) {
      const valley = Math.abs(y - (avgY + Math.sin(x / 100) * 80)) * 0.3;
      const distToHill = Math.hypot(x - (avgX + 150), y - (avgY - 100));
      const hill = Math.max(0, 150 - distToHill * 0.4);
      row.push(150 + valley + hill + (Math.random() - 0.5) * 2);
    }
    mappedData.elevation.push(row);
  }

  // 2. Flow channels
  mappedData.flowPaths = [];
  for (let x = 20; x < width; x += 60) {
    const path = [];
    let curX = x;
    let curY = Math.random() > 0.5 ? 20 : height - 20;
    const targetY = avgY + Math.sin(curX / 100) * 80;
    
    while (Math.abs(curY - targetY) > 15 && curX > 10 && curX < width - 10) {
      path.push({x: curX, y: curY});
      curY += curY < targetY ? 8 : -8;
      curX += (Math.random() - 0.5) * 12 + (targetY - curY) * 0.02;
    }
    mappedData.flowPaths.push(path);
  }

  const mainRiver = [];
  for (let x = 10; x < width; x += 10) {
    mainRiver.push({
      x,
      y: avgY + Math.sin(x / 100) * 80 + (Math.random() - 0.5) * 6
    });
  }
  mappedData.flowPaths.push(mainRiver);

  // 3. Vegetation (NDVI)
  mappedData.vegetation = [];
  for (let y = 0; y < height; y += 10) {
    const row = [];
    for (let x = 0; x < width; x += 10) {
      const riverDist = Math.abs(y - (avgY + Math.sin(x / 100) * 80));
      let ndvi = 0.75 - (riverDist * 0.0008) + (Math.random() - 0.5) * 0.1;
      
      const dryPatchDist = Math.hypot(x - (avgX - 150), y - (avgY + 120));
      if (dryPatchDist < 120) {
        ndvi -= (120 - dryPatchDist) * 0.004;
      }
      row.push(Math.max(0.05, Math.min(0.95, ndvi)));
    }
    mappedData.vegetation.push(row);
  }
}

// Canvas tools helper hook binds
document.getElementById('btnZoomIn').addEventListener('click', () => renderer.zoomIn());
document.getElementById('btnZoomOut').addEventListener('click', () => renderer.zoomOut());
document.getElementById('btnResetView').addEventListener('click', () => renderer.resetView());

const layerContainer = document.getElementById('mapLayersContainer');
layerContainer.addEventListener('click', (e) => {
  if (e.target.classList.contains('layer-btn') && !e.target.disabled) {
    document.querySelectorAll('.layer-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    const layer = e.target.getAttribute('data-layer');
    renderer.setLayer(layer);

    const scale = document.getElementById('mapScaleIndicator');
    if (layer === 'ml') {
      scale.innerText = `Grid cells: ${state.gridSize}m x ${state.gridSize}m`;
    } else {
      scale.innerText = `Scale: 1px = 0.5m`;
    }
  }
});

// ── CHATBOT MODULE ──────────────────────────────────────────────────────────
function initChatbot() {
  const triggerBtn = document.getElementById('chatTriggerBtn');
  const chatWindow = document.getElementById('chatWindow');
  const closeBtn = document.getElementById('chatCloseBtn');
  const sendBtn = document.getElementById('chatSendBtn');
  const chatInput = document.getElementById('chatInput');
  const messagesContainer = document.getElementById('chatMessagesContainer');
  const chipsContainer = document.getElementById('chatChipsContainer');

  if (!triggerBtn || !chatWindow) return;

  let firstOpen = true;

  triggerBtn.addEventListener('click', () => {
    chatWindow.classList.toggle('hidden');
    if (!chatWindow.classList.contains('hidden')) {
      chatInput.focus();
      if (firstOpen) {
        appendChatMessage('assistant', 'Hello! I am your GeoAI Agri-Assistant. Ask me about:\n\n* **Waterlogging mitigation** and surface drainage design.\n* **Soil erosion controls** on sloped terrain.\n* **NDVI crop vigor** and targeted fertilizer application.', 'System Initialized');
        firstOpen = false;
      }
    }
  });

  closeBtn.addEventListener('click', () => {
    chatWindow.classList.add('hidden');
  });

  sendBtn.addEventListener('click', handleChatSubmit);
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleChatSubmit();
    }
  });

  // Event delegation for quick chips
  if (chipsContainer) {
    chipsContainer.addEventListener('click', (e) => {
      const chip = e.target.closest('.chat-chip');
      if (chip) {
        const query = chip.getAttribute('data-query');
        if (query) {
          submitChatQuery(query);
        }
      }
    });
  }

  function handleChatSubmit() {
    const query = chatInput.value.trim();
    if (!query) return;
    chatInput.value = '';
    submitChatQuery(query);
  }

  async function submitChatQuery(query) {
    appendChatMessage('user', query);
    showTypingIndicator();

    if (state.liveMode) {
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ message: query })
        });
        hideTypingIndicator();
        if (res.ok) {
          const data = await res.json();
          appendChatMessage('assistant', data.response, data.source);
        } else {
          throw new Error("Backend chat error");
        }
      } catch (err) {
        console.warn("FastAPI chat failed, falling back to local diagnostic:", err);
        setTimeout(() => {
          hideTypingIndicator();
          const response = getLocalAgriResponse(query);
          appendChatMessage('assistant', response, "Rule-Based Expert System (Offline Fallback)");
        }, 800);
      }
    } else {
      setTimeout(() => {
        hideTypingIndicator();
        const response = getLocalAgriResponse(query);
        appendChatMessage('assistant', response, "Rule-Based Expert System (Offline Sandbox)");
      }, 1000);
    }
  }

  function appendChatMessage(sender, text, source = null) {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${sender}`;
    
    const formattedHtml = formatMarkdown(text);
    
    if (sender === 'assistant' && source) {
      bubble.innerHTML = `${formattedHtml}<span class="source-badge">${source}</span>`;
    } else {
      bubble.innerHTML = formattedHtml;
    }
    
    messagesContainer.appendChild(bubble);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function showTypingIndicator() {
    if (document.getElementById('chatTypingIndicator')) return;

    const indicator = document.createElement('div');
    indicator.id = 'chatTypingIndicator';
    indicator.className = 'typing-indicator';
    indicator.innerHTML = `
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
    `;
    messagesContainer.appendChild(indicator);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function hideTypingIndicator() {
    const indicator = document.getElementById('chatTypingIndicator');
    if (indicator) {
      indicator.remove();
    }
  }

  function formatMarkdown(text) {
    let html = text;
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    const paragraphs = html.split('\n\n');
    const formattedParagraphs = paragraphs.map(p => {
      p = p.trim();
      if (p.startsWith('*') || p.startsWith('-') || p.startsWith('1.')) {
        const lines = p.split('\n');
        const isNumbered = lines[0].trim().match(/^\d+\./);
        const listItems = lines.map(line => {
          const cleanLine = line.replace(/^[\*\-\d\.\s]+/, '').trim();
          return `<li>${cleanLine}</li>`;
        }).join('');
        return isNumbered ? `<ol>${listItems}</ol>` : `<ul>${listItems}</ul>`;
      }
      p = p.replace(/\n/g, '<br>');
      return `<p>${p}</p>`;
    });
    return formattedParagraphs.join('');
  }

  function getLocalAgriResponse(msg) {
    const lower = msg.toLowerCase();
    if (lower.includes("water") || lower.includes("drain") || lower.includes("flood")) {
      return "**Waterlogging Mitigation Advice:**\n\n1. **Surface Drainage:** Install contour ditches and open channels to redirect excess surface runoff.\n2. **Subsurface Tiling:** Install perforated plastic pipes (tile drains) 3-4 feet deep to lower the water table.\n3. **Cover Crops:** Plant deep-rooted cover crops like Radish or Rye to increase soil porosity.\n4. **Crop Selection:** Switch to flood-tolerant varieties like select soybean cultivars or sugarcane.";
    } else if (lower.includes("erosion") || lower.includes("slope") || lower.includes("soil")) {
      return "**Erosion Control Advice:**\n\n1. **Contour Farming:** Plow and plant crops along the contour lines of the slope to slow water runoff.\n2. **Terracing:** Create step-like ridges on steeper slopes to catch water and soil.\n3. **Mulching:** Apply organic residues to the soil surface to absorb raindrop impact and lock moisture.\n4. **Windbreaks:** Plant rows of trees or shrubs along field borders to reduce wind-driven soil loss.";
    } else if (lower.includes("yield") || lower.includes("fertilizer") || lower.includes("nutrient")) {
      return "**Yield Optimization Advice:**\n\n1. **Variable Rate Nitrogen:** Apply fertilizer based on NDVI vigor maps (low NDVI zones need targeted nitrogen boosts).\n2. **pH Management:** Target lime applications to neutralize acidic soil patches detected in zones under 6.0 pH.\n3. **Rotational Sowing:** Rotate cereals with legumes (e.g. Peas, Beans) to naturally fix soil nitrogen levels.";
    } else {
      return "Hello! I am your GeoAI Agri-Assistant. Ask me about:\n\n* **Waterlogging mitigation** and surface drainage design.\n* **Soil erosion controls** on sloped terrain.\n* **NDVI crop vigor** and targeted fertilizer application.";
    }
  }
}

// Start application
window.addEventListener('DOMContentLoaded', init);
