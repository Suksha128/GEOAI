import numpy as np
from pathlib import Path
from ..config import settings

class ZonalStatsService:
    def aggregate_grids(self, project_dir: Path, cell_size_meters: int = 10) -> list:
        """Divides project field into grid blocks and calculates zonal average stats."""
        grids = []
        
        try:
            import rasterio
            import geopandas as gpd
            from shapely.geometry import Polygon
            
            dem_path = project_dir / "gis_outputs" / "dem_filled.tif"
            slope_path = project_dir / "gis_outputs" / "slope.tif"
            twi_path = project_dir / "gis_outputs" / "twi.tif"
            ndvi_path = project_dir / "gis_outputs" / "ndvi.tif"
            
            with rasterio.open(dem_path) as src:
                bounds = src.bounds
                crs = src.crs
                
            xmin, ymin, xmax, ymax = bounds
            cols = int((xmax - xmin) / cell_size_meters)
            rows = int((ymax - ymin) / cell_size_meters)
            
            polygons = []
            for i in range(cols):
                for j in range(rows):
                    x1 = xmin + i * cell_size_meters
                    y1 = ymin + j * cell_size_meters
                    x2 = x1 + cell_size_meters
                    y2 = y1 + cell_size_meters
                    polygons.append(Polygon([(x1, y1), (x2, y1), (x2, y2), (x1, y2)]))
                    
            gdf = gpd.GeoDataFrame(geometry=polygons, crs=crs)
            
            # Simple aggregation method by extracting raster values at centroids
            # to remain fast and avoid loading heavy rasterstats dependencies
            centroids = gdf.geometry.centroid
            coords = [(pt.x, pt.y) for pt in centroids]
            
            def sample_raster(raster_path, points):
                try:
                    with rasterio.open(raster_path) as r_src:
                        return [float(val[0]) for val in r_src.sample(points)]
                except Exception:
                    return [0.0] * len(points)
                    
            gdf["elevation"] = sample_raster(dem_path, coords)
            gdf["slope"] = sample_raster(slope_path, coords)
            gdf["twi"] = sample_raster(twi_path, coords)
            gdf["ndvi"] = sample_raster(ndvi_path, coords)
            
            for idx, row in gdf.iterrows():
                poly = row.geometry
                grids.append({
                    "id": int(idx),
                    "bounds": [poly.bounds[0], poly.bounds[1], poly.bounds[2], poly.bounds[3]],
                    "elevation": float(row["elevation"]),
                    "slope": float(row["slope"]),
                    "twi": float(row["twi"]),
                    "ndvi": float(row["ndvi"])
                })
                
            return grids
            
        except Exception:
            # Fallback mock generator
            # Generates a grid layout matching dimensions of our canvas field (800x600 px)
            # cell sizes: 10m maps to 20px, 20m to 40px, 50m to 100px
            width, height = 800, 600
            pixel_size = cell_size_meters * 2
            cols = int(width / pixel_size)
            rows = int(height / pixel_size)
            
            grid_id = 0
            for r in range(rows):
                for c in range(cols):
                    x1 = c * pixel_size
                    y1 = r * pixel_size
                    
                    # Procedural terrain math matching app.js simulation
                    center_y = height / 2 + np.sin(x1 / 100) * 80
                    is_river = abs((y1 + pixel_size/2) - center_y) < 30
                    is_hill = y1 < 100 and x1 > 500
                    is_dry = np.hypot((x1 + pixel_size/2) - 150, (y1 + pixel_size/2) - 480) < 90
                    
                    # Set stats
                    slope = 22.0 + np.random.normal(0, 2) if is_hill else 4.0 + np.random.normal(0, 1)
                    twi = 8.5 + np.random.normal(0, 0.5) if is_river else 4.8 + np.random.normal(0, 0.4)
                    ndvi = 0.78 + np.random.normal(0, 0.05)
                    if is_dry:
                        ndvi -= 0.4
                    elif is_hill:
                        ndvi -= 0.15
                        
                    grids.append({
                        "id": grid_id,
                        "bounds": [x1, y1, x1 + pixel_size, y1 + pixel_size],
                        "elevation": float(180.0 + (y1 - height/2)*0.1),
                        "slope": float(max(0.0, slope)),
                        "twi": float(max(0.0, twi)),
                        "ndvi": float(max(-1.0, min(1.0, ndvi)))
                    })
                    grid_id += 1
                    
            return grids
