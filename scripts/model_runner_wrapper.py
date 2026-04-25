import json
import os
import runpy
import sys
import threading
import time
from pathlib import Path

try:
    import resource
except ImportError:  # pragma: no cover
    resource = None


METRICS_PATH = os.environ.get("MODEL_RUNNER_METRICS_PATH", "").strip()
REPORT_INTERVAL_SECONDS = 0.1
stop_event = threading.Event()


def current_peak_memory_kb():
    if resource is None:
        return None
    usage = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    if not usage:
        return None
    if sys.platform == "darwin":
        return int(usage / 1024)
    return int(usage)


def write_metrics():
    if not METRICS_PATH:
        return
    peak_memory_kb = current_peak_memory_kb()
    if peak_memory_kb is None:
        return
    path = Path(METRICS_PATH)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(path.suffix + ".tmp")
    temp_path.write_text(json.dumps({"peakMemoryKb": peak_memory_kb, "updatedAt": time.time()}), encoding="utf-8")
    temp_path.replace(path)


def metrics_reporter():
    while not stop_event.wait(REPORT_INTERVAL_SECONDS):
        write_metrics()


def main():
    if len(sys.argv) < 2:
        raise SystemExit("Usage: python model_runner_wrapper.py <target.py> [args...]")

    target_path = os.path.abspath(sys.argv[1])
    target_dir = os.path.dirname(target_path)
    forwarded_args = sys.argv[2:]

    if target_dir and target_dir not in sys.path:
        sys.path.insert(0, target_dir)
    sys.argv = [target_path, *forwarded_args]

    reporter_thread = None
    if METRICS_PATH:
        write_metrics()
        reporter_thread = threading.Thread(target=metrics_reporter, daemon=True)
        reporter_thread.start()

    try:
        runpy.run_path(target_path, run_name="__main__")
    finally:
        stop_event.set()
        if reporter_thread is not None:
            reporter_thread.join(timeout=REPORT_INTERVAL_SECONDS * 2)
        write_metrics()


if __name__ == "__main__":
    main()
