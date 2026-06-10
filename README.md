# GeoAI Agricultural Decision-Support Platform 🌾

An automated, enterprise-grade cloud-and-offline hybrid drone photogrammetry mapping, GIS hydrology analysis, and machine learning crop diagnostics platform. Serves a premium, futuristic glassmorphic user interface concurrently via **Streamlit** (port 8501) and **FastAPI/Uvicorn** (port 8000).

---

### 📢 Core Architecture Status

> [!IMPORTANT]
> The platform operates on a **Dual-Execution Core**:
> * **Live API Mode (Port 8000)**: Binds to local REST routers to run ODM photogrammetry alignments, WhiteboxTools calculations, and local XGBoost models.
> * **Offline Sandbox Mode (Port 8501)**: Implements client-side procedural layouts and animation loops, enabling immediate interaction without local server installations.

---

## ⚡ Core Pipeline Features

### 1. High-Speed Concurrency Ingestion Queue
Optimized to handle **25 GB datasets** (~10,000 files, 2–3 MB each). The frontend parses dropped directory structures recursively using the browser's Directory Entry API and uploads them via a concurrent worker queue (up to 32 parallel streams) using a rolling average speed (MB/s) and ETA estimator.

### 2. Automated Quality Control
Filters out poor data before running heavy computations:
* **Blur Detection**: Computes the variance of the Laplacian ($\text{Var}(\nabla^2 I)$) of each image. Flags captures with variance $< 100$.
* **Exposure Check**: Validates histogram pixel ratios to detect overexposed/underexposed flight frames.
* **Flight Trajectory Match**: Parses GPS coordinates from EXIF tags and checks sequential distance changes to flag GPS dropout.

### 3. Photogrammetry (OpenDroneMap Wrapper)
Triggers OpenDroneMap via programmatical subprocesses. Automatically computes keypoint features (SIFT), camera calibration matrices, sparse/dense point clouds, Digital Surface Models (DSM), Digital Elevation Models (DEM), and Orthomosaics.

### 4. Bundle Adjustment self-calibration correction
Detects low tie-point cameras ($< 15$ ties) and high reprojection-error outliers ($> 1.5$ pixels). Automatically prunes outliers and re-runs bundle adjustment Ceres optimizations.

### 5. DEM Validation (Hydrological Correction)
Uncorrected DEMs contain artificial sinks and spikes that disrupt flow calculations. The engine uses the **Wang & Liu (2006)** depression breaching algorithm to ensure a hydrologically correct surface.

### 6. Hydrological GIS Engine (WhiteboxTools Wrapper)
Calculates slope gradients, aspect, curvature, D8 flow pointers, flow accumulation channels, and the **Topographic Wetness Index (TWI)**:
$$\text{TWI} = \ln\left(\frac{\alpha}{\tan \beta}\right)$$
where $\alpha$ is flow accumulation and $\beta$ is local slope.

### 7. Vegetation Vigor Analysis
Extracts Red and NIR bands to calculate **NDVI**. If NIR imagery is unavailable, it automatically falls back to the RGB-based **VARI (Visible Atmospherically Resistant Index)**:
$$\text{VARI} = \frac{\text{Green} - \text{Red}}{\text{Green} + \text{Red} - \text{Blue}}$$

### 8. Grid-Based Zonal Statistics
Aggregates raster values (Elevation, Slope, TWI, NDVI) by intersecting them with configurable boundary polygons (e.g. 10m, 20m, 50m fishnet grid cells).

### 9. Machine Learning Layer (XGBoost & Scikit-learn)
Fuses binned zonal stats into tabular models:
* **Waterlogging Risk**: XGBoost binary classifier (TWI + Slope).
* **Soil Erosion Risk**: XGBoost binary classifier (Slope + NDVI + Curvature).
* **Yield Potential**: RandomForest regressor (NDVI + TWI).
*(Note: If pre-trained model files are missing, the system automatically trains a fresh set of models on a synthetic physics-based dataset on startup).*

### 10. AI Agronomic Reporting
Compiles statistics, ML risk hotspots, crop suitability (Corn/Soybeans/Rye), and confidence matrices into a beautifully formatted Jinja2 HTML brief.

---

## 🧬 Automated 10-Stage Pipeline

The platform coordinates drone imagery and GIS data processing across ten sequential stages. You can track progress visually on the dashboard:

```text
[1. Upload] ➜ [2. Quality Control] ➜ [3. Photogrammetry] ➜ [4. Error Correction] ➜ [5. DEM Validation]
                                                                                            |
[10. AI Report] ➜ [9. GeoAI ML Layer] ➜ [8. Zonal Stats] ➜ [7. Vegetation Index] ➜ [6. GIS Terrain]
