/**
 * High-Speed Folder Uploader Module (Supports Offline Simulation & Real FastAPI uploads)
 */
export class IngestionManager {
  constructor(options = {}) {
    this.files = [];
    this.folders = new Set();
    this.totalSize = 0;
    this.uploadedSize = 0;
    this.uploadedFilesCount = 0;
    this.uploadActive = false;
    this.uploadComplete = false;
    this.activeConnections = 0;
    
    // Callbacks
    this.onProgress = options.onProgress || null;
    this.onComplete = options.onComplete || null;
    this.onStatusChange = options.onStatusChange || null;
    this.onFileParsed = options.onFileParsed || null;
    
    // Performance parameters
    this.uploadSpeedHistory = [];
    this.lastUploadedBytes = 0;
    this.lastSpeedCalcTime = 0;
    this.speedInterval = null;
  }

  /**
   * Parse a file list from file input (webkitdirectory)
   */
  parseFileList(fileList) {
    this.reset();
    const validImageExts = ['.jpg', '.jpeg', '.png', '.tif', '.tiff'];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const nameLower = file.name.toLowerCase();
      const isValidImage = validImageExts.some(ext => nameLower.endsWith(ext));
      
      if (isValidImage) {
        const pathParts = (file.webkitRelativePath || file.name).split('/');
        const folderName = pathParts.length > 1 ? pathParts[pathParts.length - 2] : 'root';
        this.folders.add(folderName);
        
        this.files.push({
          name: file.name,
          size: file.size,
          relativePath: file.webkitRelativePath || file.name,
          uploaded: false,
          rawFile: file // Keep reference to raw file object for real uploads
        });
        this.totalSize += file.size;
      }
    }

    if (this.onFileParsed) {
      this.onFileParsed({
        filesCount: this.files.length,
        foldersCount: this.folders.size,
        totalSize: this.totalSize
      });
    }
  }

  /**
   * Parse dropped items recursively (DataTransferItem webkitGetAsEntry)
   */
  async parseDroppedItems(items) {
    this.reset();
    const filesArray = [];
    const self = this;

    async function traverseFileTree(item, path = "") {
      if (item.isFile) {
        const file = await new Promise((resolve) => item.file(resolve));
        Object.defineProperty(file, 'webkitRelativePath', {
          value: path + file.name,
          writable: false
        });
        filesArray.push(file);
      } else if (item.isDirectory) {
        const dirReader = item.createReader();
        let allEntries = [];
        const readEntriesBatch = async () => {
          const entries = await new Promise((resolve) => {
            dirReader.readEntries(resolve);
          });
          if (entries.length > 0) {
            allEntries = allEntries.concat(entries);
            await readEntriesBatch();
          }
        };
        await readEntriesBatch();
        for (const entry of allEntries) {
          await traverseFileTree(entry, path + item.name + "/");
        }
      }
    }

    const traversePromises = [];
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry();
      if (entry) {
        traversePromises.push(traverseFileTree(entry));
      }
    }

    await Promise.all(traversePromises);
    this.parseFileList(filesArray);
  }

  /**
   * Starts high-speed concurrent queue upload (live or simulated)
   */
  startUpload(concurrencyLimit, liveMode = false, projectId = "offline_project") {
    if (this.uploadActive || this.files.length === 0) return;
    
    this.uploadActive = true;
    this.lastUploadedBytes = 0;
    this.lastSpeedCalcTime = Date.now();
    this.uploadSpeedHistory = [];

    if (this.onStatusChange) {
      this.onStatusChange({ 
        status: 'uploading', 
        text: liveMode ? `Uploading directly to FastAPI backend...` : `Simulating direct SAS uploads...` 
      });
    }

    const filesQueue = [...this.files];
    const totalFiles = filesQueue.length;
    let activeWorkers = 0;

    // Track rolling average speeds
    this.speedInterval = setInterval(() => {
      this.calculateUploadSpeed();
    }, 1000);

    const self = this;

    function worker() {
      if (filesQueue.length === 0) {
        if (activeWorkers === 0) {
          clearInterval(self.speedInterval);
          self.completeUpload();
        }
        return;
      }

      const file = filesQueue.shift();
      activeWorkers++;
      self.activeConnections = activeWorkers;

      if (liveMode) {
        // Real upload to FastAPI
        const formData = new FormData();
        formData.append("file", file.rawFile);
        formData.append("project_id", projectId);
        formData.append("relative_path", file.relativePath);

        fetch("/api/upload", {
          method: "POST",
          body: formData
        })
        .then(res => {
          if (!res.ok) throw new Error("Upload chunk error");
          return res.json();
        })
        .then(() => {
          onUploadSuccess(file);
        })
        .catch(err => {
          console.error("Upload failed for file:", file.name, err);
          // Return to queue for retry
          filesQueue.push(file);
          activeWorkers--;
          self.activeConnections = activeWorkers;
          setTimeout(() => worker(), 1000);
        });
      } else {
        // Simulated direct SAS upload network behavior (40-120ms)
        const uploadTime = 25 + Math.random() * 80; 
        setTimeout(() => {
          onUploadSuccess(file);
        }, uploadTime);
      }
    }

    function onUploadSuccess(file) {
      file.uploaded = true;
      self.uploadedFilesCount++;
      self.uploadedSize += file.size;
      
      activeWorkers--;
      self.activeConnections = activeWorkers;

      // Callback progress
      if (self.onProgress) {
        self.onProgress({
          uploadedFiles: self.uploadedFilesCount,
          totalFiles: totalFiles,
          uploadedSize: self.uploadedSize,
          totalSize: self.totalSize,
          percentage: (self.uploadedSize / self.totalSize) * 100,
          activeConnections: self.activeConnections
        });
      }

      // Run next queue element
      worker();
    }

    const initialWorkers = Math.min(concurrencyLimit, filesQueue.length);
    for (let i = 0; i < initialWorkers; i++) {
      worker();
    }
  }

  calculateUploadSpeed() {
    const now = Date.now();
    const timeDelta = (now - this.lastSpeedCalcTime) / 1000;
    const bytesDelta = this.uploadedSize - this.lastUploadedBytes;
    
    this.lastUploadedBytes = this.uploadedSize;
    this.lastSpeedCalcTime = now;
    
    if (timeDelta <= 0) return;

    const currentSpeedBps = bytesDelta / timeDelta;
    const currentSpeedMBps = currentSpeedBps / (1024 * 1024);

    this.uploadSpeedHistory.push(currentSpeedMBps);
    if (this.uploadSpeedHistory.length > 5) this.uploadSpeedHistory.shift();
    
    const avgSpeedMBps = this.uploadSpeedHistory.reduce((s, v) => s + v, 0) / this.uploadSpeedHistory.length;
    const remainingBytes = this.totalSize - this.uploadedSize;
    
    let etaString = '00:00:00';
    if (avgSpeedMBps > 0 && remainingBytes > 0) {
      const remainingSeconds = remainingBytes / (avgSpeedMBps * 1024 * 1024);
      const h = Math.floor(remainingSeconds / 3600);
      const m = Math.floor((remainingSeconds % 3600) / 60);
      const s = Math.floor(remainingSeconds % 60);
      etaString = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    if (this.onProgress) {
      this.onProgress({
        uploadedFiles: this.uploadedFilesCount,
        totalFiles: this.files.length,
        uploadedSize: this.uploadedSize,
        totalSize: this.totalSize,
        percentage: (this.uploadedSize / this.totalSize) * 100,
        activeConnections: this.activeConnections,
        speedMBs: avgSpeedMBps,
        eta: etaString
      });
    }
  }

  completeUpload() {
    this.uploadActive = false;
    this.uploadComplete = true;
    
    if (this.onStatusChange) {
      this.onStatusChange({ status: 'completed', text: 'Upload Complete' });
    }
    if (this.onComplete) {
      this.onComplete();
    }
  }

  reset() {
    if (this.speedInterval) clearInterval(this.speedInterval);
    this.files = [];
    this.folders.clear();
    this.totalSize = 0;
    this.uploadedSize = 0;
    this.uploadedFilesCount = 0;
    this.uploadActive = false;
    this.uploadComplete = false;
    this.activeConnections = 0;
  }
}
