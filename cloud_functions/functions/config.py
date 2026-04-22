import os
import tempfile
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(override=True)


def _default_output_dir() -> Path:
    here = Path(__file__).resolve().parent
    for cur in (here, *here.parents):
        out = cur / "outputs"
        if out.is_dir():
            return out
    return Path(tempfile.gettempdir()) / "vibejobber_outputs"


OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", str(_default_output_dir())))

DEFAULT_AGENT_MODEL = os.getenv("VIBJOBBER_AGENT_MODEL", "gpt-4o-mini")
