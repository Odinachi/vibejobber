import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(override=True)


def _default_output_dir() -> Path:
    # backend/vibejobber -> repo root is parents[2]
    repo_root = Path(__file__).resolve().parents[2]
    return repo_root / "outputs"


OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", str(_default_output_dir())))

DEFAULT_AGENT_MODEL = os.getenv("VIBJOBBER_AGENT_MODEL", "gpt-4o-mini")
