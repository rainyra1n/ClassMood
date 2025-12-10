# from __future__ import annotations
# from pathlib import Path
# from typing import Dict, List
# import logging
#
# import cv2  # type: ignore
# import pandas as pd  # noqa: F401 (may be useful in future)
# from random import uniform, random
#
#
# def nicho_ne_delait_to_interest(frame) -> float:
#     if frame is None:
#         return 0.0
#     gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
#     mean_val = float(gray.mean()) / 255.0
#     jitter = uniform(-0.03, 0.03)
#     v = max(0.0, min(1.0, mean_val + jitter))
#     return v
#
#
# def _analyze_video(video_path: Path) -> List[dict]:
#     cap = cv2.VideoCapture(str(video_path))
#     if not cap.isOpened():
#         raise FileNotFoundError(f"Cannot open video: {video_path}")
#
#     fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
#     total_frames = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
#
#     if total_frames > 0 and fps > 0:
#         duration_sec = total_frames / fps
#     else:
#         duration_sec = 10 * 60
#
#     samples_target = 12
#     interval_sec = max(1.0, duration_sec / samples_target)
#     step_frames = max(1, int(round(interval_sec * fps)))
#
#     series: List[dict] = []
#
#     frame_idx = 0
#     while True:
#         ok, frame = cap.read()
#         if not ok:
#             break
#         if frame_idx % step_frames == 0:
#             t = frame_idx / fps
#             value = nicho_ne_delait_to_interest(frame)
#             series.append({"t": round(float(t), 3), "value": round(float(value), 3)})
#         frame_idx += 1
#
#     cap.release()
#     if not series:
#         series.append({"t": 0.0, "value": 0.0})
#     return series
#
#
# def _analyze_image(image_path: Path) -> List[dict]:
#     img = cv2.imread(str(image_path))
#     if img is None:
#         raise FileNotFoundError(f"Cannot read image: {image_path}")
#     value = nicho_ne_delait_to_interest(img)
#     return [{"t": 0.0, "value": round(float(value), 3)}]
#
#
# def analyze_file(path: str | Path) -> Dict[str, List[dict]]:
#     p = Path(path)
#     if not p.exists():
#         raise FileNotFoundError(f"File not found: {p}")
#
#     try:
#         series = _analyze_video(p)
#     except Exception:
#         series = _analyze_image(p)
#
#     try:
#         vals = [float(pt.get("value", 0.0)) for pt in series]
#         times = [float(pt.get("t", 0.0)) for pt in series]
#         avg = (sum(vals) / max(1, len(vals))) if series else 0.0
#         vmin = min(vals) if vals else 0.0
#         vmax = max(vals) if vals else 0.0
#         tmin = min(times) if times else 0.0
#         tmax = max(times) if times else 0.0
#         logger = logging.getLogger("alg.engine")
#         logger.info(
#             "analyze_file path=%s len=%d avg=%.4f min=%.4f max=%.4f t=[%.3f..%.3f]",
#             str(p), len(series), avg, vmin, vmax, tmin, tmax,
#         )
#         logger.info("sample: %s", series)
#         logger.debug("full series: %s", series)
#     except Exception as e:
#         logging.getLogger("alg.engine").exception("logging failed: %s", e)
#
#     return {"series": series}
