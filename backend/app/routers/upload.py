from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pathlib import Path
import shutil
from ..config import settings

router = APIRouter(prefix="/api/upload", tags=["Upload"])

@router.post("")
async def upload_drone_image(
    file: UploadFile = File(...),
    project_id: str = Form(...),
    relative_path: str = Form(None)
):
    """Handles direct concurrent upload uploads, saving files into structured directories."""
    try:
        # Determine target file folder structure
        project_upload_dir = settings.UPLOAD_DIR / project_id
        
        if relative_path:
            # Recreate folder hierarchy dropped from browser
            file_target_path = project_upload_dir / relative_path
        else:
            file_target_path = project_upload_dir / file.filename
            
        file_target_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Save file chunks to local disk
        with open(file_target_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        return {
            "status": "success",
            "filename": file.filename,
            "saved_path": str(file_target_path)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")
