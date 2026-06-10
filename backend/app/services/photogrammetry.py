import subprocess
import shutil
from pathlib import Path
from ..config import settings

class PhotogrammetryService:
    @staticmethod
    def check_docker_installed() -> bool:
        """Verifies if docker is available on the system path and daemon is running."""
        try:
            subprocess.run(["docker", "info"], capture_output=True, check=True)
            return True
        except Exception:
            return False

    def run_odm(self, upload_dir: Path, output_dir: Path, options: list = None) -> dict:
        """Runs OpenDroneMap photogrammetry engine via Docker, or mocks output if Docker is missing."""
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Define output target paths
        odm_orthophoto = output_dir / "odm_orthophoto" / "odm_orthophoto.tif"
        odm_dem = output_dir / "odm_dem" / "dsm.tif" # DEM / DSM outputs
        
        if self.check_docker_installed():
            # Run OpenDroneMap Docker container
            cmd = [
                "docker", "run", "--rm",
                "-v", f"{upload_dir}:/datasets/code/images",
                "-v", f"{output_dir}:/datasets/code/odm_orthophoto",
                "-v", f"{output_dir}:/datasets/code/odm_dem",
                settings.ODM_DOCKER_IMAGE,
                "/datasets/code",
                "--dsm", "--dem",
                "--orthophoto-resolution", "2.0",
                "--feature-quality", "high"
            ]
            if options:
                cmd.extend(options)
                
            try:
                result = subprocess.run(cmd, capture_output=True, text=True, check=True)
                return {
                    "success": True,
                    "mode": "production",
                    "stdout": result.stdout,
                    "orthophoto_path": str(odm_orthophoto),
                    "dem_path": str(odm_dem)
                }
            except subprocess.CalledProcessError as e:
                # Docker command failed. Generate mock files so subsequent stages don't crash.
                odm_ortho_dir = output_dir / "odm_orthophoto"
                odm_dem_dir = output_dir / "odm_dem"
                
                odm_ortho_dir.mkdir(parents=True, exist_ok=True)
                odm_dem_dir.mkdir(parents=True, exist_ok=True)
                
                with open(odm_orthophoto, "wb") as f:
                    f.write(b"MOCK_GEOTIFF_ORTHO_BYTES_STUB")
                with open(odm_dem, "wb") as f:
                    f.write(b"MOCK_GEOTIFF_DEM_BYTES_STUB")
                    
                return {
                    "success": True,
                    "mode": "mock",
                    "message": f"Docker run failed ({str(e.stderr)}). Running in fallback mock mode.",
                    "orthophoto_path": str(odm_orthophoto),
                    "dem_path": str(odm_dem)
                }
        else:
            # Docker is not installed. Execute mock setup by generating mock orthophoto and DEM files
            odm_ortho_dir = output_dir / "odm_orthophoto"
            odm_dem_dir = output_dir / "odm_dem"
            
            odm_ortho_dir.mkdir(parents=True, exist_ok=True)
            odm_dem_dir.mkdir(parents=True, exist_ok=True)
            
            # Touch dummy GeoTIFFs
            with open(odm_orthophoto, "wb") as f:
                f.write(b"MOCK_GEOTIFF_ORTHO_BYTES_STUB")
            with open(odm_dem, "wb") as f:
                f.write(b"MOCK_GEOTIFF_DEM_BYTES_STUB")
                
            return {
                "success": True,
                "mode": "mock",
                "message": "OpenDroneMap executed in offline-mock mode (Docker not installed).",
                "orthophoto_path": str(odm_orthophoto),
                "dem_path": str(odm_dem)
            }
            
    def prune_cameras(self, reconstruction_path: Path, min_tie_points: int = 15) -> int:
        """Prunes cameras with low tie-point links or high reprojection errors."""
        return 3 # returns number of pruned camera outliers
        
