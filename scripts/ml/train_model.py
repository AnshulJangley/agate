import os
import pandas as pd
import numpy as np
import joblib
import json
from lightgbm import LGBMClassifier
import shap
from sklearn.model_selection import train_test_split, GroupShuffleSplit
from sklearn.metrics import classification_report, roc_auc_score, average_precision_score

import warnings
warnings.filterwarnings('ignore')

def bootstrap_mock_data(df, target_size=1000):
    """Bootstraps a small dataset up to target_size by sampling with replacement and adding Gaussian noise."""
    print(f"Dataset has {len(df)} rows. Bootstrapping to {target_size} rows...")
    
    if len(df) == 0:
        raise ValueError("Cannot bootstrap from an empty dataframe.")
        
    n_needed = target_size - len(df)
    
    # Sample with replacement
    df_synthetic = df.sample(n=n_needed, replace=True).copy().reset_index(drop=True)
    
    # Give synthetic rows new fake well IDs so GroupShuffleSplit works effectively
    fake_wells = [f"MOCK-WELL-{i}" for i in np.random.randint(1, 10, size=len(df_synthetic))]
    df_synthetic['well_id'] = fake_wells
    
    # Add Gaussian noise
    noise_cols = ['rop', 'torque', 'wob', 'rpm', 'mud_weight', 'ecd', 'mse', 'd_xc', 'flow_out_pct', 'pit_gain_bbl', 'spp_psi']
    for col in noise_cols:
        if col in df_synthetic.columns:
            df_synthetic[col] = pd.to_numeric(df_synthetic[col], errors='coerce').fillna(0)
            std = df_synthetic[col].std()
            if pd.isna(std) or std == 0:
                mean_val = df_synthetic[col].mean()
                std = 0.1 * mean_val if mean_val != 0 else 1.0
            noise = np.random.normal(0, max(0.01, std * 0.2), size=len(df_synthetic))
            df_synthetic[col] += noise
            
    if 'hazard_type' not in df.columns:
        df['hazard_type'] = 'Normal'
    else:
        df['hazard_type'] = df['hazard_type'].fillna('Normal')
        df['hazard_type'] = df['hazard_type'].replace({'Mud Loss': 'Lost Circulation', 'Kick': 'Gas Kick'})
        
    df_synthetic['hazard_type'] = 'Normal'
    
    idx_hazard = df_synthetic.sample(frac=0.4).index
    hazard_types = ['Gas Kick', 'Lost Circulation', 'Stuck Pipe', 'Torque & Drag']
    df_synthetic.loc[idx_hazard, 'hazard_type'] = np.random.choice(hazard_types, size=len(idx_hazard))
    df_synthetic.loc[idx_hazard, 'hazard_upcoming'] = 1
    
    # Gas kick signatures
    kick_mask = df_synthetic['hazard_type'] == 'Gas Kick'
    if 'flow_out_pct' in df_synthetic.columns:
        df_synthetic.loc[kick_mask, 'flow_out_pct'] = 115.0 + np.random.normal(0, 2, size=kick_mask.sum())
    if 'pit_gain_bbl' in df_synthetic.columns:
        df_synthetic.loc[kick_mask, 'pit_gain_bbl'] = 12.0 + np.random.normal(0, 1, size=kick_mask.sum())
    if 'spp_psi' in df_synthetic.columns:
        df_synthetic.loc[kick_mask, 'spp_psi'] = 2500.0 - np.random.normal(0, 50, size=kick_mask.sum())

    # Lost circulation signatures
    loss_mask = df_synthetic['hazard_type'] == 'Lost Circulation'
    if 'flow_out_pct' in df_synthetic.columns:
        df_synthetic.loc[loss_mask, 'flow_out_pct'] = 85.0 - np.random.normal(0, 2, size=loss_mask.sum())
    if 'pit_gain_bbl' in df_synthetic.columns:
        df_synthetic.loc[loss_mask, 'pit_gain_bbl'] = -10.0 - np.random.normal(0, 1, size=loss_mask.sum())

    # Stuck pipe signatures
    stuck_mask = df_synthetic['hazard_type'] == 'Stuck Pipe'
    if 'torque' in df_synthetic.columns:
        df_synthetic.loc[stuck_mask, 'torque'] = 28500.0 + np.random.normal(0, 500, size=stuck_mask.sum())
    if 'mse' in df_synthetic.columns:
        df_synthetic.loc[stuck_mask, 'mse'] = 850.0 + np.random.normal(0, 20, size=stuck_mask.sum())
    if 'rop' in df_synthetic.columns:
        df_synthetic.loc[stuck_mask, 'rop'] = 0.5 + np.random.normal(0, 0.1, size=stuck_mask.sum())

    # Torque & Drag signatures
    torque_mask = df_synthetic['hazard_type'] == 'Torque & Drag'
    if 'torque' in df_synthetic.columns:
        df_synthetic.loc[torque_mask, 'torque'] = 18500.0 + np.random.normal(0, 400, size=torque_mask.sum())
    if 'torque_roll_std_5' in df_synthetic.columns:
        df_synthetic.loc[torque_mask, 'torque_roll_std_5'] = 1500.0 + np.random.normal(0, 100, size=torque_mask.sum())
        
    return pd.concat([df, df_synthetic], ignore_index=True)

def train():
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    data_path = os.path.join(base_dir, 'data', 'processed', 'ml_training_data.csv')
    artifact_dir = os.path.join(base_dir, 'backend', 'ml', 'artifacts')
    os.makedirs(artifact_dir, exist_ok=True)
    
    print(f"Loading data from {data_path}...")
    df = pd.read_csv(data_path)
    
    if 'flow_out_pct' not in df.columns: df['flow_out_pct'] = 100.0
    if 'pit_gain_bbl' not in df.columns: df['pit_gain_bbl'] = 0.0
    if 'spp_psi' not in df.columns: df['spp_psi'] = 2800.0

    if len(df) < 200:
        df = bootstrap_mock_data(df, target_size=800)
        
    # Prepare features
    features = ['depth_tvd', 'rop', 'wob', 'rpm', 'torque', 'mud_weight', 'ecd', 'mse', 'd_xc', 
                'flow_out_pct', 'pit_gain_bbl', 'spp_psi', 'rop_roll_mean_5', 'torque_roll_std_5']
                
    # Ensure available features mapped safely
    available_features = [f for f in features if f in df.columns]

    X = df[available_features]
    if 'hazard_type' not in df.columns:
        df['hazard_type'] = 'Normal'
    y = df['hazard_type'].fillna('Normal')
    groups = df.get('well_id', pd.Series(np.zeros(len(df)))) # Fallback if well_id missing
    
    # 1. Train/Test Split (Well-grouped Split)
    print("\n--- Performing Well-Grouped Split ---")
    if groups.nunique() > 1:
        gss = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=42)
        train_idx, test_idx = next(gss.split(X, y, groups))
        X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
        y_train, y_test = y.iloc[train_idx], y.iloc[test_idx]
        print(f"Split completed based on {groups.nunique()} unique wells.")
    else:
        print("Only 1 well found. Falling back to standard stratified split.")
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, stratify=y, random_state=42)
    
    # 2. Train LightGBM Model with multi-class
    print("\n--- Training LightGBM Model (hazard_type) ---")
    clf = LGBMClassifier(
        n_estimators=50, 
        min_child_samples=2, 
        class_weight='balanced', 
        objective='multiclass',
        random_state=42
    )
    clf.fit(X_train, y_train)
    
    # 3. Model Evaluation (Metrics)
    y_pred = clf.predict(X_test)
    y_prob = clf.predict_proba(X_test)
    
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred))
    
    try:
        roc_auc = roc_auc_score(y_test, y_prob, multi_class='ovr')
        print(f"ROC-AUC (OVR): {roc_auc:.4f}")
    except ValueError:
        print("ROC-AUC cannot be calculated (usually due to test set missing some classes).")
    
    # 4. Save Model
    model_path = os.path.join(artifact_dir, 'lgbm_hazard_model.joblib')
    joblib.dump(clf, model_path)
    
    # 5. SHAP Explainer
    print("\nGenerating SHAP Explainer...")
    try:
        explainer = shap.TreeExplainer(clf)
        explainer_path = os.path.join(artifact_dir, 'shap_explainer.joblib')
        joblib.dump(explainer, explainer_path)
        print("SHAP explainer successfully created and saved.")
    except Exception as e:
        print(f"SHAP TreeExplainer failed: {e}. Fallback baseline will be used in inference.")
        
    # 6. Save Metadata (Features + Default Baselines)
    metadata = {
        "features": available_features,
        "default_baselines": {f: float(df[f].median()) for f in available_features}
    }
    metadata_path = os.path.join(artifact_dir, 'model_metadata.json')
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=4)

    # Keep model_features.joblib in lockstep with model_metadata.json. It was previously
    # never rewritten here, so it drifted to a stale 15-feature list from an older model
    # generation while the served model used these 14 features.
    joblib.dump(available_features, os.path.join(artifact_dir, 'model_features.joblib'))

    print(f"\nAll artifacts (model, SHAP, metadata, features) saved to {artifact_dir}")

if __name__ == "__main__":
    train()
