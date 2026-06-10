import os
from pathlib import Path
from ..config import settings

class GisEngineService:
    def __init__(self):
        self.wbt_available = False
        try:
            from whitebox_tools import WhiteboxTools
            self.wbt = WhiteboxTools()
            if settings.WHITEBOX_BIN_PATH:
                self.wbt.set_whitebox_dir(settings.WHITEBOX_BIN_PATH)
            # Simple check
            self.wbt_available = self.wbt.help() != ""
        except Exception:
            self.wbt_available = False

    def run_terrain_analysis(self, dem_path: Path, output_dir: Path) -> dict:
        """Executes full hydrological preprocessing and indices calculations using WhiteboxTools."""
        output_dir.mkdir(parents=True, exist_ok=True)
        
        filled_dem = output_dir / "dem_filled.tif"
        slope = output_dir / "slope.tif"
        aspect = output_dir / "aspect.tif"
        flow_dir = output_dir / "flow_dir.tif"
        flow_acc = output_dir / "flow_acc.tif"
        twi = output_dir / "twi.tif"
        
        if self.wbt_available:
            try:
                # 1. Fill depressions
                self.wbt.fill_depressions_wang_and_liu(
                    dem=str(dem_path),
                    output=str(filled_dem)
                )
                # 2. Calculate Slope
                self.wbt.slope(
                    dem=str(filled_dem),
                    output=str(slope)
                )
                # 3. Calculate Aspect
                self.wbt.aspect(
                    dem=str(filled_dem),
                    output=str(aspect)
                )
                # 4. Flow direction
                self.wbt.d8_pointer(
                    dem=str(filled_dem),
                    output=str(flow_dir)
                )
                # 5. Flow accumulation
                self.wbt.d8_flow_accumulation(
                    input=str(flow_dir),
                    output=str(flow_acc)
                )
                # 6. Topographic Wetness Index (TWI)
                self.wbt.wetness_index(
                    slope=str(slope),
                    sca=str(flow_acc),
                    output=str(twi)
                )
                return {
                    "success": True,
                    "mode": "production",
                    "outputs": {
                        "dem_filled": str(filled_dem),
                        "slope": str(slope),
                        "aspect": str(aspect),
                        "flow_dir": str(flow_dir),
                        "flow_acc": str(flow_acc),
                        "twi": str(twi)
                    }
                }
            except Exception as e:
                return {"success": False, "error": str(e)}
        else:
            # Fallback mock: create stub files so the rest of the app doesn't crash
            stubs = [filled_dem, slope, aspect, flow_dir, flow_acc, twi]
            for stub in stubs:
                with open(stub, "wb") as f:
                    f.write(b"MOCK_GIS_RASTER_BYTES_STUB")
            return {
                "success": True,
                "mode": "mock",
                "message": "GIS Engine executed in offline-mock mode (WhiteboxTools not found).",
                "outputs": {
                    "dem_filled": str(filled_dem),
                    "slope": str(slope),
                    "aspect": str(aspect),
                    "flow_dir": str(flow_dir),
                    "flow_acc": str(flow_acc),
                    "twi": str(twi)
                }
            }
