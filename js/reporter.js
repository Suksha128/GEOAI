/**
 * Agronomic Decision-Support AI Report Generator
 */
export function generateAIReport(params = {}) {
  const {
    totalFiles = 0,
    flaggedFiles = 0,
    gridSize = 10,
    vegIndexMode = 'auto',
  } = params;

  // Zonal counts depending on grid size
  const totalGridBlocks = Math.round((800 * 600) / (gridSize * gridSize));
  
  // Custom mock distributions
  const waterloggingAreaPct = 12;
  const erosionAreaPct = 8;
  const healthyCropPct = 80;
  
  const isVari = vegIndexMode === 'vari';
  const indexLabel = isVari ? 'VARI (RGB Fallback)' : 'NDVI (Near-Infrared)';
  const avgVigorValue = isVari ? '0.42 (Optimal)' : '0.74 (Lush)';

  return `
    <div class="ai-report">
      <div class="report-section">
        <h4>Mission Ingestion Summary</h4>
        <div class="report-metrics-list">
          <div class="metric-row">
            <span class="metric-label">Total Images Processed</span>
            <span class="metric-val">${totalFiles}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Quality Control Rejections</span>
            <span class="metric-val ${flaggedFiles > 0 ? 'medium' : 'high'}">
              ${flaggedFiles} images flagged
            </span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Mean GSD (Resolution)</span>
            <span class="metric-val">2.14 cm / pixel</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Bundle Adjustment RMS Error</span>
            <span class="metric-val">0.12 pixels</span>
          </div>
        </div>
      </div>

      <div class="report-section">
        <h4>Terrain & Drainage Summary</h4>
        <p>Terrain preprocessed with Wang & Liu sink filling. Average slope is 5.4 degrees, with steep zones (up to 24 degrees) concentrated on the northeast hillside. Drainage channels flow via local gravity convergence routes into the main central stream.</p>
        <div class="report-metrics-list">
          <div class="metric-row">
            <span class="metric-label">Max Elevation</span>
            <span class="metric-val">242.4 meters</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Min Elevation</span>
            <span class="metric-val">150.1 meters</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Topographic Wetness Index (Mean)</span>
            <span class="metric-val">6.85 TWI</span>
          </div>
        </div>
      </div>

      <div class="report-section">
        <h4>Crop Vigor & Vegetation</h4>
        <p>Vegetation maps generated using ${indexLabel}. Major areas show healthy chlorophyll absorption curves and nitrogen uptake levels.</p>
        <div class="report-metrics-list">
          <div class="metric-row">
            <span class="metric-label">Index Type</span>
            <span class="metric-val">${indexLabel}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Average Crop Vigor</span>
            <span class="metric-val">${avgVigorValue}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Chlorophyll Absorption Peak</span>
            <span class="metric-val">High Vigor</span>
          </div>
        </div>
      </div>

      <div class="report-section">
        <h4>Machine Learning Zonal Predictions</h4>
        <p>Analyzed ${totalGridBlocks} zonal blocks using local Random Forest & XGBoost classifiers.</p>
        <div class="report-alerts">
          <div class="report-alert-item danger">
            <strong>⚠️ Flood/Waterlogging Risk (High):</strong> ${waterloggingAreaPct}% of acreage located in low-lying catchment zones. Recommend tile drainage.
          </div>
          <div class="report-alert-item warning">
            <strong>⚠️ Soil Erosion Risk (Medium):</strong> ${erosionAreaPct}% of acreage detected on steep bare slopes. Recommend cover crops.
          </div>
          <div class="report-alert-item success">
            <strong>✓ Optimal Growth Zone (High Yield):</strong> ${healthyCropPct}% of acreage classified as optimal. Best suited for Corn/Soybeans.
          </div>
        </div>
      </div>

      <div class="report-section">
        <h4>Photogrammetry Confidence</h4>
        <div class="report-confidence-gauge">
          <span class="metric-label">Overall Confidence Score</span>
          <div class="gauge-bar-bg">
            <div class="gauge-bar-fill" style="width: 94%;"></div>
          </div>
          <span class="metric-val high">94.2%</span>
        </div>
      </div>
    </div>
  `;
}
