import os
import logging
from pathlib import Path

# --- DIRECTORY PATHS ---
# Base project directory (assuming scripts/config.py)
BASE_DIR = Path(__file__).resolve().parent.parent

# Data directories
DATA_DIR = BASE_DIR / "data"
RAW_DATA_DIR = DATA_DIR / "raw"
PROCESSED_DATA_DIR = DATA_DIR / "processed"

# Log directory
LOGS_DIR = BASE_DIR / "logs"

# Ensure directories exist
RAW_DATA_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_DATA_DIR.mkdir(parents=True, exist_ok=True)
LOGS_DIR.mkdir(parents=True, exist_ok=True)

# --- LOGGING SETUP ---
LOG_FILE = LOGS_DIR / "pipeline.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("AGATE")

# --- AGATE PROJECT CONFIGURATION ---
# Target AGATE Fields for this project
PROJECT_FIELDS = ["Baghjan", "Naharkatiya", "Moran", "Digboi", "Duliajan", "Makum"]

# --- DRILLING & GEOLOGICAL ALIAS MAPPING ---
# Standardizing column names across different field datasets
COLUMN_ALIASES = {
    # Depth
    'DEPTH': 'depth_tvd',
    'DEPT': 'depth_tvd',
    
    # Rate of Penetration
    'ROP': 'rop',
    'ROPA': 'rop',
    
    # Weight on Bit
    'WOB': 'wob',
    'WOBA': 'wob',
    
    # Torque
    'TORQUE': 'torque',
    'STOR': 'torque',
    
    # Gamma Ray
    'GR': 'gamma_ray',
    'GAMMA': 'gamma_ray',
    
    # Additional drilling/well log parameters
    'RPM': 'rpm',
    'SP': 'spontaneous_potential',
    'NPHI': 'neutron_porosity',
    'RHOB': 'bulk_density',
    'DT': 'sonic_transit_time'
}
