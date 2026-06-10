import numpy as np
from pathlib import Path
from ..config import settings

class GeoAiMlModels:
    def __init__(self):
        self.xgb_available = False
        try:
            import xgboost as xgb
            from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
            self.xgb_available = True
        except Exception:
            self.xgb_available = False
            
        self.models_dir = settings.STORAGE_DIR / "models"
        self.models_dir.mkdir(parents=True, exist_ok=True)
        
        # Local paths for saved models
        self.waterlogging_model_path = self.models_dir / "waterlogging.bin"
        self.erosion_model_path = self.models_dir / "erosion.bin"
        self.yield_model_path = self.models_dir / "yield.bin"

    def generate_synthetic_training_data(self, samples: int = 1000) -> tuple:
        """Generates physics-based synthetic dataset to train our local models."""
        # Features: [elevation, slope, twi, ndvi]
        np.random.seed(42)
        elevation = np.random.uniform(150.0, 250.0, samples)
        slope = np.random.uniform(0.0, 25.0, samples)
        twi = np.random.uniform(3.0, 10.0, samples)
        ndvi = np.random.uniform(0.1, 0.9, samples)
        
        X = np.stack([elevation, slope, twi, ndvi], axis=1)
        
        # Target labels based on physical geo-mechanics rules
        # 1. Waterlogging: high wetness index (TWI > 7.5) and flat slope (< 3.0 degrees)
        waterlogging_prob = 1 / (1 + np.exp(-(twi - 7.5 + (3.0 - slope)*0.8)))
        y_waterlogging = (waterlogging_prob > 0.5).astype(int)
        
        # 2. Erosion: high slope (> 12.0) and poor vegetation cover (NDVI < 0.4)
        erosion_prob = 1 / (1 + np.exp(-(slope - 12.0 + (0.4 - ndvi)*15)))
        y_erosion = (erosion_prob > 0.5).astype(int)
        
        # 3. Yield potential: good NDVI, balanced TWI, flat slope
        y_yield = ndvi * 8.5 + (twi * 0.4) - (slope * 0.1) + np.random.normal(0, 0.5, samples)
        y_yield = np.clip(y_yield, 0.5, 12.0) # Yield in tons/hectare
        
        return X, y_waterlogging, y_erosion, y_yield

    def train_models_if_missing(self):
        """Auto-trains and serializes models using synthetic training data if not already trained."""
        if not self.xgb_available:
            return
            
        import xgboost as xgb
        from sklearn.ensemble import RandomForestRegressor
        import pickle
        
        if not (self.waterlogging_model_path.exists() and self.erosion_model_path.exists() and self.yield_model_path.exists()):
            X, y_water, y_erosion, y_yield = self.generate_synthetic_training_data()
            
            # Train waterlogging classifier
            clf_water = xgb.XGBClassifier(max_depth=4, n_estimators=50)
            clf_water.fit(X, y_water)
            with open(self.waterlogging_model_path, "wb") as f:
                pickle.dump(clf_water, f)
                
            # Train erosion classifier
            clf_erosion = xgb.XGBClassifier(max_depth=4, n_estimators=50)
            clf_erosion.fit(X, y_erosion)
            with open(self.erosion_model_path, "wb") as f:
                pickle.dump(clf_erosion, f)
                
            # Train yield potential regressor
            reg_yield = RandomForestRegressor(n_estimators=50, max_depth=6)
            reg_yield.fit(X, y_yield)
            with open(self.yield_model_path, "wb") as f:
                pickle.dump(reg_yield, f)

    def predict_grid_risks(self, grid_cells: list) -> list:
        """Runs batch ML prediction over binned grid cells."""
        if len(grid_cells) == 0:
            return []
            
        # Self-train models locally if files are missing
        try:
            self.train_models_if_missing()
        except Exception:
            pass

        # Prepare feature matrix: [elevation, slope, twi, ndvi]
        features = []
        for cell in grid_cells:
            features.append([
                cell.get("elevation", 180.0),
                cell.get("slope", 5.0),
                cell.get("twi", 5.5),
                cell.get("ndvi", 0.6)
            ])
        X = np.array(features)
        
        # Load models and predict, or run logical rules as fallback if scikit/xgboost is missing
        if self.xgb_available and self.waterlogging_model_path.exists():
            import pickle
            try:
                with open(self.waterlogging_model_path, "rb") as f:
                    clf_water = pickle.load(f)
                with open(self.erosion_model_path, "rb") as f:
                    clf_erosion = pickle.load(f)
                with open(self.yield_model_path, "rb") as f:
                    reg_yield = pickle.load(f)
                    
                water_preds = clf_water.predict_proba(X)[:, 1]
                erosion_preds = clf_erosion.predict_proba(X)[:, 1]
                yield_preds = reg_yield.predict(X)
            except Exception:
                # Rule-based fallback if pickle load fails
                water_preds = self._rule_waterlogging(X)
                erosion_preds = self._rule_erosion(X)
                yield_preds = self._rule_yield(X)
        else:
            # Rule-based fallback
            water_preds = self._rule_waterlogging(X)
            erosion_preds = self._rule_erosion(X)
            yield_preds = self._rule_yield(X)
            
        # Write predictions back to grid cell objects
        predicted_cells = []
        for idx, cell in enumerate(grid_cells):
            predicted_cells.append({
                **cell,
                "waterlogging_risk": float(water_preds[idx]),
                "erosion_risk": float(erosion_preds[idx]),
                "yield_potential": float(yield_preds[idx])
            })
            
        return predicted_cells

    def _rule_waterlogging(self, X: np.ndarray) -> np.ndarray:
        # TWI > 7.5 and Slope < 3.0
        twi = X[:, 2]
        slope = X[:, 1]
        probs = 1 / (1 + np.exp(-(twi - 7.2 + (2.5 - slope)*0.6)))
        return probs

    def _rule_erosion(self, X: np.ndarray) -> np.ndarray:
        # Slope > 12.0 and NDVI < 0.45
        slope = X[:, 1]
        ndvi = X[:, 3]
        probs = 1 / (1 + np.exp(-(slope - 10.0 + (0.4 - ndvi)*12)))
        return probs

    def _rule_yield(self, X: np.ndarray) -> np.ndarray:
        ndvi = X[:, 3]
        twi = X[:, 2]
        slope = X[:, 1]
        yields = ndvi * 8.0 + (twi * 0.35) - (slope * 0.08)
        return np.clip(yields, 0.5, 12.0)
